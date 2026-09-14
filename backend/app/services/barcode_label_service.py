"""
Barcode label generator for Calzedonia shipments.

Generates 6"x4" industrial shipping labels with Code 39 barcodes using ReportLab.
Each label contains:
- Calzedonia Group header
- Supplier name & 10-digit padded supplier code
- Purchase Order number & line number
- Material code, description, and partner product code
- Quantity and Unit of Measure
- Lot / Roll / Batch reference
- Gross Weight and Net Weight (in kg)
- 20-digit Calzedonia Handling Unit (HU) number (text + Code 39 barcode)
- Box sequence: "Box X of Y" and label creation date
"""

from __future__ import annotations

import io
from datetime import datetime
from typing import Any, Optional

from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code39


LABEL_WIDTH = 6.0 * inch
LABEL_HEIGHT = 4.0 * inch
LABEL_SIZE = (LABEL_WIDTH, LABEL_HEIGHT)


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
) -> bytes:
    """
    Generate a single 6x4 inch label PDF with Code 39 barcode.

    Returns:
        PDF bytes.
    """
    if label_date is None:
        label_date = datetime.now().strftime("%d-%m-%Y")

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=LABEL_SIZE)
    _draw_label(
        c,
        hu_number=hu_number,
        supplier_name=supplier_name,
        supplier_code=supplier_code,
        po_number=po_number,
        po_line_number=po_line_number,
        material_code=material_code,
        material_description=material_description,
        product_code_partner=product_code_partner,
        qty=qty,
        unit_of_measure=unit_of_measure,
        batch_code=batch_code,
        gross_weight=gross_weight,
        net_weight=net_weight,
        box_index=box_index,
        total_boxes=total_boxes,
        label_date=label_date,
    )
    c.save()
    buffer.seek(0)
    return buffer.read()


def generate_batch_labels(labels_data: list[dict[str, Any]]) -> bytes:
    """
    Generate a multi-page PDF with one 6x4 inch label per page.

    Args:
        labels_data: List of dicts, each containing kwargs for _draw_label.

    Returns:
        PDF bytes containing all labels.
    """
    if not labels_data:
        raise ValueError("No label data provided for batch generation")

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=LABEL_SIZE)

    for i, data in enumerate(labels_data):
        if i > 0:
            c.showPage()
        
        # Ensure default label_date if missing
        if "label_date" not in data or not data["label_date"]:
            data["label_date"] = datetime.now().strftime("%d-%m-%Y")

        _draw_label(c, **data)

    c.save()
    buffer.seek(0)
    return buffer.read()


def _draw_label(
    c: canvas.Canvas,
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
    label_date: str = "",
) -> None:
    """Draw a single 6x4 inch shipping label on the given canvas page."""
    margin = 0.3 * inch
    x = margin
    y = LABEL_HEIGHT - margin

    # ─── 1. Header Banner ───────────────────────────────────────────
    c.setFont("Helvetica-Bold", 14)
    c.drawString(x, y, "CALZEDONIA GROUP")
    y -= 4
    c.setStrokeColorRGB(0.2, 0.2, 0.2)
    c.setLineWidth(1.5)
    c.line(x, y, LABEL_WIDTH - margin, y)
    y -= 18

    # ─── 2. Supplier Info ───────────────────────────────────────────
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Supplier:")
    c.setFont("Helvetica", 9)
    c.drawString(x + 55, y, str(supplier_name or "")[:35])

    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 3.2 * inch, y, "Vendor Code:")
    c.setFont("Helvetica", 9)
    c.drawString(x + 4.0 * inch, y, str(supplier_code or "").zfill(10))
    y -= 15

    # ─── 3. PO Information ──────────────────────────────────────────
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "P/O Number:")
    c.setFont("Helvetica", 9)
    c.drawString(x + 65, y, str(po_number or ""))

    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 3.2 * inch, y, "PO Item / Line:")
    c.setFont("Helvetica", 9)
    c.drawString(x + 4.1 * inch, y, str(po_line_number or ""))
    y -= 15

    # ─── 4. Material Info ───────────────────────────────────────────
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Material:")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 55, y, str(material_code or ""))

    if product_code_partner:
        c.setFont("Helvetica", 8)
        c.drawString(x + 2.8 * inch, y, f"Partner Ref: {product_code_partner}")
    y -= 14

    desc = material_description or ""
    if len(desc) > 65:
        desc = desc[:62] + "..."
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(x, y, f"Desc: {desc}" if desc else "")
    y -= 6

    c.setStrokeColorRGB(0.7, 0.7, 0.7)
    c.setLineWidth(0.5)
    c.line(x, y, LABEL_WIDTH - margin, y)
    y -= 15

    # ─── 5. Quantity, Weights & Lot / Roll ──────────────────────────
    # Qty formatting
    qty_str = f"{int(qty)}" if qty == int(qty) else f"{qty:.2f}"
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x, y, f"Qty: {qty_str} {unit_of_measure}")

    gw_val = f"{gross_weight:.2f}" if gross_weight else "0.00"
    nw_val = f"{net_weight:.2f}" if net_weight else "0.00"
    c.setFont("Helvetica", 9)
    c.drawString(x + 2.4 * inch, y, f"Gross: {gw_val} kg")
    c.drawString(x + 3.8 * inch, y, f"Net: {nw_val} kg")
    y -= 14

    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Lot / Roll / Ref:")
    c.setFont("Helvetica", 9)
    c.drawString(x + 85, y, str(batch_code or "N/A"))
    y -= 6

    c.setStrokeColorRGB(0.7, 0.7, 0.7)
    c.line(x, y, LABEL_WIDTH - margin, y)
    y -= 15

    # ─── 6. Handling Unit (HU) Number (Text) ────────────────────────
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x, y, f"HU: {hu_number}")
    y -= 8

    # ─── 7. Code 39 Barcode ─────────────────────────────────────────
    # Standard Calzedonia format: HU encoded with Code 39
    barcode_obj = code39.Standard39(
        hu_number,
        barHeight=0.62 * inch,
        barWidth=0.0135 * inch,
        checksum=0,
        humanReadable=True,
    )
    barcode_width = barcode_obj.width
    barcode_x = max(margin, (LABEL_WIDTH - barcode_width) / 2)
    y -= 0.72 * inch
    barcode_obj.drawOn(c, barcode_x, y)

    y -= 8
    c.setStrokeColorRGB(0.7, 0.7, 0.7)
    c.line(x, y, LABEL_WIDTH - margin, y)
    y -= 13

    # ─── 8. Footer ──────────────────────────────────────────────────
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, f"Box {box_index} of {total_boxes}")

    c.setFont("Helvetica", 8)
    c.drawString(LABEL_WIDTH - margin - 1.4 * inch, y, f"Date: {label_date}")
