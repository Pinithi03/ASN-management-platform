"""
Barcode label generator for Calzedonia shipments.

Generates industrial shipping labels with Code 39 barcodes using ReportLab.
Supported sizes:
- 6x4: 6"x4" Landscape (Calzedonia Standard Thermal)
- 4x6: 4"x6" Portrait (Logistics Standard Thermal)
- 4x3: 4"x3" Compact Box / Carton
- a4:  A4 Sheet (4 labels per page in a 2x2 grid)
"""

from __future__ import annotations

import io
from datetime import datetime
from typing import Any, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code39

SIZE_6X4 = (6.0 * inch, 4.0 * inch)
SIZE_4X6 = (4.0 * inch, 6.0 * inch)
SIZE_4X3 = (4.0 * inch, 3.0 * inch)
SIZE_A4 = A4

LABEL_SIZES = {
    "6x4": SIZE_6X4,
    "4x6": SIZE_4X6,
    "4x3": SIZE_4X3,
    "a4": SIZE_A4,
}


def _fit_text(
    c: canvas.Canvas,
    text: str,
    font_name: str,
    max_size: float,
    min_size: float,
    max_width: float,
) -> tuple[str, float]:
    """Fit text within max_width by scaling down font size or truncating with ellipsis if needed."""
    if not text:
        return "", max_size
    text = str(text).strip()
    size = max_size
    while size >= min_size:
        if c.stringWidth(text, font_name, size) <= max_width:
            return text, size
        size -= 0.5

    size = min_size
    truncated = text
    while len(truncated) > 3 and c.stringWidth(truncated + "...", font_name, size) > max_width:
        truncated = truncated[:-1]
    return (truncated + "...") if truncated != text else text, size


