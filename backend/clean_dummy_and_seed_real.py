import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select, delete, text
from app.db.session import async_session_factory
from app.models.company import Company
from app.models.supplier import Supplier
from app.models.client import Client
from app.models.purchase_order import PurchaseOrder
from app.models.email_message import EmailRecord

PRIMARY_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
CALZEDONIA_HUB_ID = uuid.UUID("00000000-0000-0000-0000-000000058376")
COATS_SUPPLIER_ID = uuid.UUID("074830fc-dc21-42bb-9877-e6b6a45790a5")
CALZEDONIA_CLIENT_ID = uuid.UUID("00000000-0000-0000-0000-000000000101")

async def clean_and_seed():
    async with async_session_factory() as db:
        print("Cleaning dummy data...")

        # 1. Delete dummy POs
        dummy_pos = ["PMA-2026-0567", "ADI-2026-0892", "NKE-2026-1450"]
        for po_num in dummy_pos:
            await db.execute(delete(PurchaseOrder).where(PurchaseOrder.po_number == po_num))
        print("Dummy POs deleted.")

        # 2. Delete dummy emails
        dummy_emails = ["msg-002-nike@sirio.lk", "msg-003-adidas@sirio.lk", "msg-005-puma@sirio.lk"]
        for mid in dummy_emails:
            await db.execute(delete(EmailRecord).where(EmailRecord.message_id == mid))
        print("Dummy email records deleted.")

        # 3. Delete dummy clients
        dummy_clients = ["NIKE", "ADIDAS", "PUMA"]
        for cl_code in dummy_clients:
            await db.execute(delete(Client).where(Client.client_code == cl_code))
        print("Dummy clients deleted.")

        # 4. Ensure Calzedonia client exists
        calz_cl = await db.scalar(select(Client).where(Client.client_code == "CALZEDONIA"))
        if not calz_cl:
            calz_cl = Client(
                id=CALZEDONIA_CLIENT_ID,
                company_id=PRIMARY_COMPANY_ID,
                client_code="CALZEDONIA",
                client_name="Calzedonia Group (Oniverse)",
                is_active=True,
            )
            db.add(calz_cl)
            await db.flush()

        # 5. Seed Real Calzedonia POs
        real_pos = [
            {
                "po_number": "2001330500",
                "client_id": calz_cl.id,
                "client_code": "CALZEDONIA",
                "supplier_id": CALZEDONIA_HUB_ID,
                "style_number": "ELST1K 00016",
                "description": "Elastic Tape 15mm Black (Calzedonia Standard)",
                "quantity": 2600,
                "unit_price": Decimal("0.8500"),
                "total_value": Decimal("2210.00"),
                "currency": "EUR",
                "delivery_date": date(2025, 9, 22),
                "ship_date": date(2025, 9, 15),
                "destination": "SIRIO Plant - Badalgama",
                "status": "ACTIVE",
                "version": 1,
                "extra_data": {
                    "items": [
                        {
                            "line_number": "00500-0001",
                            "material_code": "ELST1K 00016",
                            "partner_code": "SK104546-006.0-62123",
                            "description": "Elastic Tape 15mm Black",
                            "color": "BLACK 000",
                            "size": "M",
                            "uom": "M",
                            "quantity": 2600,
                            "unit_price": 0.85,
                        }
                    ]
                },
            },
            {
                "po_number": "2001297727",
                "client_id": calz_cl.id,
                "client_code": "CALZEDONIA",
                "supplier_id": CALZEDONIA_HUB_ID,
                "style_number": "ELST1K 000615",
                "description": "Elastic Tape 15mm (Calzedonia Order ZA6A)",
                "quantity": 245,
                "unit_price": Decimal("0.8500"),
                "total_value": Decimal("208.25"),
                "currency": "EUR",
                "delivery_date": date(2025, 4, 22),
                "ship_date": date(2025, 4, 18),
                "destination": "SIRIO Plant - Katunayake",
                "status": "ACTIVE",
                "version": 1,
                "extra_data": {
                    "items": [
                        {
                            "line_number": "01800-0001",
                            "material_code": "ELST1K 000615",
                            "partner_code": "SK104546-015.0-61851",
                            "description": "Elastic Tape 15mm Special Black",
                            "color": "BLACK 000",
                            "size": "M",
                            "uom": "M",
                            "quantity": 245,
                            "unit_price": 0.85,
                        }
                    ]
                },
            },
            {
                "po_number": "2001318025",
                "client_id": calz_cl.id,
                "client_code": "CALZEDONIA",
                "supplier_id": CALZEDONIA_HUB_ID,
                "style_number": "TBST06 0006000",
                "description": "Fabric Tape Tubular (Calzedonia Order ZA6A)",
                "quantity": 600,
                "unit_price": Decimal("1.2000"),
                "total_value": Decimal("720.00"),
                "currency": "EUR",
                "delivery_date": date(2025, 5, 10),
                "ship_date": date(2025, 5, 2),
                "destination": "SIRIO Plant - Badalgama",
                "status": "ACTIVE",
                "version": 1,
                "extra_data": {
                    "items": [
                        {
                            "line_number": "00100-0001",
                            "material_code": "TBST06 0006000",
                            "partner_code": "SF105061-009.0-61851",
                            "description": "Tubular Fabric Tape Natural",
                            "color": "NATURAL 000",
                            "size": "M",
                            "uom": "M",
                            "quantity": 600,
                            "unit_price": 1.20,
                        }
                    ]
                },
            },
            {
                "po_number": "2001317985",
                "client_id": calz_cl.id,
                "client_code": "CALZEDONIA",
                "supplier_id": CALZEDONIA_HUB_ID,
                "style_number": "ELST1D J32410",
                "description": "Elastic Waistband Tape (Calzedonia Standard)",
                "quantity": 638,
                "unit_price": Decimal("1.1500"),
                "total_value": Decimal("733.70"),
                "currency": "EUR",
                "delivery_date": date(2025, 5, 15),
                "ship_date": date(2025, 5, 8),
                "destination": "SIRIO Plant - Katunayake",
                "status": "ACTIVE",
                "version": 1,
                "extra_data": {
                    "items": [
                        {
                            "line_number": "00200-0001",
                            "material_code": "ELST1D J32410",
                            "partner_code": "SW052646-010.0-66491",
                            "description": "Elastic Waistband Tape White",
                            "color": "WHITE 001",
                            "size": "M",
                            "uom": "M",
                            "quantity": 638,
                            "unit_price": 1.15,
                        }
                    ]
                },
            },
        ]

        for po_dict in real_pos:
            stmt = select(PurchaseOrder).where(
                PurchaseOrder.company_id == PRIMARY_COMPANY_ID,
                PurchaseOrder.po_number == po_dict["po_number"]
            )
            existing = await db.scalar(stmt)
            if existing:
                existing.style_number = po_dict["style_number"]
                existing.description = po_dict["description"]
                existing.quantity = po_dict["quantity"]
                existing.unit_price = po_dict["unit_price"]
                existing.total_value = po_dict["total_value"]
                existing.currency = po_dict["currency"]
                existing.delivery_date = po_dict["delivery_date"]
                existing.ship_date = po_dict["ship_date"]
                existing.destination = po_dict["destination"]
                existing.extra_data = po_dict["extra_data"]
                existing.status = "ACTIVE"
                print(f"Updated PO: {existing.po_number}")
            else:
                new_po = PurchaseOrder(
                    id=uuid.uuid4(),
                    company_id=PRIMARY_COMPANY_ID,
                    **po_dict
                )
                db.add(new_po)
                print(f"Created real PO: {new_po.po_number}")

        # Real Calzedonia Inbound EDI Email records
        real_emails = [
            {
                "message_id": "<edi-calz-2001330500@oniverse-group.com>",
                "from_address": "edi@calzedonia.com",
                "to_address": "orders@sirio.lk",
                "subject": "PO #2001330500 Transmission — Elastic Tape 15mm (SdDataSlice XML)",
                "body_text": "Calzedonia SdDataSlice EDI transmission for PO 2001330500. Quantity: 2600 M.",
                "direction": "INBOUND",
                "status": "PARSED",
                "email_type": "XML_ATTACHMENT",
                "received_at": datetime(2025, 4, 22, 16, 29, tzinfo=timezone.utc),
            },
            {
                "message_id": "<edi-calz-2001297727@oniverse-group.com>",
                "from_address": "edi@calzedonia.com",
                "to_address": "orders@sirio.lk",
                "subject": "PO #2001297727 Transmission — Elastic Tape 15mm (SdDataSlice XML)",
                "body_text": "Calzedonia SdDataSlice EDI transmission for PO 2001297727. Quantity: 245 M.",
                "direction": "INBOUND",
                "status": "PARSED",
                "email_type": "XML_ATTACHMENT",
                "received_at": datetime(2025, 4, 21, 14, 56, tzinfo=timezone.utc),
            },
            {
                "message_id": "<edi-calz-2001318025@oniverse-group.com>",
                "from_address": "edi@calzedonia.com",
                "to_address": "orders@sirio.lk",
                "subject": "PO #2001318025 Transmission — Tubular Tape (SdDataSlice XML)",
                "body_text": "Calzedonia SdDataSlice EDI transmission for PO 2001318025. Quantity: 600 M.",
                "direction": "INBOUND",
                "status": "PARSED",
                "email_type": "XML_ATTACHMENT",
                "received_at": datetime(2025, 5, 2, 10, 15, tzinfo=timezone.utc),
            },
            {
                "message_id": "<edi-calz-2001317985@oniverse-group.com>",
                "from_address": "edi@calzedonia.com",
                "to_address": "orders@sirio.lk",
                "subject": "PO #2001317985 Transmission — Waistband Tape (SdDataSlice XML)",
                "body_text": "Calzedonia SdDataSlice EDI transmission for PO 2001317985. Quantity: 638 M.",
                "direction": "INBOUND",
                "status": "PARSED",
                "email_type": "XML_ATTACHMENT",
                "received_at": datetime(2025, 5, 5, 11, 30, tzinfo=timezone.utc),
            },
        ]

        for e_dict in real_emails:
            e_stmt = select(EmailRecord).where(
                EmailRecord.company_id == PRIMARY_COMPANY_ID,
                EmailRecord.message_id == e_dict["message_id"]
            )
            existing_e = await db.scalar(e_stmt)
            if not existing_e:
                new_e = EmailRecord(
                    id=uuid.uuid4(),
                    company_id=PRIMARY_COMPANY_ID,
                    supplier_id=CALZEDONIA_HUB_ID,
                    **e_dict
                )
                db.add(new_e)
                print(f"Created real email record: {e_dict['subject']}")

        await db.commit()
        print("Database cleanup & real Calzedonia data seed completed successfully!")

asyncio.run(clean_and_seed())
