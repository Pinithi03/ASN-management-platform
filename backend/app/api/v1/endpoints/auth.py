"""
Authentication endpoints.

Login itself is handled entirely by Keycloak — the React app redirects
to the Keycloak login page. This router provides:

  GET /auth/me — returns the logged-in user's profile, role, permissions
                  and supplier info. Called once by the frontend after login.
                  Also upserts the users table row (just-in-time sync).

  PATCH /auth/me/preferences — saves the user's portal language to the
                  Keycloak `locale` attribute (and the supplier record).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.v1.deps import CurrentUser, get_current_user, get_db
from app.core.exceptions import CodedHTTPException
from app.core.languages import DEFAULT_LANGUAGE, Language, normalise_language, to_keycloak_locale
from app.models.enums import ROLE_PERMISSIONS
from app.models.supplier import Supplier
from app.models.user import User
from app.services.keycloak_admin import set_user_locale

router = APIRouter()


async def _find_supplier(db: AsyncSession, user: CurrentUser) -> Optional[Supplier]:
    """The supplier record of a SUPPLIER user (by code first, then id)."""
    if user.role.value != "SUPPLIER":
        return None
    if user.supplier_code:
        res = await db.execute(select(Supplier).where(Supplier.supplier_code == user.supplier_code))
        supp = res.scalar_one_or_none()
        if supp:
            return supp
    if user.supplier_id:
        res = await db.execute(select(Supplier).where(Supplier.id == user.supplier_id))
        return res.scalar_one_or_none()
    return None


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------
class MeResponse(BaseModel):
    keycloak_id: str
    email: Optional[str]
    name: Optional[str]
    role: str
    permissions: list[str]
    supplier_id: Optional[str] = None
    supplier_code: Optional[str] = None
    supplier_name: Optional[str] = None
    language: Language = DEFAULT_LANGUAGE


class PreferencesRequest(BaseModel):
    language: Language


class PreferencesResponse(BaseModel):
    language: Language


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------
@router.get("/me", response_model=MeResponse)
async def get_me(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the current user's profile and permissions.

    Also upserts the local users table: creates a row on first login,
    updates email/name/last_login on every login. This keeps the users
    table useful for joins and the admin UI without a separate sync job.
    """
    # --- Resolve supplier from database if SUPPLIER ---
    supplier_id = user.supplier_id
    supplier_name = None
    supp = await _find_supplier(db, user)
    if user.role.value == "SUPPLIER":
        if supp:
            supplier_id = supp.id
            supplier_name = supp.name
        else:
            supplier_id = None

    # Language: the Keycloak `locale` claim wins; the supplier record is the fallback
    language = (
        normalise_language(user.locale)
        or normalise_language(supp.preferred_language if supp else None)
        or DEFAULT_LANGUAGE
    )

    # --- Upsert the users row ---
    result = await db.execute(
        select(User).where(User.keycloak_id == user.keycloak_id)
    )
    db_user = result.scalar_one_or_none()

    display_name = user.name or supplier_name or user.email

    if db_user is None:
        db_user = User(
            keycloak_id=user.keycloak_id,
            email=user.email or "",
            full_name=display_name,
            role=user.role.value,
            supplier_id=supplier_id,
            last_login_at=datetime.now(timezone.utc),
        )
        db.add(db_user)
    else:
        db_user.email = user.email or db_user.email
        db_user.full_name = display_name or db_user.full_name
        db_user.role = user.role.value
        db_user.supplier_id = supplier_id
        db_user.last_login_at = datetime.now(timezone.utc)

    await db.flush()

    return MeResponse(
        keycloak_id=user.keycloak_id,
        email=user.email,
        name=display_name,
        role=user.role.value,
        permissions=list(ROLE_PERMISSIONS[user.role.value]),
        supplier_id=str(supplier_id) if supplier_id else None,
        supplier_code=user.supplier_code,
        supplier_name=supplier_name,
        language=language,
    )


# ---------------------------------------------------------------------------
# PATCH /auth/me/preferences
# ---------------------------------------------------------------------------
@router.patch("/me/preferences", response_model=PreferencesResponse)
async def update_my_preferences(
    body: PreferencesRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save the user's portal language.

    Keycloak's `locale` attribute is the source of truth (it drives the login pages
    and the `locale` token claim); suppliers also get it on their record, which the
    welcome email and other server-side texts use.
    """
    saved = await run_in_threadpool(set_user_locale, user.keycloak_id, to_keycloak_locale(body.language))
    if not saved:
        raise CodedHTTPException(
            status_code=502,
            detail="Could not save the language to your account. Please try again.",
            code="LANGUAGE_SAVE_FAILED",
        )

    supp = await _find_supplier(db, user)
    if supp:
        supp.preferred_language = body.language
        await db.flush()

    return PreferencesResponse(language=body.language)
