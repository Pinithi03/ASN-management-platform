"""
Shipments API endpoints.

Handles:
- GET  /template            — Download 12-column factory packing sheet Excel template
- POST /validate-excel      — Live verification of uploaded packing list (.xlsx)
- POST /create-from-excel   — Create shipment + allocate 20-digit HUs + generate Calzedonia ASN XML
- GET  /                    — List shipments
- GET  /{id}                — Shipment details
- GET  /{id}/labels         — Download 6"x4" vector Code 39 barcode PDF labels
- GET  /{id}/cartons        — List cartons with HU numbers and weight details
"""

from __future__ import annotations

import io
import logging
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.asn import ASNRecord
from app.models.company import Company
from app.models.enums import ASNStatus, ShipmentStatus
from app.models.hu_sequence import HUSequence
from app.models.packing_slip import PackingSlip
from app.models.purchase_order import PurchaseOrder
from app.models.shipment import Shipment
from app.models.shipment_line import ShipmentLine
from app.models.supplier import Supplier
from app.services.asn_xml_generator_service import (
    generate_asn_xml,
    get_asn_email_subject,
    get_asn_xml_filename,
    validate_asn_xml,
)
from app.services.barcode_label_service import generate_batch_labels
from app.services.hu_service import format_hu_number, generate_batch_hu
from app.services.packing_excel_service import (
    generate_packing_template,
    validate_packing_excel,
)
from app.services.po_service import update_po_statuses

logger = logging.getLogger(__name__)

router = APIRouter()


async def generate_po_shipment_number(db: AsyncSession, po_number: Optional[str]) -> str:
    """
    Generate unique shipment number based on PO number and dispatch sequence:
    e.g. 2001614890-01, 2001614890-02
    """
    if not po_number or not str(po_number).strip():
        today_str = datetime.now().strftime("%Y%m%d")
        base = f"SHP-{today_str}"
        seq = 1
        candidate = f"{base}-{str(seq).zfill(2)}"
        while True:
            exists = await db.scalar(
                select(func.count()).select_from(Shipment).where(Shipment.shipment_number == candidate)
            )
            if not exists:
                return candidate
            seq += 1
            candidate = f"{base}-{str(seq).zfill(2)}"

    po_clean = str(po_number).strip()

    # Count existing shipments linked to this PO number via ShipmentLine
    stmt = (
        select(func.count(distinct(Shipment.id)))
        .join(ShipmentLine, ShipmentLine.shipment_id == Shipment.id)
        .where(ShipmentLine.po_number == po_clean)
    )
    existing_count = (await db.scalar(stmt)) or 0

    seq = existing_count + 1
    candidate = f"{po_clean}-{str(seq).zfill(2)}"

    # Ensure strict uniqueness against shipments table
    while True:
        exists = await db.scalar(
            select(func.count()).select_from(Shipment).where(Shipment.shipment_number == candidate)
        )
        if not exists:
            return candidate
        seq += 1
        candidate = f"{po_clean}-{str(seq).zfill(2)}"


