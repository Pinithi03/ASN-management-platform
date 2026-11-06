"""
Purchase Orders API endpoints (Presentation Layer).

Provides:
  - GET    /              — List POs with filters & pagination (supports exclude_completed)
  - GET    /stats         — PO statistics by status
  - GET    /lines         — Paginated flat active PO lines for Purchase Order Lines workspace
  - GET    /open-lines    — List open PO lines for template export and shipment creation
  - GET    /{po_id}       — PO detail with linked email/parsed data and revision history
  - PATCH  /{po_id}       — Update PO fields
"""

from __future__ import annotations

import copy
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import CodedHTTPException
from app.api.v1.deps import CurrentUser, UserRole, get_current_user
from app.db.session import get_db
from app.models.email_message import EmailRecord
from app.models.po_history import POHistory
from app.models.purchase_order import PurchaseOrder
from app.repositories.po_repo import (
    PORepository,
    allocate_po_items_shipped_quantities,
    apply_supplier_scope,
    resolve_po_plant,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Pydantic Schemas ───────────────────────────────────────────

class POListItem(BaseModel):
    id: str
    company_id: str
    supplier_id: Optional[str] = None
    po_number: Optional[str] = None
    order_date: Optional[str] = None
    client_code: Optional[str] = None
    style_number: Optional[str] = None
    item_code: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    notations: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    total_value: Optional[float] = None
    currency: Optional[str] = None
    delivery_date: Optional[str] = None
    ship_date: Optional[str] = None
    destination: Optional[str] = None
    delivery_address: Optional[str] = None
    plant_code: Optional[str] = None
    plant_name: Optional[str] = None
    storage_location: Optional[str] = None
    status: Optional[str] = None
    version: Optional[int] = None
    extra_data: Optional[dict] = None
    shipped_quantity: Optional[float] = None
    remaining_quantity: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PODetailResponse(BaseModel):
    id: str
    company_id: str
    po_number: Optional[str] = None
    order_date: Optional[str] = None
    client_code: Optional[str] = None
    style_number: Optional[str] = None
    item_code: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    notations: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    total_value: Optional[float] = None
    currency: Optional[str] = None
    delivery_date: Optional[str] = None
    ship_date: Optional[str] = None
    destination: Optional[str] = None
    delivery_address: Optional[str] = None
    plant_code: Optional[str] = None
    plant_name: Optional[str] = None
    storage_location: Optional[str] = None
    status: Optional[str] = None
    version: Optional[int] = None
    extra_data: Optional[dict] = None
    shipped_quantity: Optional[float] = None
    remaining_quantity: Optional[float] = None
    source_email_id: Optional[str] = None
    source_email_subject: Optional[str] = None
    history: Optional[list[dict[str, Any]]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class POLineListItem(BaseModel):
    line_uid: str
    po_id: str
    po_number: str
    po_item: str
    po_line_label: str
    material_code: Optional[str] = None
    partner_code: Optional[str] = None
    material_description: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    ordered_qty: float
    shipped_qty: float
    remaining_qty: float
    unit_price: Optional[float] = None
    currency: Optional[str] = None
    uom: Optional[str] = None
    destination: Optional[str] = None
    delivery_address: Optional[str] = None
    plant_code: Optional[str] = None
    plant_name: Optional[str] = None
    plant_group: Optional[str] = None
    storage_location: Optional[str] = None
    delivery_date: Optional[str] = None
    order_date: Optional[str] = None
    po_status: Optional[str] = None
    po_version: Optional[int] = None
    supplier_id: Optional[str] = None


class PaginatedPOLineResponse(BaseModel):
    items: list[POLineListItem]
    total: int
    page: int
    per_page: int
    pages: int


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
    partial: int = 0
    shipped: int = 0
    cancelled: int = 0
    completed: int = 0


# ─── GET / — List Purchase Orders ───────────────────────────────

@router.get("", response_model=PaginatedPOResponse)
@router.get("/", response_model=PaginatedPOResponse, include_in_schema=False)
async def list_purchase_orders(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
    status: Optional[str] = Query(None, description="Filter by status"),
    exclude_completed: bool = Query(
        False, description="Exclude fully completed and cancelled POs from active workspaces"
    ),
    search: Optional[str] = Query(None, description="Search PO#, client, style"),
    supplier_id: Optional[str] = Query(None, description="Filter by supplier UUID or code"),
    plant: Optional[str] = Query(None, description="Filter by plant code or group"),
    storage_location: Optional[str] = Query(None, description="Filter by storage location code"),
    po_numbers: Optional[str] = Query(None, description="Comma-separated list of exact PO numbers"),
    delivery_date: Optional[str] = Query(None, description="Filter by delivery date (YYYY-MM-DD or DD-MM-YYYY)"),
    company_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=1000),
):
    """List purchase orders with optional filters and pagination."""
    if current_user.role == UserRole.SUPPLIER:
        supplier_id = str(current_user.supplier_id or current_user.supplier_code)

    repo = PORepository(db)
    records, total, shipped_map = await repo.list_orders(
        company_id=company_id,
        supplier_id=supplier_id,
        status=status,
        exclude_completed=exclude_completed,
        search=search,
        po_numbers=po_numbers,
        plant=plant,
        storage_location=storage_location,
        delivery_date=delivery_date,
        page=page,
        per_page=per_page,
    )

    pages = max(1, (total + per_page - 1) // per_page)

    items_list: list[POListItem] = []
    for r in records:
        total_ordered = float(r.quantity or 0)
        if r.extra_data and isinstance(r.extra_data.get("items"), list):
            items_sum = sum(float(it.get("quantity", 0) or 0) for it in r.extra_data["items"])
            if items_sum > 0:
                total_ordered = items_sum
        total_shipped = shipped_map.get(r.po_number or "", 0.0)
        total_remaining = max(0.0, total_ordered - total_shipped)

        p_resolved = resolve_po_plant(r)
        p_code = (r.extra_data.get("plant_code") if r.extra_data else None) or p_resolved["plant_code"]
        p_name = (r.extra_data.get("plant_name") if r.extra_data else None) or p_resolved["plant_name"]
        p_loc = (r.extra_data.get("storage_location") if r.extra_data else None) or p_resolved["storage_location"]

        items_list.append(
            POListItem(
                id=str(r.id),
                company_id=str(r.company_id),
                supplier_id=str(r.supplier_id) if r.supplier_id else None,
                po_number=r.po_number,
                order_date=(r.extra_data.get("order_date") if r.extra_data else None),
                client_code=r.client_code,
                style_number=r.style_number,
                item_code=(
                    (
                        r.extra_data.get("items", [{}])[0].get("item_code")
                        if r.extra_data and r.extra_data.get("items")
                        else None
                    )
                    or r.style_number
                ),
                contact_person=(r.extra_data.get("contact_person") if r.extra_data else None),
                contact_email=(r.extra_data.get("contact_email") if r.extra_data else None),
                notations=(r.extra_data.get("notations") if r.extra_data else None),
                description=r.description,
                quantity=r.quantity,
                unit_price=float(r.unit_price) if r.unit_price else None,
                total_value=float(r.total_value) if r.total_value else None,
                currency=r.currency,
                delivery_date=str(r.delivery_date) if r.delivery_date else None,
                ship_date=str(r.ship_date) if r.ship_date else None,
                destination=r.destination,
                delivery_address=(r.extra_data.get("delivery_address") if r.extra_data else None) or r.destination,
                plant_code=p_code,
                plant_name=p_name,
                storage_location=p_loc,
                status=r.status,
                version=r.version,
                extra_data=r.extra_data,
                shipped_quantity=total_shipped,
                remaining_quantity=total_remaining,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )

    return PaginatedPOResponse(
        items=items_list,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── GET /stats — PO Statistics ─────────────────────────────────

@router.get("/stats", response_model=POStatsResponse)
async def po_stats(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
    supplier_id: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
):
    """Get PO count breakdown by status."""
    if current_user.role == UserRole.SUPPLIER:
        supplier_id = str(current_user.supplier_id or current_user.supplier_code)

    query = select(
        func.count().label("total"),
        func.count().filter(PurchaseOrder.status == "ACTIVE").label("active"),
        func.count().filter(PurchaseOrder.version > 1).label("updated"),
        func.count().filter(PurchaseOrder.status == "PARTIAL").label("partial"),
        func.count().filter(or_(PurchaseOrder.status == "SHIPPED", PurchaseOrder.status == "PARTIAL")).label("shipped"),
        func.count().filter(PurchaseOrder.status == "CANCELLED").label("cancelled"),
        func.count().filter(PurchaseOrder.status == "COMPLETED").label("completed"),
    )

    if company_id:
        query = query.where(PurchaseOrder.company_id == company_id)
    query = apply_supplier_scope(query, supplier_id)

    result = await db.execute(query)
    row = result.one()

    return POStatsResponse(
        total=row.total,
        active=row.active,
        updated=row.updated,
        partial=row.partial,
        shipped=row.shipped,
        cancelled=row.cancelled,
        completed=row.completed,
    )


@router.post("/sync-statuses")
async def sync_po_statuses(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Manually trigger recalculation and update of all PO statuses based on existing shipments."""
    from app.services.po_service import update_po_statuses
    updated = await update_po_statuses(db)
    await db.commit()
    return {"success": True, "updated_count": len(updated), "updated": updated}


# ─── GET /lines — Paginated Flat Active PO Lines ────────────────

@router.get("/lines", response_model=PaginatedPOLineResponse)
async def list_po_lines(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
    supplier_id: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    plant: Optional[str] = Query(None, description="Filter by plant code or group"),
    storage_location: Optional[str] = Query(None, description="Filter by storage location code"),
    search: Optional[str] = Query(None, description="Search PO/Line, material code, description"),
    po_numbers: Optional[str] = Query(None, description="Comma-separated PO numbers"),
    delivery_date: Optional[str] = Query(None, description="Filter by delivery date (YYYY-MM-DD or DD-MM-YYYY)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=1000),
) -> PaginatedPOLineResponse:
    """Return paginated flat active PO line items (excluding completed POs and fully shipped lines)."""
    if current_user.role == UserRole.SUPPLIER:
        supplier_id = str(current_user.supplier_id or current_user.supplier_code)

    repo = PORepository(db)
    all_open_lines = await repo.list_open_lines(
        company_id=company_id,
        supplier_id=supplier_id,
        plant=plant,
        storage_location=storage_location,
        search=search,
        po_numbers=po_numbers,
        delivery_date=delivery_date,
    )

    total = len(all_open_lines)
    pages = max(1, (total + per_page - 1) // per_page)
    sliced = all_open_lines[(page - 1) * per_page : page * per_page]

    return PaginatedPOLineResponse(
        items=[POLineListItem(**item) for item in sliced],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── GET /open-lines — Open PO Lines for Shipping ───────────────

@router.get("/open-lines")
async def list_open_po_lines(
    supplier_id: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    plant: Optional[str] = Query(None),
    storage_location: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    po_numbers: Optional[str] = Query(None),
    delivery_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Return open PO lines across active purchase orders for shipping dropdowns or Excel generation."""
    if current_user.role == UserRole.SUPPLIER:
        supplier_id = str(current_user.supplier_id or current_user.supplier_code)

    try:
        repo = PORepository(db)
        return await repo.list_open_lines(
            company_id=company_id,
            supplier_id=supplier_id,
            plant=plant,
            storage_location=storage_location,
            search=search,
            po_numbers=po_numbers,
            delivery_date=delivery_date,
        )
    except Exception:
        logger.exception("Failed to query open PO lines")
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
        raise CodedHTTPException(code="PO_NOT_FOUND", status_code=404, detail="Purchase order not found")

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

    # Query shipped quantities per line for this PO
    repo = PORepository(db)
    line_shipped_map: dict[str, float] = {}
    total_shipped = 0.0
    if po.po_number:
        nested_shipped = await repo.get_line_shipped_totals([po.po_number])
        line_shipped_map = nested_shipped.get(po.po_number.strip(), {})
        totals = await repo.get_po_shipped_totals([po.po_number])
        total_shipped = totals.get(po.po_number, 0.0)

    # Enrich extra_data items with FIFO schedule sub-line shipped_quantity and remaining_quantity
    enriched_extra_data = None
    if po.extra_data:
        enriched_extra_data = copy.deepcopy(po.extra_data)
        items = enriched_extra_data.get("items")
        if isinstance(items, list):
            allocated = allocate_po_items_shipped_quantities(items, line_shipped_map)
            for item, _line_num, _ordered, item_shipped, item_remaining in allocated:
                item["shipped_quantity"] = item_shipped
                item["remaining_quantity"] = item_remaining

    total_ordered = float(po.quantity or 0)
    if enriched_extra_data and isinstance(enriched_extra_data.get("items"), list):
        items_sum = sum(float(it.get("quantity", 0) or 0) for it in enriched_extra_data["items"])
        if items_sum > 0:
            total_ordered = items_sum
    total_remaining = max(0.0, total_ordered - total_shipped)

    plant_info = resolve_po_plant(po)

    return PODetailResponse(
        id=str(po.id),
        company_id=str(po.company_id),
        po_number=po.po_number,
        order_date=(po.extra_data.get("order_date") if po.extra_data else None),
        client_code=po.client_code,
        style_number=po.style_number,
        item_code=(
            (po.extra_data.get("items", [{}])[0].get("item_code") if po.extra_data and po.extra_data.get("items") else None)
            or po.style_number
        ),
        contact_person=(po.extra_data.get("contact_person") if po.extra_data else None),
        contact_email=(po.extra_data.get("contact_email") if po.extra_data else None),
        notations=(po.extra_data.get("notations") if po.extra_data else None),
        description=po.description,
        quantity=po.quantity,
        unit_price=float(po.unit_price) if po.unit_price else None,
        total_value=float(po.total_value) if po.total_value else None,
        currency=po.currency,
        delivery_date=str(po.delivery_date) if po.delivery_date else None,
        ship_date=str(po.ship_date) if po.ship_date else None,
        destination=po.destination,
        delivery_address=(po.extra_data.get("delivery_address") if po.extra_data else None) or po.destination,
        plant_code=(enriched_extra_data.get("plant_code") if enriched_extra_data else None) or (po.extra_data.get("plant_code") if po.extra_data else None) or plant_info["plant_code"],
        plant_name=(enriched_extra_data.get("plant_name") if enriched_extra_data else None) or (po.extra_data.get("plant_name") if po.extra_data else None) or plant_info["plant_name"],
        storage_location=(enriched_extra_data.get("storage_location") if enriched_extra_data else None) or (po.extra_data.get("storage_location") if po.extra_data else None) or plant_info["storage_location"],
        status=po.status,
        version=po.version,
        extra_data=enriched_extra_data or po.extra_data,
        shipped_quantity=total_shipped,
        remaining_quantity=total_remaining,
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
        raise CodedHTTPException(code="PO_NOT_FOUND", status_code=404, detail="Purchase order not found")

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
