"""
Integration tests for concurrent Handling Unit (HU) sequence generation.
Verifies that database row-level locking (SELECT ... FOR UPDATE) prevents race conditions,
duplicate assignments, or state corruption under concurrent workloads.
"""

import asyncio
import uuid
import pytest
from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.supplier import Supplier
from app.models.hu_sequence import HUSequence
from app.services.hu_service import generate_hu_numbers


@pytest.fixture
async def concurrent_test_supplier():
    """Create a temporary supplier for concurrency testing with a 9-digit partner code."""
    unique_code = f"9{uuid.uuid4().hex[:7]}"
    supp = Supplier(
        id=uuid.uuid4(),
        supplier_code=unique_code,
        name=f"Concurrency Test Supplier {unique_code}",
        email=f"conc_{unique_code}@test.com",
    )
    async with async_session_factory() as session:
        session.add(supp)
        await session.commit()

    yield supp

    async with async_session_factory() as session:
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
async def test_concurrent_hu_generation_uniqueness(concurrent_test_supplier):
    """
    Launch 10 concurrent workers simultaneously requesting 10 HU numbers each (100 total).
    Verifies that SELECT ... FOR UPDATE serializes access such that:
    1. Zero duplicate HU numbers are produced.
    2. Exactly 100 unique HU numbers are generated.
    3. The allocated sequence numbers form a contiguous set from 1 to 100 with no gaps.
    4. The database last_number equals 100.
    """
    supplier_id = concurrent_test_supplier.id
    supplier_code = concurrent_test_supplier.supplier_code
    num_workers = 10
    batch_size = 10
    total_expected = num_workers * batch_size

    async def worker(worker_id: int):
        async with async_session_factory() as session:
            hus = await generate_hu_numbers(
                db=session,
                supplier_id=supplier_id,
                supplier_code=supplier_code,
                count=batch_size,
            )
            await session.commit()
            return hus

    # Run all workers concurrently
    results = await asyncio.gather(*[worker(i) for i in range(num_workers)])

    # Flatten results
    all_hus = [hu for batch in results for hu in batch]

    assert len(all_hus) == total_expected, f"Expected {total_expected} HUs, got {len(all_hus)}"

    # Check for uniqueness across concurrent tasks
    unique_hus = set(all_hus)
    assert len(unique_hus) == total_expected, (
        f"Duplicate HU numbers detected! Unique: {len(unique_hus)}, Total: {total_expected}"
    )

    # Extract the 10-digit numeric serial part from each 20-digit HU
    serials = set()
    for hu in all_hus:
        assert len(hu) == 20, f"HU number {hu} is not 20 digits"
        serial = int(hu[10:])
        serials.add(serial)

    # Assert that serials form an unbroken contiguous range [1, 2, ..., 100]
    expected_serials = set(range(1, total_expected + 1))
    assert serials == expected_serials, (
        f"Gaps or invalid serials detected. Missing: {expected_serials - serials}"
    )

    # Verify database state
    async with async_session_factory() as session:
        seq = (await session.execute(
            select(HUSequence).where(HUSequence.supplier_id == supplier_id)
        )).scalar_one()
        assert seq.last_number == total_expected


@pytest.mark.asyncio
async def test_concurrent_first_time_initialization(concurrent_test_supplier):
    """
    Simulate multiple concurrent requests hitting a supplier that has NO HUSequence record yet.
    Ensures ON CONFLICT DO NOTHING prevents UniqueViolation / IntegrityError.
    """
    supplier_id = concurrent_test_supplier.id
    supplier_code = concurrent_test_supplier.supplier_code
    num_workers = 5
    batch_size = 5

    async def worker(worker_id: int):
        async with async_session_factory() as session:
            hus = await generate_hu_numbers(
                db=session,
                supplier_id=supplier_id,
                supplier_code=supplier_code,
                count=batch_size,
            )
            await session.commit()
            return hus

    results = await asyncio.gather(*[worker(i) for i in range(num_workers)])
    all_hus = [hu for batch in results for hu in batch]

    assert len(all_hus) == num_workers * batch_size
    assert len(set(all_hus)) == num_workers * batch_size


@pytest.mark.asyncio
async def test_concurrent_with_interleaved_rollbacks(concurrent_test_supplier):
    """
    Test concurrent requests where some transactions commit and some roll back.
    Verifies that rolled-back transactions release the lock and do not corrupt the sequence.
    """
    supplier_id = concurrent_test_supplier.id
    supplier_code = concurrent_test_supplier.supplier_code

    async def committing_worker():
        async with async_session_factory() as session:
            hus = await generate_hu_numbers(
                db=session,
                supplier_id=supplier_id,
                supplier_code=supplier_code,
                count=5,
            )
            await session.commit()
            return hus

    async def rolling_back_worker():
        async with async_session_factory() as session:
            try:
                await generate_hu_numbers(
                    db=session,
                    supplier_id=supplier_id,
                    supplier_code=supplier_code,
                    count=5,
                )
                # Simulate error before commit
                raise RuntimeError("Simulated transaction failure")
            except RuntimeError:
                await session.rollback()
                return []

    # Execute a mix of committing and failing transactions
    tasks = [
        committing_worker(),
        rolling_back_worker(),
        committing_worker(),
        rolling_back_worker(),
        committing_worker(),
    ]
    results = await asyncio.gather(*tasks)

    # 3 committing workers * 5 = 15 committed HUs
    committed_hus = [hu for batch in results for hu in batch if batch]
    assert len(committed_hus) == 15
    assert len(set(committed_hus)) == 15

    # Check database state equals 15
    async with async_session_factory() as session:
        seq = (await session.execute(
            select(HUSequence).where(HUSequence.supplier_id == supplier_id)
        )).scalar_one()
        assert seq.last_number == 15
