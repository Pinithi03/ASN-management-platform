# backend/app/services/audit_service.py
"""
Audit Service — centralized helper for appending immutable audit log entries.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


async def create_audit_log(
    db: AsyncSession,
    company_id: str,
    action: str,
    entity_type: str,
    user_id: Optional[str] = None,
    entity_id: Optional[str] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    metadata: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AuditLog:
    """
    Append an immutable entry to the audit_logs table.

    Parameters
    ----------
    db : AsyncSession
    company_id : str
        Company/plant UUID context.
    action : str
        e.g. 'CREATE', 'UPDATE', 'DELETE', 'EMAIL_REPROCESSED', 'SUPPLIER_REGISTERED', 'CONFIG_CHANGED'
    entity_type : str
        e.g. 'SUPPLIER', 'CONFIG', 'EMAIL', 'USER', 'PURCHASE_ORDER', 'SHIPMENT'
    user_id : str, optional
    entity_id : str, optional
    old_values : dict, optional
    new_values : dict, optional
    metadata : dict, optional
    ip_address : str, optional
    user_agent : str, optional

    Returns
    -------
    AuditLog
    """
    # Parse company_id
    parsed_company_id = UUID(company_id) if isinstance(company_id, str) else company_id

    # Parse user_id safely
    parsed_user_id = None
    if user_id:
        if isinstance(user_id, UUID):
            parsed_user_id = user_id
        elif isinstance(user_id, str):
            try:
                parsed_user_id = UUID(user_id)
            except ValueError:
                parsed_user_id = None

    # Parse entity_id safely (store non-UUID codes like 'SUP-001' in metadata_)
    parsed_entity_id = None
    merged_metadata = dict(metadata) if metadata else {}

    if entity_id:
        if isinstance(entity_id, UUID):
            parsed_entity_id = entity_id
        elif isinstance(entity_id, str):
            try:
                parsed_entity_id = UUID(entity_id)
            except ValueError:
                parsed_entity_id = None
                merged_metadata.setdefault("entity_code", entity_id)

    log_entry = AuditLog(
        company_id=parsed_company_id,
        user_id=parsed_user_id,
        action=action.upper(),
        entity_type=entity_type.upper(),
        entity_id=parsed_entity_id,
        old_values=old_values,
        new_values=new_values,
        metadata_=merged_metadata,
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=datetime.now(timezone.utc),
    )

    db.add(log_entry)
    await db.flush()
    logger.info(
        "Audit Log Recorded: action=%s, entity_type=%s, entity_id=%s, company_id=%s",
        action, entity_type, entity_id, company_id
    )
    return log_entry