def _draw_label_6x4(
    c: canvas.Canvas,
    origin_x: float = 0.0,
    origin_y: float = 0.0,
    scale: float = 1.0,
    hu_number: str = "",
    supplier_name: str = "",
    supplier_code: str = "",
    po_number: str = "",
    po_line_number: str = "",
    material_code: str = "",
    material_description: str = "",
    product_code_partner: str = "",
    qty: float = 0.0,
    unit_of_measure: str = "M",
    batch_code: str = "",
    gross_weight: float = 0.0,
    net_weight: float = 0.0,
    box_index: int = 1,
    total_boxes: int = 1,
    label_date: str = "",
) -> None:
    """Draw a 6x4 inch landscape shipping label with proper text boundaries and barcode clearance."""
    c.saveState()
    c.translate(origin_x, origin_y)
    if scale != 1.0:
        c.scale(scale, scale)

    width = 6.0 * inch
    height = 4.0 * inch
    margin = 0.25 * inch

    x = margin
    right_x = width - margin
    y = height - margin

    # 1. Header Banner
    c.setFont("Helvetica-Bold", 13)
    c.drawString(x, y, "CALZEDONIA GROUP")
    y -= 4
    c.setStrokeColorRGB(0.2, 0.2, 0.2)
    c.setLineWidth(1.4)
    c.line(x, y, right_x, y)
    y -= 15

    # 2. Supplier Info
    # Right column: Vendor Code (right-aligned)
    supp_code_str = str(supplier_code or "").zfill(10)
    vendor_label = "Vendor Code: "
    vendor_full_str = vendor_label + supp_code_str
    vendor_w = c.stringWidth(vendor_label, "Helvetica-Bold", 9) + c.stringWidth(supp_code_str, "Helvetica", 9)
    vendor_start_x = right_x - vendor_w

    c.setFont("Helvetica-Bold", 9)
    c.drawString(vendor_start_x, y, vendor_label)
    c.setFont("Helvetica", 9)
    c.drawString(vendor_start_x + c.stringWidth(vendor_label, "Helvetica-Bold", 9), y, supp_code_str)

    # Left column: Supplier Name (bounded to avoid collision with Vendor Code)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Supplier:")
    supp_name_start_x = x + 48
    max_supp_name_w = (vendor_start_x - 12) - supp_name_start_x
    fitted_name, name_font_size = _fit_text(c, supplier_name or "", "Helvetica", 9.0, 7.5, max_supp_name_w)
    c.setFont("Helvetica", name_font_size)
    c.drawString(supp_name_start_x, y, fitted_name)
    y -= 14

    # 3. PO Information
    # Right column: PO Item / Line (right-aligned)
    po_line_label = "PO Item / Line: "
    po_line_val = str(po_line_number or "100")
    po_line_w = c.stringWidth(po_line_label, "Helvetica-Bold", 9) + c.stringWidth(po_line_val, "Helvetica", 9)
    po_line_start_x = right_x - po_line_w
    c.setFont("Helvetica-Bold", 9)
    c.drawString(po_line_start_x, y, po_line_label)
    c.setFont("Helvetica", 9)
    c.drawString(po_line_start_x + c.stringWidth(po_line_label, "Helvetica-Bold", 9), y, po_line_val)

    # Left column: P/O Number
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "P/O Number:")
    c.setFont("Helvetica", 9)
    c.drawString(x + 65, y, str(po_number or ""))
    y -= 14

    # 4. Material Info
    # Right column: Partner Ref
    if product_code_partner:
        pref_str = f"Partner Ref: {product_code_partner}"
        pref_w = c.stringWidth(pref_str, "Helvetica", 8.5)
        c.setFont("Helvetica", 8.5)
        c.drawString(right_x - pref_w, y, pref_str)

    # Left column: Material
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Material:")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 55, y, str(material_code or ""))
    y -= 13

    # Description
    desc = str(material_description or "")
    fitted_desc, desc_size = _fit_text(c, f"Desc: {desc}" if desc else "", "Helvetica-Oblique", 8.0, 7.0, right_x - x)
    if fitted_desc:
        c.setFont("Helvetica-Oblique", desc_size)
        c.drawString(x, y, fitted_desc)
    y -= 5

    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.setLineWidth(0.5)
    c.line(x, y, right_x, y)
    y -= 14

    # 5. Quantity, Weights & Lot / Roll
    qty_str = f"{int(qty)}" if qty == int(qty) else f"{qty:.2f}"
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x, y, f"Qty: {qty_str} {unit_of_measure}")

    gw_val = f"{gross_weight:.2f}" if gross_weight else "0.00"
    nw_val = f"{net_weight:.2f}" if net_weight else "0.00"
    c.setFont("Helvetica", 9)
    c.drawString(x + 2.3 * inch, y, f"Gross: {gw_val} kg")
    c.drawString(x + 3.7 * inch, y, f"Net: {nw_val} kg")
    y -= 13

    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Lot / Roll / Ref:")
    c.setFont("Helvetica", 9)
    c.drawString(x + 85, y, str(batch_code or "DEFAULT"))
    y -= 5

    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.line(x, y, right_x, y)
    y -= 13

    # 6. Handling Unit (HU) Number Title
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x, y, f"HU: {hu_number}")
    y -= 4

    # 7. Code 39 Barcode (Separated human-readable text prevents line-strike collision)
    bar_height = 0.50 * inch
    bar_width = 0.0135 * inch
    barcode_obj = code39.Standard39(
        hu_number,
        barHeight=bar_height,
        barWidth=bar_width,
        checksum=0,
        humanReadable=False,
    )
    b_width = barcode_obj.width
    barcode_x = max(margin, (width - b_width) / 2)
    y -= bar_height
    barcode_obj.drawOn(c, barcode_x, y)

    # Human-readable text centered below barcode bars
    y -= 12
    c.setFont("Helvetica-Bold", 10.5)
    c.drawCentredString(width / 2, y, hu_number)

    # Separator line with 8pt clearance below text
    y -= 8
    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.line(x, y, right_x, y)
    y -= 11

    # 8. Footer
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, f"Box {box_index} of {total_boxes}")

    c.setFont("Helvetica", 8.5)
    date_str = f"Date: {label_date}"
    date_w = c.stringWidth(date_str, "Helvetica", 8.5)
    c.drawString(right_x - date_w, y, date_str)

    c.restoreState()


