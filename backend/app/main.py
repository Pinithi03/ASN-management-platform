"""
FastAPI Application Factory.
"""

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.exceptions import AppException, app_exception_handler
from app.core.middleware import RequestIDMiddleware, LoggingMiddleware
from app.api.v1.router import api_router


from app.db.auto_migrate import apply_migrations_and_seed


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application startup and shutdown events."""
    # Startup
    settings = get_settings()
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"Environment: {settings.ENVIRONMENT}")

    # Auto-migrate database tables & seed initial development data
    try:
        await apply_migrations_and_seed()
    except Exception as exc:
        print(f"ERROR during database auto-migration: {exc}")
        raise exc

    yield
    # Shutdown
    print("Shutting down...")


def create_app() -> FastAPI:
    """Application factory — creates and configures the FastAPI app."""
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Email Automation & ASN Management Platform for Oniverse Group",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # Exception handlers
    app.add_exception_handler(AppException, app_exception_handler)

    # Middleware (order matters — outermost first)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RequestIDMiddleware)

    # Mount API v1 router
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_app()
