"""
Supplier Management Endpoints — /api/v1/suppliers
Provides industry-grade CRUD operations, automatic email supplier sync,
and database persistence for all supplier partner profiles.
"""

from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
# Phase 4 replaces this with Keycloak Admin API calls (keycloak_admin.py).
# For now, credential endpoints return 501 Not Implemented.
# from app.core.credentials_store import (
#     issue_temporary_credentials,
#     get_credential_info,
#     change_supplier_password,
#     mark_supplier_discovered,
#     get_supplier_discovery_meta,
# )

# Stubs for credential functions removed in Phase 2.
# Phase 4 replaces these with Keycloak Admin API calls.
def issue_temporary_credentials(**kwargs):
    return {"status": "not_implemented", "message": "Credential management moved to Keycloak (Phase 4)"}

def get_credential_info(code):
    return None

def change_supplier_password(**kwargs):
    return False, "Password management moved to Keycloak. Use the 'Forgot password' link on the login page."

def mark_supplier_discovered(code, **kwargs):
    pass

def get_supplier_discovery_meta(code):
    return None


from app.api.v1.deps import CurrentUser, get_current_user
from app.services.keycloak_admin import verify_admin_password
from app.db.session import get_db
from app.models.parsed_data import ParsedData
from app.models.purchase_order import PurchaseOrder
from app.models.supplier import Supplier

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Pydantic Schemas ───────────────────────────────────────────

class SupplierDeleteRequest(BaseModel):
    admin_password: Optional[str] = None


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
    is_deleted: bool = False
    deleted_at: Optional[str] = None
    onboarded_at: str
    updated_at: Optional[str] = None
    last_profile_updated_at: Optional[str] = None
    total_pos: int = 0
    latest_po_date: Optional[str] = None
    detected_via: Optional[str] = None
    is_pending_approval: bool = False
    has_credentials_issued: bool = False
    temporary_password: Optional[str] = None
    temp_password_expires_at: Optional[str] = None
    requires_password_change: bool = False
    credentials_emailed: bool = False

    model_config = {"from_attributes": True}


class SupplierCredentialsResponse(BaseModel):
    supplier_id: str
    supplier_code: str
    name: str
    email: str
    temporary_password: str
    expires_in_hours: int = 6
    expires_at: str
    requires_password_change: bool = True
    credentials_emailed: bool = False
    message: str = "Temporary credentials generated successfully. Valid for 6 hours."


class ChangePasswordRequest(BaseModel):
    supplier_code_or_email: str
    current_password: str
    new_password: str = Field(..., min_length=6)


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
]

# Buyer plant names to never confuse with suppliers
BUYER_PLANT_NAMES = {
    "sirio",
    "sirio ltd",
    "sirio s.p.a.",
    "sirio spa",
    "benji",
    "benji ltd",
    "omega line",
    "omega line ltd",
    "alpha apparels",
    "alpha apparels ltd",
    "vavuniya apparels",
    "calzedonia",
    "calzedonia spa",
    "calzedonia s.p.a.",
    "calzedonia group",
    "oniverse",
    "oniverse group",
}


# ─── In-Memory Tracking for Deleted Suppliers & Seed State ───────
_DELETED_SUPPLIER_CODES: set[str] = set()
_INITIAL_SEEDED: bool = False


