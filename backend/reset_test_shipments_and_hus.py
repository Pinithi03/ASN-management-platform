"""
Safe Test Data Reset & HU Sequence Purge Utility.

Cleans all test shipments, packing slips, carton handling units, and ASN records.
Restores all affected Purchase Orders to ACTIVE with 100% open balance.
Resets HU sequences to 0 and unlocks supplier HU setup so testing or production
can start from a completely clean slate.

Usage:
    python reset_test_shipments_and_hus.py [--supplier 0000018194 | --all] [--confirm]

Examples:
    # Dry-run inspection for Coats Thread:
    python reset_test_shipments_and_hus.py --supplier 0000018194

    # Execute safe reset for Coats Thread:
    python reset_test_shipments_and_hus.py --supplier 0000018194 --confirm

    # Full clean reset for ALL test shipments across the system:
    python reset_test_shipments_and_hus.py --all --confirm
"""

import argparse
import asyncio
import sys
import uuid
from typing import Optional, List

from sqlalchemy import select, delete, func
from app.db.session import async_session_factory
from app.models.supplier import Supplier
from app.models.hu_sequence import HUSequence
from app.models.shipment import Shipment
from app.models.shipment_line import ShipmentLine
from app.models.packing_slip import PackingSlip
from app.models.asn import ASNRecord
from app.models.purchase_order import PurchaseOrder
from app.services.po_service import update_po_statuses


