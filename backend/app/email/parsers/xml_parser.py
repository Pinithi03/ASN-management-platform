# backend/app/email/parsers/xml_parser.py
"""
XML parser — extracts PO data from XML attachments using lxml + XPath.

Supports:
  - Oniverse / Calzedonia SdDataSlice format:
      • SdOrder + SdOrderLine (purchase orders from Iungo / Calzedonia EDI)
      • SdPackingSlip + SdPackingSlipLine (packing slips / delivery notes)
  - Generic PurchaseOrder format (fallback)
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from lxml import etree

from app.email.parsers import ParsedPO, POLineItem

logger = logging.getLogger(__name__)


def parse_xml_all(payload: bytes, filename: str = "") -> list[ParsedPO]:
    """
    Parse an XML payload into a list of ParsedPO objects.
    A single Calzedonia SdDataSlice XML can contain multiple orders.
    """
    try:
        # Strip external DTD declarations to prevent network resolution or missing DTD file errors
        cleaned_payload = re.sub(
            rb"<!DOCTYPE\s+[^>]+>",
            b"",
            payload,
            count=1,
            flags=re.IGNORECASE,
        )
        parser = etree.XMLParser(recover=True, no_network=True)
        root = etree.fromstring(cleaned_payload, parser=parser)
    except etree.XMLSyntaxError as e:
        raise ValueError(f"Invalid XML in {filename}: {e}") from e

    if root is None:
        raise ValueError(f"Empty XML document in {filename}")

    _strip_namespaces(root)

    # Try Oniverse / Calzedonia SdDataSlice format first
    if root.tag == "SdDataSlice" or root.xpath(".//SdPackingSlip") or root.xpath(".//SdOrder"):
        pos = _parse_sd_data_slice_all(root, filename)
        if pos:
            return pos

    # Fallback to generic format
    generic_po = _parse_generic(root, filename)
    return [generic_po]


def parse_xml(payload: bytes, filename: str = "") -> ParsedPO:
    """
    Parse a single XML attachment into a ParsedPO.
    Returns the first purchase order found in the document.
    """
    pos = parse_xml_all(payload, filename)
    if not pos:
        raise ValueError(f"No purchase order found in XML {filename}")
    return pos[0]


# ─── Oniverse / Calzedonia SdDataSlice Multi-Order Parser ───────────────────


def _parse_sd_data_slice_all(root: etree._Element, filename: str) -> list[ParsedPO]:
    """
    Parse Oniverse SdDataSlice XML format.
    Supports documents with multiple SdOrder elements or multiple orders inside SdPackingSlip.
    """
    results: list[ParsedPO] = []

<<<<<<< HEAD
    # Common Company header
    buyer_name = ""
    header = root.xpath(".//SdCompanyHeader")
    if header:
        buyer_name = _xpath_text(header[0], ".//LegalName") or ""
=======
    po = ParsedPO(raw_source="xml", source_filename=filename)

    # Company header — extract LegalName, IungoEmailAddress, and TransmissionDate
    header = root.xpath(".//SdCompanyHeader")
    if header:
        po.buyer_name = _xpath_text(header[0], ".//LegalName") or ""
        po.legal_name = po.buyer_name  # Mirror for explicit field
        po.iungo_email_address = _xpath_text(header[0], ".//IungoEmailAddress") or ""
        po.transmission_date = _xpath_text(header[0], ".//TransmissionDate") or ""

    # Also try root-level IungoEmailAddress if not found in header
    if not po.iungo_email_address:
        po.iungo_email_address = _xpath_text(root, ".//IungoEmailAddress") or ""

    # Also try root-level LegalName if not found in header
    if not po.legal_name:
        po.legal_name = _xpath_text(root, ".//LegalName") or ""

    # Also try root-level TransmissionDate if not found in header
    if not po.transmission_date:
        po.transmission_date = _xpath_text(root, ".//TransmissionDate") or ""
>>>>>>> 79ee190 (fix(email): filter 0-qty cancelled line items and support PO updates)

    # Common Partner info (supplier)
    global_supplier_name = ""
    global_supplier_code = ""
    global_destination = ""
    partner = root.xpath(".//SdPartner")
    if partner:
<<<<<<< HEAD
        global_supplier_name = _xpath_text(partner[0], ".//LegalName") or ""
        global_supplier_code = _xpath_text(partner[0], ".//PartnerId") or ""
        global_destination = _xpath_text(partner[0], ".//Address") or ""
=======
        p = partner[0]
        po.supplier_name = _xpath_text(p, ".//LegalName") or ""
        po.supplier_code = _xpath_text(p, ".//PartnerId") or ""
        po.destination = _xpath_text(p, ".//Address") or ""
        po.address = (_xpath_text(p, ".//Address") or "").strip()
        po.zipcode = (_xpath_text(p, ".//ZIPCode") or _xpath_text(p, ".//Zipcode") or "").strip()
        po.city = (_xpath_text(p, ".//City") or "").strip()
        po.town = (_xpath_text(p, ".//Town") or "").strip()
        po.country = (_xpath_text(p, ".//Country") or "").strip()
>>>>>>> 79ee190 (fix(email): filter 0-qty cancelled line items and support PO updates)

    # ─── Format A: SdOrder + SdOrderLine (Purchase Orders from Iungo/Calzedonia) ───
    order_elements = root.xpath(".//SdOrder")
    if order_elements:
        for order_elem in order_elements:
            po_num = _xpath_text(order_elem, ".//OrderNumber") or ""
            if not po_num:
                continue

<<<<<<< HEAD
            po = ParsedPO(raw_source="xml", source_filename=filename)
            po.po_number = po_num
            po.buyer_name = buyer_name or "Calzedonia Group"
            po.order_date = _xpath_text(order_elem, ".//OrderDate") or ""
            po.currency = (
                _xpath_text(order_elem, ".//Currency")
                or _xpath_text(order_elem, ".//CurrencyAlphabeticCode")
                or "EUR"
            )
            po.supplier_code = (
                _xpath_text(order_elem, ".//PartnerId")
                or global_supplier_code
                or "0000058376"
=======
        if not po.supplier_code:
            po.supplier_code = _xpath_text(order_elem, ".//PartnerId") or ""
        po.partner_id = _xpath_text(order_elem, ".//PartnerId") or po.supplier_code or _xpath_text(root, ".//PartnerId") or ""
        po.supplier_code = po.partner_id
        po.contact_person = (_xpath_text(order_elem, ".//ContactPerson") or _xpath_text(root, ".//ContactPerson") or "").strip()
        po.payment = (_xpath_text(order_elem, ".//Payment") or _xpath_text(root, ".//Payment") or "").strip()
        po.delivery_address = (_xpath_text(order_elem, ".//DeliveryAddress") or "").strip()

        # Order lines
        lines = order_elem.xpath(".//SdOrderLine")
        for i, line_elem in enumerate(lines, start=1):
            oln = (_xpath_text(line_elem, ".//OrderLineNumber") or "").strip()
            item_code = (_xpath_text(line_elem, ".//ItemCode") or "").strip()
            partner_item_code = (_xpath_text(line_elem, ".//PartnerItemCode") or "").strip()
            item_desc = (_xpath_text(line_elem, ".//ItemDescription") or "").strip()
            qty_unit = (_xpath_text(line_elem, ".//QtyUnit") or "").strip()
            qty = _xpath_int(line_elem, ".//Qty") or 0
            price = _xpath_float(line_elem, ".//Price") or 0.0

            # Ignore cancelled / 0-quantity line items
            if qty <= 0:
                continue

            li = POLineItem(
                line_number=oln or i,
                order_line_number=oln or str(i),
                item_code=item_code,
                partner_item_code=partner_item_code,
                item_description=item_desc,
                qty_unit=qty_unit,
                style=partner_item_code or item_code,
                description=item_desc,
                color="",
                size=qty_unit,
                quantity=qty,
                unit_price=price,
            )

            # Try to extract color from AuxRow2 or ItemDescription
            aux_color = (_xpath_text(line_elem, ".//AuxRow2") or "").strip()
            if aux_color:
                li.color = aux_color
            elif "," in item_desc:
                parts = [p.strip() for p in item_desc.split(",")]
                if len(parts) >= 2:
                    li.color = parts[1]  # second part is usually color

            # Delivery date per line overrides order-level
            line_delivery = _xpath_text(line_elem, ".//DeliveryDate")
            if line_delivery and not po.delivery_date:
                po.delivery_date = line_delivery

            po.line_items.append(li)

        # Fallback to line-item DeliveryAddress if empty on order
        if not po.delivery_address:
            for line_elem in lines:
                da = (_xpath_text(line_elem, ".//DeliveryAddress") or "").strip()
                if da:
                    po.delivery_address = da
                    break
        if not po.delivery_address:
            po.delivery_address = (_xpath_text(root, ".//DeliveryAddress") or "").strip()

        po.total_quantity = sum(li.quantity for li in po.line_items)
        po.total_value = round(sum(li.quantity * li.unit_price for li in po.line_items), 2)

        if po.po_number:
            logger.info(
                "SdOrder parsed: PO=%s, supplier=%s, %d lines, total_qty=%d, total_value=%.2f",
                po.po_number, po.supplier_code, len(po.line_items),
                po.total_quantity, po.total_value,
>>>>>>> 79ee190 (fix(email): filter 0-qty cancelled line items and support PO updates)
            )
            po.supplier_name = global_supplier_name or "CALZEDONIA CENTRAL HUB"
            order_deliv = _xpath_text(order_elem, ".//DeliveryAddress")
            po.destination = order_deliv or (f"{buyer_name}" if buyer_name else global_destination) or "SIRIO Plant"

            lines = order_elem.xpath(".//SdOrderLine")
            for i, line_elem in enumerate(lines, start=1):
                raw_code = (
                    _xpath_text(line_elem, ".//ItemCode")
                    or _xpath_text(line_elem, ".//ProductCode")
                    or ""
                )
                style_clean = " ".join(raw_code.split()) if raw_code else ""
                partner_item = (
                    _xpath_text(line_elem, ".//PartnerItemCode")
                    or _xpath_text(line_elem, ".//ProductCodePartner")
                    or ""
                ).strip()
                desc = (
                    _xpath_text(line_elem, ".//ItemDescription")
                    or _xpath_text(line_elem, ".//ProductDescription")
                    or partner_item
                    or style_clean
                ).strip()
                uom = (
                    _xpath_text(line_elem, ".//QtyUnit")
                    or _xpath_text(line_elem, ".//ProductUnitOfMeasure")
                    or "M"
                ).strip()
                ord_line_no = (
                    _xpath_text(line_elem, ".//OrderLineNumber")
                    or _xpath_text(line_elem, ".//LineNumber")
                    or f"{i * 100:05d}"
                ).strip()

                li = POLineItem(
                    line_number=i,
                    order_line_number=ord_line_no,
                    style=style_clean,
                    partner_code=partner_item,
                    description=desc,
                    color="",
                    size=uom,
                    uom=uom,
                    quantity=_xpath_int(line_elem, ".//Qty") or 0,
                    unit_price=_xpath_float(line_elem, ".//Price") or 0.0,
                )

                line_delivery = _xpath_text(line_elem, ".//DeliveryDate")
                if line_delivery and not po.delivery_date:
                    po.delivery_date = line_delivery

                line_delivery_addr = _xpath_text(line_elem, ".//DeliveryAddress")
                if line_delivery_addr:
                    po.destination = f"{line_delivery_addr} ({buyer_name})" if buyer_name else line_delivery_addr

                po.line_items.append(li)

<<<<<<< HEAD
            po.total_quantity = sum(li.quantity for li in po.line_items)
            po.total_value = round(sum(li.quantity * li.unit_price for li in po.line_items), 2)
            results.append(po)

        if results:
            return results

    # ─── Format B: SdPackingSlip + SdPackingSlipLine (Calzedonia Packing Slip) ───
    slip_elements = root.xpath(".//SdPackingSlip")
    if slip_elements:
        for slip_elem in slip_elements:
            slip_partner = (
                _xpath_text(slip_elem, ".//PartnerId")
                or global_supplier_code
                or "0000058376"
=======
            qty = _xpath_int(line_elem, ".//Qty") or 0
            if qty <= 0:
                continue

            li = POLineItem(
                line_number=i,
                order_line_number=str(i),
                item_code=(_xpath_text(line_elem, ".//ProductCode") or "").strip(),
                partner_item_code=(_xpath_text(line_elem, ".//ProductCode") or "").strip(),
                item_description=(_xpath_text(line_elem, ".//ProductCodePartner") or "").strip(),
                qty_unit=(_xpath_text(line_elem, ".//AuxRow5") or "").strip(),
                style=(_xpath_text(line_elem, ".//ProductCode") or "").strip(),
                description=_xpath_text(line_elem, ".//ProductCodePartner") or "",
                size=_xpath_text(line_elem, ".//AuxRow5") or "",
                quantity=qty,
                unit_price=_xpath_float(line_elem, ".//Price") or 0.0,
                color="",
>>>>>>> 79ee190 (fix(email): filter 0-qty cancelled line items and support PO updates)
            )
            slip_delivery = _xpath_text(slip_elem, ".//DeliveryDate") or ""
            packing_slip_num = _xpath_text(slip_elem, ".//PackingSlipNumber") or ""

            slip_lines = slip_elem.xpath(".//SdPackingSlipLine")
            if not slip_lines:
                slip_lines = root.xpath(".//SdPackingSlipLine")

            # Group lines by OrderNumber
            orders_map: dict[str, list[etree._Element]] = {}
            for line_elem in slip_lines:
                ord_num = (
                    _xpath_text(line_elem, ".//OrderNumber")
                    or packing_slip_num
                    or "UNKNOWN-PO"
                ).strip()
                orders_map.setdefault(ord_num, []).append(line_elem)

            for ord_num, lines in orders_map.items():
                po = ParsedPO(raw_source="xml", source_filename=filename)
                po.po_number = ord_num
                po.supplier_code = slip_partner
                po.supplier_name = global_supplier_name or "CALZEDONIA CENTRAL HUB"
                po.buyer_name = buyer_name or "Sirio Ltd"
                po.delivery_date = slip_delivery
                po.currency = "EUR"

                first_order_date = ""
                for le in lines:
                    od = _xpath_text(le, ".//OrderDate")
                    if od:
                        first_order_date = od
                        break
                po.order_date = first_order_date

                # Group cartons by (order_line_number, product_code)
                line_aggregates: dict[tuple[str, str], dict] = {}
                for le in lines:
                    raw_style = _xpath_text(le, ".//ProductCode") or ""
                    clean_style = " ".join(raw_style.split()) if raw_style else ""
                    partner_ref = (_xpath_text(le, ".//ProductCodePartner") or "").strip()
                    desc = (
                        _xpath_text(le, ".//ProductDescription")
                        or _xpath_text(le, ".//PartnerItemDescription")
                        or partner_ref
                        or clean_style
                    ).strip()
                    ord_line_no = (
                        _xpath_text(le, ".//OrderLineNumber")
                        or _xpath_text(le, ".//PackingSlipLineNumber")
                        or "00100"
                    ).strip()
                    uom = (
                        _xpath_text(le, ".//ProductUnitOfMeasure")
                        or _xpath_text(le, ".//AuxRow5")
                        or "M"
                    ).strip()

                    qty = (
                        _xpath_int(le, ".//AuxRowNum4")
                        or _xpath_int(le, ".//Qty")
                        or 0
                    )
                    price = _xpath_float(le, ".//Price") or 0.85

                    key = (ord_line_no, clean_style)
                    if key not in line_aggregates:
                        line_aggregates[key] = {
                            "order_line_number": ord_line_no,
                            "style": clean_style,
                            "partner_code": partner_ref,
                            "description": desc,
                            "uom": uom,
                            "quantity": qty,
                            "unit_price": price,
                        }
                    else:
                        line_aggregates[key]["quantity"] += qty

                for i, (_, agg) in enumerate(line_aggregates.items(), start=1):
                    li = POLineItem(
                        line_number=i,
                        order_line_number=agg["order_line_number"],
                        style=agg["style"],
                        partner_code=agg["partner_code"],
                        description=agg["description"],
                        color="",
                        size=agg["uom"],
                        uom=agg["uom"],
                        quantity=agg["quantity"],
                        unit_price=agg["unit_price"],
                    )
                    po.line_items.append(li)

                po.total_quantity = sum(li.quantity for li in po.line_items)
                po.total_value = round(sum(li.quantity * li.unit_price for li in po.line_items), 2)
                results.append(po)

    return results


# ─── Generic PO parser (fallback) ──────────────────────────────────────────


def _parse_generic(root: etree._Element, filename: str) -> ParsedPO:
    """Parse generic PurchaseOrder XML format."""
    po = ParsedPO(raw_source="xml", source_filename=filename)

    po.po_number = (
        _xpath_text(root, ".//PurchaseOrderNumber")
        or _xpath_text(root, ".//PONumber")
        or _xpath_text(root, ".//OrderNumber")
        or _xpath_text(root, ".//po_number")
        or ""
    )

<<<<<<< HEAD
    po.supplier_code = (
        _xpath_text(root, ".//SupplierCode")
        or _xpath_text(root, ".//VendorCode")
        or _xpath_text(root, ".//supplier_code")
        or "0000058376"
=======
    po.supplier_code = _xpath_text(root, ".//SupplierCode") \
        or _xpath_text(root, ".//VendorCode") \
        or _xpath_text(root, ".//supplier_code") \
        or ""
    po.partner_id = _xpath_text(root, ".//PartnerId") or po.supplier_code or ""
    po.supplier_code = po.partner_id or po.supplier_code
    po.contact_person = (_xpath_text(root, ".//ContactPerson") or "").strip()
    po.delivery_address = (_xpath_text(root, ".//DeliveryAddress") or "").strip()
    po.payment = (_xpath_text(root, ".//Payment") or "").strip()
    po.address = (_xpath_text(root, ".//Address") or "").strip()
    po.zipcode = (_xpath_text(root, ".//ZIPCode") or _xpath_text(root, ".//Zipcode") or "").strip()
    po.city = (_xpath_text(root, ".//City") or "").strip()
    po.town = (_xpath_text(root, ".//Town") or "").strip()
    po.country = (_xpath_text(root, ".//Country") or "").strip()

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
>>>>>>> 79ee190 (fix(email): filter 0-qty cancelled line items and support PO updates)
    )

    po.supplier_name = (
        _xpath_text(root, ".//SupplierName")
        or _xpath_text(root, ".//VendorName")
        or _xpath_text(root, ".//supplier_name")
        or ""
    )

    po.buyer_name = (
        _xpath_text(root, ".//BuyerName")
        or _xpath_text(root, ".//buyer_name")
        or "Calzedonia Group"
    )

    po.order_date = (
        _xpath_text(root, ".//OrderDate")
        or _xpath_text(root, ".//PODate")
        or _xpath_text(root, ".//order_date")
        or _xpath_text(root, ".//Date")
        or ""
    )

    po.delivery_date = (
        _xpath_text(root, ".//DeliveryDate")
        or _xpath_text(root, ".//delivery_date")
        or _xpath_text(root, ".//RequiredDate")
        or ""
    )

    po.destination = (
        _xpath_text(root, ".//Destination")
        or _xpath_text(root, ".//ShipTo")
        or _xpath_text(root, ".//destination")
        or ""
    )

    po.currency = (
        _xpath_text(root, ".//Currency")
        or _xpath_text(root, ".//currency")
        or "EUR"
    )

    line_tags = root.xpath(".//LineItem | .//Item | .//OrderLine | .//line_item | .//Line")
    if not line_tags:
        line_tags = root.xpath(".//POLines/* | .//Items/* | .//OrderLines/* | .//Lines/*")

    for i, elem in enumerate(line_tags, start=1):
<<<<<<< HEAD
        raw_style = (
            _xpath_text(elem, ".//Style")
            or _xpath_text(elem, ".//StyleNumber")
            or _xpath_text(elem, ".//ArticleNumber")
            or _xpath_text(elem, ".//ItemCode")
            or _xpath_text(elem, ".//ProductCode")
            or _xpath_text(elem, ".//SKU")
            or ""
        )
        style_clean = " ".join(raw_style.split()) if raw_style else ""
        uom = _xpath_text(elem, ".//UOM") or _xpath_text(elem, ".//Size") or "M"
        li = POLineItem(
            line_number=_xpath_int(elem, ".//LineNumber") or i,
            order_line_number=str(_xpath_int(elem, ".//LineNumber") or f"{i * 100:05d}"),
            style=style_clean,
            partner_code=_xpath_text(elem, ".//PartnerItemCode") or "",
            color=_xpath_text(elem, ".//Color") or "",
            size=uom,
            uom=uom,
            quantity=_xpath_int(elem, ".//Quantity") or _xpath_int(elem, ".//Qty") or 0,
            unit_price=_xpath_float(elem, ".//UnitPrice") or _xpath_float(elem, ".//Price") or 0.0,
            description=_xpath_text(elem, ".//Description") or _xpath_text(elem, ".//ItemDescription") or style_clean,
        )
        po.line_items.append(li)

    po.total_quantity = sum(li.quantity for li in po.line_items)
    po.total_value = round(sum(li.quantity * li.unit_price for li in po.line_items), 2)
=======
        qty = _xpath_int(elem, ".//Quantity") \
            or _xpath_int(elem, ".//Qty") \
            or _xpath_int(elem, ".//OrderQty") \
            or 0
        if qty <= 0:
            continue

        li = POLineItem(
            line_number=_xpath_int(elem, ".//LineNumber") or i,
            order_line_number=str(_xpath_int(elem, ".//LineNumber") or i),
            item_code=_xpath_text(elem, ".//ItemCode") or _xpath_text(elem, ".//ProductCode") or _xpath_text(elem, ".//SKU") or "",
            partner_item_code=_xpath_text(elem, ".//Style") or _xpath_text(elem, ".//StyleNumber") or _xpath_text(elem, ".//ArticleNumber") or "",
            item_description=_xpath_text(elem, ".//Description") or _xpath_text(elem, ".//ItemDescription") or _xpath_text(elem, ".//ProductName") or "",
            qty_unit=_xpath_text(elem, ".//Size") or _xpath_text(elem, ".//UOM") or "",
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
            quantity=qty,
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
    if po.line_items:
        po.total_quantity = sum(li.quantity for li in po.line_items)
        po.total_value = round(sum(li.quantity * li.unit_price for li in po.line_items), 2)
    else:
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
>>>>>>> 79ee190 (fix(email): filter 0-qty cancelled line items and support PO updates)

    if not po.po_number:
        raise ValueError(f"No PO number found in XML: {filename}")

<<<<<<< HEAD
=======
    logger.info(
        "Generic XML parsed: PO=%s, supplier=%s, %d lines, total_qty=%d, total_value=%.2f",
        po.po_number, po.supplier_code, len(po.line_items),
        po.total_quantity,
        po.total_value,
    )

>>>>>>> 79ee190 (fix(email): filter 0-qty cancelled line items and support PO updates)
    return po


# ─── Helpers ────────────────────────────────────────────────────────────────


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
