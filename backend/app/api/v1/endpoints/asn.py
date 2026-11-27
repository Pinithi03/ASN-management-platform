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

from app.core.exceptions import CodedHTTPException
from app.db.session import get_db
from app.models.asn import ASNRecord
from app.models.company import Company
from app.models.enums import ASNStatus, ShipmentStatus
from app.models.shipment import Shipment
from app.models.supplier import Supplier
from app.services.asn_xml_generator_service import (
    extract_asn_xml_metadata,
    get_asn_email_subject,
    get_asn_xml_filename,
    validate_asn_xml,
)
from app.services.email_sender import send_asn_dispatch_email
from app.services import notification_service

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
    """Get the configured IUNGO / EDI dispatch recipient email and outbound SMTP settings."""
    stmt = select(Company).limit(1)
    res = await db.execute(stmt)
    comp = res.scalar_one_or_none()
    recipient = comp.settings.get("iungo_dispatch_email") if comp and comp.settings else None
    return {
        "recipient_email": recipient or "edi@orders.buyer.org",
        "default_email": "edi@orders.buyer.org",
        "smtp_host": (comp.smtp_host if comp else None) or "",
        "smtp_port": (comp.smtp_port if comp and comp.smtp_port else 587),
        "smtp_username": (comp.smtp_username if comp else None) or "",
        "smtp_from_address": (comp.smtp_from_address if comp else None) or "",
        "smtp_use_tls": comp.smtp_use_tls if (comp and comp.smtp_use_tls is not None) else True,
        "smtp_password_set": bool(comp and comp.smtp_password),
    }