def _draw_label_4x6(
    c: canvas.Canvas,
    origin_x: float = 0.0,
    origin_y: float = 0.0,
    scale: float = 1.0,
    hu_number: str = "",
    supplier_name: str = "",
    supplier_code: str = "",
    po_number: str = "",
    po_line_number: str = "",
    material_code: str = "",
    material_description: str = "",
    product_code_partner: str = "",
    qty: float = 0.0,
    unit_of_measure: str = "M",
    batch_code: str = "",
    gross_weight: float = 0.0,
    net_weight: float = 0.0,
    box_index: int = 1,
    total_boxes: int = 1,
    label_date: str = "",
) -> None:
    """Draw a 4x6 inch portrait shipping label (standard thermal logistics roll)."""
    c.saveState()
    c.translate(origin_x, origin_y)
    if scale != 1.0:
        c.scale(scale, scale)

    width = 4.0 * inch
    height = 6.0 * inch
    margin = 0.22 * inch

    x = margin
    right_x = width - margin
    y = height - margin

    # 1. Header
    c.setFont("Helvetica-Bold", 13)
    c.drawString(x, y, "CALZEDONIA GROUP")
    y -= 5
    c.setStrokeColorRGB(0.2, 0.2, 0.2)
    c.setLineWidth(1.4)
    c.line(x, y, right_x, y)
    y -= 18

    # 2. Supplier Info (Dedicated lines in portrait for plenty of room)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Supplier:")
    fitted_name, name_size = _fit_text(c, supplier_name or "", "Helvetica-Bold", 9.5, 8.0, right_x - (x + 50))
    c.setFont("Helvetica-Bold", name_size)
    c.drawString(x + 50, y, fitted_name)
    y -= 14

    supp_code_str = str(supplier_code or "").zfill(10)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Vendor Code:")
    c.setFont("Helvetica", 9)
    c.drawString(x + 70, y, supp_code_str)

    date_str = f"Date: {label_date}"
    date_w = c.stringWidth(date_str, "Helvetica", 8.5)
    c.setFont("Helvetica", 8.5)
    c.drawString(right_x - date_w, y, date_str)
    y -= 8

    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.setLineWidth(0.5)
    c.line(x, y, right_x, y)
    y -= 16

    # 3. PO Information
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "P/O Number:")
    c.setFont("Helvetica", 9.5)
    c.drawString(x + 65, y, str(po_number or ""))

    po_line_str = f"Line: {po_line_number or '100'}"
    c.setFont("Helvetica-Bold", 9)
    c.drawString(right_x - c.stringWidth(po_line_str, "Helvetica-Bold", 9), y, po_line_str)
    y -= 15

    # 4. Material Info
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Material:")
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(x + 52, y, str(material_code or ""))
    y -= 13

    if product_code_partner:
        c.setFont("Helvetica", 8.5)
        c.drawString(x, y, f"Partner Ref: {product_code_partner}")
        y -= 12

    desc = str(material_description or "")
    fitted_desc, desc_size = _fit_text(c, f"Desc: {desc}" if desc else "", "Helvetica-Oblique", 8.0, 7.0, right_x - x)
    if fitted_desc:
        c.setFont("Helvetica-Oblique", desc_size)
        c.drawString(x, y, fitted_desc)
    y -= 6

    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.line(x, y, right_x, y)
    y -= 16

    # 5. Quantity & Weights
    qty_str = f"{int(qty)}" if qty == int(qty) else f"{qty:.2f}"
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x, y, f"Qty: {qty_str} {unit_of_measure}")
    y -= 14

    gw_val = f"{gross_weight:.2f}" if gross_weight else "0.00"
    nw_val = f"{net_weight:.2f}" if net_weight else "0.00"
    c.setFont("Helvetica", 9)
    c.drawString(x, y, f"Gross: {gw_val} kg")
    c.drawString(x + 1.6 * inch, y, f"Net: {nw_val} kg")
    y -= 14

    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Lot / Roll / Ref:")
    c.setFont("Helvetica", 9)
    c.drawString(x + 85, y, str(batch_code or "DEFAULT"))
    y -= 6

    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.line(x, y, right_x, y)
    y -= 16

    # 6. Handling Unit (HU) Number Title
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x, y, f"HU: {hu_number}")
    y -= 6

    # 7. Code 39 Barcode (adjusted for 4-inch width)
    bar_height = 0.65 * inch
    bar_width = 0.010 * inch  # ensures full 20-digit fits neatly inside 250pt width
    barcode_obj = code39.Standard39(
        hu_number,
        barHeight=bar_height,
        barWidth=bar_width,
        checksum=0,
        humanReadable=False,
    )
    b_width = barcode_obj.width
    barcode_x = max(margin, (width - b_width) / 2)
    y -= bar_height
    barcode_obj.drawOn(c, barcode_x, y)

    # Human-readable text centered below barcode bars
    y -= 13
    c.setFont("Helvetica-Bold", 10.5)
    c.drawCentredString(width / 2, y, hu_number)

    # Separator line with clearance
    y -= 10
    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.line(x, y, right_x, y)
    y -= 14

    # 8. Footer
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x, y, f"Box {box_index} of {total_boxes}")

    c.restoreState()


