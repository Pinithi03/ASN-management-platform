"""
Handling Unit (HU) number generator service.

Generates 20-digit Calzedonia standard HU numbers:
  Prefix '1' + supplier_code (9 digits, zero-padded) + running_number (10 digits, zero-padded) = 20 digits

Uses SELECT ... FOR UPDATE on the HUSequence table for concurrency-safe atomicity.
"""

from __future__ import annotations

import uuid
from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hu_sequence import HUSequence


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

    # Acquire row lock for this supplier's sequence
    stmt = (
        select(HUSequence)
        .where(HUSequence.supplier_id == supplier_id)
        .with_for_update()
    )
    result = await db.execute(stmt)
    seq = result.scalar_one_or_none()

    if seq is None:
        # Create sequence record if first time
        seq = HUSequence(supplier_id=supplier_id, last_number=0)
        db.add(seq)
        await db.flush()

        # Re-query with lock
        result = await db.execute(stmt)
        seq = result.scalar_one_or_none()

    start = seq.last_number
    seq.last_number = start + count
    await db.flush()

    hu_numbers = [
        format_hu_number(supplier_code, start + i)
        for i in range(1, count + 1)
    ]

    return hu_numbers


async def generate_batch_hu(
    session: AsyncSession,
    supplier_code: str,
    count: int,
    company_id: Optional[uuid.UUID] = None,
    supplier_id: Optional[uuid.UUID] = None,
) -> List[str]:
    """
    Convenience wrapper for generating a batch of HU numbers.
    """
    if supplier_id is None:
        supplier_id = uuid.uuid5(uuid.NAMESPACE_DNS, supplier_code)

    return await generate_hu_numbers(
        db=session,
        supplier_id=supplier_id,
        supplier_code=supplier_code,
        count=count,
    )

