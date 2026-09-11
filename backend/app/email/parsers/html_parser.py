# backend/app/email/parsers/html_parser.py
"""
HTML parser — fallback when no XML attachment exists.

Scans the email HTML body for <table> elements that contain PO data
and extracts what it can using BeautifulSoup.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from bs4 import BeautifulSoup, Tag

from app.email.parsers import ParsedPO, POLineItem

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

_DATE_RE = re.compile(
    r"\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}",
)

# Common header labels → POLineItem fields (lowercase)
_HEADER_MAP: dict[str, str] = {
    "style": "style",
    "style no": "style",
    "style number": "style",
    "article": "style",
    "item": "style",
    "item code": "style",
    "itemcode": "style",
    "product": "style",
    "product code": "style",
    "material": "style",
    "color": "color",
    "colour": "color",
    "size": "size",
    "qty": "quantity",
    "quantity": "quantity",
    "pcs": "quantity",
    "pieces": "quantity",
    "price": "unit_price",
    "unit price": "unit_price",
    "unit cost": "unit_price",
    "description": "description",
    "item description": "description",
}


def _find_po_number(text: str) -> str:
    """
    Try each PO pattern against the text, return first match.
    Normalizes whitespace around dashes (e.g. "ZA6A - 123" → "ZA6A-123").
    """
    for pattern in _PO_PATTERNS:
        match = pattern.search(text)
        if match:
            raw = match.group(1).strip()
            # Normalize: "ZA6A - 2001605039" → "ZA6A-2001605039"
            normalized = re.sub(r"\s*[-–—]\s*", "-", raw)
            return normalized
    return ""


def parse_html(html: str, subject: str = "") -> list[ParsedPO]:
    """
    Parse PO data from an HTML email body.

    Parameters
    ----------
    html : str
        Raw HTML body string.
    subject : str, optional
        Email subject line — checked first for PO number since
        Oniverse emails include it in the subject.

    Returns
    -------
    list[ParsedPO]
        Extracted POs (usually one, but could be multiple if the email
        contains separate PO sections).
    """
    soup = BeautifulSoup(html, "html.parser")
    full_text = soup.get_text(" ", strip=True)

    # --- Extract PO number: try subject first, then body ---
    po_number = ""
    if subject:
        po_number = _find_po_number(subject)
        if po_number:
            logger.info("PO number found in subject: %s", po_number)

    if not po_number:
        po_number = _find_po_number(full_text)
        if po_number:
            logger.info("PO number found in HTML body: %s", po_number)

    if not po_number:
        logger.warning("No PO number found in HTML body or subject")
        return []

    po = ParsedPO(
        po_number=po_number,
        raw_source="html",
    )

    # Try to extract supplier info from text
    supplier_match = re.search(
        r"(?:supplier|vendor|from)\s*[:]\s*(.+?)(?:\n|<|$)",
        full_text,
        re.IGNORECASE,
    )
    if supplier_match:
        po.supplier_name = supplier_match.group(1).strip()

    # Try to extract dates
    dates = _DATE_RE.findall(full_text)
    if len(dates) >= 1:
        po.order_date = dates[0]
    if len(dates) >= 2:
        po.delivery_date = dates[1]

    # --- Find the best table with line item data ---
    tables = soup.find_all("table")
    best_table: Optional[Tag] = None
    best_score = 0

    for table in tables:
        score = _score_table(table)
        if score > best_score:
            best_score = score
            best_table = table

    if best_table and best_score >= 2:
        po.line_items = _extract_line_items(best_table)
        logger.info(
            "HTML parsed: PO=%s, %d line items from table",
            po.po_number,
            len(po.line_items),
        )
    else:
        logger.info("HTML parsed: PO=%s, no line-item table found", po.po_number)

    return [po]


def _score_table(table: Tag) -> int:
    """
    Score a table by how many PO-related headers it contains.
    Higher = more likely to be the line-item table.
    """
    headers = [
        th.get_text(strip=True).lower()
        for th in table.find_all("th")
    ]
    # Also check first row <td> as some emails use <td> for headers
    first_row = table.find("tr")
    if first_row:
        headers += [
            td.get_text(strip=True).lower()
            for td in first_row.find_all("td")
        ]

    score = 0
    for h in headers:
        if h in _HEADER_MAP:
            score += 1
    return score


def _extract_line_items(table: Tag) -> list[POLineItem]:
    """
    Extract line items from a scored table.
    Maps table columns to POLineItem fields via header labels.
    """
    rows = table.find_all("tr")
    if len(rows) < 2:
        return []

    # Determine column mapping from header row
    header_row = rows[0]
    header_cells = header_row.find_all(["th", "td"])
    col_map: dict[int, str] = {}

    for i, cell in enumerate(header_cells):
        label = cell.get_text(strip=True).lower()
        if label in _HEADER_MAP:
            col_map[i] = _HEADER_MAP[label]

    if not col_map:
        return []

    # Parse data rows
    items: list[POLineItem] = []
    for row_idx, row in enumerate(rows[1:], start=1):
        cells = row.find_all("td")
        if not cells:
            continue

        li = POLineItem(line_number=row_idx)

        for col_idx, field_name in col_map.items():
            if col_idx >= len(cells):
                continue
            value = cells[col_idx].get_text(strip=True)

            if field_name == "quantity":
                li.quantity = _safe_int(value)
            elif field_name == "unit_price":
                li.unit_price = _safe_float(value)
            elif field_name == "style":
                li.style = value
            elif field_name == "color":
                li.color = value
            elif field_name == "size":
                li.size = value
            elif field_name == "description":
                li.description = value

        # Skip rows with no meaningful data
        if li.style or li.description or li.quantity > 0:
            items.append(li)

    return items


def _safe_int(s: str) -> int:
    """Parse int from string, stripping commas and whitespace."""
    try:
        return int(float(s.replace(",", "").strip()))
    except (ValueError, TypeError):
        return 0


def _safe_float(s: str) -> float:
    """Parse float from string, stripping currency symbols."""
    try:
        cleaned = re.sub(r"[^\d.\-]", "", s)
        return float(cleaned)
    except (ValueError, TypeError):
        return 0.0