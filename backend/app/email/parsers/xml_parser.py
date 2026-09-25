# backend/app/email/parsers/xml_parser.py
"""
XML parser — extracts PO data from XML attachments using lxml + XPath.

Supports:
  - Oniverse SdDataSlice format:
      • SdOrder + SdOrderLine (purchase orders from Iungo)
      • SdPackingSlip + SdPackingSlipLine (packing slips / delivery notes)
  - Generic PurchaseOrder format (fallback)
"""

from __future__ import annotations

import logging
from typing import Optional

from lxml import etree

from app.email.parsers import ParsedPO, POLineItem, normalize_po_number

logger = logging.getLogger(__name__)


def parse_xml(payload: bytes, filename: str = "") -> ParsedPO:
    """
    Parse a single XML attachment into a ParsedPO.

    Tries Oniverse SdDataSlice format first, then falls back
    to generic PO tags.
    """
    try:
        root = etree.fromstring(payload)
    except etree.XMLSyntaxError as e:
        raise ValueError(f"Invalid XML in {filename}: {e}") from e

    _strip_namespaces(root)

    # Try Oniverse format first
    if root.tag == "SdDataSlice" or root.xpath(".//SdPackingSlip") or root.xpath(".//SdOrder"):
        return _parse_sd_data_slice(root, filename)

    # Fallback to generic format
    return _parse_generic(root, filename)


# ── Oniverse SdDataSlice parser ──────────────────────────


