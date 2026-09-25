"""
Purchase Orders API endpoints (Presentation Layer).

Provides:
  - GET    /              — List POs with filters & pagination
  - GET    /stats         — PO statistics by status
  - GET    /open-lines    — List open PO lines for template export and shipment creation
  - GET    /{po_id}       — PO detail with linked email/parsed data and revision history
  - PATCH  /{po_id}       — Update PO fields
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import cast, String, desc, func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.email_message import EmailRecord
from app.models.parsed_data import ParsedData
from app.models.po_history import POHistory
from app.models.purchase_order import PurchaseOrder
from app.models.supplier import Supplier

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Pydantic Schemas ───────────────────────────────────────────

class POListItem(BaseModel):
    id: str
    company_id: str
    supplier_id: Optional[str] = None
    po_number: Optional[str] = None
    client_code: Optional[str] = None
    style_number: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    total_value: Optional[float] = None
    currency: Optional[str] = None
    delivery_date: Optional[str] = None
    ship_date: Optional[str] = None
    destination: Optional[str] = None
    status: Optional[str] = None
    version: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PODetailResponse(BaseModel):
    id: str
    company_id: str
    po_number: Optional[str] = None
    client_code: Optional[str] = None
    style_number: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    total_value: Optional[float] = None
    currency: Optional[str] = None
    delivery_date: Optional[str] = None
    ship_date: Optional[str] = None
    destination: Optional[str] = None
    status: Optional[str] = None
    version: Optional[int] = None
    extra_data: Optional[dict] = None
    source_email_id: Optional[str] = None
    source_email_subject: Optional[str] = None
    history: Optional[list[dict[str, Any]]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class POUpdateRequest(BaseModel):
    status: Optional[str] = None
    quantity: Optional[int] = None
    delivery_date: Optional[str] = None
    ship_date: Optional[str] = None
    destination: Optional[str] = None
    description: Optional[str] = None
    style_number: Optional[str] = None
    currency: Optional[str] = None


class PaginatedPOResponse(BaseModel):
    items: list[POListItem]
    total: int
    page: int
    per_page: int
    pages: int


class POStatsResponse(BaseModel):
    total: int = 0
    active: int = 0
    updated: int = 0
    shipped: int = 0
    cancelled: int = 0
    completed: int = 0


# ─── GET / — List Purchase Orders ───────────────────────────────

@router.get("", response_model=PaginatedPOResponse)
@router.get("/", response_model=PaginatedPOResponse, include_in_schema=False)
async def list_purchase_orders(
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search PO#, client, style"),
    supplier_id: Optional[str] = Query(None, description="Filter by supplier UUID"),
    company_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List purchase orders with optional filters and pagination."""
    query = select(PurchaseOrder)

    # Apply filters
    if company_id:
        query = query.where(PurchaseOrder.company_id == company_id)
    if supplier_id:
        v_filter = f"%{supplier_id}%"
        parsed_po_subq = select(ParsedData.po_number_extracted).where(
            ParsedData.supplier_id_extracted.ilike(v_filter)
            | cast(ParsedData.raw_extracted, String).ilike(v_filter)
        )
        supp_ids_subq = select(Supplier.id).where(
            Supplier.supplier_code.ilike(v_filter)
            | Supplier.name.ilike(v_filter)
        )
        try:
            supp_uuid = uuid.UUID(supplier_id)
            query = query.where(
                or_(
                    PurchaseOrder.supplier_id == supp_uuid,
                    PurchaseOrder.supplier_id.in_(supp_ids_subq),
                    PurchaseOrder.po_number.in_(parsed_po_subq),
                    PurchaseOrder.client_code.ilike(v_filter),
                )
            )
        except (ValueError, TypeError):
            query = query.where(
                or_(
                    PurchaseOrder.supplier_id.in_(supp_ids_subq),
                    PurchaseOrder.po_number.in_(parsed_po_subq),
                    PurchaseOrder.client_code.ilike(v_filter),
                )
            )
    if status and status != "ALL":
        query = query.where(PurchaseOrder.status == status.upper())
    if search:
        from app.email.parsers import normalize_po_number
        search_filter = f"%{search}%"
        clean_search = normalize_po_number(search)
        query = query.where(
            PurchaseOrder.po_number.ilike(search_filter)
            | PurchaseOrder.po_number.ilike(f"%{clean_search}%")
            | PurchaseOrder.client_code.ilike(search_filter)
            | PurchaseOrder.style_number.ilike(search_filter)
            | PurchaseOrder.description.ilike(search_filter)
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate & sort
    query = query.order_by(desc(PurchaseOrder.created_at))
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    records = result.scalars().all()

    pages = max(1, (total + per_page - 1) // per_page)

    return PaginatedPOResponse(
        items=[
            POListItem(
                id=str(r.id),
                company_id=str(r.company_id),
                supplier_id=str(r.supplier_id) if r.supplier_id else None,
                po_number=r.po_number,
                client_code=r.client_code,
                style_number=r.style_number,
                description=r.description,
                quantity=r.quantity,
                unit_price=float(r.unit_price) if r.unit_price else None,
                total_value=float(r.total_value) if r.total_value else None,
                currency=r.currency,
                delivery_date=str(r.delivery_date) if r.delivery_date else None,
                ship_date=str(r.ship_date) if r.ship_date else None,
                destination=r.destination,
                status=r.status,
                version=r.version,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in records
        ],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── GET /stats — PO Statistics ─────────────────────────────────

@router.get("/stats", response_model=POStatsResponse)
async def po_stats(
    db: AsyncSession = Depends(get_db),
    supplier_id: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
):
    """Get PO count breakdown by status."""
    query = select(
        func.count().label("total"),
        func.count().filter(PurchaseOrder.status == "ACTIVE").label("active"),
        func.count().filter(PurchaseOrder.status == "UPDATED").label("updated"),
        func.count().filter(PurchaseOrder.status == "SHIPPED").label("shipped"),
        func.count().filter(PurchaseOrder.status == "CANCELLED").label("cancelled"),
        func.count().filter(PurchaseOrder.status == "COMPLETED").label("completed"),
    )

    if company_id:
        query = query.where(PurchaseOrder.company_id == company_id)
    if supplier_id:
        v_filter = f"%{supplier_id}%"
        parsed_po_subq = select(ParsedData.po_number_extracted).where(
            ParsedData.supplier_id_extracted.ilike(v_filter)
            | cast(ParsedData.raw_extracted, String).ilike(v_filter)
        )
        supp_ids_subq = select(Supplier.id).where(
            Supplier.supplier_code.ilike(v_filter)
            | Supplier.name.ilike(v_filter)
        )
        try:
            supp_uuid = uuid.UUID(supplier_id)
            query = query.where(
                PurchaseOrder.supplier_id == supp_uuid
                | PurchaseOrder.supplier_id.in_(supp_ids_subq)
                | PurchaseOrder.po_number.in_(parsed_po_subq)
                | PurchaseOrder.client_code.ilike(v_filter)
            )
        except (ValueError, TypeError):
            query = query.where(
                PurchaseOrder.supplier_id.in_(supp_ids_subq)
                | PurchaseOrder.po_number.in_(parsed_po_subq)
                | PurchaseOrder.client_code.ilike(v_filter)
            )

    result = await db.execute(query)
    row = result.one()

    return POStatsResponse(
        total=row.total,
        active=row.active,
        updated=row.updated,
        shipped=row.shipped,
        cancelled=row.cancelled,
        completed=row.completed,
    )


# ─── GET /open-lines — Open PO Lines for Shipping ───────────────

@router.get("/open-lines")
async def list_open_po_lines(
    supplier_id: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return open PO lines across active purchase orders for shipping dropdowns or Excel generation."""
    try:
        stmt = select(PurchaseOrder).where(
            PurchaseOrder.status.in_(["ACTIVE", "UPDATED", "XML_SENT"])
        )
        if company_id:
            stmt = stmt.where(PurchaseOrder.company_id == company_id)
        if supplier_id:
            try:
                stmt = stmt.where(PurchaseOrder.supplier_id == UUID(supplier_id))
            except ValueError:
                pass

        res = await db.execute(stmt)
        pos = res.scalars().all()

        open_lines = []
        for po in pos:
            items = (po.extra_data or {}).get("items", [])
            for item in items:
                line_num = str(item.get("line_number", "00100")).split("-")[0].zfill(5)
                ordered = float(item.get("quantity", 0))
                open_lines.append({
                    "po_id": str(po.id),
                    "po_number": po.po_number,
                    "po_item": line_num,
                    "material_code": item.get("material_code", ""),
                    "material_description": item.get("description", po.description or ""),
                    "ordered_qty": ordered,
                    "uom": item.get("uom", "M"),
                    "destination": po.destination,
                    "delivery_date": str(po.delivery_date) if po.delivery_date else None,
                })
        return open_lines
    except Exception as e:
        logger.warning("Failed to query open PO lines: %s", e)
        return []


# ─── GET /{po_id} — PO Detail ───────────────────────────────────

@router.get("/{po_id}", response_model=PODetailResponse)
async def get_purchase_order(
    po_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get purchase order detail with linked source email info and revision history."""
    result = await db.execute(
        select(PurchaseOrder).where(PurchaseOrder.id == po_id)
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    # Get source email subject if linked
    source_email_subject = None
    if po.source_email_id:
        email_result = await db.execute(
            select(EmailRecord.subject).where(
                EmailRecord.id == po.source_email_id
            )
        )
        source_email_subject = email_result.scalar_one_or_none()

    # Fetch revision history
    history_list: list[dict[str, Any]] = []
    try:
        hist_stmt = (
            select(POHistory)
            .where(POHistory.po_id == po_id)
            .order_by(desc(POHistory.created_at))
        )
        hist_res = await db.execute(hist_stmt)
        for h in hist_res.scalars().all():
            history_list.append({
                "id": str(h.id),
                "version": h.version,
                "change_source": h.change_source,
                "changed_fields": getattr(h, "changed_fields", {}),
                "created_at": h.created_at.isoformat() if h.created_at else None,
            })
    except Exception as e:
        logger.warning("Could not fetch PO history: %s", e)

    return PODetailResponse(
        id=str(po.id),
        company_id=str(po.company_id),
        po_number=po.po_number,
        client_code=po.client_code,
        style_number=po.style_number,
        description=po.description,
        quantity=po.quantity,
        unit_price=float(po.unit_price) if po.unit_price else None,
        total_value=float(po.total_value) if po.total_value else None,
        currency=po.currency,
        delivery_date=str(po.delivery_date) if po.delivery_date else None,
        ship_date=str(po.ship_date) if po.ship_date else None,
        destination=po.destination,
        status=po.status,
        version=po.version,
        extra_data=po.extra_data,
        source_email_id=str(po.source_email_id) if po.source_email_id else None,
        source_email_subject=source_email_subject,
        history=history_list,
        created_at=po.created_at,
        updated_at=po.updated_at,
    )


# ─── PATCH /{po_id} — Update PO ─────────────────────────────────

@router.patch("/{po_id}")
async def update_purchase_order(
    po_id: UUID,
    body: POUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update purchase order fields."""
    from app.services.email_service import _parse_date

    result = await db.execute(
        select(PurchaseOrder).where(PurchaseOrder.id == po_id)
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if body.status is not None:
        po.status = body.status.upper()
    if body.quantity is not None:
        po.quantity = body.quantity
    if body.delivery_date is not None:
        po.delivery_date = _parse_date(body.delivery_date)
    if body.ship_date is not None:
        po.ship_date = _parse_date(body.ship_date)
    if body.destination is not None:
        po.destination = body.destination
    if body.description is not None:
        po.description = body.description
    if body.style_number is not None:
        po.style_number = body.style_number
    if body.currency is not None:
        po.currency = body.currency

    po.updated_at = datetime.now(timezone.utc)
    po.version = (po.version or 1) + 1
    await db.commit()

    logger.info("Updated PO %s (v%d)", po.po_number, po.version)
    return {"status": "updated", "po_id": str(po_id), "version": po.version}
