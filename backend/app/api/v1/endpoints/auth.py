"""
Authentication and Role Management API Endpoints.
Supports both Plant Administrator login and Supplier Partner ID login.
"""

from __future__ import annotations

import uuid
from typing import Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.company import Company
from app.models.supplier import Supplier
from app.models.user import User
from app.models.purchase_order import PurchaseOrder

router = APIRouter()

from app.core.credentials_store import verify_supplier_login, change_supplier_password
from app.models.enums import UserRole, ROLE_PERMISSIONS

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEFAULT_PASSWORD = "Abc123@#"


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    supplier_code_or_email: str
    current_password: str
    new_password: str


class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    company_id: str
    company_name: str
    company_code: str
    supplier_id: Optional[str] = None
    supplier_code: Optional[str] = None
    supplier_name: Optional[str] = None
    is_active: bool = True
    requires_password_change: bool = False
    permissions: list[str] = []


class LoginResponse(BaseModel):
    success: bool
    message: str
    token: str
    user: UserProfileResponse


class SupplierSummary(BaseModel):
    id: str
    supplier_code: str
    name: str
    email: str
    contact_name: Optional[str] = None
    country: Optional[str] = None
    total_orders: int = 0


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Authenticate user via Partner ID, Supplier Email, or Admin username.
    Supports RBAC: SUPER_ADMIN, COMPANY_ADMIN, and SUPPLIER.
    Enforces 6-hour temporary password validity & first-time password customization.
    """
    username_clean = req.username.strip()
    password_clean = req.password.strip()

    # 1. Super Admin or Company Admin login
    is_super_admin = username_clean.lower() in ["superadmin", "superadmin@oniverse.com"]
    is_plant_admin = username_clean.lower() in ["admin", "admin@oniverse.com", "admin@sirio.lk"]

    if is_super_admin or is_plant_admin:
        if password_clean != DEFAULT_PASSWORD and password_clean != "SuperAdmin123@#":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password for Administrator.",
            )

        role = "SUPER_ADMIN" if is_super_admin else "COMPANY_ADMIN"
        admin_res = await db.execute(select(User).where(User.keycloak_id == ("kc-super-001" if is_super_admin else "kc-admin-001")))
        admin_user = admin_res.scalar_one_or_none()
        user_id = str(admin_user.id) if admin_user else str(uuid.uuid4())

        return LoginResponse(
            success=True,
            message="Logged in as Super Administrator" if is_super_admin else "Logged in as Plant Administrator",
            token=f"jwt-admin-{user_id}",
            user=UserProfileResponse(
                id=user_id,
                email="superadmin@oniverse.com" if is_super_admin else "admin@oniverse.com",
                full_name="Super Administrator" if is_super_admin else "Plant Administrator",
                role=role,
                company_id=str(COMPANY_ID),
                company_name="Sirio Ltd / Oniverse Group",
                company_code="SIRIO",
                supplier_id=None,
                supplier_code=None,
                supplier_name=None,
                is_active=True,
                requires_password_change=False,
                permissions=ROLE_PERMISSIONS.get(role, ["*"]),
            ),
        )

    # 2. Supplier Partner ID / Email login
    partner_id = username_clean.lstrip("0").zfill(10) if username_clean.isdigit() else username_clean

    supp_res = await db.execute(
        select(Supplier).where(
            or_(
                Supplier.supplier_code == partner_id,
                Supplier.supplier_code == username_clean,
                Supplier.email.ilike(username_clean),
            )
        )
    )
    supplier = supp_res.scalar_one_or_none()

    if not supplier:
        # Check by substring email
        supp_by_email = await db.execute(select(Supplier).where(Supplier.email.ilike(f"%{username_clean}%")))
        supplier = supp_by_email.scalar_one_or_none()

    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Supplier account with Partner ID or Email '{username_clean}' not found.",
        )

    # Check approval status
    if not supplier.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Supplier account '{supplier.name}' (# {supplier.supplier_code}) is pending administrator activation. Please contact the Plant Administrator to approve & issue credentials.",
        )

    # Verify password (checks custom password, temporary password with 6h expiry, or default dev fallback)
    is_valid, err_msg, requires_pwd_change = verify_supplier_login(
        supplier_code=supplier.supplier_code,
        password_attempt=password_clean,
    )

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=err_msg or "Invalid username or password.",
        )

    # Find or link User entity
    usr_res = await db.execute(select(User).where(User.supplier_id == supplier.id))
    usr = usr_res.scalar_one_or_none()
    user_id = str(usr.id) if usr else str(uuid.uuid4())

    return LoginResponse(
        success=True,
        message=f"Logged in as {supplier.name}",
        token=f"jwt-supplier-{supplier.supplier_code}",
        user=UserProfileResponse(
            id=user_id,
            email=supplier.email,
            full_name=supplier.name,
            role="SUPPLIER",
            company_id=str(COMPANY_ID),
            company_name="Sirio Ltd",
            company_code="SIRIO",
            supplier_id=str(supplier.id),
            supplier_code=supplier.supplier_code,
            supplier_name=supplier.name,
            is_active=True,
            requires_password_change=requires_pwd_change,
            permissions=ROLE_PERMISSIONS.get("SUPPLIER", []),
        ),
    )


@router.post("/change-password")
async def change_password(payload: ChangePasswordRequest):
    """
    Allow supplier to update their temporary password to a permanent password.
    """
    success, msg = change_supplier_password(
        supplier_code_or_email=payload.supplier_code_or_email,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}


@router.get("/suppliers", response_model=list[SupplierSummary])
async def list_auth_suppliers(db: AsyncSession = Depends(get_db)):
    """
    List available supplier logins with order statistics for the login portal.
    """
    stmt = select(Supplier).where(Supplier.supplier_code != "0000058376").order_by(Supplier.supplier_code)
    res = await db.execute(stmt)
    suppliers = res.scalars().all()

    items = []
    for s in suppliers:
        # Count orders
        count_stmt = select(func.count()).select_from(PurchaseOrder).where(PurchaseOrder.supplier_id == s.id)
        count_res = await db.execute(count_stmt)
        total_orders = count_res.scalar_one() or 0

        items.append(
            SupplierSummary(
                id=str(s.id),
                supplier_code=s.supplier_code,
                name=s.name,
                email=s.email,
                contact_name=s.contact_name,
                country=s.country,
                total_orders=total_orders,
            )
        )

    return items
