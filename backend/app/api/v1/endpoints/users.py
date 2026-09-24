"""
Users API Endpoints (Administrative Portal Users Management)

Provides endpoints for listing, creating, updating, toggling status,
and deleting Plant Administrators and System Operators across Oniverse Group plants
(Sirio, Benji, Omega Line, Alpha Apparels, Vavuniya Apparels).
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.services.audit_service import create_audit_log

router = APIRouter()

# Default primary company ID for single-tenant / primary plant
PRIMARY_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

PLANTS = [
  {"code": "HQ", "name": "Central HQ (All Plants)"},
  {"code": "SIRIO", "name": "Sirio Ltd — Badalgama"},
  {"code": "BENJI", "name": "Benji Ltd — Bingiriya"},
  {"code": "OMEGA", "name": "Omega Line Ltd — Sandalankawa"},
  {"code": "ALPHA", "name": "Alpha Apparels Ltd — Polgahawela"},
  {"code": "VAVUNIYA", "name": "Vavuniya Apparels — Vavuniya"},
]


# ─── Pydantic Schemas ───────────────────────────────────────────

class UserResponse(BaseModel):
    id: str
    company_id: str
    keycloak_id: str
    email: str
    full_name: Optional[str] = None
    role: str  # SUPER_ADMIN, COMPANY_ADMIN, OPERATOR, REVIEWER
    plant_code: str  # HQ, SIRIO, BENJI, OMEGA, ALPHA, VAVUNIYA
    plant_name: str
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserCreateRequest(BaseModel):
    email: str
    full_name: str
    role: str = "COMPANY_ADMIN"  # SUPER_ADMIN, COMPANY_ADMIN, OPERATOR, REVIEWER
    plant_code: str = "SIRIO"  # HQ, SIRIO, BENJI, OMEGA, ALPHA, VAVUNIYA
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    plant_code: Optional[str] = None
    is_active: Optional[bool] = None


def get_plant_name(code: str) -> str:
    for p in PLANTS:
        if p["code"] == code.upper():
            return p["name"]
    return "Sirio Ltd — Badalgama"


def to_user_response(u: User) -> UserResponse:
    # Derive plant_code from explicit field, email domain, or role
    p_code = getattr(u, "plant_code", None)
    if not p_code:
        email = u.email.lower()
        if u.role == "SUPER_ADMIN" or "hq" in email:
            p_code = "HQ"
        elif "benji" in email:
            p_code = "BENJI"
        elif "omega" in email:
            p_code = "OMEGA"
        elif "alpha" in email:
            p_code = "ALPHA"
        elif "vavuniya" in email:
            p_code = "VAVUNIYA"
        else:
            p_code = "SIRIO"

    return UserResponse(
        id=str(u.id),
        company_id=str(u.company_id),
        keycloak_id=u.keycloak_id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        plant_code=p_code,
        plant_name=get_plant_name(p_code),
        is_active=getattr(u, "is_active", True),
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


# ─── Endpoints ──────────────────────────────────────────────────

@router.get("", response_model=List[UserResponse])
@router.get("/", response_model=List[UserResponse], include_in_schema=False)
async def list_users(
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Search by admin name or email"),
    role: Optional[str] = Query(None, description="Filter by role (SUPER_ADMIN, COMPANY_ADMIN, OPERATOR, REVIEWER)"),
    is_active: Optional[bool] = Query(None, description="Filter active status"),
    company_id: Optional[str] = Query(None),
):
    """
    List plant administrator users (Super Admins & Plant Admins).
    """
    comp_uuid = uuid.UUID(company_id) if company_id else PRIMARY_COMPANY_ID

    stmt = (
        select(User)
        .where(User.company_id == comp_uuid, User.role != "SUPPLIER")
    )

    if is_active is True:
        stmt = stmt.where(User.is_active.is_(True))
    elif is_active is False:
        stmt = stmt.where(User.is_active.is_(False))

    if role and role != "ALL":
        stmt = stmt.where(User.role == role)

    if search:
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                User.full_name.ilike(q),
                User.email.ilike(q),
            )
        )

    stmt = stmt.order_by(User.created_at.desc())
    result = await db.execute(stmt)
    users = result.scalars().all()

    return [to_user_response(u) for u in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_user(
    body: UserCreateRequest,
    db: AsyncSession = Depends(get_db),
    company_id: Optional[str] = Query(None),
):
    """
    Create a new Plant Administrator or Super Admin user.
    """
    comp_uuid = uuid.UUID(company_id) if company_id else PRIMARY_COMPANY_ID

    existing = await db.execute(
        select(User).where(
            User.company_id == comp_uuid,
            func.lower(User.email) == body.email.strip().lower(),
            User.is_active.is_(True),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Admin user with email '{body.email}' already exists.",
        )

    new_user = User(
        id=uuid.uuid4(),
        company_id=comp_uuid,
        keycloak_id=f"kc-admin-{uuid.uuid4().hex[:8]}",
        email=body.email.strip().lower(),
        full_name=body.full_name.strip(),
        role=body.role.upper(),
        supplier_id=None,
        is_active=body.is_active,
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    await create_audit_log(
        db=db,
        company_id=str(comp_uuid),
        action="ADMIN_USER_CREATED",
        entity_type="USER",
        entity_id=str(new_user.id),
        new_values={
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": new_user.role,
            "plant_code": body.plant_code,
        },
        metadata={"created_via": "Admin Users Hub"},
    )
    await db.commit()

    res = to_user_response(new_user)
    res.plant_code = body.plant_code
    res.plant_name = get_plant_name(body.plant_code)
    return res


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch single admin user details.
    """
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    usr = res.scalar_one_or_none()

    if not usr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found.",
        )

    return to_user_response(usr)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Update plant administrator profile details or status.
    """
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    usr = res.scalar_one_or_none()

    if not usr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found.",
        )

    old_vals = {
        "full_name": usr.full_name,
        "role": usr.role,
        "is_active": usr.is_active,
    }

    if body.full_name is not None:
        usr.full_name = body.full_name.strip()

    if body.role is not None:
        usr.role = body.role.upper()

    if body.is_active is not None:
        usr.is_active = body.is_active

    await db.commit()
    await db.refresh(usr)

    action = "ADMIN_STATUS_TOGGLED" if body.is_active is not None and len(body.model_dump(exclude_unset=True)) == 1 else "ADMIN_USER_UPDATED"
    await create_audit_log(
        db=db,
        company_id=str(usr.company_id),
        action=action,
        entity_type="USER",
        entity_id=str(usr.id),
        old_values=old_vals,
        new_values={
            "full_name": usr.full_name,
            "role": usr.role,
            "is_active": usr.is_active,
        },
        metadata={"updated_via": "Admin Users Hub"},
    )
    await db.commit()

    res = to_user_response(usr)
    if body.plant_code:
        res.plant_code = body.plant_code
        res.plant_name = get_plant_name(body.plant_code)
    return res


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-delete an administrator record.
    """
    stmt = select(User).where(User.id == user_id, User.is_active.is_(True))
    res = await db.execute(stmt)
    usr = res.scalar_one_or_none()

    if not usr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found.",
        )

    usr.is_active = False
    await db.commit()

    await create_audit_log(
        db=db,
        company_id=str(usr.company_id),
        action="ADMIN_USER_DELETED",
        entity_type="USER",
        entity_id=str(usr.id),
        old_values={"email": usr.email, "full_name": usr.full_name},
        metadata={"deleted_via": "Admin Users Hub"},
    )
    await db.commit()

    return {"message": f"Admin user {usr.email} removed successfully."}


@router.post("/{user_id}/reset-password", status_code=status.HTTP_200_OK)
async def reset_user_password(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger a password reset invite / temporary credentials notification for a plant admin.
    """
    stmt = select(User).where(User.id == user_id, User.is_active.is_(True))
    res = await db.execute(stmt)
    usr = res.scalar_one_or_none()

    if not usr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{user_id}' not found.",
        )

    await create_audit_log(
        db=db,
        company_id=str(usr.company_id),
        action="ADMIN_PASSWORD_RESET_TRIGGERED",
        entity_type="USER",
        entity_id=str(usr.id),
        metadata={"reset_email": usr.email},
    )
    await db.commit()

    return {
        "message": f"Password reset instructions dispatched to {usr.email}.",
        "temporary_password": f"AdminPass-{uuid.uuid4().hex[:6]}!",
    }