@router.post("/dispatch-settings")
async def update_dispatch_settings(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update the configured IUNGO / EDI dispatch recipient email and optional outbound SMTP settings (Admin setting)."""
    recipient = (payload.get("recipient_email") or "").strip()
    if not recipient:
        raise CodedHTTPException(code="RECIPIENT_EMAIL_REQUIRED", status_code=400, detail="Recipient email cannot be empty")

    stmt = select(Company)
    res = await db.execute(stmt)
    companies = res.scalars().all()
    for comp in companies:
        current_settings = dict(comp.settings or {})
        current_settings["iungo_dispatch_email"] = recipient
        comp.settings = current_settings

        if "smtp_host" in payload and payload.get("smtp_host") is not None:
            comp.smtp_host = str(payload.get("smtp_host") or "").strip() or None
        if "smtp_port" in payload and payload.get("smtp_port"):
            try:
                comp.smtp_port = int(payload["smtp_port"])
            except (ValueError, TypeError):
                pass
        if "smtp_username" in payload and payload.get("smtp_username") is not None:
            comp.smtp_username = str(payload.get("smtp_username") or "").strip() or None
        if "smtp_password" in payload and payload.get("smtp_password"):
            comp.smtp_password = str(payload.get("smtp_password")).strip()
        if "smtp_from_address" in payload and payload.get("smtp_from_address") is not None:
            comp.smtp_from_address = str(payload.get("smtp_from_address") or "").strip() or None
        if "smtp_use_tls" in payload and payload.get("smtp_use_tls") is not None:
            comp.smtp_use_tls = bool(payload.get("smtp_use_tls"))

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
            raise CodedHTTPException(code="ASN_NOT_FOUND", status_code=404, detail="ASN record not found")

        # Get linked shipment
        shipment_num = None
        plant_code = None
        boxes_count = 0
        shp = None
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

        xml_meta = extract_asn_xml_metadata(r.xml_content or "")
        effective_ps_num = xml_meta.get("packing_slip_number") or shipment_num or "01000000"
        effective_supp_code = xml_meta.get("partner_id") or supp_code
        effective_deliv_date = (
            xml_meta.get("delivery_date")
            or (shp.estimated_arrival if shp and shp.estimated_arrival else None)
            or xml_meta.get("packing_slip_date")
            or (shp.ship_date if shp and shp.ship_date else None)
            or r.created_at
            or datetime.now()
        )

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
            "xml_filename": get_asn_xml_filename(effective_ps_num, effective_supp_code),
            "email_subject": get_asn_email_subject(
                effective_ps_num,
                effective_deliv_date,
                effective_supp_code,
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
        raise CodedHTTPException(code="ASN_NOT_FOUND", status_code=404, detail="ASN record not found")

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

    xml_meta = extract_asn_xml_metadata(r.xml_content or "")
    effective_ps_num = xml_meta.get("packing_slip_number") or shipment_num
    effective_supp_code = xml_meta.get("partner_id") or supp_code

    return {
        "asn_number": r.asn_number,
        "xml_content": r.xml_content or "",
        "xml_validated": r.xml_validated,
        "xml_filename": get_asn_xml_filename(effective_ps_num, effective_supp_code),
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
        raise CodedHTTPException(code="ASN_NOT_FOUND", status_code=404, detail="ASN record not found")

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

    xml_meta = extract_asn_xml_metadata(r.xml_content or "")
    effective_ps_num = xml_meta.get("packing_slip_number") or shipment_num
    effective_supp_code = xml_meta.get("partner_id") or supp_code

    filename = get_asn_xml_filename(effective_ps_num, effective_supp_code)
    xml_data = (r.xml_content or "").encode("utf-8")

    return Response(
        content=xml_data,
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
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
        raise CodedHTTPException(code="ASN_NOT_FOUND", status_code=404, detail="ASN record not found")

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
    Sends real outbound email via SMTP with XML attachment (without writing to Email Inbox).
    """
    stmt = select(ASNRecord).where(ASNRecord.id == id)
    res = await db.execute(stmt)
    r = res.scalar_one_or_none()
    if not r:
        raise CodedHTTPException(code="ASN_NOT_FOUND", status_code=404, detail="ASN record not found")

    supp_code = "0000018194"
    supp_name = "COATS THREAD EXPORTS (PVT) LTD"
    supp_email = None
    if r.supplier_id:
        supp_stmt = select(Supplier).where(Supplier.id == r.supplier_id)
        supp_res = await db.execute(supp_stmt)
        supp = supp_res.scalar_one_or_none()
        if supp:
            supp_code = supp.supplier_code
            supp_name = supp.name or supp_name
            supp_email = supp.email

    shipment_num = "01000000"
    shp = None
    if r.shipment_id:
        shp_stmt = select(Shipment).where(Shipment.id == r.shipment_id)
        shp_res = await db.execute(shp_stmt)
        shp = shp_res.scalar_one_or_none()
        if shp:
            shipment_num = shp.shipment_number
            shp.status = ShipmentStatus.XML_SENT.value

    # Look up configured recipient email and optional SMTP config from Company settings
    to_email = (recipient_email or "").strip() or None
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

    # Extract PackingSlipNumber, DeliveryDate, and PartnerId directly from the XML being dispatched
    xml_meta = extract_asn_xml_metadata(r.xml_content or "")
    effective_ps_num = xml_meta.get("packing_slip_number") or shipment_num
    effective_supp_code = xml_meta.get("partner_id") or supp_code
    effective_deliv_date = (
        xml_meta.get("delivery_date")
        or (shp.estimated_arrival if shp and shp.estimated_arrival else None)
        or xml_meta.get("packing_slip_date")
        or (shp.ship_date if shp and shp.ship_date else None)
        or r.created_at
        or datetime.now()
    )

    filename = get_asn_xml_filename(effective_ps_num, effective_supp_code)
    email_subject = get_asn_email_subject(effective_ps_num, effective_deliv_date, effective_supp_code)

    now_utc = datetime.utcnow()
    r.status = ASNStatus.XML_SENT.value
    r.sent_at = now_utc

    smtp_cfg = None
    if comp and comp.smtp_host:
        smtp_cfg = {
            "smtp_host": comp.smtp_host,
            "smtp_port": comp.smtp_port,
            "smtp_username": comp.smtp_username,
            "smtp_password": comp.smtp_password,
            "smtp_from_address": comp.smtp_from_address,
            "smtp_use_tls": comp.smtp_use_tls,
        }

    # Send the actual email via SMTP with XML attachment (isolated from EmailRecord inbox)
    email_dispatched = False
    try:
        email_dispatched = send_asn_dispatch_email(
            to_email=to_email,
            asn_number=r.asn_number,
            shipment_number=effective_ps_num,
            supplier_code=effective_supp_code,
            supplier_name=supp_name,
            xml_content=r.xml_content or "",
            xml_filename=filename,
            email_subject=email_subject,
            reply_to_email=supp_email,
            smtp_config=smtp_cfg,
        )
    except Exception as em_err:
        logger.error("Failed to send ASN email via SMTP: %s", em_err)

    # Supplier: ASN dispatched / failed. Admin: dispatch failed.
    notif_params = {"shipment": effective_ps_num, "recipient": to_email}
    notif_link = f"/shipments/{r.shipment_id}#xml" if r.shipment_id else "/shipments"
    if email_dispatched:
        await notification_service.notify_supplier(
            db, r.supplier_id, "ASN_DISPATCHED", params=notif_params, link=notif_link
        )
    else:
        await notification_service.notify_supplier(
            db, r.supplier_id, "ASN_DISPATCH_FAILED", params=notif_params, link=notif_link
        )
        await notification_service.notify_admins(
            db, "ASN_DISPATCH_FAILED", params={**notif_params, "supplier": supp_name}, link=notif_link
        )

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