def _parse_sd_data_slice(root: etree._Element, filename: str) -> ParsedPO:
    """Parse Oniverse SdDataSlice XML format.

    Supports two sub-formats:
      - SdOrder + SdOrderLine (purchase orders from Iungo)
      - SdPackingSlip + SdPackingSlipLine (packing slips / delivery notes)
    """

    po = ParsedPO(raw_source="xml", source_filename=filename)

    # Company header
    header = root.xpath(".//SdCompanyHeader")
    if header:
        po.buyer_name = _xpath_text(header[0], ".//LegalName") or ""

    # Partner info (supplier)
    partner = root.xpath(".//SdPartner")
    if partner:
        po.supplier_name = _xpath_text(partner[0], ".//LegalName") or ""
        po.supplier_code = _xpath_text(partner[0], ".//PartnerId") or ""
        po.destination = _xpath_text(partner[0], ".//Address") or ""

    # ── Format A: SdOrder + SdOrderLine (Purchase Order from Iungo) ──
    order = root.xpath(".//SdOrder")
    if order:
        order_elem = order[0]
        po.po_number = normalize_po_number(_xpath_text(order_elem, ".//OrderNumber") or "")
        po.order_type = (_xpath_text(order_elem, ".//OrderTypeName") or "").strip()
        po.order_date = _xpath_text(order_elem, ".//OrderDate") or ""
        po.currency = _xpath_text(order_elem, ".//Currency") or _xpath_text(order_elem, ".//CurrencyAlphabeticCode") or "USD"

        if not po.supplier_code:
            po.supplier_code = _xpath_text(order_elem, ".//PartnerId") or ""

        # Order lines
        lines = order_elem.xpath(".//SdOrderLine")
        for i, line_elem in enumerate(lines, start=1):
            li = POLineItem(
                line_number=i,
                style=(_xpath_text(line_elem, ".//PartnerItemCode") or _xpath_text(line_elem, ".//ItemCode") or "").strip(),
                description=(_xpath_text(line_elem, ".//ItemDescription") or "").strip(),
                color="",
                size=(_xpath_text(line_elem, ".//QtyUnit") or "").strip(),
                quantity=_xpath_int(line_elem, ".//Qty") or 0,
                unit_price=_xpath_float(line_elem, ".//Price") or 0.0,
            )

            # Try to extract color from ItemDescription (e.g. "STCO1092A, BLU ASSOLUTO, 000")
            desc = li.description
            if "," in desc:
                parts = [p.strip() for p in desc.split(",")]
                if len(parts) >= 2:
                    li.color = parts[1]  # second part is usually color

            # Delivery date per line overrides order-level
            line_delivery = _xpath_text(line_elem, ".//DeliveryDate")
            if line_delivery and not po.delivery_date:
                po.delivery_date = line_delivery

            po.line_items.append(li)

        po.total_quantity = sum(li.quantity for li in po.line_items)
        po.total_value = round(sum(li.quantity * li.unit_price for li in po.line_items), 2)

        if po.po_number:
            logger.info(
                "SdOrder parsed: PO=%s, supplier=%s, %d lines, total_qty=%d, total_value=%.2f",
                po.po_number, po.supplier_code, len(po.line_items),
                po.total_quantity, po.total_value,
            )
            return po

    # ── Format B: SdPackingSlip + SdPackingSlipLine (Packing Slip) ──
    slip = root.xpath(".//SdPackingSlip")
    if slip:
        slip_elem = slip[0]
        po.delivery_date = _xpath_text(slip_elem, ".//DeliveryDate") or ""

        if not po.supplier_code:
            po.supplier_code = _xpath_text(slip_elem, ".//PartnerId") or ""

        lines = root.xpath(".//SdPackingSlipLine")
        po_number_set = False

        for i, line_elem in enumerate(lines, start=1):
            order_num = _xpath_text(line_elem, ".//OrderNumber") or ""
            if order_num and not po_number_set:
                po.po_number = normalize_po_number(order_num)
                po.order_type = (_xpath_text(line_elem, ".//OrderTypeName") or "").strip()
                po_number_set = True

            if not po.order_date:
                po.order_date = _xpath_text(line_elem, ".//OrderDate") or ""

            li = POLineItem(
                line_number=i,
                style=(_xpath_text(line_elem, ".//ProductCode") or "").strip(),
                description=_xpath_text(line_elem, ".//ProductCodePartner") or "",
                size=_xpath_text(line_elem, ".//AuxRow5") or "",
                quantity=_xpath_int(line_elem, ".//Qty") or 0,
                unit_price=_xpath_float(line_elem, ".//Price") or 0.0,
                color="",
            )
            po.line_items.append(li)

        po.total_quantity = sum(li.quantity for li in po.line_items)
        po.total_value = round(sum(li.quantity * li.unit_price for li in po.line_items), 2)

        if not po.po_number:
            for s in root.xpath(".//SdPackingSlip"):
                psn = _xpath_text(s, ".//PackingSlipNumber")
                if psn:
                    po.po_number = psn
                    break

    if not po.po_number:
        raise ValueError(f"No PO/order number found in SdDataSlice: {filename}")

    logger.info(
        "SdPackingSlip parsed: PO=%s, supplier=%s, %d lines, total_qty=%d, total_value=%.2f",
        po.po_number, po.supplier_code, len(po.line_items),
        po.total_quantity, po.total_value,
    )
    return po


# ── Generic PO parser (fallback) ────────────────────────


