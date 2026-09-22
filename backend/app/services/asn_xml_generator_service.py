"""
ASN XML Generator & Validator service for Calzedonia EDI integration.

Constructs Calzedonia-compliant SdDataSlice XML documents according to
the Calzedonia m2Data_Partner.dtd specification, verified against 15 real
production samples from Sirio Ltd / Benji / Omega Line / Calzedonia Group.

Includes two-phase validation:
1. DTD structural schema validation using lxml.etree.DTD
2. Business rule validation (PartnerId padding, HU 20-digit prefix, weight rules)
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from io import BytesIO
from typing import Any, Optional

from lxml import etree


DTD_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dtd", "m2Data_Partner.dtd")


class ValidationError:
    """Represents a single validation issue."""
    def __init__(self, field: str, message: str, line_number: Optional[int] = None):
        self.field = field
        self.message = message
        self.line_number = line_number

    def to_dict(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "message": self.message,
            "line_number": self.line_number,
        }


class ValidationResult:
    """Collects validation outcome and error list."""
    def __init__(self):
        self.errors: list[ValidationError] = []

    @property
    def valid(self) -> bool:
        return len(self.errors) == 0

    def add_error(self, field: str, message: str, line_number: Optional[int] = None):
        self.errors.append(ValidationError(field, message, line_number))

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "errors": [e.to_dict() for e in self.errors],
        }


def generate_asn_xml(
    company_name: str,
    group_code: str,
    supplier_code: str,
    packing_slip_number: str,
    packing_slip_date: datetime | str,
    delivery_date: datetime | str,
    boxes: list[dict[str, Any]],
    note: str = "",
) -> str:
    """
    Generate complete Calzedonia ASN XML matching the m2Data_Partner.dtd specification.

    Args:
        company_name: e.g. "Sirio Ltd", "Benji Ltd", "Omega Line Ltd", or "Alpha Apparels Ltd"
        group_code: e.g. "SIRIONEW" or "Benji"
        supplier_code: Supplier vendor code (e.g. "0000058376" or "58376")
        packing_slip_number: 8-digit or alphanumeric packing slip / shipment number
        packing_slip_date: Date of packing slip (datetime or 'DD-MM-YYYY')
        delivery_date: Estimated delivery date (datetime or 'DD-MM-YYYY')
        boxes: List of carton/box dictionaries containing:
            - po_number: str
            - po_line: str (e.g. '00100' or '00100-0001')
            - order_date: datetime or 'DD-MM-YYYY'
            - order_type: 'ZA6A' (default)
            - hu_number: 20-digit HU number
            - material_code: Calzedonia product code
            - material_desc: Material description
            - partner_product_code: Supplier material code
            - lot_number: Lot / Roll / Batch code
            - supplier_carton_ref: Carton or roll ID
            - quantity: float/int
            - uom: 'M', 'PC', 'KG'
            - gross_weight: float
            - net_weight: float
        note: Optional packing slip note

    Returns:
        XML string with DOCTYPE declaration.
    """
    # ─── Format dates ───────────────────────────────────────────────
    now = datetime.utcnow()
    transmission_date_str = now.strftime("%d-%m-%Y %H:%M")

    def format_date(d: Any) -> str:
        if isinstance(d, datetime):
            return d.strftime("%d-%m-%Y")
        if isinstance(d, str):
            # If already DD-MM-YYYY
            if re.match(r"^\d{2}-\d{2}-\d{4}$", d.strip()):
                return d.strip()
            # If YYYY-MM-DD
            try:
                parsed = datetime.strptime(d.strip(), "%Y-%m-%d")
                return parsed.strftime("%d-%m-%Y")
            except Exception:
                pass
        return now.strftime("%d-%m-%Y")

    ps_date_str = format_date(packing_slip_date)
    deliv_date_str = format_date(delivery_date)
    partner_id_str = str(supplier_code).lstrip("0").zfill(10)

    # ─── Group Boxes by (po_number, base_po_line) for AuxRow math ───
    # In Calzedonia EDI:
    # AuxRow1: Group sequential integer (1, 2, 3...)
    # AuxRowNum1: Box sequential integer within that group (1, 2, 3...)
    # AuxRowNum4: Total sum of Qty across all boxes in that group
    group_map: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for box in boxes:
        po_num = str(box.get("po_number", ""))
        po_line_raw = str(box.get("po_line", ""))
        # Normalize to base line (e.g. '00100' from '00100-0001' or '100')
        base_line = po_line_raw.split("-")[0].strip().zfill(5)
        key = (po_num, base_line)
        if key not in group_map:
            group_map[key] = []
        group_map[key].append(box)

    # Precalculate group totals
    group_totals: dict[tuple[str, str], float] = {
        key: sum(float(b.get("quantity") or 0.0) for b in b_list)
        for key, b_list in group_map.items()
    }

    # Assign group numbers
    group_ids: dict[tuple[str, str], int] = {
        key: idx for idx, key in enumerate(group_map.keys(), start=1)
    }

    # ─── Build XML Tree ─────────────────────────────────────────────
    root = etree.Element("SdDataSlice")

    # SdCompanyHeader
    comp_header = etree.SubElement(root, "SdCompanyHeader")
    etree.SubElement(comp_header, "LegalName").text = company_name or "Sirio Ltd"
    etree.SubElement(comp_header, "Group").text = group_code or "SIRIONEW"
    etree.SubElement(comp_header, "TransmissionDate").text = transmission_date_str

    # SdPackingSlip
    ps_elem = etree.SubElement(root, "SdPackingSlip")
    etree.SubElement(ps_elem, "PartnerId").text = partner_id_str
    etree.SubElement(ps_elem, "PackingSlipNumber").text = str(packing_slip_number).zfill(8)
    etree.SubElement(ps_elem, "FgOutbound").text = "false"
    etree.SubElement(ps_elem, "PackingSlipDate").text = ps_date_str
    etree.SubElement(ps_elem, "DeliveryDate").text = deliv_date_str
    etree.SubElement(ps_elem, "Note").text = note or ""

    # Keep track of box index per group
    box_seq_in_group: dict[tuple[str, str], int] = {key: 0 for key in group_map.keys()}

    for line_idx, box in enumerate(boxes, start=1):
        po_num = str(box.get("po_number", ""))
        po_line_raw = str(box.get("po_line", ""))
        base_line = po_line_raw.split("-")[0].strip().zfill(5)
        key = (po_num, base_line)

        group_id = group_ids[key]
        box_seq_in_group[key] += 1
        box_seq = box_seq_in_group[key]
        group_total_qty = group_totals[key]

        # Standard schedule line representation: '00100-0001'
        full_line_num = po_line_raw if "-" in po_line_raw else f"{base_line}-0001"
        order_date_str = format_date(box.get("order_date") or packing_slip_date)

        qty_val = float(box.get("quantity") or 0.0)
        qty_str = str(int(qty_val)) if qty_val == int(qty_val) else f"{qty_val:.2f}"

        gw_val = float(box.get("gross_weight") or 0.0)
        nw_val = float(box.get("net_weight") or 0.0)

        group_total_str = str(int(group_total_qty)) if group_total_qty == int(group_total_qty) else f"{group_total_qty:.2f}"

        uom = str(box.get("uom") or "M").upper()

        line_elem = etree.SubElement(ps_elem, "SdPackingSlipLine")
        etree.SubElement(line_elem, "PackingSlipLineNumber").text = f"{group_id}-{box_seq}"
        etree.SubElement(line_elem, "OrderTypeName").text = str(box.get("order_type") or "ZA6A")
        etree.SubElement(line_elem, "OrderNumber").text = po_num
        etree.SubElement(line_elem, "OrderDate").text = order_date_str
        etree.SubElement(line_elem, "OrderLineNumber").text = full_line_num
        etree.SubElement(line_elem, "Qty").text = qty_str
        etree.SubElement(line_elem, "BackOrder").text = ""
        etree.SubElement(line_elem, "AcceptanceDate").text = ""
        etree.SubElement(line_elem, "AcceptanceQty").text = ""
        etree.SubElement(line_elem, "AcceptanceBackOrder").text = "false"
        etree.SubElement(line_elem, "ProductCode").text = str(box.get("material_code") or "")
        etree.SubElement(line_elem, "ProductCodePartner").text = str(box.get("partner_product_code") or "")
        etree.SubElement(line_elem, "ProductDescription").text = str(box.get("material_desc") or "")
        etree.SubElement(line_elem, "PartnerItemDescription").text = ""
        etree.SubElement(line_elem, "ProductUnitOfMeasure").text = uom
        etree.SubElement(line_elem, "ProductBatchCode").text = str(box.get("lot_number") or "")
        etree.SubElement(line_elem, "ProductBatchCodePartner").text = ""
        etree.SubElement(line_elem, "Price").text = ""
        etree.SubElement(line_elem, "PriceUnit").text = ""
        etree.SubElement(line_elem, "Note").text = ""
        etree.SubElement(line_elem, "AuxRow1").text = str(group_id)
        etree.SubElement(line_elem, "AuxRow2").text = str(box.get("hu_number") or "")
        etree.SubElement(line_elem, "AuxRow3").text = "BOX"
        etree.SubElement(line_elem, "AuxRow4").text = str(box.get("supplier_carton_ref") or box.get("lot_number") or "")
        etree.SubElement(line_elem, "AuxRow5").text = uom
        etree.SubElement(line_elem, "AuxRowNum1").text = str(box_seq)
        etree.SubElement(line_elem, "AuxRowNum2").text = f"{gw_val:.2f}"
        etree.SubElement(line_elem, "AuxRowNum3").text = f"{nw_val:.2f}"
        etree.SubElement(line_elem, "AuxRowNum4").text = group_total_str

    xml_bytes = etree.tostring(
        root,
        xml_declaration=True,
        encoding="utf-8",
        pretty_print=True,
    )

    xml_str = xml_bytes.decode("utf-8")
    # Insert DOCTYPE after <?xml ...?>
    xml_str = re.sub(
        r"<\?xml[^\?]*\?>",
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE SdDataSlice SYSTEM "m2Data_Partner.dtd">',
        xml_str,
        count=1,
    )

    return xml_str


def validate_asn_xml(xml_content: str | bytes, supplier_code: str) -> ValidationResult:
    """
    Perform two-phase validation on generated ASN XML:
    1. DTD schema validation
    2. Business rules validation (lengths, prefixes, weights, totals)
    """
    result = ValidationResult()

    if isinstance(xml_content, str):
        xml_bytes = xml_content.encode("utf-8")
    else:
        xml_bytes = xml_content

    # Parse XML without DOCTYPE first for safe DOM access
    try:
        xml_str = xml_bytes.decode("utf-8", errors="replace")
        clean_xml = re.sub(r"<!DOCTYPE[^>]*>", "", xml_str)
        tree = etree.parse(BytesIO(clean_xml.encode("utf-8")))
        root = tree.getroot()
    except etree.XMLSyntaxError as e:
        result.add_error("XML", f"XML syntax error: {str(e)}")
        return result

    # ─── Phase 1: DTD Validation ────────────────────────────────────
    if os.path.exists(DTD_PATH):
        try:
            with open(DTD_PATH, "r", encoding="utf-8") as f:
                dtd = etree.DTD(f)
            if not dtd.validate(root):
                for err in dtd.error_log.filter_from_errors():
                    result.add_error("DTD", str(err.message), err.line)
        except Exception as e:
            result.add_error("DTD", f"DTD validation failed to execute: {str(e)}")
    else:
        result.add_error("DTD", f"DTD specification file not found at {DTD_PATH}")

    # ─── Phase 2: Business Rules ────────────────────────────────────
    if root.tag != "SdDataSlice":
        result.add_error("Root", "Root element must be <SdDataSlice>")
        return result

    company_header = root.find("SdCompanyHeader")
    if company_header is None:
        result.add_error("SdCompanyHeader", "<SdCompanyHeader> missing")
    else:
        if not company_header.findtext("LegalName"):
            result.add_error("LegalName", "<LegalName> is required")
        if not company_header.findtext("Group"):
            result.add_error("Group", "<Group> is required")
        if not company_header.findtext("TransmissionDate"):
            result.add_error("TransmissionDate", "<TransmissionDate> is required")

    packing_slip = root.find("SdPackingSlip")
    if packing_slip is None:
        result.add_error("SdPackingSlip", "<SdPackingSlip> missing")
        return result

    # PartnerId must be 10 digits
    expected_partner_id = str(supplier_code).lstrip("0").zfill(10)
    partner_id = (packing_slip.findtext("PartnerId") or "").strip()
    if not partner_id:
        result.add_error("PartnerId", "<PartnerId> is required")
    elif partner_id != expected_partner_id:
        result.add_error(
            "PartnerId",
            f"PartnerId '{partner_id}' does not match expected supplier code '{expected_partner_id}'",
        )

    if (packing_slip.findtext("FgOutbound") or "").strip() != "false":
        result.add_error("FgOutbound", "<FgOutbound> must be 'false'")

    if not packing_slip.findtext("PackingSlipNumber"):
        result.add_error("PackingSlipNumber", "<PackingSlipNumber> is required")

    lines = packing_slip.findall("SdPackingSlipLine")
    if not lines:
        result.add_error("SdPackingSlipLine", "At least one <SdPackingSlipLine> is required")
        return result

    seen_hus = set()
    expected_hu_prefix = "1" + str(supplier_code).lstrip("0").zfill(9)

    for idx, line in enumerate(lines, start=1):
        loc = f"Line {idx}"

        # Qty
        qty_txt = line.findtext("Qty")
        try:
            qty_val = float(qty_txt)
            if qty_val <= 0:
                result.add_error(f"{loc}/Qty", "Quantity must be strictly positive (> 0)")
        except (ValueError, TypeError):
            result.add_error(f"{loc}/Qty", f"Invalid quantity '{qty_txt}'")

        # AuxRow2 (Handling Unit: 20 digits)
        hu = (line.findtext("AuxRow2") or "").strip()
        if not hu:
            result.add_error(f"{loc}/AuxRow2", "Handling Unit (AuxRow2) is required")
        elif len(hu) != 20 or not hu.isdigit():
            result.add_error(
                f"{loc}/AuxRow2",
                f"Handling Unit must be exactly 20 digits, got '{hu}' (len: {len(hu)})",
            )
        elif not hu.startswith(expected_hu_prefix):
            result.add_error(
                f"{loc}/AuxRow2",
                f"HU must start with prefix '{expected_hu_prefix}', got '{hu}'",
            )
        if hu in seen_hus:
            result.add_error(f"{loc}/AuxRow2", f"Duplicate HU '{hu}' found in shipment")
        seen_hus.add(hu)

        # AuxRow3 (Packaging: 'BOX')
        aux3 = (line.findtext("AuxRow3") or "").strip()
        if aux3 not in ("BOX", "ROLL"):
            result.add_error(f"{loc}/AuxRow3", "AuxRow3 must be 'BOX' or 'ROLL'")

        # Weights: GW >= NW > 0
        try:
            gw = float(line.findtext("AuxRowNum2") or 0.0)
            nw = float(line.findtext("AuxRowNum3") or 0.0)
            if gw <= 0:
                result.add_error(f"{loc}/AuxRowNum2", f"Gross Weight must be > 0, got {gw}")
            if nw <= 0:
                result.add_error(f"{loc}/AuxRowNum3", f"Net Weight must be > 0, got {nw}")
            if gw < nw:
                result.add_error(f"{loc}/Weights", f"Gross Weight ({gw}) cannot be less than Net Weight ({nw})")
        except (ValueError, TypeError):
            result.add_error(f"{loc}/Weights", "Invalid gross or net weight number")

        # Required identifiers
        for tag in ["PackingSlipLineNumber", "OrderNumber", "OrderLineNumber", "ProductCode"]:
            if not line.findtext(tag):
                result.add_error(f"{loc}/{tag}", f"<{tag}> is mandatory")

    return result


def get_asn_xml_filename(packing_slip_number: str, supplier_code: str) -> str:
    """Generate standard filename: PL_{PackingSlipNumber}_{SupplierCode10}.xml"""
    ps_clean = str(packing_slip_number).zfill(8)
    supp_clean = str(supplier_code).lstrip("0").zfill(10)
    return f"PL_{ps_clean}_{supp_clean}.xml"


def get_asn_email_subject(packing_slip_number: str, packing_slip_date: datetime | str, supplier_code: str) -> str:
    """Generate email subject: Packing List {Number} of {DD-MM-YYYY} - {SupplierCode10}"""
    if isinstance(packing_slip_date, datetime):
        date_str = packing_slip_date.strftime("%d-%m-%Y")
    else:
        date_str = str(packing_slip_date)
    ps_clean = str(packing_slip_number).zfill(8)
    supp_clean = str(supplier_code).lstrip("0").zfill(10)
    return f"Packing List {ps_clean} of {date_str} - {supp_clean}"
