"""
Supplier Management Endpoints — /api/v1/suppliers
Provides industry-grade CRUD operations, automatic email supplier sync,
and database persistence for all supplier partner profiles.
"""

from __future__ import annotations

import uuid
import re
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

def mark_supplier_discovered(code=None, supplier_code=None, **kwargs):
    pass

def get_supplier_discovery_meta(code):
    return None


from starlette.requests import Request
from fastapi.security import HTTPAuthorizationCredentials
from app.api.v1.deps import CurrentUser, get_current_user, _bearer
from app.models.enums import UserRole
from app.services.keycloak_admin import (
    verify_admin_password,
    set_supplier_enabled_in_keycloak,
    delete_supplier_from_keycloak,
)
from app.db.session import get_db
from app.models.parsed_data import ParsedData
from app.models.purchase_order import PurchaseOrder
from app.models.supplier import Supplier

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_optional_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[CurrentUser]:
    if creds is None:
        return None
    try:
        return await get_current_user(request, creds)
    except Exception:
        return None


async def set_supplier_hu_sequence(db: AsyncSession, supplier_id: uuid.UUID, hu_number_str: str) -> None:
    """Synchronize a supplier's current HU number with the atomic hu_sequences sequence tracker."""
    from app.models.hu_sequence import HUSequence
    from app.models.packing_slip import PackingSlip
    from app.models.shipment import Shipment

    clean = hu_number_str.strip()
    digits = "".join(filter(str.isdigit, clean))
    if not digits:
        return
    running_seq = int(digits[-10:]) if len(digits) >= 10 else int(digits)

    # Check if this supplier already has packing slips/shipments using higher or equal HU serials
    max_hu_stmt = (
        select(PackingSlip.hu_number)
        .join(Shipment, PackingSlip.shipment_id == Shipment.id)
        .where(
            Shipment.supplier_id == supplier_id,
            Shipment.status != "CANCELLED",
        )
    )
    existing_res = await db.execute(max_hu_stmt)
    existing_hus = existing_res.scalars().all()
    serials = [int(h[10:]) for h in existing_hus if len(h) == 20 and h[10:].isdigit()]
    if serials:
        max_used = max(serials)
        if running_seq < max_used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot set last used HU sequence to #{running_seq}. "
                    f"Handling Units up to #{max_used} have already been used in existing active shipments. "
                    f"Last used sequence must be at least #{max_used} (next carton will be #{running_seq + 1}). "
                    f"To start from a lower number, please delete or cancel the existing test shipments first."
                ),
            )

    # The number entered by the user is the LAST USED number (e.g. 0 for new supplier, or 50 if already used up to 50).
    # Since get_next_hu_sequence and generate_hu_numbers allocate starting from last_number + 1,
    # we directly store running_seq as last_number so the very next carton generated is running_seq + 1.
    last_num = max(0, running_seq)
    stmt = select(HUSequence).where(HUSequence.supplier_id == supplier_id)
    res = await db.execute(stmt)
    seq = res.scalar_one_or_none()
    if seq:
        seq.last_number = last_num
    else:
        seq = HUSequence(supplier_id=supplier_id, last_number=last_num)
        db.add(seq)


# ─── Pydantic Schemas ───────────────────────────────────────────

class SupplierDeleteRequest(BaseModel):
    admin_password: Optional[str] = None
    permanent: Optional[bool] = False


class SupplierHUNumberRequest(BaseModel):
    current_hu_number: str = Field(..., min_length=1, max_length=50)


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
    profile_picture_url: Optional[str] = None
    current_hu_number: Optional[str] = None
    hu_locked: bool = False
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
    email: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = "Sri Lanka"
    tax_id: Optional[str] = None
    category: Optional[str] = "Textiles & Garments"
    profile_picture_url: Optional[str] = None
    current_hu_number: Optional[str] = None
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
    profile_picture_url: Optional[str] = None
    current_hu_number: Optional[str] = None
    hu_locked: Optional[bool] = None
    is_active: Optional[bool] = None


# Buyer plant and brand names to never confuse with suppliers
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
    "calzedonia central hub",
    "calzedonia hub",
    "calzedonia central hub s.p.a.",
    "calzedonia central hub spa",
    "oniverse",
    "oniverse group",
}


