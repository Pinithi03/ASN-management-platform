"""
Unit tests for Handling Unit (HU) service and sequence generation.
"""

import uuid
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_factory
from app.models.supplier import Supplier
from app.models.hu_sequence import HUSequence
from app.services.hu_service import (
    format_hu_number,
    generate_hu_numbers,
    generate_batch_hu,
    sync_hu_sequence_max,
)


@pytest.fixture
async def test_supplier():
    """Fixture that creates and yields a temporary supplier, cleaning it up afterwards."""
    unique_code = f"T{uuid.uuid4().hex[:8]}"
    supp = Supplier(
        id=uuid.uuid4(),
        supplier_code=unique_code,
        name=f"Test Supplier {unique_code}",
        email=f"test_{unique_code}@supplier.com",
    )
    async with async_session_factory() as session:
        session.add(supp)
        await session.commit()

    yield supp

    async with async_session_factory() as session:
        # Delete HUSequence first, then Supplier
        seq = (await session.execute(
            select(HUSequence).where(HUSequence.supplier_id == supp.id)
        )).scalar_one_or_none()
        if seq:
            await session.delete(seq)
        s = (await session.execute(
            select(Supplier).where(Supplier.id == supp.id)
        )).scalar_one_or_none()
        if s:
            await session.delete(s)
        await session.commit()


@pytest.mark.asyncio
async def test_format_hu_number():
    """Test standard 20-digit Calzedonia SSCC HU number formatting."""
    # Prefix '1' + 9-digit supplier code + 10-digit serial number
    hu = format_hu_number("0000058376", 1)
    assert len(hu) == 20
    assert hu == "10000583760000000001"
    assert hu.startswith("1000058376")
    assert hu.endswith("0000000001")

    # Supplier code without leading zeros
    hu2 = format_hu_number("58376", 42)
    assert hu2 == "10000583760000000042"

    # High serial number
    hu3 = format_hu_number("12345", 9999999999)
    assert hu3 == "10000123459999999999"
    assert len(hu3) == 20


@pytest.mark.asyncio
async def test_generate_hu_numbers_sequential(test_supplier):
    """Test that generate_hu_numbers allocates contiguous, sequential numbers."""
    async with async_session_factory() as session:
        # First batch of 5 numbers (serials 1..5)
        batch1 = await generate_hu_numbers(
            db=session,
            supplier_id=test_supplier.id,
            supplier_code=test_supplier.supplier_code,
            count=5,
        )
        await session.commit()

    assert len(batch1) == 5
    for i, hu in enumerate(batch1, start=1):
        assert hu.endswith(str(i).zfill(10))

    async with async_session_factory() as session:
        # Second batch of 3 numbers (serials 6..8)
        batch2 = await generate_hu_numbers(
            db=session,
            supplier_id=test_supplier.id,
            supplier_code=test_supplier.supplier_code,
            count=3,
        )
        await session.commit()

    assert len(batch2) == 3
    for i, hu in enumerate(batch2, start=6):
        assert hu.endswith(str(i).zfill(10))

    # Verify final last_number in database
    async with async_session_factory() as session:
        seq = (await session.execute(
            select(HUSequence).where(HUSequence.supplier_id == test_supplier.id)
        )).scalar_one()
        assert seq.last_number == 8


@pytest.mark.asyncio
async def test_generate_hu_numbers_zero_count(test_supplier):
    """Test that count <= 0 returns an empty list without incrementing sequence."""
    async with async_session_factory() as session:
        res_zero = await generate_hu_numbers(
            db=session,
            supplier_id=test_supplier.id,
            supplier_code=test_supplier.supplier_code,
            count=0,
        )
        res_neg = await generate_hu_numbers(
            db=session,
            supplier_id=test_supplier.id,
            supplier_code=test_supplier.supplier_code,
            count=-3,
        )
        await session.commit()

    assert res_zero == []
    assert res_neg == []


@pytest.mark.asyncio
async def test_sync_hu_sequence_max(test_supplier):
    """Test syncing the sequence counter to a given maximum value."""
    async with async_session_factory() as session:
        # Advance to 100
        val1 = await sync_hu_sequence_max(session, test_supplier.id, 100)
        await session.commit()
    assert val1 == 100

    async with async_session_factory() as session:
        # Lower value does not downgrade
        val2 = await sync_hu_sequence_max(session, test_supplier.id, 50)
        await session.commit()
    assert val2 == 100

    async with async_session_factory() as session:
        # Higher value updates
        val3 = await sync_hu_sequence_max(session, test_supplier.id, 250)
        await session.commit()
    assert val3 == 250

    async with async_session_factory() as session:
        # Next generation continues from 251
        hus = await generate_hu_numbers(
            db=session,
            supplier_id=test_supplier.id,
            supplier_code=test_supplier.supplier_code,
            count=2,
        )
        await session.commit()

    assert len(hus) == 2
    assert hus[0].endswith("0000000251")
    assert hus[1].endswith("0000000252")


@pytest.mark.asyncio
async def test_rollback_preserves_sequence_state(test_supplier):
    """
    Test that if a transaction fails or rolls back after generating HU numbers,
    the sequence number is NOT permanently incremented and rolls back cleanly.
    """
    # 1. Establish initial committed state at sequence = 5
    async with async_session_factory() as session:
        await generate_hu_numbers(
            db=session,
            supplier_id=test_supplier.id,
            supplier_code=test_supplier.supplier_code,
            count=5,
        )
        await session.commit()

    # 2. Start a transaction, generate numbers 6..10, then ROLL BACK
    async with async_session_factory() as session:
        uncommitted_hus = await generate_hu_numbers(
            db=session,
            supplier_id=test_supplier.id,
            supplier_code=test_supplier.supplier_code,
            count=5,
        )
        assert len(uncommitted_hus) == 5
        assert uncommitted_hus[0].endswith("0000000006")
        # Explicit rollback simulating an unhandled error or validation failure
        await session.rollback()

    # 3. Verify in a fresh session that last_number is still 5
    async with async_session_factory() as session:
        seq = (await session.execute(
            select(HUSequence).where(HUSequence.supplier_id == test_supplier.id)
        )).scalar_one()
        assert seq.last_number == 5

    # 4. Next successful transaction receives 6..10 as expected (no gaps)
    async with async_session_factory() as session:
        next_hus = await generate_hu_numbers(
            db=session,
            supplier_id=test_supplier.id,
            supplier_code=test_supplier.supplier_code,
            count=5,
        )
        await session.commit()

    assert len(next_hus) == 5
    assert next_hus[0].endswith("0000000006")
    assert next_hus[4].endswith("0000000010")