@router.get("/next-hu-sequence")
async def get_next_hu_sequence(
    supplier_code: Optional[str] = Query(None, description="Supplier partner code, e.g. 0000018194"),
    supplier_id: Optional[str] = Query(None, description="Supplier UUID"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Get the next available 20-digit Handling Unit (SSCC) sequence number for a supplier.
    Ensures sequential continuity across cartons and shipments without gaps or random numbers.
    """
    supp = None
    if supplier_id:
        try:
            res = await db.execute(select(Supplier).where(Supplier.id == uuid.UUID(supplier_id)))
            supp = res.scalar_one_or_none()
        except ValueError:
            pass

    if not supp and supplier_code:
        code_clean = supplier_code.strip()
        res = await db.execute(
            select(Supplier).where(
                (Supplier.supplier_code == code_clean)
                | (Supplier.supplier_code == code_clean.zfill(10))
                | (Supplier.supplier_code == code_clean.lstrip("0"))
            )
        )
        supp = res.scalar_one_or_none()

    if not supp:
        res = await db.execute(select(Supplier).limit(1))
        supp = res.scalar_one_or_none()

    resolved_code = supp.supplier_code if supp else (supplier_code or "0000018194")
    resolved_id = supp.id if supp else uuid.UUID("00000000-0000-0000-0000-000000018194")

    seq_res = await db.execute(
        select(HUSequence).where(HUSequence.supplier_id == resolved_id)
    )
    seq = seq_res.scalar_one_or_none()
    last_num = seq.last_number if seq else 0
    next_num = last_num + 1

    clean_code = resolved_code.lstrip("0")
    prefix = f"1{clean_code.zfill(9)}"
    next_hu = f"{prefix}{str(next_num).zfill(10)}"

    return {
        "supplier_id": str(resolved_id),
        "supplier_code": resolved_code,
        "prefix": prefix,
        "last_number": last_num,
        "next_number": next_num,
        "next_hu": next_hu,
    }


@router.get("/template")
async def download_packing_template(
    po_number: Optional[str] = Query(None, description="Optional PO number to pre-populate"),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Generate and download the standard 12-column Calzedonia packing list Excel template.
    Optionally pre-populates open PO line items.
    """
    sample_lines = None
    if po_number:
        try:
            stmt = select(PurchaseOrder).where(PurchaseOrder.po_number == po_number)
            res = await db.execute(stmt)
            po = res.scalar_one_or_none()
            if po and po.extra_data and "items" in po.extra_data:
                sample_lines = []
                for idx, item in enumerate(po.extra_data["items"], start=1):
                    sample_lines.append({
                        "po_number": po.po_number,
                        "po_item": str(item.get("order_line_number") or item.get("line_number", "1")).strip(),
                        "pack_number": "PACK-01",
                        "carton_number": idx,
                        "supplier_carton_ref": "",
                        "product_code": item.get("material_code", "ELST1K 000615"),
                        "lot_number": "LOT-01",
                        "width": "",
                        "gw": "",
                        "nw": "",
                        "quantity": float(item.get("quantity", 0)),
                        "uom": item.get("uom") or item.get("size") or "M",
                    })
        except Exception as e:
            logger.warning("Could not pre-fetch PO for template: %s", e)

    excel_bytes = generate_packing_template(sample_lines)

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=Packing_List_Template.xlsx",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


class PoPackConfig(BaseModel):
    po_number: str
    pack_type: str = "BOX"
    selected_lines: Optional[list[str]] = None

class ConfigureTemplateRequest(BaseModel):
    configs: list[PoPackConfig]

@router.post("/template/configured")
async def download_configured_packing_template(
    payload: ConfigureTemplateRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Generate a tailored Calzedonia packing list Excel template based on supplier's
    packaging setup (Box vs Roll per PO).
    """
    sample_lines = []
    running_carton_idx = 1
    
    for cfg in payload.configs:
        stmt = select(PurchaseOrder).where(PurchaseOrder.po_number == cfg.po_number)
        res = await db.execute(stmt)
        po = res.scalar_one_or_none()
        if not po:
            continue

        raw_items = po.extra_data.get("items") if (po.extra_data and isinstance(po.extra_data, dict)) else None
        if not raw_items:
            raw_items = [{
                "line_number": "00100",
                "material_code": po.style_number or "ELST1K 000615",
                "description": po.description or "PO Line Item",
                "quantity": float(po.quantity or 500),
                "uom": "M",
            }]

        for it in raw_items:
            norm_key = str(it.get("order_line_number") or it.get("line_number", "1")).strip()
            if cfg.selected_lines is not None and norm_key not in cfg.selected_lines:
                continue
            pack_type = cfg.pack_type.upper()
            ref_prefix = "RL" if pack_type == "ROLL" else "CTN"
            carton_ref = f"{ref_prefix}-{str(running_carton_idx).zfill(2)}"
            
            sample_lines.append({
                "po_number": po.po_number,
                "po_item": norm_key,
                "pack_number": "",
                "carton_number": running_carton_idx,
                "supplier_carton_ref": "",
                "product_code": it.get("material_code", "ELST1K 000615"),
                "lot_number": "",
                "width": "",
                "gw": "",
                "nw": "",
                "quantity": float(it.get("quantity", 0)),
                "uom": it.get("uom") or it.get("size") or "M",
            })
            running_carton_idx += 1

    excel_bytes = generate_packing_template(sample_lines)
    filename = "Packing_List_Tailored.xlsx"
    if len(payload.configs) == 1:
        filename = f"Packing_List_{payload.configs[0].po_number}_Tailored.xlsx"

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/validate-excel")
async def validate_excel_packing_list(
    file: UploadFile = File(...),
    supplier_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Upload and parse a 12-column factory packing sheet Excel file.
    Performs live verification against DB open PO quantities and weight validation rules.
    """
    if not file.filename or not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(
            status_code=400,
            detail="Only Excel spreadsheets (.xlsx or .xls) are accepted",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    supplier_uuid = None
    if supplier_id:
        try:
            supplier_uuid = uuid.UUID(supplier_id)
        except ValueError:
            pass

    validation_result = await validate_packing_excel(
        file_bytes=file_bytes,
        db=db,
        supplier_id=supplier_uuid,
    )

    return validation_result.to_dict()


@router.post("/create-from-excel")
async def create_shipment_from_excel(
    file: UploadFile = File(...),
    supplier_code: str = Form("0000058376"),
    supplier_name: str = Form("Sirio Ltd"),
    supplier_id: Optional[str] = Form(None),
    plant_code: str = Form("PPC1"),
    storage_location: Optional[str] = Form("0101"),
    carrier: Optional[str] = Form(None),
    tracking_number: Optional[str] = Form(None),
    estimated_arrival: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Create a complete shipment directly from the 12-column Excel file:
    1. Parse & validate the Excel packing sheet
    2. Atomically allocate 20-digit Calzedonia Handling Units (HUs)
    3. Save Shipment and individual carton PackingSlip records
    4. Automatically generate and validate the Calzedonia SdDataSlice ASN XML
    5. Save ASNRecord ready for dispatch
    """
    if not file.filename or not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx) are accepted")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File is empty")

    supplier_uuid = None
    if supplier_id:
        try:
            supplier_uuid = uuid.UUID(supplier_id)
        except ValueError:
            pass

    # ─── 1. Live Validation ─────────────────────────────────────────
    validation_res = await validate_packing_excel(
        file_bytes=file_bytes,
        db=db,
        supplier_id=supplier_uuid,
    )
    if not validation_res.is_valid:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Excel file contains validation errors",
                "errors": validation_res.general_errors,
                "lines": [s.errors for s in validation_res.line_summaries if not s.is_valid],
            },
        )

    if not validation_res.rows:
        raise HTTPException(status_code=400, detail="No carton data rows found in Excel sheet")

    # Fetch PO from DB first to get actual company_id, supplier_id, and destination
    po_obj = None
    try:
        po_stmt = select(PurchaseOrder).where(PurchaseOrder.po_number == validation_res.rows[0].po_number)
        po_res = await db.execute(po_stmt)
        po_obj = po_res.scalar_one_or_none()
    except Exception as e:
        logger.warning("Could not query PO for shipment: %s", e)

    company_id = po_obj.company_id if (po_obj and po_obj.company_id) else None
    if not company_id:
        comp_stmt = select(Company.id).limit(1)
        comp_res = await db.execute(comp_stmt)
        company_id = comp_res.scalar_one_or_none() or uuid.UUID("00000000-0000-0000-0000-000000000001")

    # ─── 2. Resolve Supplier & Plant Details ────────────────────────
    supp = None
    # 1. Prioritize po_obj.supplier_id if PO belongs to a known supplier
    if po_obj and po_obj.supplier_id:
        supp_res = await db.execute(select(Supplier).where(Supplier.id == po_obj.supplier_id))
        supp = supp_res.scalar_one_or_none()

    # 2. Try finding by supplier_uuid
    if not supp and supplier_uuid:
        supp_res = await db.execute(select(Supplier).where(Supplier.id == supplier_uuid))
        supp = supp_res.scalar_one_or_none()

    # 3. Try finding by supplier_code from form
    supp_code_clean = (supplier_code or "0000018194").lstrip("0").zfill(10)
    if not supp and supplier_code:
        try:
            stmt = select(Supplier).where(
                (Supplier.supplier_code == supp_code_clean)
                | (Supplier.supplier_code == supp_code_clean.lstrip("0"))
            )
            res = await db.execute(stmt)
            supp = res.scalar_one_or_none()
        except Exception as e:
            logger.warning("Could not query supplier: %s", e)

    # 4. Fallback to first supplier in DB
    if not supp:
        supp_res = await db.execute(select(Supplier).limit(1))
        supp = supp_res.scalar_one_or_none()

    supplier_id = supp.id if supp else uuid.UUID("074830fc-dc21-42bb-9877-e6b6a45790a5")
    actual_supp_name = supp.name if supp else supplier_name
    actual_supp_code = supp.supplier_code if supp else supp_code_clean

    # Resolve company name and group code based on plant (PPA1, PPB1, PPC1, PPD1, PPE1)
    plant_upper = (plant_code or "PPA1").upper()
    if "PPA" in plant_upper or "OMEGA" in plant_upper:
        company_name = "Omega Line Ltd"
        group_code = "OMEGALINENEW"
    elif "PPB" in plant_upper or "ALPHA" in plant_upper:
        company_name = "Alpha Apparels Ltd"
        group_code = "ALPHA"
    elif "PPC" in plant_upper or "BENJI" in plant_upper:
        company_name = "Benji Ltd"
        group_code = "BENJI"
    elif "PPD" in plant_upper or "SIRIO" in plant_upper:
        company_name = "Sirio Ltd"
        group_code = "SIRIONEW"
    elif "PPE" in plant_upper or "VAVUNIYA" in plant_upper:
        company_name = "Vavuniya Apparels Ltd"
        group_code = "VAVUNIYA"
    else:
        company_name = "Omega Line Ltd"
        group_code = "OMEGALINENEW"

    # ─── 3. Generate 20-digit Handling Units (HUs) ──────────────────
    total_cartons = len(validation_res.rows)
    try:
        hu_numbers = await generate_batch_hu(
            session=db,
            supplier_code=actual_supp_code,
            count=total_cartons,
            company_id=company_id,
            supplier_id=supplier_id,
        )
    except Exception as e:
        logger.error("HU generation error: %s", e)
        await db.rollback()
        # Safe fallback sequence if DB lock failed
        prefix = "1" + actual_supp_code.lstrip("0").zfill(9)
        base_num = int(datetime.utcnow().timestamp()) % 1000000000
        hu_numbers = [f"{prefix}{str(base_num + i).zfill(10)}" for i in range(total_cartons)]

    # ─── 4. Build Shipment & Packing Slip Entities ──────────────────
    shipment_date = date.today()
    est_arrival_date = None
    if estimated_arrival:
        try:
            est_arrival_date = datetime.strptime(estimated_arrival, "%Y-%m-%d").date()
        except ValueError:
            pass

    # Generate sequential shipment / packing slip number based on PO (e.g. 2001614890-01)
    first_po_num = validation_res.rows[0].po_number if validation_res.rows else None
    shipment_number = await generate_po_shipment_number(db, first_po_num)

    shipment = Shipment(
        id=uuid.uuid4(),
        company_id=company_id,
        supplier_id=supplier_id,
        shipment_number=shipment_number,
        plant_code=plant_code,
        storage_location=storage_location,
        status=ShipmentStatus.PACKED.value,
        total_boxes=total_cartons,
        total_pieces=int(validation_res.total_quantity),
        ship_date=shipment_date,
        estimated_arrival=est_arrival_date,
        carrier=carrier,
        tracking_number=tracking_number,
    )

    boxes_for_xml: list[dict[str, Any]] = []
    packing_slips: list[PackingSlip] = []

    po_items_list = (po_obj.extra_data or {}).get("items", []) if po_obj else []
    po_order_date = getattr(po_obj, "order_date", None) or shipment_date

    for idx, row in enumerate(validation_res.rows):
        hu_num = hu_numbers[idx]
        slip_number = f"PS-{shipment_number}-{idx + 1}"

        carton_meta = {
            "po_number": row.po_number,
            "po_line": row.po_item,
            "product_code": row.product_code,
            "lot_number": row.lot_number,
            "width": row.width,
            "supplier_carton_ref": row.supplier_carton_ref,
            "quantity": row.quantity,
            "uom": row.uom,
            "box_index": idx + 1,
            "total_boxes": total_cartons,
        }

        ps = PackingSlip(
            id=uuid.uuid4(),
            company_id=company_id,
            shipment_id=shipment.id,
            slip_number=slip_number,
            box_number=idx + 1,
            hu_number=hu_num,
            barcode_data=hu_num,
            net_weight=Decimal(str(row.net_weight)),
            gross_weight=Decimal(str(row.gross_weight)),
            dimensions=carton_meta,
            status="PACKED",
        )
        packing_slips.append(ps)

        clean_row_item = str(row.po_item).split("-")[0].zfill(5)
        po_item_info = next(
            (it for it in po_items_list if str(it.get("order_line_number") or it.get("line_number", "")).strip() == clean_row_item),
            None
        )
        mat_desc = (po_item_info.get("description") if po_item_info else None) or f"Item {row.product_code}"
        partner_code = (po_item_info.get("partner_code") if po_item_info else None) or ""

        boxes_for_xml.append({
            "po_number": row.po_number,
            "po_line": row.po_item,
            "order_date": po_order_date,
            "order_type": "ZA6A",
            "hu_number": hu_num,
            "material_code": row.product_code,
            "material_desc": mat_desc,
            "partner_product_code": partner_code,
            "lot_number": row.lot_number,
            "supplier_carton_ref": row.supplier_carton_ref,
            "quantity": row.quantity,
            "uom": row.uom,
            "gross_weight": row.gross_weight,
            "net_weight": row.net_weight,
        })

    # Group lines for ShipmentLine
    line_map: dict[tuple[str, str], float] = {}
    for row in validation_res.rows:
        k = (row.po_number, row.po_item)
        line_map[k] = line_map.get(k, 0.0) + row.quantity

    shipment_lines: list[ShipmentLine] = []
    for (po_num, po_item), total_qty in line_map.items():
        try:
            line_int = int(po_item.split("-")[0])
        except ValueError:
            line_int = 100

        sl = ShipmentLine(
            id=uuid.uuid4(),
            company_id=company_id,
            shipment_id=shipment.id,
            po_id=po_obj.id if po_obj else None,
            po_number=po_num,
            po_line_number=line_int,
            material_number=validation_res.rows[0].product_code,
            quantity=int(total_qty),
            unit_of_measure=validation_res.rows[0].uom,
        )
        shipment_lines.append(sl)

    # ─── 5. Generate Calzedonia ASN XML (SdDataSlice) ───────────────
    xml_content = generate_asn_xml(
        company_name=company_name,
        group_code=group_code,
        supplier_code=actual_supp_code,
        packing_slip_number=shipment_number,
        packing_slip_date=shipment_date,
        delivery_date=est_arrival_date or shipment_date,
        boxes=boxes_for_xml,
        note=note or "",
    )

    # ─── 6. Validate ASN XML with Two-Phase Validator ───────────────
    val_xml_result = validate_asn_xml(
        xml_content=xml_content,
        supplier_code=actual_supp_code,
    )
    is_xml_valid = val_xml_result.valid

    asn_number = f"ASN-{shipment_number}"
    asn_record = ASNRecord(
        id=uuid.uuid4(),
        company_id=company_id,
        supplier_id=supplier_id,
        shipment_id=shipment.id,
        asn_number=asn_number,
        xml_content=xml_content,
        xml_validated=is_xml_valid,
        status=ASNStatus.VALIDATED.value if is_xml_valid else ASNStatus.DRAFT.value,
    )

    # ─── 7. Save to Database ────────────────────────────────────────
    try:
        db.add(shipment)
        for ps in packing_slips:
            db.add(ps)
        for sl in shipment_lines:
            db.add(sl)
        db.add(asn_record)
        await db.flush()

        # Update PO statuses (PARTIAL / COMPLETED)
        affected_pos = list({row.po_number for row in validation_res.rows if row.po_number})
        await update_po_statuses(db, affected_pos)

        await db.commit()
    except Exception as e:
        logger.error("DB commit failed for shipment: %s", e)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save shipment to database: {str(e)}",
        )

    return {
        "success": True,
        "message": f"Shipment {shipment_number} created successfully with {total_cartons} cartons",
        "shipment": {
            "id": str(shipment.id),
            "shipment_number": shipment.shipment_number,
            "plant_code": shipment.plant_code,
            "status": shipment.status,
            "total_boxes": shipment.total_boxes,
            "total_pieces": shipment.total_pieces,
            "ship_date": shipment.ship_date.isoformat() if shipment.ship_date else None,
            "carrier": shipment.carrier,
        },
        "asn": {
            "id": str(asn_record.id),
            "asn_number": asn_record.asn_number,
            "status": asn_record.status,
            "xml_validated": asn_record.xml_validated,
            "xml_filename": get_asn_xml_filename(shipment_number, actual_supp_code),
            "email_subject": get_asn_email_subject(shipment_number, shipment_date, actual_supp_code),
        },
        "handling_units": hu_numbers,
        "xml_validation": val_xml_result.to_dict(),
    }



class DirectCartonItem(BaseModel):
    po_number: str
    po_line: str = "00100"
    product_code: str
    description: Optional[str] = ""
    partner_product_code: Optional[str] = ""
    lot_number: str = "DEFAULT"
    quantity: float
    uom: str = "M"
    net_weight: float
    gross_weight: float
    supplier_carton_ref: Optional[str] = None
    packaging_type: Optional[str] = "BOX"
    hu_number: Optional[str] = None


class CreateDirectShipmentRequest(BaseModel):
    plant_code: str = "PPD1"
    supplier_code: Optional[str] = "0000058376"
    supplier_name: Optional[str] = "CALZEDONIA CENTRAL HUB"
    supplier_id: Optional[str] = None
    storage_location: Optional[str] = "SL01"
    estimated_arrival: Optional[str] = None
    carrier: Optional[str] = "EXPRESS FREIGHT"
    tracking_number: Optional[str] = None
    note: Optional[str] = ""
    cartons: list[DirectCartonItem]


@router.post("/create-direct")
async def create_direct_shipment(
    req: CreateDirectShipmentRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Create shipment directly from Web Packing Wizard (JSON carton payload)
    or ERP API integration.
    Allocates 20-digit Calzedonia HUs, validates DTD, and generates official ASN XML.
    """
    if not req.cartons:
        raise HTTPException(status_code=400, detail="At least one carton is required.")

    # 1. Validate weights and quantities
    for idx, c in enumerate(req.cartons):
        if c.quantity <= 0:
            raise HTTPException(
                status_code=422,
                detail=f"Carton {idx + 1}: Quantity must be greater than 0",
            )
        if c.net_weight <= 0:
            raise HTTPException(
                status_code=422,
                detail=f"Carton {idx + 1}: Net weight must be greater than 0 kg",
            )
        if c.gross_weight <= c.net_weight:
            raise HTTPException(
                status_code=422,
                detail=f"Carton {idx + 1}: Gross weight ({c.gross_weight} kg) must be strictly greater than net weight ({c.net_weight} kg)",
            )

    # 2. Resolve company and plant details
    plant_upper = (req.plant_code or "PPA1").upper()
    if "PPA" in plant_upper or "OMEGA" in plant_upper:
        company_name = "Omega Line Ltd"
        group_code = "OMEGALINENEW"
    elif "PPB" in plant_upper or "ALPHA" in plant_upper:
        company_name = "Alpha Apparels Ltd"
        group_code = "ALPHA"
    elif "PPC" in plant_upper or "BENJI" in plant_upper:
        company_name = "Benji Ltd"
        group_code = "BENJI"
    elif "PPD" in plant_upper or "SIRIO" in plant_upper:
        company_name = "Sirio Ltd"
        group_code = "SIRIONEW"
    elif "PPE" in plant_upper or "VAVUNIYA" in plant_upper:
        company_name = "Vavuniya Apparels Ltd"
        group_code = "VAVUNIYA"
    else:
        company_name = "Omega Line Ltd"
        group_code = "OMEGALINENEW"

    # Fetch PO from DB to link company_id and supplier_id
    first_po_num = req.cartons[0].po_number if req.cartons else None
    po_obj = None
    if first_po_num:
        try:
            po_res = await db.execute(select(PurchaseOrder).where(PurchaseOrder.po_number == first_po_num))
            po_obj = po_res.scalar_one_or_none()
        except Exception:
            pass

    company_id = po_obj.company_id if (po_obj and po_obj.company_id) else None
    if not company_id:
        comp_stmt = select(Company.id).limit(1)
        comp_res = await db.execute(comp_stmt)
        company_id = comp_res.scalar_one_or_none() or uuid.UUID("00000000-0000-0000-0000-000000000001")

    # 3. Resolve supplier
    supp = None
    if po_obj and po_obj.supplier_id:
        supp_res = await db.execute(select(Supplier).where(Supplier.id == po_obj.supplier_id))
        supp = supp_res.scalar_one_or_none()

    if not supp and req.supplier_id:
        try:
            supp_uuid = uuid.UUID(req.supplier_id)
            res = await db.execute(select(Supplier).where(Supplier.id == supp_uuid))
            supp = res.scalar_one_or_none()
        except ValueError:
            pass

    supp_code_clean = (req.supplier_code or "0000018194").strip().zfill(10)
    if not supp and req.supplier_code:
        res = await db.execute(
            select(Supplier).where(
                (Supplier.supplier_code == supp_code_clean)
                | (Supplier.supplier_code == supp_code_clean.lstrip("0"))
            )
        )
        supp = res.scalar_one_or_none()

    if not supp:
        res = await db.execute(select(Supplier).limit(1))
        supp = res.scalar_one_or_none()

    supplier_id = supp.id if supp else uuid.UUID("00000000-0000-0000-0000-000000018194")
    actual_supp_name = supp.name if supp else req.supplier_name or "COATS THREAD EXPORTS (PRIVATE) LIMITED"
    actual_supp_code = supp.supplier_code if supp else supp_code_clean

    total_cartons = len(req.cartons)

    # 4. Generate or validate 20-digit Handling Units (SSCC)
    provided_hus = [
        c.hu_number.strip()
        for c in req.cartons
        if c.hu_number and len(c.hu_number.strip()) == 20 and c.hu_number.strip().isdigit()
    ]
    if len(provided_hus) == total_cartons:
        hu_numbers = provided_hus
        # Update sequence table to ensure next shipments continue seamlessly
        try:
            prefix = "1" + actual_supp_code.lstrip("0").zfill(9)
            serials = [int(h[10:]) for h in hu_numbers if h.startswith(prefix) and h[10:].isdigit()]
            if serials:
                max_serial = max(serials)
                seq_stmt = select(HUSequence).where(HUSequence.supplier_id == supplier_id).with_for_update()
                seq_res = await db.execute(seq_stmt)
                seq_obj = seq_res.scalar_one_or_none()
                if seq_obj:
                    if max_serial > seq_obj.last_number:
                        seq_obj.last_number = max_serial
                else:
                    seq_obj = HUSequence(supplier_id=supplier_id, last_number=max_serial)
                    db.add(seq_obj)
                await db.flush()
        except Exception as e:
            logger.warning("Could not sync HU sequence with provided HUs: %s", e)
    else:
        try:
            hu_numbers = await generate_batch_hu(
                session=db,
                supplier_code=actual_supp_code,
                count=total_cartons,
                company_id=company_id,
                supplier_id=supplier_id,
            )
        except Exception as e:
            logger.warning("HU batch generator failed, using calibrated sequence: %s", e)
            prefix = "1" + actual_supp_code.lstrip("0").zfill(9)
            base_num = int(datetime.utcnow().timestamp()) % 1000000000
            hu_numbers = [f"{prefix}{str(base_num + i).zfill(10)}" for i in range(total_cartons)]

    # 5. Build Shipment entity
    shipment_date = date.today()
    est_arrival_date = None
    if req.estimated_arrival:
        try:
            est_arrival_date = datetime.strptime(req.estimated_arrival, "%Y-%m-%d").date()
        except ValueError:
            pass

    # Generate sequential shipment / packing slip number based on PO (e.g. 2001614890-01)
    shipment_number = await generate_po_shipment_number(db, first_po_num)

    total_units = int(sum(c.quantity for c in req.cartons))

    shipment = Shipment(
        id=uuid.uuid4(),
        company_id=company_id,
        supplier_id=supplier_id,
        shipment_number=shipment_number,
        plant_code=req.plant_code,
        storage_location=req.storage_location or "SL01",
        status=ShipmentStatus.PACKED.value,
        total_boxes=total_cartons,
        total_pieces=total_units,
        ship_date=shipment_date,
        estimated_arrival=est_arrival_date,
        carrier=req.carrier or "EXPRESS FREIGHT",
        tracking_number=req.tracking_number,
    )

    boxes_for_xml: list[dict[str, Any]] = []
    packing_slips: list[PackingSlip] = []

    po_cache: dict[str, Any] = {}
    if first_po_num and po_obj:
        po_cache[first_po_num] = po_obj

    for idx, c in enumerate(req.cartons):
        hu_num = hu_numbers[idx]
        slip_number = f"PS-{shipment_number}-{idx + 1}"

        if c.po_number not in po_cache:
            p_res = await db.execute(select(PurchaseOrder).where(PurchaseOrder.po_number == c.po_number))
            po_cache[c.po_number] = p_res.scalar_one_or_none()
        c_po = po_cache.get(c.po_number)
        c_po_items = (c_po.extra_data or {}).get("items", []) if c_po else []
        c_order_date = getattr(c_po, "order_date", None) or shipment_date

        clean_c_line = str(c.po_line).split("-")[0].zfill(5)
        po_item_info = next(
            (it for it in c_po_items if str(it.get("order_line_number") or it.get("line_number", "")).strip() == clean_c_line),
            None
        )
        mat_desc = c.description or (po_item_info.get("description") if po_item_info else None) or f"Item {c.product_code}"
        partner_code = c.partner_product_code or (po_item_info.get("partner_code") if po_item_info else None) or ""

        carton_meta = {
            "po_number": c.po_number,
            "po_line": c.po_line,
            "product_code": c.product_code,
            "lot_number": c.lot_number,
            "supplier_carton_ref": c.supplier_carton_ref,
            "quantity": c.quantity,
            "uom": c.uom,
            "box_index": idx + 1,
            "total_boxes": total_cartons,
        }

        ps = PackingSlip(
            id=uuid.uuid4(),
            company_id=company_id,
            shipment_id=shipment.id,
            slip_number=slip_number,
            box_number=idx + 1,
            hu_number=hu_num,
            barcode_data=hu_num,
            net_weight=Decimal(str(c.net_weight)),
            gross_weight=Decimal(str(c.gross_weight)),
            dimensions=carton_meta,
            status="PACKED",
        )
        packing_slips.append(ps)

        boxes_for_xml.append({
            "po_number": c.po_number,
            "po_line": c.po_line,
            "order_date": c_order_date,
            "order_type": "ZA6A",
            "hu_number": hu_num,
            "material_code": c.product_code,
            "material_desc": mat_desc,
            "partner_product_code": partner_code,
            "lot_number": c.lot_number or "DEFAULT",
            "supplier_carton_ref": c.supplier_carton_ref,
            "quantity": c.quantity,
            "uom": c.uom or "M",
            "gross_weight": c.gross_weight,
            "net_weight": c.net_weight,
            "packaging_type": c.packaging_type or "BOX",
        })

    # Group lines for ShipmentLine
    line_map: dict[tuple[str, str], float] = {}
    for c in req.cartons:
        k = (c.po_number, c.po_line)
        line_map[k] = line_map.get(k, 0.0) + c.quantity

    shipment_lines: list[ShipmentLine] = []
    for (po_num, po_item), total_qty in line_map.items():
        try:
            line_int = int(str(po_item).split("-")[0])
        except ValueError:
            line_int = 100

        # Query PO to link po_id
        po_stmt = select(PurchaseOrder).where(PurchaseOrder.po_number == po_num)
        po_res = await db.execute(po_stmt)
        po_obj = po_res.scalar_one_or_none()

        sample_carton = next((c for c in req.cartons if c.po_number == po_num), req.cartons[0])

        sl = ShipmentLine(
            id=uuid.uuid4(),
            company_id=company_id,
            shipment_id=shipment.id,
            po_id=po_obj.id if po_obj else None,
            po_number=po_num,
            po_line_number=line_int,
            material_number=sample_carton.product_code,
            quantity=int(total_qty),
            unit_of_measure=sample_carton.uom or "M",
        )
        shipment_lines.append(sl)

    # 6. Generate Calzedonia ASN XML (SdDataSlice)
    xml_content = generate_asn_xml(
        company_name=company_name,
        group_code=group_code,
        supplier_code=actual_supp_code,
        packing_slip_number=shipment_number,
        packing_slip_date=shipment_date,
        delivery_date=est_arrival_date or shipment_date,
        boxes=boxes_for_xml,
        note=req.note or "",
    )

    # 7. Validate ASN XML with Two-Phase Validator
    val_xml_result = validate_asn_xml(
        xml_content=xml_content,
        supplier_code=actual_supp_code,
    )
    is_xml_valid = val_xml_result.valid

    asn_number = f"ASN-{shipment_number}"
    asn_record = ASNRecord(
        id=uuid.uuid4(),
        company_id=company_id,
        supplier_id=supplier_id,
        shipment_id=shipment.id,
        asn_number=asn_number,
        xml_content=xml_content,
        xml_validated=is_xml_valid,
        status=ASNStatus.VALIDATED.value if is_xml_valid else ASNStatus.DRAFT.value,
    )

    # 8. Save to DB
    try:
        db.add(shipment)
        for ps in packing_slips:
            db.add(ps)
        for sl in shipment_lines:
            db.add(sl)
        db.add(asn_record)
        await db.flush()

        # Update PO statuses (PARTIAL / COMPLETED)
        affected_pos = list({c.po_number for c in req.cartons if c.po_number})
        await update_po_statuses(db, affected_pos)

        await db.commit()
    except Exception as e:
        logger.error("DB commit failed for direct shipment: %s", e)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save shipment to database: {str(e)}",
        )

    return {
        "success": True,
        "message": f"Shipment {shipment_number} created successfully with {total_cartons} cartons",
        "shipment": {
            "id": str(shipment.id),
            "shipment_number": shipment.shipment_number,
            "plant_code": shipment.plant_code,
            "status": shipment.status,
            "total_boxes": shipment.total_boxes,
            "total_pieces": shipment.total_pieces,
            "ship_date": shipment.ship_date.isoformat() if shipment.ship_date else None,
            "carrier": shipment.carrier,
        },
        "asn": {
            "id": str(asn_record.id),
            "asn_number": asn_record.asn_number,
            "status": asn_record.status,
            "xml_validated": asn_record.xml_validated,
            "xml_filename": get_asn_xml_filename(shipment_number, actual_supp_code),
            "email_subject": get_asn_email_subject(shipment_number, shipment_date, actual_supp_code),
            "xml_content": xml_content,
        },
        "handling_units": hu_numbers,
        "xml_validation": val_xml_result.to_dict(),
    }


@router.get("")
@router.get("/", include_in_schema=False)
async def list_shipments(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all shipments with carton, PO, and status details."""
    try:
        stmt = (
            select(Shipment, ASNRecord.id.label("asn_id"))
            .outerjoin(ASNRecord, ASNRecord.shipment_id == Shipment.id)
            .options(selectinload(Shipment.lines), selectinload(Shipment.packing_slips))
            .order_by(desc(Shipment.created_at))
            .limit(limit)
        )
        if supplier_id:
            try:
                stmt = stmt.where(Shipment.supplier_id == uuid.UUID(supplier_id))
            except (ValueError, TypeError):
                pass
        if status and status != "ALL":
            stmt = stmt.where(Shipment.status == status)
        if search:
            search_clean = search.strip()
            po_subq = select(ShipmentLine.shipment_id).where(
                ShipmentLine.po_number.ilike(f"%{search_clean}%")
            )
            stmt = stmt.where(
                Shipment.shipment_number.ilike(f"%{search_clean}%")
                | Shipment.plant_code.ilike(f"%{search_clean}%")
                | Shipment.id.in_(po_subq)
            )

        res = await db.execute(stmt)
        rows = res.all()

        results = []
        for s, asn_id in rows:
            po_set = {line.po_number for line in (s.lines or []) if line.po_number}
            for ps in (s.packing_slips or []):
                if ps.dimensions and isinstance(ps.dimensions, dict) and ps.dimensions.get("po_number"):
                    po_set.add(str(ps.dimensions["po_number"]))

            primary_uom = s.lines[0].unit_of_measure if (s.lines and s.lines[0].unit_of_measure) else "M"
            if not s.lines and s.packing_slips:
                for ps in s.packing_slips:
                    if ps.dimensions and isinstance(ps.dimensions, dict) and ps.dimensions.get("uom"):
                        primary_uom = str(ps.dimensions["uom"])
                        break

            gw = sum(float(ps.gross_weight or 0) for ps in (s.packing_slips or []))
            nw = sum(float(ps.net_weight or 0) for ps in (s.packing_slips or []))

            results.append({
                "id": str(s.id),
                "shipment_number": s.shipment_number,
                "plant_code": s.plant_code,
                "storage_location": s.storage_location,
                "status": s.status,
                "total_boxes": s.total_boxes,
                "total_pieces": s.total_pieces,
                "uom": primary_uom,
                "po_numbers": sorted(list(po_set)),
                "gross_weight": round(gw, 2) if gw > 0 else None,
                "net_weight": round(nw, 2) if nw > 0 else None,
                "ship_date": s.ship_date.isoformat() if s.ship_date else None,
                "carrier": s.carrier,
                "tracking_number": s.tracking_number,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "asn_id": str(asn_id) if asn_id else None,
            })
        return results
    except Exception as e:
        logger.warning("DB query for shipments failed: %s", e)
        return []


@router.get("/{id}")
async def get_shipment_detail(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve full shipment details including lines and cartons."""
    try:
        stmt = (
            select(Shipment)
            .where(Shipment.id == id)
            .options(selectinload(Shipment.lines))
        )
        res = await db.execute(stmt)
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Shipment not found")

        # Get packing slips / cartons
        ps_stmt = select(PackingSlip).where(PackingSlip.shipment_id == id).order_by(PackingSlip.box_number)
        ps_res = await db.execute(ps_stmt)
        cartons = ps_res.scalars().all()

        # Get ASN record
        asn_stmt = select(ASNRecord).where(ASNRecord.shipment_id == id)
        asn_res = await db.execute(asn_stmt)
        asn = asn_res.scalar_one_or_none()

        po_set = {line.po_number for line in (s.lines or []) if line.po_number}
        for c in cartons:
            if c.dimensions and isinstance(c.dimensions, dict) and c.dimensions.get("po_number"):
                po_set.add(str(c.dimensions["po_number"]))

        primary_uom = s.lines[0].unit_of_measure if (s.lines and s.lines[0].unit_of_measure) else "M"
        if not s.lines and cartons:
            for c in cartons:
                if c.dimensions and isinstance(c.dimensions, dict) and c.dimensions.get("uom"):
                    primary_uom = str(c.dimensions["uom"])
                    break

        gw = sum(float(c.gross_weight or 0) for c in cartons)
        nw = sum(float(c.net_weight or 0) for c in cartons)

        return {
            "id": str(s.id),
            "shipment_number": s.shipment_number,
            "plant_code": s.plant_code,
            "storage_location": s.storage_location,
            "status": s.status,
            "total_boxes": s.total_boxes,
            "total_pieces": s.total_pieces,
            "uom": primary_uom,
            "po_numbers": sorted(list(po_set)),
            "gross_weight": round(gw, 2) if gw > 0 else None,
            "net_weight": round(nw, 2) if nw > 0 else None,
            "ship_date": s.ship_date.isoformat() if s.ship_date else None,
            "carrier": s.carrier,
            "tracking_number": s.tracking_number,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "cartons": [
                {
                    "box_number": c.box_number,
                    "hu_number": c.hu_number,
                    "gross_weight": float(c.gross_weight or 0),
                    "net_weight": float(c.net_weight or 0),
                    "details": c.dimensions or {},
                }
                for c in cartons
            ],
            "asn": {
                "id": str(asn.id) if asn else None,
                "asn_number": asn.asn_number if asn else None,
                "status": asn.status if asn else None,
                "xml_validated": asn.xml_validated if asn else False,
                "xml_content": asn.xml_content if asn else None,
            } if asn else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error retrieving shipment detail: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{id}/labels")
async def download_shipment_labels(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Generate and stream 6"x4" industrial PDF labels with Code 39 barcodes
    for all cartons/boxes in this shipment.
    """
    try:
        stmt = select(Shipment).where(Shipment.id == id)
        res = await db.execute(stmt)
        shipment = res.scalar_one_or_none()
        if not shipment:
            raise HTTPException(status_code=404, detail="Shipment not found")

        # Get cartons
        ps_stmt = select(PackingSlip).where(PackingSlip.shipment_id == id).order_by(PackingSlip.box_number)
        ps_res = await db.execute(ps_stmt)
        cartons = ps_res.scalars().all()

        if not cartons:
            raise HTTPException(status_code=400, detail="No carton records found for this shipment")

        # Supplier info
        supp_name = "Sirio Ltd"
        supp_code = "0000058376"
        if shipment.supplier_id:
            supp_stmt = select(Supplier).where(Supplier.id == shipment.supplier_id)
            supp_res = await db.execute(supp_stmt)
            supp = supp_res.scalar_one_or_none()
            if supp:
                supp_name = supp.name
                supp_code = supp.supplier_code

        labels_data: list[dict[str, Any]] = []
        total_boxes = len(cartons)

        for c in cartons:
            meta = c.dimensions or {}
            labels_data.append({
                "hu_number": c.hu_number or c.barcode_data or "",
                "supplier_name": supp_name,
                "supplier_code": supp_code,
                "po_number": meta.get("po_number", "N/A"),
                "po_line_number": str(meta.get("po_line", "100")),
                "material_code": meta.get("product_code", "MATERIAL"),
                "material_description": f"Calzedonia Item {meta.get('product_code', '')}",
                "product_code_partner": meta.get("supplier_carton_ref", ""),
                "qty": float(meta.get("quantity", 0.0)),
                "unit_of_measure": meta.get("uom", "M"),
                "batch_code": meta.get("lot_number", ""),
                "gross_weight": float(c.gross_weight or 0.0),
                "net_weight": float(c.net_weight or 0.0),
                "box_index": c.box_number or 1,
                "total_boxes": total_boxes,
                "label_date": shipment.ship_date.strftime("%d-%m-%Y") if shipment.ship_date else datetime.now().strftime("%d-%m-%Y"),
            })

        pdf_bytes = generate_batch_labels(labels_data)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=Labels_{shipment.shipment_number}.pdf",
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Label generation failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate labels: {str(e)}")