async def _ensure_seed_and_email_sync(db: AsyncSession) -> None:
    """Ensure initial partners exist only on initial startup, and auto-import new suppliers from parsed email data."""
    global _INITIAL_SEEDED

    # 1. Seed initial partners ONLY ONCE if the database table is completely empty
    if not _INITIAL_SEEDED:
        count_res = await db.execute(select(func.count(Supplier.id)))
        supplier_count = count_res.scalar() or 0

        if supplier_count == 0:
            for p in INITIAL_PARTNERS:
                code = p["supplier_code"]
                clean_code = code.lstrip("0")
                if code in _DELETED_SUPPLIER_CODES or clean_code in _DELETED_SUPPLIER_CODES:
                    continue

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
            await db.commit()
        _INITIAL_SEEDED = True

    # 2. Sync any suppliers extracted strictly with a valid <PartnerId>
    try:
        from app.models.email_message import EmailRecord

        raw_supps = await db.execute(
            select(ParsedData, EmailRecord)
            .outerjoin(EmailRecord, ParsedData.email_record_id == EmailRecord.id)
            .where(
                (ParsedData.supplier_id_extracted.isnot(None) & (ParsedData.supplier_id_extracted != ""))
                | (ParsedData.raw_extracted.isnot(None))
            )
        )
        for pd, email_rec in raw_supps.all():
            raw = pd.raw_extracted if isinstance(pd.raw_extracted, dict) else {}
            s_code = (
                pd.supplier_id_extracted
                or raw.get("partner_id")
                or raw.get("supplier_code")
                or raw.get("supplier_id")
            )
            if not s_code:
                continue
            s_code_str = str(s_code).strip()
            # Do NOT create or fetch any dummy supplier codes without real <PartnerId>
            if (
                not s_code_str
                or s_code_str.upper().startswith("SUP-")
                or s_code_str.upper() in ["UNKNOWN", "NONE", "NULL", "0"]
            ):
                continue

            s_clean = s_code_str.lstrip("0")
            s_padded = s_clean.zfill(10) if s_clean.isdigit() else s_code_str

            if (
                s_code_str in _DELETED_SUPPLIER_CODES
                or s_clean in _DELETED_SUPPLIER_CODES
                or s_padded in _DELETED_SUPPLIER_CODES
            ):
                continue

            chk = await db.execute(
                select(Supplier).where(
                    or_(
                        Supplier.supplier_code == s_code_str,
                        Supplier.supplier_code == s_clean,
                        Supplier.supplier_code == s_padded,
                    )
                )
            )
            existing = chk.scalars().first()

            name_candidate = (
                raw.get("legal_name")
                or raw.get("supplier_name")
                or raw.get("partner_name")
            )
            # Prevent buyer plant names from ever being used as a supplier name
            if name_candidate and str(name_candidate).strip().lower() in BUYER_PLANT_NAMES:
                name_candidate = raw.get("supplier_name") or raw.get("partner_name") or None

            email_candidate = (
                raw.get("iungo_email_address")
                or raw.get("email")
                or (email_rec.from_address if email_rec else None)
            )
            address_candidate = (
                raw.get("address")
                or raw.get("delivery_address")
                or raw.get("destination")
            )
            country_candidate = raw.get("country") or "Sri Lanka"
            tax_id_candidate = raw.get("tax_id") or raw.get("fiscal_code") or raw.get("vat_registration") or None
            phone_candidate = raw.get("phone") or raw.get("telephone") or None
            contact_candidate = raw.get("contact_person") or raw.get("contact_name") or None
            category_candidate = raw.get("category") or "Textiles & Garments"

            if not existing:
                # Option 3: Newly auto-discovered from incoming Iungo email!
                # Initially is_active=False so admin reviews & clicks "Approve & Issue Credentials"
                new_s = Supplier(
                    supplier_code=s_padded,
                    name=str(name_candidate).strip() if name_candidate else f"Supplier #{s_code_str}",
                    email=str(email_candidate).strip().lower() if email_candidate else f"supplier_{s_clean or 'partner'}@oniverse.local",
                    contact_name=str(contact_candidate).strip() if contact_candidate else None,
                    phone=str(phone_candidate).strip() if phone_candidate else None,
                    country=str(country_candidate).strip(),
                    category=str(category_candidate).strip(),
                    tax_id=str(tax_id_candidate).strip() if tax_id_candidate else None,
                    address=str(address_candidate).strip() if address_candidate else None,
                    is_active=False,
                )
                db.add(new_s)
                mark_supplier_discovered(
                    supplier_code=new_s.supplier_code,
                    detected_via="Iungo System Email",
                    email_subject=email_rec.subject if email_rec else "Inbound Iungo Order",
                    extracted_data=raw,
                )
            else:
                # Enrich existing supplier details if missing or placeholder
                if name_candidate and (not existing.name or existing.name.startswith("Supplier ")):
                    existing.name = str(name_candidate).strip()
                if email_candidate and (not existing.email or "oniverse.local" in existing.email):
                    existing.email = str(email_candidate).strip().lower()
                if address_candidate and not existing.address:
                    existing.address = str(address_candidate).strip()
                if tax_id_candidate and not existing.tax_id:
                    existing.tax_id = str(tax_id_candidate).strip()
                if phone_candidate and not existing.phone:
                    existing.phone = str(phone_candidate).strip()
                if contact_candidate and not existing.contact_name:
                    existing.contact_name = str(contact_candidate).strip()
                mark_supplier_discovered(
                    supplier_code=existing.supplier_code,
                    detected_via="Iungo System Email",
                    email_subject=email_rec.subject if email_rec else "Inbound Iungo Order",
                    extracted_data=raw,
                )
    except Exception as e:
        logger.warning("Error auto-syncing suppliers from email parsed_data: %s", e)

    await db.commit()


