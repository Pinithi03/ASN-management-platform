"""
FastAPI Application Factory.
"""

import asyncio
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.exceptions import AppException, app_exception_handler
from app.core.middleware import RequestIDMiddleware, LoggingMiddleware
from app.api.v1.router import api_router


from app.db.auto_migrate import apply_migrations_and_seed


async def _continuous_imap_poller() -> None:
    """
    Continuous background loop that polls IMAP every 30 seconds.
    Fetches unread emails, parses them with the multi-parser engine (XML/HTML/MIXED),
    and persists them to PostgreSQL + MinIO without requiring Celery.
    """
    import asyncio
    from app.email.imap_client import IMAPClient, IMAPConfig
    from app.email.mime_decoder import decode
    from app.email.classifier import classify
    from app.email.parsers import parse
    from app.services.email_service import process_and_save
    from app.db.session import async_session_factory
    from app.models.email_message import EmailRecord
    from sqlalchemy import select

    settings = get_settings()
    while True:
        try:
            if settings.IMAP_USERNAME and settings.IMAP_PASSWORD:
                config = IMAPConfig(
                    host=settings.IMAP_HOST,
                    port=settings.IMAP_PORT,
                    username=settings.IMAP_USERNAME,
                    password=settings.IMAP_PASSWORD,
                    mailbox=settings.IMAP_MAILBOX,
                    use_ssl=settings.IMAP_USE_SSL,
                )

                def _fetch_unread():
                    with IMAPClient(config) as client:
                        return client.fetch_unread(limit=20)

                raw_emails = await asyncio.to_thread(_fetch_unread)
                if raw_emails:
                    print(f"[IMAP Poller] Detected {len(raw_emails)} new email(s) in inbox. Processing...")
                    async with async_session_factory() as db:
                        for raw in raw_emails:
                            try:
                                decoded = decode(raw.raw)
                                # Filter non-order system messages (e.g. Google security alerts)
                                if "google" in decoded.from_address.lower() or "alert" in (decoded.subject or "").lower():
                                    continue

                                # Skip duplicates
                                if decoded.message_id:
                                    dup = await db.execute(
                                        select(EmailRecord).where(EmailRecord.message_id == decoded.message_id)
                                    )
                                    if dup.scalar_one_or_none():
                                        continue

                                cls = classify(decoded)
                                pos = parse(decoded, cls)
                                res = await process_and_save(
                                    db,
                                    decoded,
                                    cls,
                                    pos,
                                    settings.DEFAULT_COMPANY_ID or "00000000-0000-0000-0000-000000000001",
                                )
                                print(f"[IMAP Poller] Successfully saved & parsed email: {decoded.subject} (POs: {len(pos)})")
                            except Exception as err:
                                print(f"[IMAP Poller] Error processing incoming email: {err}")
        except Exception as e:
            # Keep loop resilient
            pass

        await asyncio.sleep(settings.EMAIL_POLL_INTERVAL_SECONDS or 30)


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

    # Start continuous background IMAP email poller
    poller_task = asyncio.create_task(_continuous_imap_poller())

    try:
        yield
    finally:
        poller_task.cancel()
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
