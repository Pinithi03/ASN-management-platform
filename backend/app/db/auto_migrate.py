"""
Automatic database migration and initialization runner.

Executes Alembic migrations up to 'head' on FastAPI application startup,
and optionally populates initial development seed data if the database is empty.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time

from alembic import command
from alembic.config import Config
from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.session import async_session_factory
from app.models.company import Company

logger = logging.getLogger("app.db.auto_migrate")


def get_alembic_config_path() -> str:
    """Resolve the absolute path to alembic.ini."""
    # Check current directory
    if os.path.exists("alembic.ini"):
        return os.path.abspath("alembic.ini")

    # Check backend directory or /app
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    alembic_ini_path = os.path.join(backend_root, "alembic.ini")
    if os.path.exists(alembic_ini_path):
        return alembic_ini_path

    # Fallback default
    return "alembic.ini"


def run_alembic_upgrade(max_retries: int = 5, retry_delay: float = 2.0) -> None:
    """
    Execute alembic upgrade head synchronously.
    Retries gracefully if the database is still initializing on boot.
    """
    ini_path = get_alembic_config_path()
    logger.info("Checking database migrations using: %s", ini_path)
    alembic_cfg = Config(ini_path)

    for attempt in range(1, max_retries + 1):
        try:
            command.upgrade(alembic_cfg, "head")
            logger.info("Database schema is up to date (alembic upgrade head complete).")
            return
        except Exception as exc:
            if attempt < max_retries:
                logger.warning(
                    "Migration attempt %d/%d failed: %s. Retrying in %.1fs...",
                    attempt,
                    max_retries,
                    exc,
                    retry_delay,
                )
                time.sleep(retry_delay)
            else:
                logger.error("Database migration failed after %d attempts: %s", max_retries, exc)
                raise


async def auto_seed_if_empty() -> None:
    """
    Populates development seed data if the database is completely fresh (no companies found).
    """
    settings = get_settings()
    env = getattr(settings, "ENVIRONMENT", "").lower()
    if env not in ("development", "dev", "test"):
        return

    try:
        async with async_session_factory() as session:
            count = await session.scalar(select(func.count()).select_from(Company))
            if count == 0:
                logger.info("Empty database detected (0 companies). Running initial development seed...")
                from app.db.seed import seed_database

                await seed_database()
                logger.info("Initial development seed applied successfully.")
            else:
                logger.debug("Database already contains %d company record(s). Skipping seed.", count)
    except Exception as exc:
        logger.warning("Auto-seed check encountered an issue (non-fatal): %s", exc)


async def apply_migrations_and_seed() -> None:
    """
    Async entrypoint called during FastAPI lifespan startup.
    Runs Alembic migrations in a worker thread, then checks/runs initial seed.
    """
    logger.info("Starting automatic database migration check...")
    await asyncio.to_thread(run_alembic_upgrade)
    await auto_seed_if_empty()