# ─── ENDPOINTS ──────────────────────────────────────────────────

@router.get("", response_model=list[SupplierResponse])
@router.get("/", response_model=list[SupplierResponse], include_in_schema=False)
async def list_suppliers(
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Search by name, code, email, or contact"),
    active_only: Optional[bool] = Query(None, description="Filter by active status"),
    archived_only: Optional[bool] = Query(False, description="Filter for archived/deleted suppliers only"),
    include_deleted: Optional[bool] = Query(False, description="Include soft-deleted suppliers"),
) -> list[SupplierResponse]:
    """
    List all onboarded and email-detected suppliers, enriched with live PO statistics.
    """
    await _ensure_seed_and_email_sync(db)

    query = select(Supplier).order_by(Supplier.name.asc())
    if archived_only:
        query = query.where(Supplier.is_deleted.is_(True))
    elif not include_deleted:
        query = query.where(Supplier.is_deleted.is_(False))

    if isinstance(active_only, bool):
        query = query.where(Supplier.is_active == active_only)
    if isinstance(search, str) and search.strip():
        s_term = f"%{search.strip()}%"
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
        discovery = get_supplier_discovery_meta(s.supplier_code)
        cred = get_credential_info(s.supplier_code)

        # Discovered via Iungo email if tracked or has live POs from Iungo EDI
        detected_via = (
            discovery.get("detected_via")
            if discovery
            else ("Iungo System Email" if (total_pos > 0 or s.supplier_code in ["0000058376", "0000018194", "0000001122", "0000080589"]) else None)
        )
        is_pending = not s.is_active and bool(detected_via)
        has_creds = bool(cred and cred.get("temporary_password"))

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
                is_deleted=bool(s.is_deleted),
                deleted_at=s.deleted_at.isoformat() if s.deleted_at else None,
                onboarded_at=s.created_at.isoformat() if s.created_at else datetime.now(timezone.utc).isoformat(),
                updated_at=s.updated_at.isoformat() if s.updated_at else None,
                last_profile_updated_at=s.updated_at.isoformat() if s.updated_at else None,
                total_pos=total_pos,
                latest_po_date=latest_po.isoformat() if latest_po else None,
                detected_via=detected_via,
                is_pending_approval=is_pending,
                has_credentials_issued=has_creds,
                temporary_password=cred.get("temporary_password") if cred else None,
                temp_password_expires_at=cred.get("expires_at") if cred else None,
                requires_password_change=cred.get("requires_password_change", False) if cred else False,
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

    # 1. Generate & cache temporary credentials
    from app.core.credentials_store import issue_temporary_credentials
    cred = issue_temporary_credentials(
        supplier_code=new_supp.supplier_code,
        email=new_supp.email,
        name=new_supp.name,
        duration_hours=6,
    )
    temp_pw = cred["temporary_password"]

    # 2. Provision account in Keycloak SSO
    kc_uid = None
    try:
        from app.services.keycloak_admin import provision_supplier_in_keycloak
        kc_res = provision_supplier_in_keycloak(
            supplier_code=new_supp.supplier_code,
            email=new_supp.email,
            name=new_supp.name,
            supplier_id=str(new_supp.id),
            temporary_password=temp_pw,
        )
        kc_uid = kc_res.get("keycloak_id")
    except Exception as ex:
        logger.error("Could not provision supplier %s in Keycloak: %s", new_supp.supplier_code, ex)

    # 3. Create or synchronize User entity in users table
    try:
        from app.models.user import User
        from app.models.company import Company
        co_res = await db.execute(select(Company).limit(1))
        company = co_res.scalar_one_or_none()
        company_id = company.id if company else uuid.UUID("00000000-0000-0000-0000-000000000001")

        usr = User(
            company_id=company_id,
            keycloak_id=kc_uid or f"kc-supp-{new_supp.supplier_code}",
            email=new_supp.email,
            full_name=new_supp.name,
            role="SUPPLIER",
            supplier_id=new_supp.id,
            is_active=True,
        )
        db.add(usr)
        await db.commit()
    except Exception as ex:
        logger.error("Could not record User entity for supplier %s: %s", new_supp.supplier_code, ex)

    # 4. Dispatch automated welcome email with credentials
    email_sent = False
    try:
        from app.services.email_sender import send_supplier_welcome_email
        email_sent = send_supplier_welcome_email(
            to_email=new_supp.email,
            supplier_name=new_supp.name,
            supplier_code=new_supp.supplier_code,
            temporary_password=temp_pw,
        )
    except Exception as ex:
        logger.error("Failed to send welcome credentials email to %s: %s", new_supp.email, ex)

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
        is_deleted=False,
        deleted_at=None,
        onboarded_at=new_supp.created_at.isoformat(),
        total_pos=0,
        latest_po_date=None,
        has_credentials_issued=True,
        temporary_password=temp_pw,
        temp_password_expires_at=cred.get("expires_at"),
        requires_password_change=True,
        credentials_emailed=email_sent,
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
        is_deleted=bool(supp.is_deleted),
        deleted_at=supp.deleted_at.isoformat() if supp.deleted_at else None,
        onboarded_at=supp.created_at.isoformat() if supp.created_at else datetime.now(timezone.utc).isoformat(),
        updated_at=supp.updated_at.isoformat() if supp.updated_at else datetime.now(timezone.utc).isoformat(),
        last_profile_updated_at=supp.updated_at.isoformat() if supp.updated_at else datetime.now(timezone.utc).isoformat(),
        total_pos=po_cnt,
        latest_po_date=None,
    )