def _parse_generic(root: etree._Element, filename: str) -> ParsedPO:
    """Parse generic PurchaseOrder XML format."""

    po = ParsedPO(raw_source="xml", source_filename=filename)

    po.po_number = normalize_po_number(
        _xpath_text(root, ".//PurchaseOrderNumber")
        or _xpath_text(root, ".//PONumber")
        or _xpath_text(root, ".//OrderNumber")
        or _xpath_text(root, ".//po_number")
        or ""
    )

    po.supplier_code = _xpath_text(root, ".//SupplierCode") \
        or _xpath_text(root, ".//VendorCode") \
        or _xpath_text(root, ".//supplier_code") \
        or ""

    po.supplier_name = _xpath_text(root, ".//SupplierName") \
        or _xpath_text(root, ".//VendorName") \
        or _xpath_text(root, ".//supplier_name") \
        or ""

    po.buyer_name = _xpath_text(root, ".//BuyerName") \
        or _xpath_text(root, ".//buyer_name") \
        or ""

    po.order_date = _xpath_text(root, ".//OrderDate") \
        or _xpath_text(root, ".//PODate") \
        or _xpath_text(root, ".//order_date") \
        or _xpath_text(root, ".//Date") \
        or ""

    po.delivery_date = _xpath_text(root, ".//DeliveryDate") \
        or _xpath_text(root, ".//delivery_date") \
        or _xpath_text(root, ".//RequiredDate") \
        or ""

    po.destination = _xpath_text(root, ".//Destination") \
        or _xpath_text(root, ".//ShipTo") \
        or _xpath_text(root, ".//destination") \
        or ""

    po.currency = _xpath_text(root, ".//Currency") \
        or _xpath_text(root, ".//currency") \
        or "USD"

    # ── Extract line items ───────────────────────────────
    # Search for all common line element tag names
    line_tags = root.xpath(
        ".//LineItem | .//Item | .//OrderLine | .//line_item | .//Line"
    )

    # If no lines found with those tags, try inside POLines/Items wrapper
    if not line_tags:
        line_tags = root.xpath(
            ".//POLines/* | .//Items/* | .//OrderLines/* | .//Lines/*"
        )

    for i, elem in enumerate(line_tags, start=1):
        li = POLineItem(
            line_number=_xpath_int(elem, ".//LineNumber") or i,
            style=_xpath_text(elem, ".//Style")
                or _xpath_text(elem, ".//StyleNumber")
                or _xpath_text(elem, ".//ArticleNumber")
                or _xpath_text(elem, ".//ItemCode")
                or _xpath_text(elem, ".//ProductCode")
                or _xpath_text(elem, ".//SKU")
                or "",
            color=_xpath_text(elem, ".//Color")
                or _xpath_text(elem, ".//Colour")
                or "",
            size=_xpath_text(elem, ".//Size")
                or _xpath_text(elem, ".//UOM")
                or "",
            quantity=_xpath_int(elem, ".//Quantity")
                or _xpath_int(elem, ".//Qty")
                or _xpath_int(elem, ".//OrderQty")
                or 0,
            unit_price=_xpath_float(elem, ".//UnitPrice")
                or _xpath_float(elem, ".//Price")
                or _xpath_float(elem, ".//Cost")
                or 0.0,
            description=_xpath_text(elem, ".//Description")
                or _xpath_text(elem, ".//ItemDescription")
                or _xpath_text(elem, ".//ProductName")
                or "",
        )
        po.line_items.append(li)

    # ── Try to get total from XML, otherwise compute ─────
    xml_total = _xpath_float(root, ".//POTotal") \
        or _xpath_float(root, ".//TotalValue") \
        or _xpath_float(root, ".//OrderTotal") \
        or _xpath_float(root, ".//GrandTotal")
    if xml_total:
        po.total_value = xml_total

    xml_qty = _xpath_int(root, ".//TotalQuantity") \
        or _xpath_int(root, ".//TotalQty")
    if xml_qty:
        po.total_quantity = xml_qty

    if not po.po_number:
        raise ValueError(f"No PO number found in XML: {filename}")

    logger.info(
        "Generic XML parsed: PO=%s, supplier=%s, %d lines, total_qty=%d, total_value=%.2f",
        po.po_number, po.supplier_code, len(po.line_items),
        po.total_quantity or sum(li.quantity for li in po.line_items),
        po.total_value or sum(li.quantity * li.unit_price for li in po.line_items),
    )

    return po


# ── Helpers ──────────────────────────────────────────────


def _strip_namespaces(root: etree._Element) -> None:
    for elem in root.iter():
        if isinstance(elem.tag, str) and "}" in elem.tag:
            elem.tag = elem.tag.split("}", 1)[1]


def _xpath_text(elem: etree._Element, xpath: str) -> Optional[str]:
    hits = elem.xpath(xpath)
    if hits:
        text = hits[0].text
        return text.strip() if text else None
    return None


def _xpath_int(elem: etree._Element, xpath: str) -> Optional[int]:
    text = _xpath_text(elem, xpath)
    if text:
        try:
            return int(float(text))
        except (ValueError, TypeError):
            return None
    return None


def _xpath_float(elem: etree._Element, xpath: str) -> Optional[float]:
    text = _xpath_text(elem, xpath)
    if text:
        try:
            return float(text)
        except (ValueError, TypeError):
            return None
    return None