async def perform_reset(supplier_code: Optional[str] = None, confirm: bool = False) -> None:
    async with async_session_factory() as db:
        print("\n" + "=" * 65)
        print("   SAFE TEST SHIPMENTS & HU SEQUENCE RESET UTILITY")
        print("=" * 65)

        target_supp_id: Optional[uuid.UUID] = None
        target_supp_name: str = "ALL SUPPLIERS"

        if supplier_code and supplier_code.upper() != "ALL":
            code_clean = supplier_code.strip()
            supp_res = await db.execute(
                select(Supplier).where(
                    (Supplier.supplier_code == code_clean)
                    | (Supplier.supplier_code == code_clean.zfill(10))
                    | (Supplier.supplier_code == code_clean.lstrip("0"))
                )
            )
            supp = supp_res.scalar_one_or_none()
            if not supp:
                print(f"❌ Error: Supplier with code '{supplier_code}' not found in database.")
                sys.exit(1)
            target_supp_id = supp.id
            target_supp_name = f"{supp.name} ({supp.supplier_code})"

        print(f"Scope: {target_supp_name}")
        print(f"Mode : {'EXECUTION (CONFIRMED)' if confirm else 'DRY RUN (INSPECTION ONLY)'}\n")

        # 1. Identify shipments to delete
        shipment_stmt = select(Shipment)
        if target_supp_id:
            shipment_stmt = shipment_stmt.where(Shipment.supplier_id == target_supp_id)
        
        shipments_res = await db.execute(shipment_stmt)
        shipments = shipments_res.scalars().all()
        shipment_ids = [s.id for s in shipments]

        # 2. Count associated records
        total_slips = 0
        total_lines = 0
        total_asns = 0
        affected_pos = set()

        if shipment_ids:
            slips_stmt = select(PackingSlip).where(PackingSlip.shipment_id.in_(shipment_ids))
            slips = (await db.execute(slips_stmt)).scalars().all()
            total_slips = len(slips)

            lines_stmt = select(ShipmentLine).where(ShipmentLine.shipment_id.in_(shipment_ids))
            lines = (await db.execute(lines_stmt)).scalars().all()
            total_lines = len(lines)
            for l in lines:
                if l.po_number:
                    affected_pos.add(l.po_number.strip())

            asns_stmt = select(ASNRecord).where(ASNRecord.shipment_id.in_(shipment_ids))
            asns = (await db.execute(asns_stmt)).scalars().all()
            total_asns = len(asns)

        # 3. Identify suppliers whose HU sequences will be reset
        supp_stmt = select(Supplier)
        if target_supp_id:
            supp_stmt = supp_stmt.where(Supplier.id == target_supp_id)
        suppliers_res = await db.execute(supp_stmt)
        suppliers_to_reset = suppliers_res.scalars().all()

        print("--- Inspection Summary ---")
        print(f"• Shipments to delete   : {len(shipments)}")
        print(f"• Packing Slips (HUs)   : {total_slips}")
        print(f"• Shipment Lines        : {total_lines}")
        print(f"• ASN XML Records       : {total_asns}")
        print(f"• Affected POs to restore: {len(affected_pos)} ({', '.join(sorted(affected_pos)) if affected_pos else 'None'})")
        print(f"• Suppliers to unlock   : {len(suppliers_to_reset)}")
        print("-" * 30)

        if not confirm:
            print("\n⚠️  DRY RUN ONLY — No changes were made to the database.")
            print("To execute this reset, run the command again with --confirm:")
            if supplier_code and supplier_code.upper() != "ALL":
                print(f"  python reset_test_shipments_and_hus.py --supplier {supplier_code} --confirm")
            else:
                print("  python reset_test_shipments_and_hus.py --all --confirm")
            print("=" * 65 + "\n")
            return

        # ─── EXECUTE CLEANUP ───
        print("\nExecuting database cleanup...")

        if shipment_ids:
            # Delete ASNs
            await db.execute(delete(ASNRecord).where(ASNRecord.shipment_id.in_(shipment_ids)))
            print("  ✓ Deleted ASN XML records")

            # Delete Packing Slips
            await db.execute(delete(PackingSlip).where(PackingSlip.shipment_id.in_(shipment_ids)))
            print("  ✓ Deleted carton Packing Slips & HUs")

            # Delete Shipment Lines
            await db.execute(delete(ShipmentLine).where(ShipmentLine.shipment_id.in_(shipment_ids)))
            print("  ✓ Deleted Shipment Lines")

            # Delete Shipments
            await db.execute(delete(Shipment).where(Shipment.id.in_(shipment_ids)))
            print("  ✓ Deleted Shipments")

        # Recalculate affected POs back to ACTIVE and 100% open balance
        if affected_pos:
            await update_po_statuses(db, list(affected_pos))
            print(f"  ✓ Restored {len(affected_pos)} POs back to ACTIVE with open balances")

        # Reset HUSequence and unlock Supplier profile
        for s in suppliers_to_reset:
            # Reset atomic sequence tracker
            seq_stmt = select(HUSequence).where(HUSequence.supplier_id == s.id)
            seq_res = await db.execute(seq_stmt)
            seq = seq_res.scalar_one_or_none()
            if seq:
                seq.last_number = 0
            else:
                db.add(HUSequence(supplier_id=s.id, last_number=0))

            # Unlock supplier profile so they can configure fresh starting HU
            s.current_hu_number = None
            s.hu_locked = False
            print(f"  ✓ Reset & Unlocked HU sequence for {s.name} ({s.supplier_code})")

        await db.commit()
        print("\n✅ SUCCESS: Database has been cleanly reset!")
        print("   - All test shipments and carton HUs removed.")
        print("   - Purchase Orders restored to 100% open balance.")
        print("   - Next generated HU will start from 1 (or the supplier's freshly configured starting number).")
        print("=" * 65 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Safe reset of test shipments and HU sequences.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--supplier", type=str, help="Supplier code to reset (e.g. 0000018194)")
    group.add_argument("--all", action="store_true", help="Reset ALL test shipments across the system")
    parser.add_argument("--confirm", action="store_true", help="Confirm execution of database deletion")

    args = parser.parse_args()
    supp = None if args.all else args.supplier

    asyncio.run(perform_reset(supplier_code=supp, confirm=args.confirm))


if __name__ == "__main__":
    main()