async def _ensure_seed_and_email_sync(db: AsyncSession) -> None:
    """Auto-import newly discovered suppliers from incoming parsed email records into the live database."""

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
            if existing and existing.is_deleted:
                # Retain archived state; do not alter or resurrect deleted supplier
                continue

            name_candidate = (
                raw.get("supplier_name")
                or raw.get("partner_name")
                or raw.get("legal_name")
            )
            # Prevent buyer plant names from ever being used as a supplier name
            if name_candidate and str(name_candidate).strip().lower() in BUYER_PLANT_NAMES:
                name_candidate = raw.get("partner_name") or None

            email_candidate = (
                raw.get("supplier_email")
                or raw.get("partner_email")
                or raw.get("email")
                or raw.get("contact_email")
            )
            if email_candidate:
                parts = [e.strip() for e in re.split(r"[;, ]+", str(email_candidate)) if e.strip() and "@" in e]
                clean_vendor_emails = [
                    e for e in parts
                    if not any(bd in e.lower() for bd in ["sirioltd.org", "calzedonia.it", "oniverse.com", "oniverse.it", "iungomail.com"])
                ]
                email_candidate = clean_vendor_emails[0] if clean_vendor_emails else (parts[0] if parts else None)

            # Never fall back to personal forwarder email addresses for official supplier profile
            if not email_candidate and email_rec and email_rec.from_address:
                fa = email_rec.from_address.lower()
                if not any(pd in fa for pd in ["@gmail.", "@yahoo.", "@outlook.", "@hotmail.", "@live.", "@icloud."]):
                    email_candidate = email_rec.from_address

            # Assemble clean physical factory/office address from SdPartner
            country_candidate = raw.get("country") or "Sri Lanka"

            # Registry fallbacks for real XML values if omitted in XML
            clean_code = s_clean
            if clean_code == "111924":
                name_candidate = name_candidate or "ORIENT INTERNATIONAL HOLDING SHANGH FOREIGN TRADE CO.,LTD."
                country_candidate = "China"
            elif clean_code == "1122":
                name_candidate = name_candidate or "HAYLEYS FABRIC PLC"
                country_candidate = "Sri Lanka"
            elif clean_code == "18194":
                name_candidate = name_candidate or "COATS THREAD EXPORTS (PRIVATE) LIMITED"
                country_candidate = "Sri Lanka"
            elif clean_code == "80589":
                name_candidate = name_candidate or "SOUTH ASIA TEXTILES (PRIVATE) LIMITED"
                country_candidate = "Sri Lanka"

            if not existing:
                # Newly auto-discovered from incoming PO/email: only gather name and country
                new_s = Supplier(
                    supplier_code=s_padded,
                    name=str(name_candidate).strip() if name_candidate else f"Supplier #{s_code_str}",
                    email=f"supplier_{s_clean or 'partner'}@supplier.local",
                    country=str(country_candidate).strip(),
                    is_active=False,
                )
                db.add(new_s)
                mark_supplier_discovered(
                    supplier_code=new_s.supplier_code,
                    detected_via="System PO Ingestion",
                    email_subject=email_rec.subject if email_rec else "Inbound Order",
                    extracted_data={"supplier_code": s_padded, "name": new_s.name, "country": new_s.country},
                )
            else:
                # Only enrich name and country from POs if missing
                if name_candidate and (not existing.name or existing.name.startswith("Supplier ")):
                    existing.name = str(name_candidate).strip()
                if country_candidate and (
                    not existing.country
                    or (existing.country == "Sri Lanka" and country_candidate != "Sri Lanka")
                ):
                    existing.country = str(country_candidate).strip()
                mark_supplier_discovered(
                    supplier_code=existing.supplier_code,
                    detected_via="System PO Ingestion",
                    email_subject=email_rec.subject if email_rec else "Inbound Order",
                    extracted_data={"supplier_code": existing.supplier_code, "name": existing.name, "country": existing.country},
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
            if (discovery and discovery.get("detected_via"))
            else ("Iungo System Email" if total_pos > 0 else "Manual Onboarding")
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
                profile_picture_url=s.profile_picture_url,
                current_hu_number=s.current_hu_number,
                hu_locked=bool(s.hu_locked),
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


@router.get("/lookup-xml/{supplier_code}")
async def lookup_supplier_xml(
    supplier_code: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Search inbound parsed XML attachments in parsed_data for a supplier code
    and return prefilled supplier information for onboarding.
    """
    code_raw = supplier_code.strip()
    code_clean = code_raw.lstrip("0")
    code_padded = code_clean.zfill(10) if code_clean.isdigit() else code_raw

    # Check existing Supplier record if present
    supp_stmt = select(Supplier).where(
        or_(
            Supplier.supplier_code == code_raw,
            Supplier.supplier_code == code_clean,
            Supplier.supplier_code == code_padded,
        )
    )
    supp_res = await db.execute(supp_stmt)
    existing_supp = supp_res.scalars().first()

    stmt = select(ParsedData).where(
        or_(
            ParsedData.supplier_id_extracted == code_raw,
            ParsedData.supplier_id_extracted == code_clean,
            ParsedData.supplier_id_extracted == code_padded,
        )
    ).order_by(desc(ParsedData.created_at))
    res = await db.execute(stmt)
    all_pd = res.scalars().all()

    # Aggregate best available fields from all parsed XML records
    best_name = None
    best_country = None
    best_source_file = None

    for pd in all_pd:
        raw = pd.raw_extracted if pd and isinstance(pd.raw_extracted, dict) else {}
        if not raw:
            continue

        # Name
        s_name = raw.get("supplier_name") or raw.get("partner_name")
        if s_name and not best_name and not str(s_name).startswith("Supplier #"):
            best_name = str(s_name).strip()

        # Country
        s_country = raw.get("country")
        if s_country and not best_country and str(s_country).strip():
            best_country = str(s_country).strip()

        if not best_source_file and raw.get("source_filename"):
            best_source_file = raw.get("source_filename")

    # Blend with existing supplier in DB if not found in XML
    if existing_supp:
        if not best_name and existing_supp.name:
            best_name = existing_supp.name
        if not best_country and existing_supp.country:
            best_country = existing_supp.country

    # Verified fallbacks for known partner codes
    if code_clean == "111924":
        best_name = best_name or "ORIENT INTERNATIONAL HOLDING SHANGH FOREIGN TRADE CO.,LTD."
        best_country = best_country or "China"
    elif code_clean == "1122":
        best_name = best_name or "HAYLEYS FABRIC PLC"
        best_country = best_country or "Sri Lanka"
    elif code_clean == "18194":
        best_name = best_name or "COATS THREAD EXPORTS (PRIVATE) LIMITED"
        best_country = best_country or "Sri Lanka"
    elif code_clean == "80589":
        best_name = best_name or "SOUTH ASIA TEXTILES (PRIVATE) LIMITED"
        best_country = best_country or "Sri Lanka"

    if not all_pd and not existing_supp and not best_name:
        return {"found": False, "supplier_code": code_padded}

    return {
        "found": True,
        "supplier_code": code_padded,
        "name": best_name or f"Supplier #{code_padded}",
        "country": best_country or ("China" if code_clean == "111924" else "Sri Lanka"),
        "source_filename": best_source_file or "Inbound XML",
    }


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_supplier(
    payload: SupplierCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> SupplierResponse:
    """
    Onboard a new supplier profile manually, enriched with authoritative XML data if available.
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

    # If any optional fields are omitted, auto-fetch from parsed XML if present in mailbox
    xml_data = await lookup_supplier_xml(payload.supplier_code.strip(), db)

    supp_name = payload.name.strip() if payload.name else (xml_data.get("name") if xml_data.get("found") else f"Supplier #{payload.supplier_code}")
    supp_email = payload.email.strip().lower() if payload.email else f"supplier_{payload.supplier_code.strip().lower()}@supplier.local"
    supp_country = payload.country.strip() if payload.country else (xml_data.get("country") if xml_data.get("found") else "Sri Lanka")

    has_hu = bool(payload.current_hu_number and payload.current_hu_number.strip())
    hu_str = payload.current_hu_number.strip() if has_hu else None
    if hu_str:
        digits = "".join(filter(str.isdigit, hu_str))
        if digits:
            running_seq = int(digits[-10:]) if len(digits) >= 10 else int(digits)
            clean_code = payload.supplier_code.strip().lstrip("0").zfill(9)
            hu_str = f"1{clean_code}{str(running_seq).zfill(10)}"

    new_supp = Supplier(
        supplier_code=payload.supplier_code.strip(),
        name=supp_name,
        email=supp_email,
        contact_name=payload.contact_name.strip() if payload.contact_name else None,
        phone=payload.phone.strip() if payload.phone else None,
        address=payload.address.strip() if payload.address else None,
        country=supp_country,
        tax_id=payload.tax_id.strip() if payload.tax_id else None,
        category=payload.category.strip() if payload.category else "Textiles & Garments",
        profile_picture_url=payload.profile_picture_url.strip() if payload.profile_picture_url else None,
        current_hu_number=hu_str,
        hu_locked=has_hu,
        is_active=payload.is_active,
    )
    db.add(new_supp)
    await db.commit()
    await db.refresh(new_supp)

    if hu_str:
        await set_supplier_hu_sequence(db, new_supp.id, hu_str)
        await db.commit()

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
        profile_picture_url=new_supp.profile_picture_url,
        current_hu_number=new_supp.current_hu_number,
        hu_locked=bool(new_supp.hu_locked),
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
    if payload.profile_picture_url is not None:
        supp.profile_picture_url = payload.profile_picture_url.strip() or None
    if payload.current_hu_number is not None:
        hu_val = payload.current_hu_number.strip() if payload.current_hu_number else None
        if hu_val:
            digits = "".join(filter(str.isdigit, hu_val))
            if digits:
                running_seq = int(digits[-10:]) if len(digits) >= 10 else int(digits)
                clean_code = (supp.supplier_code or "").lstrip("0").zfill(9)
                formatted_hu = f"1{clean_code}{str(running_seq).zfill(10)}"
                supp.current_hu_number = formatted_hu
            else:
                supp.current_hu_number = hu_val
            supp.hu_locked = True
            await set_supplier_hu_sequence(db, supp.id, hu_val)
        else:
            supp.current_hu_number = None
            supp.hu_locked = False
            from app.models.hu_sequence import HUSequence
            stmt = select(HUSequence).where(HUSequence.supplier_id == supp.id)
            res = await db.execute(stmt)
            seq = res.scalar_one_or_none()
            if seq:
                seq.last_number = 0
    if payload.hu_locked is not None:
        supp.hu_locked = payload.hu_locked
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
        profile_picture_url=supp.profile_picture_url,
        current_hu_number=supp.current_hu_number,
        hu_locked=bool(supp.hu_locked),
        is_active=supp.is_active,
        is_deleted=bool(supp.is_deleted),
        deleted_at=supp.deleted_at.isoformat() if supp.deleted_at else None,
        onboarded_at=supp.created_at.isoformat() if supp.created_at else datetime.now(timezone.utc).isoformat(),
        updated_at=supp.updated_at.isoformat() if supp.updated_at else datetime.now(timezone.utc).isoformat(),
        last_profile_updated_at=supp.updated_at.isoformat() if supp.updated_at else datetime.now(timezone.utc).isoformat(),
        total_pos=po_cnt,
        latest_po_date=None,
    )


class SupplierAvatarRequest(BaseModel):
    profile_picture_url: Optional[str] = None


@router.post("/{supplier_id_or_code}/avatar", response_model=SupplierResponse)
@router.put("/{supplier_id_or_code}/avatar", response_model=SupplierResponse)
async def update_supplier_avatar(
    supplier_id_or_code: str,
    payload: SupplierAvatarRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update or remove a supplier partner's profile picture / avatar."""
    supp = None
    try:
        val_uuid = uuid.UUID(supplier_id_or_code)
        supp = (await db.execute(select(Supplier).where(Supplier.id == val_uuid))).scalar_one_or_none()
    except (ValueError, AttributeError):
        pass

    if not supp:
        supp = (
            await db.execute(select(Supplier).where(Supplier.supplier_code == supplier_id_or_code.strip()))
        ).scalar_one_or_none()

    if not supp:
        clean = supplier_id_or_code.strip().lstrip("0")
        if clean:
            supp = (
                await db.execute(
                    select(Supplier).where(func.ltrim(Supplier.supplier_code, "0") == clean)
                )
            ).scalar_one_or_none()

    if not supp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supplier '{supplier_id_or_code}' not found.",
        )

    supp.profile_picture_url = payload.profile_picture_url.strip() if payload.profile_picture_url else None
    await db.commit()
    await db.refresh(supp)

    po_cnt = (
        await db.execute(
            select(func.count(PurchaseOrder.id)).where(PurchaseOrder.supplier_id == supp.id)
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
        profile_picture_url=supp.profile_picture_url,
        current_hu_number=supp.current_hu_number,
        hu_locked=bool(supp.hu_locked),
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

    is_perm = bool(payload and payload.permanent)

    # Soft-delete: mark is_deleted=True, deactivate, set timestamp
    # CRITICAL: We do NOT detach purchase orders or delete users, preserving all historical data and backup!
    supp.is_deleted = True
    supp.is_active = False
    supp.deleted_at = datetime.now(timezone.utc)

    # Sync with Keycloak
    try:
        if is_perm:
            delete_supplier_from_keycloak(code)
        else:
            set_supplier_enabled_in_keycloak(code, enabled=False)
    except Exception as ex:
        logger.warning("Could not sync supplier %s state to Keycloak: %s", code, ex)

    await db.commit()
    return {
        "status": "success",
        "message": f"Supplier {supp.name} (#{supp.supplier_code}) successfully moved to Archive / Trash. Login access has been disabled in Keycloak.",
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

    supp.is_deleted = False
    supp.deleted_at = None
    supp.is_active = True

    # Re-enable in Keycloak
    try:
        set_supplier_enabled_in_keycloak(code, enabled=True)
    except Exception as ex:
        logger.warning("Could not re-enable supplier %s in Keycloak: %s", code, ex)

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
        profile_picture_url=supp.profile_picture_url,
        current_hu_number=supp.current_hu_number,
        hu_locked=bool(supp.hu_locked),
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


@router.post("/{supplier_id}/hu-number", response_model=SupplierResponse)
@router.put("/{supplier_id}/hu-number", response_model=SupplierResponse)
async def set_supplier_hu_number(
    supplier_id: str,
    payload: SupplierHUNumberRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[CurrentUser] = Depends(get_optional_current_user),
) -> SupplierResponse:
    """
    Configure or update the current/starting Handling Unit (HU) number for a supplier.
    - Suppliers can only set this ONCE in the Supplier Portal profile settings.
    - If hu_locked is True, subsequent edits by suppliers are prohibited and require System Admin assistance.
    - System Administrators can view and edit this field anytime from the Admin Dashboard.
    """
    supp: Optional[Supplier] = None
    try:
        supp_uuid = uuid.UUID(supplier_id)
        res = await db.execute(select(Supplier).where(Supplier.id == supp_uuid))
        supp = res.scalar_one_or_none()
    except (ValueError, AttributeError):
        pass

    if supp is None:
        res = await db.execute(select(Supplier).where(Supplier.supplier_code == supplier_id.strip()))
        supp = res.scalar_one_or_none()

    if supp is None:
        clean_code = supplier_id.strip().lstrip("0")
        res = await db.execute(select(Supplier).where(func.lstrip(Supplier.supplier_code, "0") == clean_code))
        supp = res.scalar_one_or_none()

    if supp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supplier with ID or code '{supplier_id}' not found.",
        )

    # Security & Role check:
    # Admin / Super Admin can edit anytime
    is_admin = current_user and current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)

    # If not admin, check if already locked
    if not is_admin and supp.hu_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Handling Unit (HU) Number is locked and can only be set once. Please contact your System Administrator to change it.",
        )

    hu_val = payload.current_hu_number.strip()
    if not hu_val:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HU Number cannot be empty.",
        )

    digits = "".join(filter(str.isdigit, hu_val))
    if digits:
        running_seq = int(digits[-10:]) if len(digits) >= 10 else int(digits)
        clean_code = (supp.supplier_code or "0000018194").lstrip("0").zfill(9)
        formatted_hu = f"1{clean_code}{str(running_seq).zfill(10)}"
        supp.current_hu_number = formatted_hu
    else:
        supp.current_hu_number = hu_val

    supp.hu_locked = True
    await set_supplier_hu_sequence(db, supp.id, hu_val)
    await db.commit()
    await db.refresh(supp)

    po_cnt = (
        await db.execute(
            select(func.count(PurchaseOrder.id)).where(PurchaseOrder.supplier_id == supp.id)
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
        profile_picture_url=supp.profile_picture_url,
        current_hu_number=supp.current_hu_number,
        hu_locked=bool(supp.hu_locked),
        is_active=supp.is_active,
        is_deleted=bool(supp.is_deleted),
        deleted_at=supp.deleted_at.isoformat() if supp.deleted_at else None,
        onboarded_at=supp.created_at.isoformat() if supp.created_at else datetime.now(timezone.utc).isoformat(),
        updated_at=supp.updated_at.isoformat() if supp.updated_at else datetime.now(timezone.utc).isoformat(),
        last_profile_updated_at=supp.updated_at.isoformat() if supp.updated_at else datetime.now(timezone.utc).isoformat(),
        total_pos=po_cnt,
        latest_po_date=None,
    )

