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

# Regex patterns for extracting PO metadata from free text
_PO_NUMBER_RE = re.compile(
    r"(PO[-‑][\w\-/]{2,20})",
    re.IGNORECASE,
)
_DATE_RE = re.compile(
    r"\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}",
)

# Common header labels → POLineItem fields (lowercase)
_HEADER_MAP: dict[str, str] = {
    "style": "style",
    "style no": "style",
    "style number": "style",
    "article": "style",
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
    "item": "description",
    "item description": "description",
}


def parse_html(html: str) -> list[ParsedPO]:
    """
    Parse PO data from an HTML email body.

    Parameters
    ----------
    html : str
        Raw HTML body string.

    Returns
    -------
    list[ParsedPO]
        Extracted POs (usually one, but could be multiple if the email
        contains separate PO sections).
    """
    soup = BeautifulSoup(html, "html.parser")
    full_text = soup.get_text(" ", strip=True)

    # --- Extract PO number from text ---
    po_number = ""
    po_match = _PO_NUMBER_RE.search(full_text)
    if po_match:
        po_number = po_match.group(1).strip()

    if not po_number:
        logger.warning("No PO number found in HTML body")
        return []

    po = ParsedPO(
        po_number=po_number,
        raw_source="html",
    )

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