def _draw_label_4x3(
    c: canvas.Canvas,
    origin_x: float = 0.0,
    origin_y: float = 0.0,
    scale: float = 1.0,
    hu_number: str = "",
    supplier_name: str = "",
    supplier_code: str = "",
    po_number: str = "",
    po_line_number: str = "",
    material_code: str = "",
    material_description: str = "",
    product_code_partner: str = "",
    qty: float = 0.0,
    unit_of_measure: str = "M",
    batch_code: str = "",
    gross_weight: float = 0.0,
    net_weight: float = 0.0,
    box_index: int = 1,
    total_boxes: int = 1,
    label_date: str = "",
) -> None:
    """Draw a 4x3 inch compact shipping label."""
    c.saveState()
    c.translate(origin_x, origin_y)
    if scale != 1.0:
        c.scale(scale, scale)

    width = 4.0 * inch
    height = 3.0 * inch
    margin = 0.18 * inch

    x = margin
    right_x = width - margin
    y = height - margin

    # 1. Header
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x, y, "CALZEDONIA GROUP")
    date_str = f"{label_date}"
    c.setFont("Helvetica", 7.5)
    c.drawString(right_x - c.stringWidth(date_str, "Helvetica", 7.5), y, date_str)
    y -= 3
    c.setStrokeColorRGB(0.2, 0.2, 0.2)
    c.setLineWidth(1.2)
    c.line(x, y, right_x, y)
    y -= 11

    # 2. Supplier Info
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y, "Supplier:")
    fitted_name, name_size = _fit_text(c, supplier_name or "", "Helvetica", 8.0, 7.0, 140)
    c.setFont("Helvetica", name_size)
    c.drawString(x + 40, y, fitted_name)

    supp_code_str = str(supplier_code or "").zfill(10)
    code_txt = f"Code: {supp_code_str}"
    c.setFont("Helvetica-Bold", 8)
    c.drawString(right_x - c.stringWidth(code_txt, "Helvetica-Bold", 8), y, code_txt)
    y -= 10

    # 3. PO Information
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y, f"PO: {po_number}")
    line_txt = f"Line: {po_line_number or '100'}"
    c.drawString(right_x - c.stringWidth(line_txt, "Helvetica-Bold", 8), y, line_txt)
    y -= 10

    # 4. Material
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y, "Mat:")
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x + 22, y, str(material_code or ""))

    qty_str = f"{int(qty)}" if qty == int(qty) else f"{qty:.2f}"
    qty_txt = f"Qty: {qty_str} {unit_of_measure}"
    c.setFont("Helvetica-Bold", 9)
    c.drawString(right_x - c.stringWidth(qty_txt, "Helvetica-Bold", 9), y, qty_txt)
    y -= 4

    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.setLineWidth(0.5)
    c.line(x, y, right_x, y)
    y -= 9

    # 5. Weights & Ref
    gw_val = f"{gross_weight:.1f}" if gross_weight else "0.0"
    nw_val = f"{net_weight:.1f}" if net_weight else "0.0"
    c.setFont("Helvetica", 7.5)
    c.drawString(x, y, f"GW: {gw_val}kg  NW: {nw_val}kg")
    ref_txt = f"Lot: {str(batch_code or 'DEFAULT')[:12]}"
    c.drawString(right_x - c.stringWidth(ref_txt, "Helvetica", 7.5), y, ref_txt)
    y -= 9

    # 6. HU text
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x, y, f"HU: {hu_number}")
    y -= 3

    # 7. Code 39 Barcode (compact)
    bar_height = 0.38 * inch
    bar_width = 0.0095 * inch
    barcode_obj = code39.Standard39(
        hu_number,
        barHeight=bar_height,
        barWidth=bar_width,
        checksum=0,
        humanReadable=False,
    )
    b_width = barcode_obj.width
    barcode_x = max(margin, (width - b_width) / 2)
    y -= bar_height
    barcode_obj.drawOn(c, barcode_x, y)

    y -= 9
    c.setFont("Helvetica-Bold", 8.5)
    c.drawCentredString(width / 2, y, hu_number)

    y -= 5
    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.line(x, y, right_x, y)
    y -= 8

    # 8. Footer
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y, f"Box {box_index} of {total_boxes}")

    c.restoreState()


