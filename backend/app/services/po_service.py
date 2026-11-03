"""
Purchase Order Service.

Handles PO lifecycle logic including automatic status updates based on shipment execution
and recording completion milestones into POHistory.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.po_history import POHistory
from app.models.purchase_order import PurchaseOrder
from app.models.shipment import Shipment
from app.models.shipment_line import ShipmentLine

logger = logging.getLogger(__name__)


async def update_po_statuses(
    db: AsyncSession,
    po_numbers: Optional[Sequence[str]] = None,
) -> dict[str, str]:
    """
    Recalculate and update PurchaseOrder.status based on actual shipped quantities.
    - If total_shipped > 0 and remaining <= 0 (all items fulfilled): COMPLETED
    - If total_shipped > 0 and remaining > 0 (partially fulfilled): PARTIAL
    - If total_shipped == 0: ACTIVE (unless already UPDATED or CANCELLED)

    Appends a POHistory changelog entry when a PO transitions (e.g. into COMPLETED
    for the Order History archive).

    Returns a dictionary mapping po_number to its updated status.
    """
    stmt = select(PurchaseOrder)
    if po_numbers:
        clean_pos = [p.strip() for p in po_numbers if p and p.strip()]
        if not clean_pos:
            return {}
        stmt = stmt.where(PurchaseOrder.po_number.in_(clean_pos))
    else:
        stmt = stmt.where(PurchaseOrder.status != "CANCELLED")

    res = await db.execute(stmt)
    pos = res.scalars().all()
    if not pos:
        return {}

    relevant_po_numbers = [p.po_number for p in pos if p.po_number]

    # Query sum of all shipped quantities grouped by po_number for non-cancelled shipments
    shipped_stmt = (
        select(
            ShipmentLine.po_number,
            func.sum(ShipmentLine.quantity).label("shipped_total"),
        )
        .join(Shipment, ShipmentLine.shipment_id == Shipment.id)
        .where(
            ShipmentLine.po_number.in_(relevant_po_numbers),
            Shipment.status != "CANCELLED",
        )
        .group_by(
            ShipmentLine.po_number,
        )
    )

    shipped_res = await db.execute(shipped_stmt)
    shipped_map = {row.po_number: float(row.shipped_total or 0) for row in shipped_res.all()}

    updated_statuses: dict[str, str] = {}

    for po in pos:
        po_num = (po.po_number or "").strip()
        raw_items = (po.extra_data or {}).get("items", [])

        total_ordered = 0.0
        if raw_items and isinstance(raw_items, list):
            total_ordered = sum(float(it.get("quantity", 0)) for it in raw_items)
        if total_ordered <= 0:
            total_ordered = float(po.quantity or 0)

        total_shipped = shipped_map.get(po_num, 0.0)
        total_remaining = max(0.0, total_ordered - total_shipped)

        current_status = po.status
        if current_status == "CANCELLED":
            continue

        if total_shipped > 0 and total_remaining <= 0 and total_ordered > 0:
            new_status = "COMPLETED"
        elif total_shipped > 0 and total_remaining > 0:
            new_status = "PARTIAL"
        elif total_shipped == 0:
            if current_status in ("PARTIAL", "COMPLETED", "UPDATED", "SHIPPED"):
                new_status = "ACTIVE"
            else:
                new_status = current_status
        else:
            new_status = current_status

        if po.status != new_status:
            previous_status = po.status
            logger.info(
                "PO %s status changing: %s -> %s (ordered: %s, shipped: %s, remaining: %s)",
                po_num,
                previous_status,
                new_status,
                total_ordered,
                total_shipped,
                total_remaining,
            )
            po.status = new_status
            po.updated_at = datetime.now(timezone.utc)
            updated_statuses[po_num] = new_status

            # Record lifecycle transition (including COMPLETED milestone) in POHistory
            if po.company_id:
                db.add(
                    POHistory(
                        po_id=po.id,
                        company_id=po.company_id,
                        source_email_id=po.source_email_id,
                        version=po.version or 1,
                        change_source="SHIPMENT_FULFILLMENT",
                        changed_fields={
                            "status": {"old": previous_status, "new": new_status},
                            "ordered_quantity": total_ordered,
                            "shipped_quantity": total_shipped,
                            "remaining_quantity": total_remaining,
                        },
                    )
                )

    return updated_statuses
