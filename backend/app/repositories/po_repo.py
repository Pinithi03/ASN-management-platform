"""
Purchase Order Repository (Data Access Layer).

Encapsulates database queries for Purchase Orders, including:
- Tenant & supplier-scoped PO queries
- Active vs. Completed order separation (Order History)
- Flattened open PO line queries with FIFO schedule sub-line shipped quantity allocation
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import String, asc, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plant_resolver import normalize_plant_group, resolve_plant_and_location
from app.models.parsed_data import ParsedData
from app.models.purchase_order import PurchaseOrder
from app.models.shipment import Shipment
from app.models.shipment_line import ShipmentLine
from app.models.supplier import Supplier


def _parse_comparable_date(val: Any) -> Optional[date]:
    """Parse date, datetime, or string (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY) into a date."""
    if not val:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def _resolve_po_delivery_date(po: PurchaseOrder) -> Optional[date]:
    """Resolve the earliest delivery date on a PurchaseOrder (from items or header)."""
    candidates: list[date] = []
    if po.delivery_date:
        d = _parse_comparable_date(po.delivery_date)
        if d:
            candidates.append(d)
    if po.extra_data and isinstance(po.extra_data, dict):
        hdr_d = _parse_comparable_date(po.extra_data.get("delivery_date"))
        if hdr_d:
            candidates.append(hdr_d)
        raw_items = po.extra_data.get("items")
        if isinstance(raw_items, list):
            for it in raw_items:
                if isinstance(it, dict):
                    it_d = _parse_comparable_date(it.get("delivery_date"))
                    if it_d:
                        candidates.append(it_d)
    return min(candidates) if candidates else None


def _po_matches_delivery_date(po: PurchaseOrder, target_date: date) -> bool:
    """Return True if the PO header or any of its line items match target_date."""
    if po.delivery_date and _parse_comparable_date(po.delivery_date) == target_date:
        return True
    if po.extra_data and isinstance(po.extra_data, dict):
        if _parse_comparable_date(po.extra_data.get("delivery_date")) == target_date:
            return True
        raw_items = po.extra_data.get("items")
        if isinstance(raw_items, list):
            for it in raw_items:
                if isinstance(it, dict) and _parse_comparable_date(it.get("delivery_date")) == target_date:
                    return True
    return False


def resolve_po_plant(po: PurchaseOrder) -> dict[str, str]:
    """Resolve plant and storage location metadata for a PurchaseOrder instance."""
    p_raw = (
        (po.extra_data.get("delivery_address") if po.extra_data else None)
        or po.destination
        or po.client_code
        or ""
    )
    resolved = dict(resolve_plant_and_location(p_raw, fallback_client_code=po.client_code))
    stored_group = po.extra_data.get("plant_group") if po.extra_data else None
    if stored_group:
        norm = normalize_plant_group(str(stored_group))
        if norm:
            resolved["plant_group"] = norm
    return resolved


def apply_supplier_scope(query: Any, supplier_id: Optional[str]) -> Any:
    """Apply comprehensive supplier isolation across UUID, supplier_code, ParsedData, and client_code."""
    if not supplier_id:
        return query

    v_filter = f"%{supplier_id}%"
    parsed_po_subq = select(ParsedData.po_number_extracted).where(
        ParsedData.supplier_id_extracted.ilike(v_filter)
        | cast(ParsedData.raw_extracted, String).ilike(v_filter)
    )
    supp_ids_subq = select(Supplier.id).where(
        Supplier.supplier_code.ilike(v_filter) | Supplier.name.ilike(v_filter)
    )
    try:
        supp_uuid = uuid.UUID(str(supplier_id))
        return query.where(
            or_(
                PurchaseOrder.supplier_id == supp_uuid,
                PurchaseOrder.supplier_id.in_(supp_ids_subq),
                PurchaseOrder.po_number.in_(parsed_po_subq),
                PurchaseOrder.client_code.ilike(v_filter),
            )
        )
    except (ValueError, TypeError):
        return query.where(
            or_(
                PurchaseOrder.supplier_id.in_(supp_ids_subq),
                PurchaseOrder.po_number.in_(parsed_po_subq),
                PurchaseOrder.client_code.ilike(v_filter),
            )
        )


def allocate_po_items_shipped_quantities(
    raw_items: list[dict[str, Any]],
    po_line_shipped_map: dict[str, float],
) -> list[tuple[dict[str, Any], str, float, float, float]]:
    """
    Allocate shipped quantities across PO line items (including schedule sub-lines like
    00100-0001, 00100-0002) using exact-match first and FIFO waterfall on shared base line integers.

    Returns list of tuples: (item_dict, line_num_str, ordered_qty, shipped_qty, remaining_qty)
    """
    # Group indices by normalized base integer key when no exact line match exists
    parsed_entries: list[dict[str, Any]] = []
    base_groups: dict[str, list[int]] = defaultdict(list)

    for idx, item in enumerate(raw_items):
        line_val = item.get("order_line_number") or item.get("line_number", idx + 1)
        line_num = str(line_val).strip()
        ordered = float(item.get("quantity", 0) or 0)
        try:
            base_key = str(int(line_num.split("-")[0]))
        except (ValueError, TypeError):
            base_key = line_num

        exact_shipped: Optional[float] = None
        if line_num in po_line_shipped_map and "-" in line_num:
            exact_shipped = po_line_shipped_map[line_num]

        entry = {
            "idx": idx,
            "item": item,
            "line_num": line_num,
            "base_key": base_key,
            "ordered": ordered,
            "exact_shipped": exact_shipped,
            "shipped": 0.0,
            "remaining": ordered,
        }
        parsed_entries.append(entry)
        if exact_shipped is None:
            base_groups[base_key].append(idx)

    # First apply exact matches
    for entry in parsed_entries:
        if entry["exact_shipped"] is not None:
            shp = float(entry["exact_shipped"])
            entry["shipped"] = shp
            entry["remaining"] = max(0.0, entry["ordered"] - shp)

    # Next apply FIFO waterfall per shared integer base line (e.g. 100 -> 00100-0001, 00100-0002)
    for base_key, indices in base_groups.items():
        pool = float(po_line_shipped_map.get(base_key, 0.0))
        if pool <= 0 and len(indices) == 1:
            only_idx = indices[0]
            fallback_idx_key = str(only_idx + 1)
            if fallback_idx_key in po_line_shipped_map and base_key != fallback_idx_key:
                pool = float(po_line_shipped_map[fallback_idx_key])

        for pos_in_group, item_idx in enumerate(indices):
            entry = parsed_entries[item_idx]
            ordered = entry["ordered"]
            is_last = pos_in_group == len(indices) - 1
            if pool <= 0:
                shp = 0.0
            elif is_last:
                # Assign all remaining shipped pool on the final sub-line of this base line
                shp = pool
                pool = 0.0
            else:
                shp = min(ordered, pool)
                pool = max(0.0, pool - shp)

            entry["shipped"] = shp
            entry["remaining"] = max(0.0, ordered - shp)

    return [
        (e["item"], e["line_num"], e["ordered"], e["shipped"], e["remaining"])
        for e in parsed_entries
    ]


class PORepository:
    """Repository encapsulating Purchase Order and PO Line queries."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_po_shipped_totals(self, po_numbers: list[str]) -> dict[str, float]:
        """Return total non-cancelled shipped quantity per PO number."""
        clean_pos = [p for p in po_numbers if p]
        if not clean_pos:
            return {}
        stmt = (
            select(
                ShipmentLine.po_number,
                func.sum(ShipmentLine.quantity).label("shipped_total"),
            )
            .join(Shipment, ShipmentLine.shipment_id == Shipment.id)
            .where(
                ShipmentLine.po_number.in_(clean_pos),
                Shipment.status != "CANCELLED",
            )
            .group_by(ShipmentLine.po_number)
        )
        res = await self.db.execute(stmt)
        return {row.po_number: float(row.shipped_total or 0) for row in res.all() if row.po_number}

    async def get_line_shipped_totals(
        self, po_numbers: Optional[list[str]] = None
    ) -> dict[str, dict[str, float]]:
        """Return nested map: po_number -> { line_key_str -> shipped_total }."""
        stmt = (
            select(
                ShipmentLine.po_number,
                ShipmentLine.po_line_number,
                func.sum(ShipmentLine.quantity).label("shipped_total"),
            )
            .join(Shipment, ShipmentLine.shipment_id == Shipment.id)
            .where(Shipment.status != "CANCELLED")
        )
        if po_numbers is not None:
            clean_pos = [p for p in po_numbers if p]
            if not clean_pos:
                return {}
            stmt = stmt.where(ShipmentLine.po_number.in_(clean_pos))

        stmt = stmt.group_by(ShipmentLine.po_number, ShipmentLine.po_line_number)
        res = await self.db.execute(stmt)

        nested: dict[str, dict[str, float]] = defaultdict(dict)
        for row in res.all():
            po_num = (row.po_number or "").strip()
            if not po_num:
                continue
            line_str = str(row.po_line_number or "").strip()
            qty = float(row.shipped_total or 0)
            nested[po_num][line_str] = qty
            try:
                nested[po_num][str(int(line_str))] = qty
            except (ValueError, TypeError):
                pass
        return nested

    async def list_orders(
        self,
        *,
        company_id: Optional[str] = None,
        supplier_id: Optional[str] = None,
        status: Optional[str] = None,
        exclude_completed: bool = False,
        search: Optional[str] = None,
        po_numbers: Optional[str] = None,
        plant: Optional[str] = None,
        storage_location: Optional[str] = None,
        delivery_date: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[PurchaseOrder], int, dict[str, float]]:
        """
        Query PurchaseOrders with plant/location resolution, search, delivery date filter,
        delivery_date ASC sorting, and completion filtering.
        Returns (paginated_records, total_matching, shipped_totals_map).
        """
        from app.email.parsers import normalize_po_number

        query = select(PurchaseOrder)
        if company_id:
            query = query.where(PurchaseOrder.company_id == company_id)

        query = apply_supplier_scope(query, supplier_id)

        upper_status = status.upper() if status and status.upper() != "ALL" else None
        if upper_status:
            query = query.where(PurchaseOrder.status == upper_status)
        elif exclude_completed:
            query = query.where(PurchaseOrder.status.notin_(["COMPLETED", "CANCELLED"]))

        if search:
            search_filter = f"%{search}%"
            clean_search = normalize_po_number(search)
            query = query.where(
                PurchaseOrder.po_number.ilike(search_filter)
                | PurchaseOrder.po_number.ilike(f"%{clean_search}%")
                | PurchaseOrder.client_code.ilike(search_filter)
                | PurchaseOrder.style_number.ilike(search_filter)
                | PurchaseOrder.description.ilike(search_filter)
            )

        if po_numbers:
            raw_values = [v.strip() for v in po_numbers.split(",") if v.strip()]
            wanted = set(raw_values) | {normalize_po_number(v) for v in raw_values}
            wanted.discard("")
            if wanted:
                clauses = [PurchaseOrder.po_number.in_(wanted)]
                for w in wanted:
                    clauses.append(PurchaseOrder.po_number.ilike(f"%{w}%"))
                query = query.where(or_(*clauses))

        if upper_status == "COMPLETED":
            query = query.order_by(desc(PurchaseOrder.updated_at), desc(PurchaseOrder.created_at))
        else:
            query = query.order_by(
                asc(PurchaseOrder.delivery_date).nulls_last(),
                desc(PurchaseOrder.created_at),
            )

        plant_group = normalize_plant_group(plant)
        location = (
            storage_location.strip().upper()
            if storage_location and storage_location.strip().upper() != "ALL"
            else None
        )
        target_delivery_date = _parse_comparable_date(delivery_date) if delivery_date else None

        # Evaluate in Python when plant/location/exclude_completed/delivery_date or active ASC sort is needed
        if plant_group or location or exclude_completed or target_delivery_date or upper_status != "COMPLETED":
            all_records = list((await self.db.execute(query)).scalars().all())
            candidate_pos = [r.po_number for r in all_records if r.po_number]
            shipped_map = await self.get_po_shipped_totals(candidate_pos)

            matching: list[PurchaseOrder] = []
            for r in all_records:
                if exclude_completed and upper_status != "COMPLETED":
                    if (r.status or "").upper() in ("COMPLETED", "CANCELLED"):
                        continue
                    total_ordered = float(r.quantity or 0)
                    if r.extra_data and isinstance(r.extra_data.get("items"), list):
                        items_sum = sum(float(it.get("quantity", 0) or 0) for it in r.extra_data["items"])
                        if items_sum > 0:
                            total_ordered = items_sum
                    total_shipped = shipped_map.get(r.po_number or "", 0.0)
                    if total_ordered > 0 and total_shipped >= total_ordered:
                        continue

                if target_delivery_date and not _po_matches_delivery_date(r, target_delivery_date):
                    continue

                if plant_group or location:
                    resolved = resolve_po_plant(r)
                    if plant_group and resolved["plant_group"] != plant_group:
                        continue
                    if location and location not in (
                        resolved["full_delivery_address"].upper(),
                        resolved["storage_location"].upper(),
                    ):
                        continue

                matching.append(r)

            if upper_status != "COMPLETED":
                matching.sort(
                    key=lambda po_rec: (
                        _resolve_po_delivery_date(po_rec) is None,
                        _resolve_po_delivery_date(po_rec) or date.max,
                        po_rec.po_number or "",
                    )
                )

            total = len(matching)
            records = matching[(page - 1) * per_page : page * per_page]
            return records, total, shipped_map

        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.offset((page - 1) * per_page).limit(per_page)
        records = list((await self.db.execute(query)).scalars().all())
        record_pos = [r.po_number for r in records if r.po_number]
        shipped_map = await self.get_po_shipped_totals(record_pos)
        return records, total, shipped_map

    async def list_open_lines(
        self,
        *,
        company_id: Optional[str] = None,
        supplier_id: Optional[str] = None,
        plant: Optional[str] = None,
        storage_location: Optional[str] = None,
        search: Optional[str] = None,
        po_numbers: Optional[str] = None,
        delivery_date: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """
        Return all active, unfulfilled PO line items (remaining_qty > 0) flattened across
        non-completed, non-cancelled Purchase Orders, sorted by delivery_date ASC.
        """
        from app.email.parsers import normalize_po_number

        stmt = select(PurchaseOrder).where(
            PurchaseOrder.status.notin_(["COMPLETED", "CANCELLED"])
        )
        if company_id:
            stmt = stmt.where(PurchaseOrder.company_id == company_id)

        stmt = apply_supplier_scope(stmt, supplier_id)

        if po_numbers:
            raw_values = [v.strip() for v in po_numbers.split(",") if v.strip()]
            wanted = set(raw_values) | {normalize_po_number(v) for v in raw_values}
            wanted.discard("")
            if wanted:
                clauses = [PurchaseOrder.po_number.in_(wanted)]
                for w in wanted:
                    clauses.append(PurchaseOrder.po_number.ilike(f"%{w}%"))
                stmt = stmt.where(or_(*clauses))

        stmt = stmt.order_by(
            asc(PurchaseOrder.delivery_date).nulls_last(),
            desc(PurchaseOrder.created_at),
        )
        pos = list((await self.db.execute(stmt)).scalars().all())
        if not pos:
            return []

        plant_group = normalize_plant_group(plant)
        location = (
            storage_location.strip().upper()
            if storage_location and storage_location.strip().upper() != "ALL"
            else None
        )
        target_delivery_date = _parse_comparable_date(delivery_date) if delivery_date else None

        # Filter POs by plant/location first
        scoped_pos: list[tuple[PurchaseOrder, dict[str, str]]] = []
        for po in pos:
            resolved = resolve_po_plant(po)
            if plant_group and resolved["plant_group"] != plant_group:
                continue
            if location and location not in (
                resolved["full_delivery_address"].upper(),
                resolved["storage_location"].upper(),
            ):
                continue
            scoped_pos.append((po, resolved))

        if not scoped_pos:
            return []

        candidate_po_nums = [(po.po_number or "").strip() for po, _ in scoped_pos if po.po_number]
        nested_shipped = await self.get_line_shipped_totals(candidate_po_nums)

        q_lower = search.strip().lower() if search and search.strip() else None
        q_norm = normalize_po_number(search).lower() if search and search.strip() else None

        open_lines: list[dict[str, Any]] = []
        for po, resolved in scoped_pos:
            po_num = (po.po_number or "").strip()
            if not po_num:
                continue

            raw_items = (po.extra_data or {}).get("items", [])
            if not raw_items or not isinstance(raw_items, list):
                raw_items = [
                    {
                        "line_number": "00100",
                        "material_code": po.style_number or "ELST1K 000615",
                        "partner_code": "",
                        "description": po.description or "PO Line Item",
                        "quantity": float(po.quantity or 0),
                        "uom": "M",
                    }
                ]

            po_line_map = nested_shipped.get(po_num, {})
            allocated = allocate_po_items_shipped_quantities(raw_items, po_line_map)

            p_code = (po.extra_data.get("plant_code") if po.extra_data else None) or resolved["plant_code"]
            p_name = (po.extra_data.get("plant_name") if po.extra_data else None) or resolved["plant_name"]
            p_loc = (po.extra_data.get("storage_location") if po.extra_data else None) or resolved["storage_location"]
            p_group = resolved["plant_group"]

            for item, line_num, ordered, shipped, remaining in allocated:
                # Exclude fully shipped or zero-qty lines from active open lines
                if ordered <= 0 or remaining <= 0:
                    continue

                line_delivery_raw = item.get("delivery_date") or (
                    str(po.delivery_date) if po.delivery_date else None
                )
                if target_delivery_date:
                    parsed_line_date = _parse_comparable_date(line_delivery_raw)
                    if parsed_line_date != target_delivery_date:
                        continue

                material = (
                    item.get("item_code")
                    or item.get("material_code")
                    or po.style_number
                    or ""
                )
                partner = item.get("partner_item_code") or item.get("partner_code") or ""
                desc_text = (
                    item.get("description")
                    or item.get("item_description")
                    or po.description
                    or ""
                )
                color = item.get("color") or ""
                size = item.get("size") or ""
                uom = item.get("uom") or item.get("qty_unit") or "M"
                po_line_label = f"{po_num} {line_num}"

                if q_lower:
                    haystack = " ".join(
                        [
                            po_num.lower(),
                            line_num.lower(),
                            po_line_label.lower(),
                            str(material).lower(),
                            str(partner).lower(),
                            str(desc_text).lower(),
                            str(po.client_code or "").lower(),
                        ]
                    )
                    if q_lower not in haystack and (not q_norm or q_norm not in haystack):
                        continue

                line_dest = (
                    item.get("delivery_address")
                    or (po.extra_data.get("delivery_address") if po.extra_data else None)
                    or po.destination
                )

                open_lines.append(
                    {
                        "line_uid": f"{po_num}:{line_num}",
                        "po_id": str(po.id),
                        "po_number": po_num,
                        "po_item": line_num,
                        "po_line_label": po_line_label,
                        "material_code": material,
                        "partner_code": partner,
                        "material_description": desc_text,
                        "color": color,
                        "size": size,
                        "ordered_qty": ordered,
                        "shipped_qty": shipped,
                        "remaining_qty": remaining,
                        "unit_price": float(item.get("unit_price") or po.unit_price or 0) or None,
                        "currency": po.currency,
                        "uom": uom,
                        "destination": line_dest,
                        "delivery_address": line_dest,
                        "plant_code": p_code,
                        "plant_name": p_name,
                        "plant_group": p_group,
                        "storage_location": p_loc,
                        "delivery_date": line_delivery_raw,
                        "order_date": (
                            (po.extra_data.get("order_date") if po.extra_data else None)
                            or (str(po.created_at.date()) if po.created_at else None)
                        ),
                        "po_status": po.status,
                        "po_version": po.version,
                        "supplier_id": str(po.supplier_id) if po.supplier_id else None,
                    }
                )

        # Sort open lines by nearest delivery date at the top (delivery_date ASC, NULLS LAST)
        open_lines.sort(
            key=lambda ln: (
                _parse_comparable_date(ln.get("delivery_date")) is None,
                _parse_comparable_date(ln.get("delivery_date")) or date.max,
                ln.get("po_number") or "",
                ln.get("po_item") or "",
            )
        )

        return open_lines
