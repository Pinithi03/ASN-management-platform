"""
Handling Unit (HU) number generator service.

Generates 20-digit Calzedonia standard HU numbers:
  Prefix '1' + supplier_code (9 digits, zero-padded) + running_number (10 digits, zero-padded) = 20 digits

Uses SELECT ... FOR UPDATE on the HUSequence table for concurrency-safe atomicity.
"""

from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hu_sequence import HUSequence
from app.models.supplier import Supplier

logger = logging.getLogger(__name__)


def format_hu_number(supplier_code: str, running_number: int) -> str:
    """
    Format a 20-digit Calzedonia Handling Unit number.
    Formula: 1 + supplier_code (9 digits zero-padded) + running_number (10 digits zero-padded)
    """
    clean_code = supplier_code.lstrip("0")
    padded_prefix = f"1{clean_code.zfill(9)}"
    return f"{padded_prefix}{str(running_number).zfill(10)}"


async def generate_hu_numbers(
    db: AsyncSession,
    supplier_id: uuid.UUID,
    supplier_code: str,
    count: int,
) -> List[str]:
    """
    Atomically generates `count` sequential 20-digit HU numbers for a supplier.

    Uses row-level locking (SELECT ... FOR UPDATE) within the caller's active
    database transaction to ensure strict concurrency safety:
    - Multiple concurrent requests for the same supplier are serialized by the row lock.
    - If the transaction fails and is rolled back, the sequence remains uncorrupted.
    - New sequence records are initialized atomically using ON CONFLICT DO NOTHING.

    Parameters
    ----------
    db : AsyncSession
        Active database session (must be within transaction).
    supplier_id : uuid.UUID
        Supplier database UUID.
    supplier_code : str
        Calzedonia partner code (e.g. '0000058376').
    count : int
        Number of HU numbers to allocate.

    Returns
    -------
    List[str]
        List of 20-digit numeric strings.
    """
    if count <= 0:
        return []

    # 1. Ensure the sequence row exists atomically without race conditions.
    try:
        insert_stmt = (
            pg_insert(HUSequence)
            .values(supplier_id=supplier_id, last_number=0)
            .on_conflict_do_nothing(index_elements=["supplier_id"])
        )
        await db.execute(insert_stmt)
    except Exception:
        # Fallback for SQLite or non-PostgreSQL dialects in isolated unit tests
        try:
            async with db.begin_nested():
                db.add(HUSequence(supplier_id=supplier_id, last_number=0))
                await db.flush()
        except Exception:
            pass

    # 2. Acquire exclusive row-level lock using SELECT ... FOR UPDATE.
    # Concurrent transactions requesting HUs for this supplier will block here
    # until the locking transaction finishes (commits or rolls back).
    select_stmt = (
        select(HUSequence)
        .where(HUSequence.supplier_id == supplier_id)
        .with_for_update()
    )
    result = await db.execute(select_stmt)
    seq = result.scalar_one_or_none()

    if seq is None:
        # Fallback if dialect didn't support upsert and begin_nested didn't flush
        seq = HUSequence(supplier_id=supplier_id, last_number=0)
        db.add(seq)
        await db.flush()
        result = await db.execute(select_stmt)
        seq = result.scalar_one()

    # 3. Increment sequence and flush to the active transaction
    start = seq.last_number
    seq.last_number = start + count
    await db.flush()

    # 4. Generate formatted 20-digit Calzedonia HU numbers
    hu_numbers = [
        format_hu_number(supplier_code, start + i)
        for i in range(1, count + 1)
    ]

    return hu_numbers


async def sync_hu_sequence_max(
    db: AsyncSession,
    supplier_id: uuid.UUID,
    max_serial: int,
) -> int:
    """
    Atomically updates the supplier's sequence counter to at least `max_serial`
    using row-level locking (SELECT ... FOR UPDATE).
    Useful when a supplier provides pre-assigned HU numbers (e.g., from Excel).
    """
    if max_serial <= 0:
        return 0

    try:
        insert_stmt = (
            pg_insert(HUSequence)
            .values(supplier_id=supplier_id, last_number=max_serial)
            .on_conflict_do_nothing(index_elements=["supplier_id"])
        )
        await db.execute(insert_stmt)
    except Exception:
        try:
            async with db.begin_nested():
                db.add(HUSequence(supplier_id=supplier_id, last_number=max_serial))
                await db.flush()
        except Exception:
            pass

    stmt = (
        select(HUSequence)
        .where(HUSequence.supplier_id == supplier_id)
        .with_for_update()
    )
    result = await db.execute(stmt)
    seq = result.scalar_one_or_none()

    if seq is None:
        seq = HUSequence(supplier_id=supplier_id, last_number=max_serial)
        db.add(seq)
        await db.flush()
        result = await db.execute(stmt)
        seq = result.scalar_one()

    if max_serial > seq.last_number:
        seq.last_number = max_serial
        await db.flush()

    return seq.last_number


async def generate_batch_hu(
    session: AsyncSession,
    supplier_code: str,
    count: int,
    company_id: Optional[uuid.UUID] = None,
    supplier_id: Optional[uuid.UUID] = None,
) -> List[str]:
    """
    Convenience wrapper for generating a batch of HU numbers.
    Resolves supplier_id from supplier_code if not explicitly provided.
    """
    if count <= 0:
        return []

    if supplier_id is None:
        clean_code = supplier_code.strip()
        supp_stmt = select(Supplier.id).where(
            (Supplier.supplier_code == clean_code)
            | (Supplier.supplier_code == clean_code.lstrip("0"))
        )
        res = await session.execute(supp_stmt)
        found_id = res.scalar_one_or_none()
        if found_id:
            supplier_id = found_id
        else:
            supplier_id = uuid.uuid5(uuid.NAMESPACE_DNS, supplier_code)

    return await generate_hu_numbers(
        db=session,
        supplier_id=supplier_id,
        supplier_code=supplier_code,
        count=count,
    )