@router.delete("/{supplier_id}", status_code=status.HTTP_200_OK)
@router.post("/{supplier_id}/delete", status_code=status.HTTP_200_OK)
async def delete_supplier(
    supplier_id: str,
    payload: Optional[SupplierDeleteRequest] = None,
    admin_password: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[CurrentUser] = Depends(get_current_user),
) -> dict:
    """
    Safely soft-delete/archive a supplier partner after verifying the administrator's password against Keycloak.
    Preserves all historical purchase orders and records for 1-click restore.
    """
    pwd = (payload.admin_password if payload and payload.admin_password else None) or admin_password
    if not pwd or not pwd.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrator password is required to verify deletion.",
        )

    admin_identifier = (current_user.username or current_user.email) if current_user else None
    if not verify_admin_password(admin_identifier, pwd.strip()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Verification Failed: Invalid administrator password. Deletion denied.",
        )

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

    code = supp.supplier_code.strip()
    _DELETED_SUPPLIER_CODES.add(code)
    _DELETED_SUPPLIER_CODES.add(code.lstrip("0"))

    # Soft-delete: mark is_deleted=True, deactivate, set timestamp
    # CRITICAL: We do NOT detach purchase orders or delete users, preserving all historical data and backup!
    supp.is_deleted = True
    supp.is_active = False
    supp.deleted_at = datetime.now(timezone.utc)

    await db.commit()
    return {
        "status": "success",
        "message": f"Supplier {supp.name} (#{supp.supplier_code}) successfully moved to Archive / Trash. All purchase orders and records are preserved and can be restored.",
        "id": str(supp.id),
        "supplier_code": supp.supplier_code,
    }


