"""
ASN API endpoints.

Handles:
- GET  /                    — List ASN records
- GET  /{id}                — ASN record details
- GET  /{id}/preview-xml    — Preview raw Calzedonia SdDataSlice XML
- GET  /{id}/download-xml   — Download XML file (PL_XXXXXXXX_YYYYYYYYYY.xml)
- POST /{id}/validate       — Execute two-phase validation (DTD + business rules)
- POST /{id}/send           — Dispatch ASN XML via email to Calzedonia EDI / iungo
"""

from __future__ import annotations

import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.asn import ASNRecord
from app.models.company import Company
from app.models.email_message import EmailRecord
from app.models.enums import ASNStatus, ShipmentStatus
from app.models.shipment import Shipment
from app.models.supplier import Supplier
from app.services.asn_xml_generator_service import (
    get_asn_email_subject,
    get_asn_xml_filename,
    validate_asn_xml,
)
from app.services.email_sender import send_asn_dispatch_email

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
@router.get("/", include_in_schema=False)
async def list_asns(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List ASN records with filtering."""
    try:
        stmt = select(ASNRecord).order_by(desc(ASNRecord.created_at)).limit(limit)
        if supplier_id:
            try:
                stmt = stmt.where(ASNRecord.supplier_id == uuid.UUID(supplier_id))
            except (ValueError, TypeError):
                pass
        if status and status != "ALL":
            stmt = stmt.where(ASNRecord.status == status)
        if search:
            stmt = stmt.where(ASNRecord.asn_number.ilike(f"%{search}%"))

        res = await db.execute(stmt)
        records = res.scalars().all()

        return [
            {
                "id": str(r.id),
                "asn_number": r.asn_number,
                "shipment_id": str(r.shipment_id),
                "supplier_id": str(r.supplier_id),
                "status": r.status,
                "xml_validated": r.xml_validated,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
                "accepted_at": r.accepted_at.isoformat() if r.accepted_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ]
    except Exception as e:
        logger.warning("DB query for ASNs failed: %s", e)
        return []


@router.get("/dispatch-settings")
async def get_dispatch_settings(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get the configured IUNGO / EDI dispatch recipient email."""
    stmt = select(Company).limit(1)
    res = await db.execute(stmt)
    comp = res.scalar_one_or_none()
    recipient = comp.settings.get("iungo_dispatch_email") if comp and comp.settings else None
    return {
        "recipient_email": recipient or "edi@orders.buyer.org",
        "default_email": "edi@orders.buyer.org",
    }


@router.post("/dispatch-settings")
async def update_dispatch_settings(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update the configured IUNGO / EDI dispatch recipient email (Admin setting)."""
    recipient = (payload.get("recipient_email") or "").strip()
    if not recipient:
        raise HTTPException(status_code=400, detail="Recipient email cannot be empty")

    stmt = select(Company)
    res = await db.execute(stmt)
    companies = res.scalars().all()
    for comp in companies:
        current_settings = dict(comp.settings or {})
        current_settings["iungo_dispatch_email"] = recipient
        comp.settings = current_settings

    await db.commit()
    logger.info("Updated IUNGO EDI dispatch email to: %s", recipient)
    return {
        "success": True,
        "message": f"IUNGO dispatch email configured to {recipient}",
        "recipient_email": recipient,
    }


@router.get("/{id}")
async def get_asn_detail(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get single ASN record details."""
    try:
        stmt = select(ASNRecord).where(ASNRecord.id == id)
        res = await db.execute(stmt)
        r = res.scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="ASN record not found")

        # Get linked shipment
        shipment_num = None
        plant_code = None
        boxes_count = 0
        if r.shipment_id:
            shp_stmt = select(Shipment).where(Shipment.id == r.shipment_id)
            shp_res = await db.execute(shp_stmt)
            shp = shp_res.scalar_one_or_none()
            if shp:
                shipment_num = shp.shipment_number
                plant_code = shp.plant_code
                boxes_count = shp.total_boxes

        # Get supplier
        supp_code = "0000018194"
        supp_name = "COATS THREAD EXPORTS (PVT) LTD"
        if r.supplier_id:
            supp_stmt = select(Supplier).where(Supplier.id == r.supplier_id)
            supp_res = await db.execute(supp_stmt)
            supp = supp_res.scalar_one_or_none()
            if supp:
                supp_code = supp.supplier_code
                supp_name = supp.name

        return {
            "id": str(r.id),
            "asn_number": r.asn_number,
            "shipment_id": str(r.shipment_id),
            "shipment_number": shipment_num,
            "plant_code": plant_code,
            "boxes_count": boxes_count,
            "supplier_id": str(r.supplier_id),
            "supplier_name": supp_name,
            "supplier_code": supp_code,
            "status": r.status,
            "xml_validated": r.xml_validated,
            "xml_filename": get_asn_xml_filename(shipment_num or "01000000", supp_code),
            "email_subject": get_asn_email_subject(
                shipment_num or "01000000",
                r.created_at or datetime.now(),
                supp_code,
            ),
            "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            "accepted_at": r.accepted_at.isoformat() if r.accepted_at else None,
            "rejection_reason": r.rejection_reason,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error retrieving ASN: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{id}/preview-xml")
async def preview_asn_xml(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve raw Calzedonia SdDataSlice XML content for preview."""
    stmt = select(ASNRecord).where(ASNRecord.id == id)
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="ASN record not found")

    return {
        "asn_number": r.asn_number,
        "xml_content": r.xml_content or "",
        "xml_validated": r.xml_validated,
    }


@router.get("/{id}/download-xml")
async def download_asn_xml(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Download the Calzedonia SdDataSlice XML file."""
    stmt = select(ASNRecord).where(ASNRecord.id == id)
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="ASN record not found")

    supp_code = "0000018194"
    if r.supplier_id:
        supp_stmt = select(Supplier).where(Supplier.id == r.supplier_id)
        supp_res = await db.execute(supp_stmt)
        supp = supp_res.scalar_one_or_none()
        if supp:
            supp_code = supp.supplier_code

    shipment_num = "01000000"
    if r.shipment_id:
        shp_stmt = select(Shipment).where(Shipment.id == r.shipment_id)
        shp_res = await db.execute(shp_stmt)
        shp = shp_res.scalar_one_or_none()
        if shp:
            shipment_num = shp.shipment_number

    filename = get_asn_xml_filename(shipment_num, supp_code)
    xml_data = (r.xml_content or "").encode("utf-8")

    return Response(
        content=xml_data,
        media_type="application/xml",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/{id}/validate")
async def revalidate_asn_xml(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Execute two-phase DTD and business rules validation against the stored ASN XML."""
    stmt = select(ASNRecord).where(ASNRecord.id == id)
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="ASN record not found")

    supp_code = "0000018194"
    if r.supplier_id:
        supp_stmt = select(Supplier).where(Supplier.id == r.supplier_id)
        supp_res = await db.execute(supp_stmt)
        supp = supp_res.scalar_one_or_none()
        if supp:
            supp_code = supp.supplier_code

    val_res = validate_asn_xml(r.xml_content or "", supp_code)
    r.xml_validated = val_res.valid
    if val_res.valid and r.status == ASNStatus.DRAFT.value:
        r.status = ASNStatus.VALIDATED.value
    elif not val_res.valid:
        r.status = ASNStatus.FAILED.value

    try:
        await db.commit()
    except Exception as e:
        logger.warning("Failed to save validation status: %s", e)

    return val_res.to_dict()


@router.post("/{id}/send")
async def send_asn_xml(
    id: uuid.UUID,
    recipient_email: Optional[str] = Query(None, description="Optional override recipient email"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Dispatch ASN XML to Calzedonia EDI / IUNGO.
    Updates ASN status to XML_SENT and marks shipment as XML_SENT.
    Sends real outbound email via SMTP with XML attachment and logs to EmailRecord.
    """
    stmt = select(ASNRecord).where(ASNRecord.id == id)
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="ASN record not found")

    supp_code = "0000018194"
    supp_name = "COATS THREAD EXPORTS (PVT) LTD"
    if r.supplier_id:
        supp_stmt = select(Supplier).where(Supplier.id == r.supplier_id)
        supp_res = await db.execute(supp_stmt)
        supp = supp_res.scalar_one_or_none()
        if supp:
            supp_code = supp.supplier_code
            supp_name = supp.name or supp_name

    shipment_num = "01000000"
    if r.shipment_id:
        shp_stmt = select(Shipment).where(Shipment.id == r.shipment_id)
        shp_res = await db.execute(shp_stmt)
        shp = shp_res.scalar_one_or_none()
        if shp:
            shipment_num = shp.shipment_number
            shp.status = ShipmentStatus.XML_SENT.value

    # Look up configured recipient email from Company settings if not passed
    to_email = recipient_email
    comp_stmt = select(Company).where(Company.id == r.company_id)
    comp_res = await db.execute(comp_stmt)
    comp = comp_res.scalar_one_or_none()
    if not comp:
        comp_res = await db.execute(select(Company).limit(1))
        comp = comp_res.scalar_one_or_none()

    if not to_email:
        if comp and comp.settings and comp.settings.get("iungo_dispatch_email"):
            to_email = comp.settings.get("iungo_dispatch_email")
        else:
            to_email = "edi@orders.buyer.org"

    filename = get_asn_xml_filename(shipment_num, supp_code)
    email_subject = get_asn_email_subject(shipment_num, r.created_at or datetime.now(), supp_code)

    now_utc = datetime.utcnow()
    r.status = ASNStatus.XML_SENT.value
    r.sent_at = now_utc

    # 1. Send the actual email via SMTP with XML attachment
    email_dispatched = False
    try:
        email_dispatched = send_asn_dispatch_email(
            to_email=to_email,
            asn_number=r.asn_number,
            shipment_number=shipment_num,
            supplier_code=supp_code,
            supplier_name=supp_name,
            xml_content=r.xml_content or "",
            xml_filename=filename,
            email_subject=email_subject,
        )
    except Exception as em_err:
        logger.error("Failed to send ASN email via SMTP: %s", em_err)

    # 2. Record outbound EmailRecord in PostgreSQL database
    try:
        outbound_rec = EmailRecord(
            company_id=r.company_id or (comp.id if comp else None),
            supplier_id=r.supplier_id,
            message_id=f"asn-{r.asn_number}-{uuid.uuid4().hex[:8]}@asn-platform.local",
            from_address="ASN Portal <no-reply@asnplatform.local>",
            to_address=to_email,
            subject=email_subject,
            body_text=f"ASN {r.asn_number} for Shipment #{shipment_num} dispatched to IUNGO EDI recipient {to_email}.",
            direction="OUTBOUND",
            status="SENT" if email_dispatched else "FAILED",
            email_type="ASN_DISPATCH",
            processed_at=now_utc,
        )
        db.add(outbound_rec)
    except Exception as rec_err:
        logger.warning("Failed to save outbound EmailRecord: %s", rec_err)

    try:
        await db.commit()
    except Exception as e:
        logger.warning("Failed to update status on send: %s", e)
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "success": True,
        "message": f"ASN XML successfully dispatched to {to_email}",
        "asn_number": r.asn_number,
        "status": r.status,
        "sent_at": now_utc.isoformat(),
        "email_subject": email_subject,
        "attachment_filename": filename,
        "recipient": to_email,
        "email_sent": email_dispatched,
    }
