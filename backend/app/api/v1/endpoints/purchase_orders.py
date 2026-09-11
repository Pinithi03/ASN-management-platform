"""
Purchase Orders API endpoints.

Handles:
- GET /              — List purchase orders with revision history and shipping progress
- GET /{id}          — PO details and line item breakdown
- GET /open-lines    — List open PO lines for template export and shipment creation
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.po_history import POHistory
from app.models.purchase_order import PurchaseOrder
from app.models.supplier import Supplier

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
async def list_purchase_orders(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List purchase orders with versioning and status."""
    try:
        stmt = select(PurchaseOrder).order_by(desc(PurchaseOrder.created_at)).limit(limit)
        if status and status != "ALL":
            stmt = stmt.where(PurchaseOrder.status == status)
        if search:
            stmt = stmt.where(PurchaseOrder.po_number.ilike(f"%{search}%"))
        if supplier_id:
            try:
                stmt = stmt.where(PurchaseOrder.supplier_id == uuid.UUID(supplier_id))
            except ValueError:
                pass

        res = await db.execute(stmt)
        pos = res.scalars().all()

        results = []
        for po in pos:
            # Calculate open balance from items
            items = (po.extra_data or {}).get("items", [])
            total_ordered = po.quantity or sum(float(it.get("quantity", 0)) for it in items)
            shipped_qty = 0.0
            if po.shipment_lines:
                shipped_qty = sum(float(sl.quantity) for sl in po.shipment_lines)
            open_balance = max(0.0, float(total_ordered) - shipped_qty)

            results.append({
                "id": str(po.id),
                "po_number": po.po_number,
                "style_number": po.style_number,
                "description": po.description,
                "quantity": po.quantity,
                "shipped_quantity": shipped_qty,
                "open_balance": open_balance,
                "unit_price": float(po.unit_price) if po.unit_price else None,
                "total_value": float(po.total_value) if po.total_value else None,
                "currency": po.currency,
                "delivery_date": po.delivery_date.isoformat() if po.delivery_date else None,
                "ship_date": po.ship_date.isoformat() if po.ship_date else None,
                "destination": po.destination,
                "status": po.status,
                "version": po.version,
                "items_count": len(items),
                "created_at": po.created_at.isoformat() if po.created_at else None,
            })
        return results
    except Exception as e:
        logger.warning("DB query for purchase orders failed: %s", e)
        return []


@router.get("/open-lines")
async def list_open_po_lines(
    supplier_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return open PO lines across active purchase orders for shipping dropdowns or Excel generation."""
    try:
        stmt = select(PurchaseOrder).where(PurchaseOrder.status.in_(["ACTIVE", "UPDATED", "XML_SENT"]))
        if supplier_id:
            try:
                stmt = stmt.where(PurchaseOrder.supplier_id == uuid.UUID(supplier_id))
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
                    "delivery_date": po.delivery_date.isoformat() if po.delivery_date else None,
                })
        return open_lines
    except Exception as e:
        logger.warning("Failed to query open PO lines: %s", e)
        return []


@router.get("/{id}")
async def get_purchase_order_detail(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get single PO detail with line items and version change history."""
    try:
        stmt = select(PurchaseOrder).where(PurchaseOrder.id == id)
        res = await db.execute(stmt)
        po = res.scalar_one_or_none()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")

        # Fetch history
        hist_stmt = select(POHistory).where(POHistory.po_id == id).order_by(desc(POHistory.created_at))
        hist_res = await db.execute(hist_stmt)
        history = hist_res.scalars().all()

        return {
            "id": str(po.id),
            "po_number": po.po_number,
            "style_number": po.style_number,
            "description": po.description,
            "quantity": po.quantity,
            "unit_price": float(po.unit_price) if po.unit_price else None,
            "total_value": float(po.total_value) if po.total_value else None,
            "currency": po.currency,
            "delivery_date": po.delivery_date.isoformat() if po.delivery_date else None,
            "destination": po.destination,
            "status": po.status,
            "version": po.version,
            "extra_data": po.extra_data or {},
            "history": [
                {
                    "version": h.version,
                    "change_source": h.change_source,
                    "change_summary": h.change_summary,
                    "diff": h.diff,
                    "created_at": h.created_at.isoformat() if h.created_at else None,
                }
                for h in history
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error retrieving PO: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
