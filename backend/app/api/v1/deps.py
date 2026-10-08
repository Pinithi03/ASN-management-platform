"""
FastAPI dependencies for authentication and authorization.

Every protected endpoint uses these:
  - get_current_user : verifies the JWT and returns a CurrentUser
  - require_permission : checks the user has specific permissions
  - require_admin : shortcut for admin-only endpoints
  - get_db : yields a database session (re-exported from db.session)

Supplier scoping: the supplier_id ALWAYS comes from the token,
never from query strings or request bodies. No endpoint may let
a supplier choose whose data they see.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.security import decode_access_token
from app.db.session import get_db  # noqa: F401 — re-exported for endpoints
from app.models.enums import UserRole, ROLE_PERMISSIONS

# ---------------------------------------------------------------------------
# Bearer token extractor (auto_error=False so we return 401, not 403)
# ---------------------------------------------------------------------------
_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# CurrentUser — the identity every endpoint receives
# ---------------------------------------------------------------------------
class CurrentUser(BaseModel):
    keycloak_id: str
    username: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    role: UserRole                      # ADMIN or SUPPLIER
    supplier_id: Optional[uuid.UUID] = None
    supplier_code: Optional[str] = None
    permissions: frozenset[str]

    class Config:
        frozen = True


# ---------------------------------------------------------------------------
# get_current_user — the core auth dependency
# ---------------------------------------------------------------------------
async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> CurrentUser:
    """
    Verify the access token and build a CurrentUser from its claims.

    Sets request.state.user so downstream code (middleware, logging)
    can access the identity without re-parsing the token.
    """
    if creds is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = await run_in_threadpool(decode_access_token, creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="token_expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=401,
            detail="invalid_token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # --- Determine role ---
    held_roles = set(claims.get("realm_access", {}).get("roles", []))

    if UserRole.SUPER_ADMIN.value in held_roles:
        role = UserRole.SUPER_ADMIN
    elif UserRole.ADMIN.value in held_roles:
        role = UserRole.ADMIN
    elif UserRole.SUPPLIER.value in held_roles:
        role = UserRole.SUPPLIER
        if not claims.get("supplier_id"):
            raise HTTPException(
                status_code=403,
                detail="Supplier account is not linked to a supplier",
            )
    else:
        raise HTTPException(
            status_code=403,
            detail="No portal role assigned",
        )

    # --- Build the user ---
    supplier_id_raw = claims.get("supplier_id") if role is UserRole.SUPPLIER else None
    user = CurrentUser(
        keycloak_id=claims["sub"],
        username=claims.get("preferred_username"),
        email=claims.get("email"),
        name=claims.get("name"),
        role=role,
        supplier_id=uuid.UUID(supplier_id_raw) if supplier_id_raw else None,
        supplier_code=claims.get("supplier_code") if role is UserRole.SUPPLIER else None,
        permissions=frozenset(ROLE_PERMISSIONS[role.value]),
    )

    request.state.user = user
    return user


# ---------------------------------------------------------------------------
# Permission checks
# ---------------------------------------------------------------------------
def require_permission(*needed: str):
    """
    Dependency factory: the user must hold ALL listed permissions.
    ADMIN has "*" which passes everything.
    """
    async def _check(
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if "*" in user.permissions:
            return user
        if set(needed) <= user.permissions:
            return user
        raise HTTPException(
            status_code=403,
            detail=f"Missing permission: {', '.join(needed)}",
        )
    return _check


# Shortcut for admin-only endpoints
require_admin = require_permission("*")
