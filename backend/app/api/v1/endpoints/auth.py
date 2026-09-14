"""
Authentication and Role Management API Endpoints.
Supports both Plant Administrator login and Supplier Partner ID login.
"""

from __future__ import annotations

import uuid
from typing import Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.company import Company
from app.models.supplier import Supplier
from app.models.user import User
from app.models.purchase_order import PurchaseOrder

router = APIRouter()

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEFAULT_PASSWORD = "Abc123@#"


class LoginRequest(BaseModel):
    username: str
    password: str


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
    Authenticate user via Partner ID or Admin username.
    Default system password: Abc123@#
    """
    username_clean = req.username.strip()
    if req.password != DEFAULT_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password. (Default password is: Abc123@#)",
        )

    # 1. Admin login
    if username_clean.lower() in ["admin", "admin@oniverse.com", "admin@sirio.lk"]:
        admin_res = await db.execute(select(User).where(User.keycloak_id == "kc-admin-001"))
        admin_user = admin_res.scalar_one_or_none()

        user_id = str(admin_user.id) if admin_user else str(uuid.uuid4())
        return LoginResponse(
            success=True,
            message="Logged in as Plant Administrator",
            token=f"jwt-admin-{user_id}",
            user=UserProfileResponse(
                id=user_id,
                email="admin@oniverse.com",
                full_name="Plant Administrator",
                role="COMPANY_ADMIN",
                company_id=str(COMPANY_ID),
                company_name="Sirio Ltd / Oniverse",
                company_code="SIRIO",
                supplier_id=None,
                supplier_code=None,
                supplier_name=None,
                is_active=True,
            ),
        )

    # 2. Supplier Partner ID login
    # Clean partner id (e.g. '18194' -> '0000018194')
    partner_id = username_clean.lstrip("0").zfill(10)

    supp_res = await db.execute(select(Supplier).where(Supplier.supplier_code == partner_id))
    supplier = supp_res.scalar_one_or_none()

    if not supplier:
        # Check by email or name substring if not matched by code
        supp_by_email = await db.execute(select(Supplier).where(Supplier.email.ilike(f"%{username_clean}%")))
        supplier = supp_by_email.scalar_one_or_none()

    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Supplier account with Partner ID or Email '{username_clean}' not found.",
        )

    # Find or create user entity
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
        ),
    )


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
