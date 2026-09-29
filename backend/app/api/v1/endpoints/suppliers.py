"""
Supplier Management Endpoints — /api/v1/suppliers
Provides industry-grade CRUD operations, automatic email supplier sync,
and database persistence for all supplier partner profiles.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.parsed_data import ParsedData
from app.models.purchase_order import PurchaseOrder
from app.models.supplier import Supplier

router = APIRouter()

# ─── Pydantic Schemas ───────────────────────────────────────────

class SupplierResponse(BaseModel):
    id: str
    supplier_code: str
    name: str
    email: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    tax_id: Optional[str] = None
    category: Optional[str] = None
    is_active: bool = True
    onboarded_at: str
    total_pos: int = 0
    latest_po_date: Optional[str] = None

    model_config = {"from_attributes": True}


class SupplierCreateRequest(BaseModel):
    supplier_code: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=200)
    email: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = "Sri Lanka"
    tax_id: Optional[str] = None
    category: Optional[str] = "Textiles & Garments"
    is_active: bool = True


class SupplierUpdateRequest(BaseModel):
    name: Optional[str] = None
    supplier_code: Optional[str] = None
    email: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    tax_id: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


# ─── Initial / Default Suppliers Seed ───────────────────────────
INITIAL_PARTNERS = [
    {
        "supplier_code": "456789",
        "name": "PINITHI FERNANDO",
        "email": "pinithi0123ransara@gmail.com",
        "contact_name": "Pinithi Fernando",
        "phone": "+94772218163",
        "country": "Sri Lanka",
        "category": "Textiles & Garments",
        "tax_id": "PV-10293847",
        "address": "Sri Lanka Manufacturing Plant",
        "is_active": True,
    },
    {
        "supplier_code": "0000018194",
        "name": "Coats Thread Exports Ltd",
        "email": "orders@coatsthread.lk",
        "contact_name": "Kamal Wickramasinghe",
        "phone": "+94 11 4712000",
        "country": "Sri Lanka",
        "category": "Thread & Trims",
        "tax_id": "PV-10293847",
        "address": "No. 40, Station Road, Colombo 03",
        "is_active": True,
    },
    {
        "supplier_code": "0000001122",
        "name": "Hayleys Fabric PLC",
        "email": "supplier_1122@oniverse.local",
        "contact_name": "Kamal Wickramasinghe",
        "phone": "+94 11 4712000",
        "country": "Sri Lanka",
        "category": "Thread & Trims",
        "tax_id": "PQ-49201934",
        "address": "Narthupana Estate, Neboda",
        "is_active": True,
    },
    {
        "supplier_code": "0000080589",
        "name": "South Asia Textiles Ltd",
        "email": "supply@southasiatextiles.com",
        "contact_name": "Wasitha Maheshitha",
        "phone": "+94 11 2855123",
        "country": "Sri Lanka",
        "category": "Dyed & Printed Fabric",
        "tax_id": "PV-88371920",
        "address": "Pugoda Road, Kirindiwela",
        "is_active": True,
    },
    {
        "supplier_code": "0000058376",
        "name": "Prym Intimates Lanka Ltd",
        "email": "onboarding@prym-intimates.lk",
        "contact_name": "Saman Kumara",
        "phone": "+94 11 4567890",
        "country": "Sri Lanka",
        "category": "Elastics & Fasteners",
        "tax_id": "PV-55291048",
        "address": "Export Processing Zone, Biyagama",
        "is_active": True,
    },
    {
        "supplier_code": "SUP-001",
        "name": "YKK Lanka Private Ltd",
        "email": "sales@ykk.lk",
        "contact_name": "Takahiro Sato",
        "phone": "+94 11 2489100",
        "country": "Sri Lanka",
        "category": "Zippers & Fasteners",
        "tax_id": "PV-77182901",
        "address": "Phase 1, EPZ, Seethawaka, Avissawella",
        "is_active": True,
    },
]


async def _ensure_seed_and_email_sync(db: AsyncSession) -> None:
    """Ensure initial partners exist and auto-import any new suppliers found in parsed email data."""
    # 1. Seed initial partners
    for p in INITIAL_PARTNERS:
        code = p["supplier_code"]
        clean_code = code.lstrip("0")
        stmt = select(Supplier).where(
            or_(
                Supplier.supplier_code == code,
                Supplier.supplier_code == clean_code,
                Supplier.email == p["email"],
            )
        )
        res = await db.execute(stmt)
        supp = res.scalar_one_or_none()
        if not supp:
            new_s = Supplier(
                supplier_code=code,
                name=p["name"],
                email=p["email"],
                contact_name=p["contact_name"],
                phone=p["phone"],
                country=p["country"],
                category=p["category"],
                tax_id=p["tax_id"],
                address=p["address"],
                is_active=p["is_active"],
            )
            db.add(new_s)
        else:
            # Backfill missing tax_id, category, contact_name, address
            if not supp.tax_id and p.get("tax_id"):
                supp.tax_id = p["tax_id"]
            if not supp.category and p.get("category"):
                supp.category = p["category"]
            if not supp.address and p.get("address"):
                supp.address = p["address"]
            if not supp.contact_name and p.get("contact_name"):
                supp.contact_name = p["contact_name"]
            if not supp.phone and p.get("phone"):
                supp.phone = p["phone"]

    # 2. Sync any suppliers extracted from incoming emails in parsed_data
    try:
        raw_supps = await db.execute(
            select(ParsedData.supplier_id_extracted).distinct().where(
                ParsedData.supplier_id_extracted.isnot(None),
                ParsedData.supplier_id_extracted != "",
            )
        )
        for row in raw_supps.fetchall():
            s_code = row[0]
            if not s_code:
                continue
            s_clean = str(s_code).lstrip("0")
            chk = await db.execute(
                select(Supplier).where(
                    or_(
                        Supplier.supplier_code == s_code,
                        Supplier.supplier_code == s_clean,
                    )
                )
            )
            if not chk.scalar_one_or_none():
                db.add(
                    Supplier(
                        supplier_code=s_code,
                        name=f"Supplier {s_code}",
                        email=f"supplier_{s_clean or 'partner'}@oniverse.local",
                        country="Sri Lanka",
                        category="Textiles & Garments",
                        is_active=True,
                    )
                )
    except Exception:
        pass

    await db.commit()


# ─── ENDPOINTS ──────────────────────────────────────────────────

@router.get("", response_model=list[SupplierResponse])
@router.get("/", response_model=list[SupplierResponse], include_in_schema=False)
async def list_suppliers(
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Search by name, code, email, or contact"),
    active_only: Optional[bool] = Query(None, description="Filter by active status"),
) -> list[SupplierResponse]:
    """
    List all onboarded and email-detected suppliers, enriched with live PO statistics.
    """
    await _ensure_seed_and_email_sync(db)

    query = select(Supplier).order_by(Supplier.name.asc())
    if active_only is not None:
        query = query.where(Supplier.is_active == active_only)
    if search:
        s_term = f"%{search}%"
        query = query.where(
            or_(
                Supplier.name.ilike(s_term),
                Supplier.supplier_code.ilike(s_term),
                Supplier.email.ilike(s_term),
                Supplier.contact_name.ilike(s_term),
            )
        )

    res = await db.execute(query)
    suppliers = res.scalars().all()

    # Pre-fetch PO stats per supplier
    po_counts_stmt = select(
        PurchaseOrder.supplier_id,
        func.count(PurchaseOrder.id).label("total_pos"),
        func.max(PurchaseOrder.created_at).label("latest_po_date"),
    ).where(PurchaseOrder.supplier_id.isnot(None)).group_by(PurchaseOrder.supplier_id)

    po_counts_res = await db.execute(po_counts_stmt)
    po_stats_map = {
        row.supplier_id: (row.total_pos, row.latest_po_date)
        for row in po_counts_res.fetchall()
    }

    result = []
    for s in suppliers:
        total_pos, latest_po = po_stats_map.get(s.id, (0, None))
        result.append(
            SupplierResponse(
                id=str(s.id),
                supplier_code=s.supplier_code,
                name=s.name,
                email=s.email,
                contact_name=s.contact_name,
                phone=s.phone,
                address=s.address,
                country=s.country or "Sri Lanka",
                tax_id=s.tax_id,
                category=s.category or "Textiles & Garments",
                is_active=s.is_active,
                onboarded_at=s.created_at.isoformat() if s.created_at else datetime.now(timezone.utc).isoformat(),
                total_pos=total_pos,
                latest_po_date=latest_po.isoformat() if latest_po else None,
            )
        )

    return result


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_supplier(
    payload: SupplierCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> SupplierResponse:
    """
    Onboard a new supplier profile manually.
    """
    # Check duplicate code
    dup = await db.execute(
        select(Supplier).where(Supplier.supplier_code == payload.supplier_code.strip())
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Supplier code '{payload.supplier_code}' already exists.",
        )

    new_supp = Supplier(
        supplier_code=payload.supplier_code.strip(),
        name=payload.name.strip(),
        email=payload.email.strip().lower(),
        contact_name=payload.contact_name.strip() if payload.contact_name else None,
        phone=payload.phone.strip() if payload.phone else None,
        address=payload.address.strip() if payload.address else None,
        country=payload.country.strip() if payload.country else "Sri Lanka",
        tax_id=payload.tax_id.strip() if payload.tax_id else None,
        category=payload.category.strip() if payload.category else "Textiles & Garments",
        is_active=payload.is_active,
    )
    db.add(new_supp)
    await db.commit()
    await db.refresh(new_supp)

    return SupplierResponse(
        id=str(new_supp.id),
        supplier_code=new_supp.supplier_code,
        name=new_supp.name,
        email=new_supp.email,
        contact_name=new_supp.contact_name,
        phone=new_supp.phone,
        address=new_supp.address,
        country=new_supp.country,
        tax_id=new_supp.tax_id,
        category=new_supp.category,
        is_active=new_supp.is_active,
        onboarded_at=new_supp.created_at.isoformat(),
        total_pos=0,
        latest_po_date=None,
    )


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: str,
    payload: SupplierUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> SupplierResponse:
    """
    Update an existing supplier profile and keep it 100% synchronized with database.
    """
    # Search by UUID or by supplier_code
    supp: Optional[Supplier] = None
    try:
        supp_uuid = uuid.UUID(supplier_id)
        res = await db.execute(select(Supplier).where(Supplier.id == supp_uuid))
        supp = res.scalar_one_or_none()
    except ValueError:
        pass

    if not supp:
        res = await db.execute(
            select(Supplier).where(Supplier.supplier_code == supplier_id)
        )
        supp = res.scalar_one_or_none()

    if not supp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supplier with ID or code '{supplier_id}' not found.",
        )

    # Update provided fields
    if payload.name is not None:
        supp.name = payload.name.strip()
    if payload.supplier_code is not None:
        supp.supplier_code = payload.supplier_code.strip()
    if payload.email is not None:
        supp.email = payload.email.strip().lower()
    if payload.contact_name is not None:
        supp.contact_name = payload.contact_name.strip() or None
    if payload.phone is not None:
        supp.phone = payload.phone.strip() or None
    if payload.address is not None:
        supp.address = payload.address.strip() or None
    if payload.country is not None:
        supp.country = payload.country.strip() or None
    if payload.tax_id is not None:
        supp.tax_id = payload.tax_id.strip() or None
    if payload.category is not None:
        supp.category = payload.category.strip() or None
    if payload.is_active is not None:
        supp.is_active = payload.is_active

    await db.commit()
    await db.refresh(supp)

    # Count POs
    po_cnt = (
        await db.execute(
            select(func.count(PurchaseOrder.id)).where(
                PurchaseOrder.supplier_id == supp.id
            )
        )
    ).scalar() or 0

    return SupplierResponse(
        id=str(supp.id),
        supplier_code=supp.supplier_code,
        name=supp.name,
        email=supp.email,
        contact_name=supp.contact_name,
        phone=supp.phone,
        address=supp.address,
        country=supp.country,
        tax_id=supp.tax_id,
        category=supp.category,
        is_active=supp.is_active,
        onboarded_at=supp.created_at.isoformat() if supp.created_at else datetime.now(timezone.utc).isoformat(),
        total_pos=po_cnt,
        latest_po_date=None,
    )


@router.delete("/{supplier_id}", status_code=status.HTTP_200_OK)
async def delete_supplier(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Delete a supplier profile.
    """
    supp: Optional[Supplier] = None
    try:
        supp_uuid = uuid.UUID(supplier_id)
        res = await db.execute(select(Supplier).where(Supplier.id == supp_uuid))
        supp = res.scalar_one_or_none()
    except ValueError:
        pass

    if not supp:
        res = await db.execute(
            select(Supplier).where(Supplier.supplier_code == supplier_id)
        )
        supp = res.scalar_one_or_none()

    if not supp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supplier with ID or code '{supplier_id}' not found.",
        )

    await db.delete(supp)
    await db.commit()
    return {"status": "success", "message": f"Supplier {supp.name} deleted successfully"}
