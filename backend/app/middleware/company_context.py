"""
RLS (Row-Level Security) context middleware.

Sets PostgreSQL session variables on every request so that
RLS policies can enforce tenant isolation at the database level.

The middleware reads the authenticated user's company_id, role,
and (for suppliers) supplier_id from the request state — which
is set by the auth dependency after JWT validation — and injects
them as SET LOCAL variables into the current database transaction.

Three variables are set:
  app.current_company_id  — UUID of the user's company/plant
  app.current_role        — 'COMPANY_ADMIN' or 'SUPPLIER'
  app.current_supplier_id — UUID of the supplier (SUPPLIER only)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from starlette.types import ASGIApp


# ---------------------------------------------------------------------------
# Low-level helper: set RLS context on an existing session
# ---------------------------------------------------------------------------

async def set_rls_context(
    session: AsyncSession,
    company_id: str,
    role: str,
    supplier_id: str | None = None,
) -> None:
    """
    Set the RLS context variables for this database session.
    Called at the start of every request after JWT validation.

    Uses SET LOCAL so the variables are scoped to the current
    transaction and automatically cleared on commit/rollback.
    """
    await session.execute(
        text("SET LOCAL app.current_company_id = :company_id"),
        {"company_id": company_id},
    )
    await session.execute(
        text("SET LOCAL app.current_role = :role"),
        {"role": role},
    )
    if supplier_id:
        await session.execute(
            text("SET LOCAL app.current_supplier_id = :supplier_id"),
            {"supplier_id": supplier_id},
        )


# ---------------------------------------------------------------------------
# ASGI middleware (optional — can also be used as a FastAPI dependency)
# ---------------------------------------------------------------------------

class CompanyContextMiddleware(BaseHTTPMiddleware):
    """
    Starlette middleware that sets RLS context variables after
    authentication has placed user info on request.state.

    Expected request.state attributes (set by auth dependency):
      - request.state.company_id: str   (UUID as string)
      - request.state.role: str         ('COMPANY_ADMIN' or 'SUPPLIER')
      - request.state.supplier_id: str | None
      - request.state.db: AsyncSession  (the active DB session)

    If these are not present (e.g. unauthenticated endpoints like
    /health), the middleware passes through without setting context.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Only set context if auth has run and placed attributes
        company_id = getattr(request.state, "company_id", None)
        role = getattr(request.state, "role", None)
        db = getattr(request.state, "db", None)

        if company_id and role and db:
            supplier_id = getattr(request.state, "supplier_id", None)
            await set_rls_context(
                session=db,
                company_id=str(company_id),
                role=role,
                supplier_id=str(supplier_id) if supplier_id else None,
            )

        return await call_next(request)
