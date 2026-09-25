"""
Database Seeding Script.
Populates initial development data:
- Companies (Sirio, Incas, Radon, GePi, Intimissimi)
- Suppliers (Coats Thread, Hayleys Fabric, South Asia Textiles, Calzedonia Central Hub)
- Supplier Plant associations
- Clients (Calzedonia, Nike, Adidas, Puma)
- Users (Plant Administrator, Supplier Users)
- Purchase Orders with line items
- Email Records
- Shipments & ASN Records
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.company import Company
from app.models.supplier import Supplier
from app.models.supplier_plant import SupplierPlant
from app.models.client import Client
from app.models.user import User
from app.models.purchase_order import PurchaseOrder
from app.models.email_message import EmailRecord
from app.models.shipment import Shipment
from app.models.asn import ASNRecord

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")

PRIMARY_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
COATS_SUPPLIER_ID = uuid.UUID("074830fc-dc21-42bb-9877-e6b6a45790a5")
HAYLEYS_SUPPLIER_ID = uuid.UUID("00000000-0000-0000-0000-000000001122")
SOUTH_ASIA_SUPPLIER_ID = uuid.UUID("00000000-0000-0000-0000-000000080589")
CALZEDONIA_HUB_SUPPLIER_ID = uuid.UUID("00000000-0000-0000-0000-000000058376")
CALZEDONIA_HUB_ID = CALZEDONIA_HUB_SUPPLIER_ID


async def seed_database() -> None:
    logger.info("Starting database seed...")

    async with async_session_factory() as db:
        # 1. Companies
        companies_data = [
            {
                "id": PRIMARY_COMPANY_ID,
                "code": "SIRIO",
                "name": "Sirio S.r.l.",
                "imap_port": 993,
                "imap_folder": "INBOX",
                "imap_poll_interval_seconds": 120,
                "imap_use_ssl": True,
                "smtp_port": 587,
                "smtp_use_tls": True,
                "is_active": True,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000002"),
                "code": "INCAS",
                "name": "Incas S.p.A.",
                "imap_port": 993,
                "imap_folder": "INBOX",
                "imap_poll_interval_seconds": 120,
                "imap_use_ssl": True,
                "smtp_port": 587,
                "smtp_use_tls": True,
                "is_active": True,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000003"),
                "code": "RADON",
                "name": "Radon S.r.l.",
                "imap_port": 993,
                "imap_folder": "INBOX",
                "imap_poll_interval_seconds": 120,
                "imap_use_ssl": True,
                "smtp_port": 587,
                "smtp_use_tls": True,
                "is_active": True,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000004"),
                "code": "GEPI",
                "name": "GePi S.r.l.",
                "imap_port": 993,
                "imap_folder": "INBOX",
                "imap_poll_interval_seconds": 120,
                "imap_use_ssl": True,
                "smtp_port": 587,
                "smtp_use_tls": True,
                "is_active": True,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000005"),
                "code": "INTIM",
                "name": "Intimissimi Plant",
                "imap_port": 993,
                "imap_folder": "INBOX",
                "imap_poll_interval_seconds": 120,
                "imap_use_ssl": True,
                "smtp_port": 587,
                "smtp_use_tls": True,
                "is_active": True,
            },
        ]

        for c_data in companies_data:
            existing = await db.execute(select(Company).where(Company.id == c_data["id"]))
            if not existing.scalar_one_or_none():
                db.add(Company(**c_data))
        await db.commit()
        logger.info("Companies seeded.")

        # 2. Suppliers
        suppliers_data = [
            {
                "id": COATS_SUPPLIER_ID,
                "supplier_code": "0000018194",
                "name": "COATS THREAD EXPORTS (PRIVATE) LIMITED",
                "email": "coats.exports@supplier.com",
                "contact_name": "Duminda Silva",
                "phone": "+94 11 249 1100",
                "address": "144/2, Kaduwela Road, Malabe",
                "country": "Sri Lanka",
                "is_active": True,
            },
            {
                "id": HAYLEYS_SUPPLIER_ID,
                "supplier_code": "0000001122",
                "name": "HAYLEYS FABRIC PLC",
                "email": "hayleys.fabric@supplier.com",
                "contact_name": "Rohan Fernando",
                "phone": "+94 34 229 7100",
                "address": "Narthupana Estate, Neboda",
                "country": "Sri Lanka",
                "is_active": True,
            },
            {
                "id": SOUTH_ASIA_SUPPLIER_ID,
                "supplier_code": "0000080589",
                "name": "SOUTH ASIA TEXTILES (PRIVATE) LIMITED",
                "email": "southasia.textiles@supplier.com",
                "contact_name": "Pradeep Kumara",
                "phone": "+94 11 482 1000",
                "address": "Pugoda, Western Province",
                "country": "Sri Lanka",
                "is_active": True,
            },
            {
                "id": CALZEDONIA_HUB_SUPPLIER_ID,
                "supplier_code": "0000058376",
                "name": "CALZEDONIA CENTRAL HUB",
                "email": "edi@calzedonia.com",
                "contact_name": "EDI Operations",
                "phone": "+39 045 860 4111",
                "address": "Via Monte Baldo 20, Dossobuono di Villafranca, Verona",
                "country": "Italy",
                "is_active": True,
            },
        ]

        for s_data in suppliers_data:
            existing = await db.execute(select(Supplier).where(Supplier.id == s_data["id"]))
            if not existing.scalar_one_or_none():
                db.add(Supplier(**s_data))
        await db.commit()
        logger.info("Suppliers seeded.")

        # 3. Supplier Plants
        for s_data in suppliers_data:
            existing_sp = await db.execute(
                select(SupplierPlant).where(
                    SupplierPlant.supplier_id == s_data["id"],
                    SupplierPlant.company_id == PRIMARY_COMPANY_ID,
                )
            )
            if not existing_sp.scalar_one_or_none():
                db.add(
                    SupplierPlant(
                        id=uuid.uuid4(),
                        supplier_id=s_data["id"],
                        company_id=PRIMARY_COMPANY_ID,
                        plant_code="1001",
                        is_active=True,
                    )
                )
        await db.commit()
        logger.info("Supplier plants linked.")

        # 4. Clients
        clients_data = [
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000101"),
                "company_id": PRIMARY_COMPANY_ID,
                "client_code": "CALZEDONIA",
                "client_name": "Calzedonia Group (Oniverse)",
                "is_active": True,
            },
        ]

        for cl_data in clients_data:
            existing = await db.execute(select(Client).where(Client.id == cl_data["id"]))
            if not existing.scalar_one_or_none():
                db.add(Client(**cl_data))
        await db.commit()
        logger.info("Clients seeded.")

        # 5. Users
        users_data = [
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000099"),
                "company_id": PRIMARY_COMPANY_ID,
                "keycloak_id": "kc-admin-001",
                "email": "admin@oniverse.com",
                "full_name": "Kasun Perera (Plant Administrator)",
                "role": "COMPANY_ADMIN",
                "supplier_id": None,
                "is_active": True,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000098"),
                "company_id": PRIMARY_COMPANY_ID,
                "keycloak_id": "kc-supplier-001",
                "email": "coats.exports@supplier.com",
                "full_name": "Duminda Silva (Coats Exports)",
                "role": "SUPPLIER",
                "supplier_id": COATS_SUPPLIER_ID,
                "is_active": True,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000097"),
                "company_id": PRIMARY_COMPANY_ID,
                "keycloak_id": "kc-supplier-002",
                "email": "hayleys.fabric@supplier.com",
                "full_name": "Rohan Fernando (Hayleys)",
                "role": "SUPPLIER",
                "supplier_id": HAYLEYS_SUPPLIER_ID,
                "is_active": True,
            },
        ]

        for u_data in users_data:
            existing = await db.execute(select(User).where(User.id == u_data["id"]))
            if not existing.scalar_one_or_none():
                db.add(User(**u_data))
        await db.commit()
        logger.info("Users seeded.")

        # 6. Email Records
        emails_data = [
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000201"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": COATS_SUPPLIER_ID,
                "message_id": "msg-001-coats@sirio.lk",
                "from_address": "coats.exports@supplier.com",
                "to_address": "orders@sirio.lk",
                "subject": "PO #2001297727 Confirmation — Elastic Tape 15mm",
                "body_text": "Please find attached order confirmation for PO 2001297727. Total quantity: 12,000 M.",
                "direction": "INBOUND",
                "status": "PARSED",
                "email_type": "PO",
                "received_at": datetime(2026, 9, 10, 8, 30, tzinfo=timezone.utc),
                "processed_at": datetime(2026, 9, 10, 8, 31, tzinfo=timezone.utc),
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000202"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": COATS_SUPPLIER_ID,
                "message_id": "msg-002-nike@sirio.lk",
                "from_address": "orders@nike.com",
                "to_address": "purchasing@sirio.lk",
                "subject": "PO #NKE-2026-1450 — Men's Running Shorts DRI-FIT",
                "body_text": "Please find attached Purchase Order NKE-2026-1450 for 8,000 units of Men's Running Shorts.",
                "direction": "INBOUND",
                "status": "PARSED",
                "email_type": "PO",
                "received_at": datetime(2026, 9, 11, 14, 20, tzinfo=timezone.utc),
                "processed_at": datetime(2026, 9, 11, 14, 21, tzinfo=timezone.utc),
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000203"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": COATS_SUPPLIER_ID,
                "message_id": "msg-003-adidas@sirio.lk",
                "from_address": "supply-chain@adidas.com",
                "to_address": "purchasing@sirio.lk",
                "subject": "Updated PO #ADI-2026-0892 — Women's Track Jacket",
                "body_text": "Revised quantities for PO ADI-2026-0892. Delivery schedule October 10th.",
                "direction": "INBOUND",
                "status": "REVIEW",
                "email_type": "PO_UPDATE",
                "received_at": datetime(2026, 9, 12, 10, 15, tzinfo=timezone.utc),
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000204"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": COATS_SUPPLIER_ID,
                "message_id": "msg-004-asn-ack@sirio.lk",
                "from_address": "purchasing@sirio.lk",
                "to_address": "coats.exports@supplier.com",
                "subject": "ASN XML Acceptance — Shipment SHP-2026-0018194-01",
                "body_text": "Calzedonia SdDataSlice XML verified and committed for shipment SHP-2026-0018194-01.",
                "direction": "OUTBOUND",
                "status": "COMMITTED",
                "email_type": "ASN_CONFIRM",
                "received_at": datetime(2026, 9, 14, 16, 45, tzinfo=timezone.utc),
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000205"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": HAYLEYS_SUPPLIER_ID,
                "message_id": "msg-005-puma@sirio.lk",
                "from_address": "procurement@puma.com",
                "to_address": "purchasing@sirio.lk",
                "subject": "PO #PMA-2026-0567 — Essentials Logo Tee Fabric",
                "body_text": "New PO for 20,000 meters fabric. Please review schedule.",
                "direction": "INBOUND",
                "status": "QUEUED",
                "email_type": "PO",
                "received_at": datetime(2026, 9, 15, 7, 10, tzinfo=timezone.utc),
            },
        ]

        for e_data in emails_data:
            existing = await db.execute(select(EmailRecord).where(EmailRecord.id == e_data["id"]))
            if not existing.scalar_one_or_none():
                db.add(EmailRecord(**e_data))
        await db.commit()
        logger.info("Email records seeded.")

        # 7. Purchase Orders
        pos_data = [
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000301"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": COATS_SUPPLIER_ID,
                "client_id": uuid.UUID("00000000-0000-0000-0000-000000000101"),
                "client_code": "CALZEDONIA",
                "source_email_id": uuid.UUID("00000000-0000-0000-0000-000000000201"),
                "po_number": "2001297727",
                "style_number": "ELST1K",
                "description": "Elastic tape 15mm black (Calzedonia Standard)",
                "quantity": 12000,
                "unit_price": Decimal("0.8500"),
                "total_value": Decimal("10200.00"),
                "currency": "EUR",
                "delivery_date": date(2026, 10, 20),
                "ship_date": date(2026, 10, 5),
                "destination": "SIRIO Plant 1 - Katunayake",
                "status": "ACTIVE",
                "version": 1,
                "extra_data": {
                    "items": [
                        {
                            "line_number": "00100",
                            "material_code": "ELST1K 000615",
                            "description": "Elastic tape 15mm black",
                            "quantity": 6000,
                            "uom": "M",
                            "unit_price": 0.85,
                        },
                        {
                            "line_number": "00200",
                            "material_code": "ELST1K 000616",
                            "description": "Elastic tape 20mm white",
                            "quantity": 6000,
                            "uom": "M",
                            "unit_price": 0.85,
                        },
                    ]
                },
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000302"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": CALZEDONIA_HUB_ID,
                "client_id": uuid.UUID("00000000-0000-0000-0000-000000000101"),
                "client_code": "Sirio Ltd",
                "source_email_id": None,
                "po_number": "2001330500",
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
                "id": uuid.UUID("00000000-0000-0000-0000-000000000303"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": CALZEDONIA_HUB_ID,
                "client_id": uuid.UUID("00000000-0000-0000-0000-000000000101"),
                "client_code": "CALZEDONIA",
                "source_email_id": None,
                "po_number": "2001318025",
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
                "id": uuid.UUID("00000000-0000-0000-0000-000000000304"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": CALZEDONIA_HUB_ID,
                "client_id": uuid.UUID("00000000-0000-0000-0000-000000000101"),
                "client_code": "CALZEDONIA",
                "source_email_id": None,
                "po_number": "2001317985",
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
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000305"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": HAYLEYS_SUPPLIER_ID,
                "client_id": uuid.UUID("00000000-0000-0000-0000-000000000101"),
                "client_code": "Benji Ltd",
                "source_email_id": None,
                "po_number": "2001611117",
                "style_number": "TYHL60 BU9R000",
                "description": "ART.OBICOS36 COTON, AZZURRO CAMICIA, 000",
                "quantity": 280,
                "unit_price": Decimal("8.3200"),
                "total_value": Decimal("2329.60"),
                "currency": "USD",
                "delivery_date": date(2026, 9, 24),
                "ship_date": None,
                "destination": "NARTHUPANA ESTATE",
                "status": "ACTIVE",
                "version": 1,
                "extra_data": {
                    "items": [
                        {
                            "line_number": "00100-0001",
                            "material_code": "TYHL60 BU9R000",
                            "partner_code": "ART.OBICOS36 COTON, AZZURRO CAMICIA",
                            "description": "ART.OBICOS36 COTON, AZZURRO CAMICIA, 000",
                            "color": "",
                            "size": "M",
                            "uom": "M",
                            "quantity": 280,
                            "unit_price": 8.32,
                        }
                    ]
                },
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000306"),
                "company_id": PRIMARY_COMPANY_ID,
                "supplier_id": HAYLEYS_SUPPLIER_ID,
                "client_id": uuid.UUID("00000000-0000-0000-0000-000000000101"),
                "client_code": "Alpha Apparels Ltd",
                "source_email_id": None,
                "po_number": "2001608736",
                "style_number": "TYHL50 R2GC001",
                "description": "ART. BJCOS555, VERDE SCURO, 001",
                "quantity": 4230,
                "unit_price": Decimal("4.4100"),
                "total_value": Decimal("18666.40"),
                "currency": "USD",
                "delivery_date": date(2026, 10, 10),
                "ship_date": None,
                "destination": "NARTHUPANA ESTATE",
                "status": "UPDATED",
                "version": 2,
                "extra_data": {
                    "items": [
                        {
                            "line_number": "00300-0001",
                            "material_code": "TYHL50 R2GC001",
                            "partner_code": "AR.BJCOS555",
                            "description": "ART. BJCOS555, VERDE SCURO, 001",
                            "color": "VERDE SCURO",
                            "size": "M",
                            "uom": "M",
                            "quantity": 2900,
                            "unit_price": 4.5,
                        },
                        {
                            "line_number": "00100-0001",
                            "material_code": "TYHL0004 0001000",
                            "partner_code": "AR.BJCOS555",
                            "description": "ART. BJCOS555, BIANCO, 000",
                            "color": "BIANCO",
                            "size": "M",
                            "uom": "M",
                            "quantity": 100,
                            "unit_price": 4.0,
                        },
                        {
                            "line_number": "00400-0001",
                            "material_code": "TYHL54 R2GC001",
                            "partner_code": "ART.RCOS411",
                            "description": "ART. RCOS411, VERDE SCURO, 001",
                            "color": "VERDE SCURO",
                            "size": "M",
                            "uom": "M",
                            "quantity": 120,
                            "unit_price": 6.47,
                        },
                        {
                            "line_number": "00200-0001",
                            "material_code": "TYHL0004 C837000",
                            "partner_code": "AR.BJCOS555",
                            "description": "ART. BJCOS555, DARK GREY, 000",
                            "color": "DARK GREY",
                            "size": "M",
                            "uom": "M",
                            "quantity": 1110,
                            "unit_price": 4.0,
                        },
                    ]
                },
            },
        ]

        for po_data in pos_data:
            existing = await db.execute(
                select(PurchaseOrder).where(
                    PurchaseOrder.company_id == po_data["company_id"],
                    PurchaseOrder.po_number == po_data["po_number"],
                )
            )
            if not existing.scalar_one_or_none():
                db.add(PurchaseOrder(**po_data))
        await db.commit()
        logger.info("Purchase orders seeded.")

        # 8. Shipments & ASN Records
        shipment1_id = uuid.UUID("00000000-0000-0000-0000-000000000401")
        existing_s1 = await db.execute(select(Shipment).where(Shipment.id == shipment1_id))
        if not existing_s1.scalar_one_or_none():
            db.add(
                Shipment(
                    id=shipment1_id,
                    company_id=PRIMARY_COMPANY_ID,
                    supplier_id=COATS_SUPPLIER_ID,
                    created_by=uuid.UUID("00000000-0000-0000-0000-000000000098"),
                    shipment_number="SHP-2026-0018194-01",
                    plant_code="1001",
                    storage_location="SL01",
                    status="XML_SENT",
                    total_boxes=24,
                    total_pieces=6000,
                    ship_date=date(2026, 9, 14),
                    estimated_arrival=date(2026, 9, 18),
                    carrier="DHL Global Forwarding",
                    tracking_number="DHL-9481029481",
                )
            )
            db.add(
                ASNRecord(
                    id=uuid.UUID("00000000-0000-0000-0000-000000000501"),
                    company_id=PRIMARY_COMPANY_ID,
                    shipment_id=shipment1_id,
                    supplier_id=COATS_SUPPLIER_ID,
                    created_by=uuid.UUID("00000000-0000-0000-0000-000000000098"),
                    asn_number="ASN-2026-0018194-001",
                    xml_content='<?xml version="1.0" encoding="UTF-8"?><SdDataSlice><Header status="OK"/></SdDataSlice>',
                    xml_validated=True,
                    status="ACCEPTED",
                    sent_at=datetime(2026, 9, 14, 10, 0),
                    accepted_at=datetime(2026, 9, 14, 11, 30),
                )
            )

        shipment2_id = uuid.UUID("00000000-0000-0000-0000-000000000402")
        existing_s2 = await db.execute(select(Shipment).where(Shipment.id == shipment2_id))
        if not existing_s2.scalar_one_or_none():
            db.add(
                Shipment(
                    id=shipment2_id,
                    company_id=PRIMARY_COMPANY_ID,
                    supplier_id=COATS_SUPPLIER_ID,
                    created_by=uuid.UUID("00000000-0000-0000-0000-000000000098"),
                    shipment_number="SHP-2026-0018194-02",
                    plant_code="1001",
                    storage_location="SL01",
                    status="PACKED",
                    total_boxes=12,
                    total_pieces=3000,
                    ship_date=date(2026, 9, 16),
                    estimated_arrival=date(2026, 9, 20),
                    carrier="Expeditors International",
                    tracking_number="EXP-55928103",
                )
            )
            db.add(
                ASNRecord(
                    id=uuid.UUID("00000000-0000-0000-0000-000000000502"),
                    company_id=PRIMARY_COMPANY_ID,
                    shipment_id=shipment2_id,
                    supplier_id=COATS_SUPPLIER_ID,
                    created_by=uuid.UUID("00000000-0000-0000-0000-000000000098"),
                    asn_number="ASN-2026-0018194-002",
                    xml_content=None,
                    xml_validated=False,
                    status="DRAFT",
                )
            )

        await db.commit()
        logger.info("Shipments and ASN records seeded.")

    logger.info("Database seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(seed_database())
