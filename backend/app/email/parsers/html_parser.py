# backend/app/email/parsers/html_parser.py
"""
HTML parser — reads order pages (HTML attachments) and HTML email bodies.

Order page layouts vary, so parsing happens in two layers:

1. extract_html_details() captures everything readable on the page without
   assuming a layout: label/value pairs (two-column rows, label cells, <dl>,
   "Label: value" lines) and every data table.
2. parse_html_document() maps the recognised labels and the best line-item
   table onto a ParsedPO. Anything not mapped stays available in po.sources.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from bs4 import BeautifulSoup, Tag

from app.email.parsers import DEFAULT_CURRENCY, ParsedPO, POLineItem, normalize_po_number

logger = logging.getLogger(__name__)

# ── PO Number Patterns (tried in order of specificity) ───────────
_PO_PATTERNS = [
    # Oniverse format: ZA6A-2001605039, ZA6A - 2001605039, IT01-2001606115
    re.compile(r"\b([A-Z0-9]{2,6}\s*[-–—]\s*\d{7,15})\b"),
    # Standard: PO-12345, PO#12345, PO 12345, P.O. 12345
    re.compile(r"\b(?:PO|P\.O\.)\s*[-#:\s]*([\w\-/]{3,20})\b", re.IGNORECASE),
    # "Purchase Order" followed by number
    re.compile(r"Purchase\s*Order\s*[-#:\s]*([\w\-/]{3,20})", re.IGNORECASE),
    # "Order No" / "Order Number" / "Order #" followed by value
    re.compile(r"Order\s*(?:No\.?|Number|#)\s*[-:\s]*([\w\-/]{3,20})", re.IGNORECASE),
]

_DATE_RE = re.compile(r"\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4}")

# "Label: value" on a single line of text
_TEXT_FIELD_RE = re.compile(r"^\s*([^:]{2,60}?)\s*:\s*(\S.*?)\s*$")

_TOTAL_ROW_RE = re.compile(r"^(sub\s*|grand\s*)?totals?\b", re.IGNORECASE)

# Innermost elements whose text is read line by line for "Label: value"
_BLOCK_TAGS = [
    "p", "div", "li", "td", "th", "dd", "dt", "pre", "blockquote",
    "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header", "footer",
]

# Page labels (normalised, see _normalize_label) → ParsedPO header fields
_FIELD_LABELS: dict[str, tuple[str, ...]] = {
    "po_number": (
        "po", "po number", "po no", "p o", "p o number", "p o no",
        "purchase order", "purchase order number", "purchase order no",
        "order", "order number", "order no", "order n", "order id",
        "order reference", "order ref", "document number", "doc number",
        "numero ordine", "n ordine",
    ),
    "supplier_code": (
        "supplier code", "vendor code", "supplier id", "vendor id",
        "partner id", "partner code", "supplier number", "vendor number",
        "supplier no", "vendor no", "codice fornitore",
    ),
    "supplier_name": (
        "supplier", "supplier name", "vendor", "vendor name", "partner name", "fornitore",
    ),
    "buyer_name": (
        "buyer", "buyer name", "customer", "customer name", "sold to", "bill to", "cliente",
    ),
    "order_date": (
        "order date", "po date", "document date", "date", "issue date", "issued on", "data ordine",
    ),
    "delivery_date": (
        "delivery date", "requested delivery date", "required delivery date",
        "required date", "ship date", "shipping date", "due date", "eta", "data consegna",
    ),
    "destination": (
        "destination", "ship to", "deliver to", "delivery address", "delivery to",
        "delivery place", "place of delivery", "consignee", "destinazione",
    ),
    "currency": ("currency", "curr", "valuta"),
    "total_quantity": (
        "total quantity", "total qty", "total pieces", "total pcs", "quantity total",
    ),
    "total_value": (
        "total value", "total amount", "order total", "grand total", "total",
        "net value", "order value", "total net value",
    ),
}
_LABEL_TO_FIELD = {
    label: name for name, labels in _FIELD_LABELS.items() for label in labels
}

# Line-item table column headers (normalised) → POLineItem fields
_HEADER_MAP: dict[str, str] = {
    "pos": "line_number",
    "position": "line_number",
    "line": "line_number",
    "line no": "line_number",
    "line number": "line_number",
    "item no": "line_number",
    "style": "style",
    "style no": "style",
    "style number": "style",
    "article": "style",
    "article code": "style",
    "article no": "style",
    "item": "style",
    "item code": "style",
    "itemcode": "style",
    "product": "style",
    "product code": "style",
    "material": "style",
    "material code": "style",
    "partner item code": "style",
    "sku": "style",
    "model": "style",
    "color": "color",
    "colour": "color",
    "color code": "color",
    "colour code": "color",
    "colour description": "color_desc",
    "color description": "color_desc",
    "colour desc": "color_desc",
    "color desc": "color_desc",
    "size": "size",
    "size code": "size",
    "unit": "size",
    "uom": "size",
    "delivery date": "delivery_date",
    "qty": "quantity",
    "quantity": "quantity",
    "pcs": "quantity",
    "pieces": "quantity",
    "qty ordered": "quantity",
    "ordered qty": "quantity",
    "order qty": "quantity",
    "quantity ordered": "quantity",
    "ordered quantity": "quantity",
    "price": "unit_price",
    "unit price": "unit_price",
    "unit cost": "unit_price",
    "net price": "unit_price",
    "price per unit": "unit_price",
    "unit net price": "unit_price",
    "description": "description",
    "desc": "description",
    "item description": "description",
    "product description": "description",
    "material description": "description",
    "article description": "description",
}

_CURRENCY_WORDS = {
    "€": "EUR", "EURO": "EUR", "EUROS": "EUR",
    "$": "USD", "DOLLAR": "USD", "DOLLARS": "USD",
    "£": "GBP", "POUND": "GBP", "POUNDS": "GBP",
}


# ── Public API ───────────────────────────────────────────────────


def parse_html_document(
    html: str | bytes,
    subject: str = "",
    source_name: str = "",
) -> ParsedPO:
    """
    Parse one HTML document (an attached order page or the email body).

    Parameters
    ----------
    html : str | bytes
        The document. Bytes let BeautifulSoup honour the page's own charset.
    subject : str, optional
        Email subject — a fallback place to find the PO number.
    source_name : str, optional
        Attachment filename (or "email body"), recorded with the details.

    Returns
    -------
    ParsedPO
        Always returned. ``po_number`` is empty when none was found, but
        everything read from the page is still in ``po.sources``.
    """
    soup = BeautifulSoup(html, "html.parser")
    title = _text(soup.title) if soup.title else ""
    for tag in soup(["script", "style", "head"]):
        tag.decompose()

    details = extract_html_details(soup)

    po = ParsedPO(raw_source="html", source_filename=source_name)
    po.sources = [{"type": "html", "name": source_name, "title": title, **details}]

    for label, value in details["fields"].items():
        field_name = _LABEL_TO_FIELD.get(_normalize_label(label))
        if field_name:
            _apply_field(po, field_name, value)

    # Check for IUNGO specific company/supplier article header tags
    company_tag = soup.find("article", class_="company")
    if company_tag and not po.buyer_name:
        h1 = company_tag.find("h1")
        po.buyer_name = _text(h1) if h1 else _text(company_tag).splitlines()[0]

    supplier_tag = soup.find("article", class_="supplier")
    if supplier_tag and not po.supplier_name:
        h1 = supplier_tag.find("h1")
        po.supplier_name = _text(h1) if h1 else _text(supplier_tag).splitlines()[0]

    # Check for Order Type + Order Number if present
    order_type = details["fields"].get("Order Type", "")
    order_num = details["fields"].get("Order Number", "")
    if order_type:
        po.order_type = order_type.strip()
    if order_num:
        po.po_number = normalize_po_number(order_num.strip())

    full_text = soup.get_text(" ", strip=True)
    if not po.po_number:
        po.po_number = (
            _find_po_number(subject)
            or _find_po_number(title)
            or _find_po_number(full_text)
        )
    po.po_number = normalize_po_number(po.po_number)

    if not po.order_date and not po.delivery_date:
        dates = _DATE_RE.findall(full_text)
        if dates:
            po.order_date = dates[0]
        if len(dates) >= 2:
            po.delivery_date = dates[1]

    po.line_items = _extract_line_items(soup)
    if not po.total_quantity and po.line_items:
        po.total_quantity = sum(item.quantity for item in po.line_items)
    if not po.total_value and po.line_items:
        po.total_value = round(sum(item.quantity * item.unit_price for item in po.line_items), 2)

    logger.info(
        "HTML parsed (%s): PO=%s, %d fields, %d tables, %d line items",
        source_name or "html",
        po.po_number or "—",
        len(details["fields"]),
        len(details["tables"]),
        len(po.line_items),
    )
    return po


def extract_html_details(soup: BeautifulSoup) -> dict:
    """
    Capture every label/value pair and data table on the page.

    Returns
    -------
    dict
        {"fields": {label: value}, "tables": [{"headers": [...], "rows": [[...]]}]}.
        A label repeated with a different value is kept as "Label (2)", "Label (3)"…
    """
    fields: dict[str, str] = {}
    tables: list[dict] = []

    def add_field(label: str, value: str) -> None:
        label = _clean(label).rstrip(":").strip()
        value = _clean(value)
        if not label or not value or len(label) > 80 or not re.search(r"[^\W\d_]", label):
            return
        key, n = label, 2
        while key in fields:
            if fields[key] == value:
                return
            key = f"{label} ({n})"
            n += 1
        fields[key] = value

    for br in soup.find_all("br"):
        br.replace_with("\n")

    # ── Tables: label/value layouts become fields, the rest stay tables ──
    for table in soup.find_all("table"):
        rows = _own_rows(table)
        if not rows or any(cell.find("table") for row in rows for cell in _cells(row)):
            continue  # empty, or a layout wrapper whose inner tables are read on their own

        cell_rows = [cells for cells in (_cells(row) for row in rows) if any(_text(c) for c in cells)]
        if not cell_rows:
            continue

        header_is_th = all(cell.name == "th" for cell in cell_rows[0])
        if all(len(cells) == 2 for cells in cell_rows) and not (header_is_th and len(cell_rows) > 1):
            for label_cell, value_cell in cell_rows:
                add_field(_text(label_cell), _text(value_cell))
            continue

        grid: list[list[str]] = []
        for cells in cell_rows:
            pairs = _label_pairs(cells)
            if pairs:
                for label, value in pairs:
                    add_field(label, value)
            else:
                grid.append([_text(cell) for cell in cells])
        if grid:
            tables.append({"headers": grid[0], "rows": grid[1:]})

    # ── Definition lists ──
    for dt in soup.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if dd is not None:
            add_field(_text(dt), _text(dd))

    # ── "Label: value" lines in the innermost text blocks ──
    blocks = [b for b in soup.find_all(_BLOCK_TAGS) if not b.find(_BLOCK_TAGS)] or [soup]
    for block in blocks:
        for line in block.get_text("").splitlines():
            match = _TEXT_FIELD_RE.match(line)
            if match and not match.group(2).startswith("//"):
                add_field(match.group(1), match.group(2))

    return {"fields": fields, "tables": tables}


# ── Field mapping ────────────────────────────────────────────────


def _apply_field(po: ParsedPO, field_name: str, value: str) -> None:
    """Set a PO header field from a page value; the first label found wins."""
    if field_name == "po_number":
        if not po.po_number:
            po.po_number = _po_from_value(value)
    elif field_name == "currency":
        if po.currency == DEFAULT_CURRENCY:
            po.currency = _currency_from(value) or po.currency
    elif field_name == "total_quantity":
        if not po.total_quantity:
            po.total_quantity = int(_parse_number(value) or 0)
    elif field_name == "total_value":
        if not po.total_value:
            po.total_value = _parse_number(value) or 0.0
    elif field_name in ("order_date", "delivery_date"):
        if not getattr(po, field_name):
            match = _DATE_RE.search(value)
            setattr(po, field_name, match.group(0) if match else value)
    elif not getattr(po, field_name):
        setattr(po, field_name, value)


def _find_po_number(text: str) -> str:
    """
    Try each PO pattern against the text, return first match.
    Normalizes to clean PO number (e.g. "ZA6A - 2001606637" → "2001606637").
    """
    for pattern in _PO_PATTERNS:
        match = pattern.search(text)
        if match:
            raw = match.group(1).strip()
            clean = re.sub(r"\s*[-–—]\s*", "-", raw)
            return normalize_po_number(clean)
    return ""


def _po_from_value(value: str) -> str:
    """PO number from a labelled value: a known pattern, else the first code-like token."""
    found = _find_po_number(value)
    if found:
        return found
    for token in value.split():
        token = token.strip(",;")
        if re.search(r"\d", token) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9\-/_.]{1,49}", token):
            return token
    return ""


def _currency_from(value: str) -> str:
    upper = value.upper()
    for word, code in _CURRENCY_WORDS.items():
        if re.search(rf"(?<![A-Z]){re.escape(word)}(?![A-Z])", upper):
            return code
    match = re.search(r"\b([A-Z]{3})\b", upper)
    return match.group(1) if match else ""


def _parse_number(text: str) -> Optional[float]:
    """
    Parse numbers in English or European notation:
    "1,200.50" / "1.200,50" → 1200.5, "0,45" → 0.45, "1.200" → 1200.
    """
    cleaned = re.sub(r"[^\d,.\-]", "", text)
    if not re.search(r"\d", cleaned):
        return None
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        if re.fullmatch(r"-?[1-9]\d{0,2}(,\d{3})+", cleaned):
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(",", ".")
    elif re.fullmatch(r"-?[1-9]\d{0,2}(\.\d{3})+", cleaned):
        cleaned = cleaned.replace(".", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


# ── Line items ───────────────────────────────────────────────────


def _extract_line_items(soup: BeautifulSoup) -> list[POLineItem]:
    """Read line items from the table whose header row matches the most known columns."""
    best_rows: list[list[Tag]] = []
    best_map: dict[int, str] = {}

    for table in soup.find_all("table"):
        rows = [_cells(row) for row in _own_rows(table)]
        for header_idx, cells in enumerate(rows[:3]):
            col_map: dict[int, str] = {}
            for i, cell in enumerate(cells):
                field_name = _HEADER_MAP.get(_normalize_label(_text(cell)))
                if field_name:
                    col_map[i] = field_name
            if len(col_map) > len(best_map):
                best_map = col_map
                best_rows = rows[header_idx + 1:]

    if len(best_map) < 2:
        return []

    items: list[POLineItem] = []
    current_item: Optional[POLineItem] = None

    for cells in best_rows:
        texts = [_text(cell) for cell in cells]
        if not any(cell.name == "td" for cell in cells) or not any(texts):
            continue
        first_non_empty = next((t for t in texts if t), "")
        if _TOTAL_ROW_RE.match(first_non_empty):
            continue

        combined = " ".join(texts)

        # Sub-row providing customer reference style (e.g. "Yrs: AR.BJCOS555")
        yrs_match = re.search(r"\bYrs:\s*([A-Za-z0-9\-._/]+)", combined, re.IGNORECASE)
        if yrs_match and current_item:
            current_item.style = yrs_match.group(1).strip()
            continue

        # Skip sub-rows with few cells (e.g. delivery address notes, attachments buttons)
        if len(texts) < 3 or (len(texts) < len(best_map) and not any("qty" in k.lower() for k in texts)):
            continue

        row_fields: dict[str, str] = {}
        qty = 0
        price = 0.0

        for col_idx, field_name in best_map.items():
            if col_idx < len(texts) and texts[col_idx]:
                val = texts[col_idx]
                if field_name == "quantity":
                    qty = int(_parse_number(val) or 0)
                elif field_name == "unit_price":
                    price = _parse_number(val) or 0.0
                else:
                    row_fields[field_name] = val

        # In purchase orders, line items must have a positive quantity
        if qty <= 0:
            continue

        style = row_fields.get("style", "").strip()
        description = row_fields.get("description", "").strip()

        # Check if description has ART. <style>
        art_match = re.search(r"\bART\.?\s*([A-Za-z0-9\-._/]+)", description, re.IGNORECASE)
        if art_match and (not style or style.startswith("Ors:") or not style.startswith("AR.")):
            art_code = art_match.group(1).strip()
            style = art_code if art_code.startswith("AR.") else f"AR.{art_code}"

        color = row_fields.get("color_desc") or row_fields.get("color", "")
        size = row_fields.get("size", "")

        item = POLineItem(
            line_number=len(items) + 1,
            style=style,
            color=color,
            size=size,
            quantity=qty,
            unit_price=price,
            description=description,
        )
        items.append(item)
        current_item = item

    return items


# ── Helpers ──────────────────────────────────────────────────────


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _text(element: Tag) -> str:
    return _clean(element.get_text(" ", strip=True))


def _normalize_label(text: str) -> str:
    """"Qty (pcs):" → "qty", "P.O. No." → "p o no", "Order N°" → "order n"."""
    text = re.sub(r"\(.*?\)", " ", text.lower())
    text = re.sub(r"[:#.°º*/\\_\-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _own_rows(table: Tag) -> list[Tag]:
    """Rows belonging to this table, not to tables nested inside it."""
    return [tr for tr in table.find_all("tr") if tr.find_parent("table") is table]


def _cells(row: Tag) -> list[Tag]:
    return row.find_all(["td", "th"], recursive=False)


def _is_label_cell(cell: Tag) -> bool:
    text = _text(cell)
    if not text:
        return False
    if cell.name == "th" or text.endswith(":"):
        return True
    strong = cell.find(["b", "strong"])
    return strong is not None and _text(strong) == text


def _label_pairs(cells: list[Tag]) -> list[tuple[str, str]]:
    """Rows shaped [Label][value][Label][value] → pairs; [] if the row isn't one."""
    if len(cells) < 2 or len(cells) % 2:
        return []
    labels, values = cells[0::2], cells[1::2]
    if not all(_is_label_cell(c) for c in labels) or any(c.name == "th" for c in values):
        return []
    return [(_text(label), _text(value)) for label, value in zip(labels, values)]
