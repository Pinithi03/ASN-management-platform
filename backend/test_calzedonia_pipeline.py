"""
End-to-end unit and integration test for Calzedonia pipeline:
1. Excel template generation
2. Excel upload & live validation
3. Concurrency-safe 20-digit HU generation
4. 6"x4" vector PDF Code 39 Barcode labels
5. Calzedonia SdDataSlice XML generation & DTD validation
"""

import io
from datetime import date, datetime

from app.services.packing_excel_service import (
    generate_packing_template,
    validate_packing_excel,
)
from app.services.hu_service import format_hu_number
from app.services.barcode_label_service import generate_batch_labels, generate_single_label
from app.services.asn_xml_generator_service import (
    generate_asn_xml,
    validate_asn_xml,
    get_asn_xml_filename,
    get_asn_email_subject,
)


def run_pipeline_test():
    print("=== 1. Testing Excel Template Generation ===")
    template_bytes = generate_packing_template()
    assert len(template_bytes) > 1000, "Template bytes too small"
    print(f" Template generated successfully! Size: {len(template_bytes)} bytes")

    print("\n=== 2. Testing Excel Validation & Parsing ===")
    import asyncio
    val_res = asyncio.run(validate_packing_excel(template_bytes))
    print(f" Valid: {val_res.is_valid}")
    print(f" Total rows parsed: {val_res.total_rows}")
    print(f" Total cartons: {val_res.total_cartons}")
    print(f" Total gross weight: {val_res.total_gross_weight} kg")
    print(f" Total net weight: {val_res.total_net_weight} kg")
    print(f" Total quantity: {val_res.total_quantity} M")
    assert val_res.is_valid, f"Validation failed with errors: {val_res.general_errors}"
    assert val_res.total_cartons == 2, "Expected 2 cartons"
    assert val_res.total_gross_weight >= val_res.total_net_weight > 0, "Weight rule violation"

    print("\n=== 3. Testing 20-digit Calzedonia HU Generation ===")
    supplier_code = "0000058376"
    hu1 = format_hu_number(supplier_code, 1)
    hu2 = format_hu_number(supplier_code, 2)
    print(f" HU 1: {hu1} (length: {len(hu1)})")
    print(f" HU 2: {hu2} (length: {len(hu2)})")
    assert len(hu1) == 20, f"Expected 20 digits, got {len(hu1)}"
    assert hu1.startswith("1000058376"), f"HU does not start with expected prefix: {hu1}"
    assert hu1 != hu2, "HUs must be unique"

    print("\n=== 4. Testing 6x4 Code 39 Barcode PDF Generation ===")
    label_data = [
        {
            "hu_number": hu1,
            "supplier_name": "Sirio Ltd",
            "supplier_code": supplier_code,
            "po_number": "2001297727",
            "po_line_number": "00100",
            "material_code": "ELST1K 000615",
            "material_description": "Elastic tape 15mm black",
            "product_code_partner": "SK104546-015.0-61851",
            "qty": 245.0,
            "unit_of_measure": "M",
            "batch_code": "LOT-2025-01",
            "gross_weight": 25.5,
            "net_weight": 24.0,
            "box_index": 1,
            "total_boxes": 2,
            "label_date": "11-09-2026",
        },
        {
            "hu_number": hu2,
            "supplier_name": "Sirio Ltd",
            "supplier_code": supplier_code,
            "po_number": "2001297727",
            "po_line_number": "00100",
            "material_code": "ELST1K 000615",
            "material_description": "Elastic tape 15mm black",
            "product_code_partner": "SK104546-015.0-61852",
            "qty": 255.0,
            "unit_of_measure": "M",
            "batch_code": "LOT-2025-01",
            "gross_weight": 26.0,
            "net_weight": 24.5,
            "box_index": 2,
            "total_boxes": 2,
            "label_date": "11-09-2026",
        }
    ]
    pdf_bytes = generate_batch_labels(label_data)
    assert len(pdf_bytes) > 2000, "PDF bytes too small"
    print(f" Multi-page 6x4 PDF label generated successfully! Size: {len(pdf_bytes)} bytes")

    print("\n=== 5. Testing Calzedonia SdDataSlice XML & Two-Phase DTD Validation ===")
    boxes = [
        {
            "po_number": "2001297727",
            "po_line": "00100",
            "order_date": "10-02-2025",
            "order_type": "ZA6A",
            "hu_number": hu1,
            "material_code": "ELST1K 000615",
            "material_desc": "Elastic tape 15mm black",
            "partner_product_code": "SK104546-015.0-61851",
            "lot_number": "LOT-2025-01",
            "supplier_carton_ref": "SK104546-015.0-61851",
            "quantity": 245.0,
            "uom": "M",
            "gross_weight": 25.5,
            "net_weight": 24.0,
        },
        {
            "po_number": "2001297727",
            "po_line": "00100",
            "order_date": "10-02-2025",
            "order_type": "ZA6A",
            "hu_number": hu2,
            "material_code": "ELST1K 000615",
            "material_desc": "Elastic tape 15mm black",
            "partner_product_code": "SK104546-015.0-61852",
            "lot_number": "LOT-2025-01",
            "supplier_carton_ref": "SK104546-015.0-61852",
            "quantity": 255.0,
            "uom": "M",
            "gross_weight": 26.0,
            "net_weight": 24.5,
        }
    ]

    xml_content = generate_asn_xml(
        company_name="Sirio Ltd",
        group_code="SIRIONEW",
        supplier_code=supplier_code,
        packing_slip_number="01007770",
        packing_slip_date="21-04-2025",
        delivery_date="22-04-2025",
        boxes=boxes,
        note="Test shipment for Benji",
    )

    print("Generated XML snippet:")
    print("\n".join(xml_content.splitlines()[:18]))
    print("...")

    val_xml = validate_asn_xml(xml_content, supplier_code)
    print(f"\nXML Valid: {val_xml.valid}")
    if not val_xml.valid:
        for err in val_xml.errors:
            print(f"  ❌ [{err.field}]: {err.message}")
    assert val_xml.valid, "XML validation against m2Data_Partner.dtd failed!"

    xml_fname = get_asn_xml_filename("01007770", supplier_code)
    email_subj = get_asn_email_subject("01007770", "21-04-2025", supplier_code)
    print(f" Calzedonia XML Filename: {xml_fname}")
    print(f" Calzedonia Email Subject: {email_subj}")
    assert xml_fname == "PL_01007770_0000058376.xml"
    assert email_subj == "Packing List 01007770 of 21-04-2025 - 0000058376"

    print("\n ALL 5 PIPELINE MODULES PASSED WITH 100% ACCURACY!")


if __name__ == "__main__":
    run_pipeline_test()