def generate_single_label(
    hu_number: str,
    supplier_name: str,
    supplier_code: str,
    po_number: str,
    po_line_number: str,
    material_code: str,
    material_description: str = "",
    product_code_partner: str = "",
    qty: float = 0.0,
    unit_of_measure: str = "M",
    batch_code: str = "",
    gross_weight: float = 0.0,
    net_weight: float = 0.0,
    box_index: int = 1,
    total_boxes: int = 1,
    label_date: Optional[str] = None,
    size: str = "6x4",
) -> bytes:
    """Generate a single label PDF with customizable size."""
    return generate_batch_labels(
        [
            {
                "hu_number": hu_number,
                "supplier_name": supplier_name,
                "supplier_code": supplier_code,
                "po_number": po_number,
                "po_line_number": po_line_number,
                "material_code": material_code,
                "material_description": material_description,
                "product_code_partner": product_code_partner,
                "qty": qty,
                "unit_of_measure": unit_of_measure,
                "batch_code": batch_code,
                "gross_weight": gross_weight,
                "net_weight": net_weight,
                "box_index": box_index,
                "total_boxes": total_boxes,
                "label_date": label_date,
            }
        ],
        size=size,
    )


def generate_batch_labels(labels_data: list[dict[str, Any]], size: str = "6x4") -> bytes:
    """
    Generate a multi-page PDF containing labels formatted according to the requested size.
    Sizes:
    - '6x4': 6"x4" Landscape (Calzedonia Standard)
    - '4x6': 4"x6" Portrait (Logistics Standard Thermal)
    - '4x3': 4"x3" Compact Box / Carton
    - 'a4':  A4 Sheet (4 labels per page in a 2x2 grid)
    """
    if not labels_data:
        raise ValueError("No label data provided for batch generation")

    norm_size = (size or "6x4").strip().lower()
    if norm_size not in LABEL_SIZES:
        norm_size = "6x4"

    buffer = io.BytesIO()

    # ─── A4 4-UP SHEET RENDERING ────────────────────────────────────
    if norm_size == "a4":
        c = canvas.Canvas(buffer, pagesize=A4)
        a4_w, a4_h = A4

        # 2 columns x 2 rows
        col_w = a4_w / 2.0
        row_h = a4_h / 2.0

        for i, data in enumerate(labels_data):
            page_index = i % 4
            if i > 0 and page_index == 0:
                c.showPage()

            if "label_date" not in data or not data["label_date"]:
                data["label_date"] = datetime.now().strftime("%d-%m-%Y")

            col = page_index % 2
            row = page_index // 2  # 0 is top row, 1 is bottom row

            cell_x = col * col_w
            # ReportLab y=0 is at the bottom, so top row is row_h, bottom row is 0
            cell_y = (1 - row) * row_h

            # Scale 4x6 label (288x432) to fit in quadrant (col_w x row_h ≈ 297x420)
            target_w = 4.0 * inch  # 288 pt
            target_h = 6.0 * inch  # 432 pt
            scale = min((col_w - 20) / target_w, (row_h - 20) / target_h)

            offset_x = cell_x + (col_w - target_w * scale) / 2
            offset_y = cell_y + (row_h - target_h * scale) / 2

            # Draw light cutting guideline border around each label cell
            c.saveState()
            c.setStrokeColorRGB(0.85, 0.85, 0.85)
            c.setLineWidth(0.5)
            c.setDash(2, 4)
            c.rect(cell_x + 5, cell_y + 5, col_w - 10, row_h - 10)
            c.restoreState()

            _draw_label_4x6(c, origin_x=offset_x, origin_y=offset_y, scale=scale, **data)

        c.save()
        buffer.seek(0)
        return buffer.read()

    # ─── SINGLE / ROLL THERMAL SIZES (6x4, 4x6, 4x3) ───────────────
    page_size = LABEL_SIZES[norm_size]
    c = canvas.Canvas(buffer, pagesize=page_size)

    for i, data in enumerate(labels_data):
        if i > 0:
            c.showPage()

        if "label_date" not in data or not data["label_date"]:
            data["label_date"] = datetime.now().strftime("%d-%m-%Y")

        if norm_size == "4x6":
            _draw_label_4x6(c, **data)
        elif norm_size == "4x3":
            _draw_label_4x3(c, **data)
        else:
            _draw_label_6x4(c, **data)

    c.save()
    buffer.seek(0)
    return buffer.read()