@router.post("/{supplier_id}/restore", response_model=SupplierResponse)
async def restore_supplier(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
) -> SupplierResponse:
    """
    Restore an archived / soft-deleted supplier partner back to active status.
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

    code = supp.supplier_code.strip()
    _DELETED_SUPPLIER_CODES.discard(code)
    _DELETED_SUPPLIER_CODES.discard(code.lstrip("0"))

    supp.is_deleted = False
    supp.deleted_at = None
    supp.is_active = True

    await db.commit()
    await db.refresh(supp)

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
        is_deleted=False,
        deleted_at=None,
        onboarded_at=supp.created_at.isoformat() if supp.created_at else datetime.now(timezone.utc).isoformat(),
        updated_at=supp.updated_at.isoformat() if supp.updated_at else None,
        last_profile_updated_at=supp.updated_at.isoformat() if supp.updated_at else None,
        total_pos=po_cnt,
        latest_po_date=None,
    )


def _is_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False


# ─── CREDENTIALS & 1-CLICK ACTIVATION ENDPOINTS ──────────────────

@router.post("/{supplier_id}/activate-credentials", response_model=SupplierCredentialsResponse)
async def activate_supplier_credentials(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
) -> SupplierCredentialsResponse:
    """
    1-Click Admin Activation: Approves an auto-discovered or onboarded supplier,
    activates their account, generates a 6-hour temporary password,
    and provisions their User entity for immediate Supplier Dashboard access.
    """
    from app.models.user import User
    from app.models.company import Company

    # Find supplier by ID or code
    supp_uuid = uuid.UUID(supplier_id) if _is_uuid(supplier_id) else None
    stmt = select(Supplier).where(
        or_(
            Supplier.id == supp_uuid if supp_uuid else False,
            Supplier.supplier_code == supplier_id,
        )
    )
    res = await db.execute(stmt)
    supplier = res.scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # 1. Activate supplier status
    supplier.is_active = True

    # 2. Issue 6-hour temporary credentials
    cred = issue_temporary_credentials(
        supplier_code=supplier.supplier_code,
        email=supplier.email,
        name=supplier.name,
        duration_hours=6,
    )

    # 3. Ensure User entity exists in users table with role SUPPLIER
    usr_res = await db.execute(select(User).where(User.supplier_id == supplier.id))
    usr = usr_res.scalar_one_or_none()
    if not usr:
        co_res = await db.execute(select(Company).limit(1))
        company = co_res.scalar_one_or_none()
        company_id = company.id if company else uuid.UUID("00000000-0000-0000-0000-000000000001")

        usr = User(
            company_id=company_id,
            keycloak_id=f"kc-supp-{supplier.supplier_code}",
            email=supplier.email,
            full_name=supplier.name,
            role="SUPPLIER",
            supplier_id=supplier.id,
            is_active=True,
        )
        db.add(usr)
    else:
        usr.is_active = True

    await db.commit()

    # 4. Provision in Keycloak SSO
    kc_uid = None
    try:
        from app.services.keycloak_admin import provision_supplier_in_keycloak
        kc_res = provision_supplier_in_keycloak(
            supplier_code=supplier.supplier_code,
            email=supplier.email,
            name=supplier.name,
            supplier_id=str(supplier.id),
            temporary_password=cred["temporary_password"],
        )
        kc_uid = kc_res.get("keycloak_id")
        if usr and kc_uid:
            usr.keycloak_id = kc_uid
            await db.commit()
    except Exception as ex:
        logger.error("Keycloak activation error for %s: %s", supplier.supplier_code, ex)

    # 5. Send automated credentials email to company address
    email_sent = False
    try:
        from app.services.email_sender import send_supplier_welcome_email
        email_sent = send_supplier_welcome_email(
            to_email=supplier.email,
            supplier_name=supplier.name,
            supplier_code=supplier.supplier_code,
            temporary_password=cred["temporary_password"],
        )
    except Exception as ex:
        logger.error("Email sending error for %s: %s", supplier.supplier_code, ex)

    return SupplierCredentialsResponse(
        supplier_id=str(supplier.id),
        supplier_code=supplier.supplier_code,
        name=supplier.name,
        email=supplier.email,
        temporary_password=cred["temporary_password"],
        expires_in_hours=6,
        expires_at=cred["expires_at"],
        requires_password_change=True,
        credentials_emailed=email_sent,
        message=f"Supplier {supplier.name} successfully activated. 6-hour temporary password generated and emailed to {supplier.email}.",
    )


@router.get("/{supplier_id}/credentials", response_model=SupplierCredentialsResponse)
async def get_supplier_credentials(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
) -> SupplierCredentialsResponse:
    """Retrieve existing or freshly generated credentials for a supplier."""
    supp_uuid = uuid.UUID(supplier_id) if _is_uuid(supplier_id) else None
    stmt = select(Supplier).where(
        or_(
            Supplier.id == supp_uuid if supp_uuid else False,
            Supplier.supplier_code == supplier_id,
        )
    )
    res = await db.execute(stmt)
    supplier = res.scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    cred = get_credential_info(supplier.supplier_code)
    if not cred or not cred.get("temporary_password"):
        cred = issue_temporary_credentials(
            supplier_code=supplier.supplier_code,
            email=supplier.email,
            name=supplier.name,
            duration_hours=6,
        )

    return SupplierCredentialsResponse(
        supplier_id=str(supplier.id),
        supplier_code=supplier.supplier_code,
        name=supplier.name,
        email=supplier.email,
        temporary_password=cred["temporary_password"],
        expires_in_hours=6,
        expires_at=cred["expires_at"],
        requires_password_change=cred.get("requires_password_change", True),
        message="Credentials retrieved.",
    )


@router.post("/change-password")
async def change_password_endpoint(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Allow supplier partner to change their password from temporary to permanent.
    """
    success, msg = change_supplier_password(
        supplier_code_or_email=payload.supplier_code_or_email,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)

    return {"status": "ok", "message": msg}

