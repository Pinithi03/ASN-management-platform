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


async def seed_database() -> None:
    global COATS_SUPPLIER_ID, HAYLEYS_SUPPLIER_ID, SOUTH_ASIA_SUPPLIER_ID, CALZEDONIA_HUB_SUPPLIER_ID
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
            existing = await db.execute(select(Supplier).where(Supplier.supplier_code == s_data["supplier_code"]))
            if not existing.scalar_one_or_none():
                db.add(Supplier(**s_data))
        await db.commit()
        logger.info("Suppliers seeded.")

        # Dynamically map supplier IDs
        coats_obj = (await db.execute(select(Supplier).where(Supplier.supplier_code == "0000018194"))).scalar_one_or_none()
        if coats_obj:
            COATS_SUPPLIER_ID = coats_obj.id

        hayleys_obj = (await db.execute(select(Supplier).where(Supplier.supplier_code == "0000001122"))).scalar_one_or_none()
        if hayleys_obj:
            HAYLEYS_SUPPLIER_ID = hayleys_obj.id

        south_asia_obj = (await db.execute(select(Supplier).where(Supplier.supplier_code == "0000080589"))).scalar_one_or_none()
        if south_asia_obj:
            SOUTH_ASIA_SUPPLIER_ID = south_asia_obj.id

        # 3. Supplier Plants
        for s_data in suppliers_data:
            s_obj = (await db.execute(select(Supplier).where(Supplier.supplier_code == s_data["supplier_code"]))).scalar_one_or_none()
            if s_obj:
                existing_sp = await db.execute(
                    select(SupplierPlant).where(
                        SupplierPlant.supplier_id == s_obj.id,
                        SupplierPlant.company_id == PRIMARY_COMPANY_ID,
                    )
                )
                if not existing_sp.scalar_one_or_none():
                    db.add(
                        SupplierPlant(
                            id=uuid.uuid4(),
                            supplier_id=s_obj.id,
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
                "client_name": "Calzedonia Group",
                "is_active": True,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000102"),
                "company_id": PRIMARY_COMPANY_ID,
                "client_code": "NIKE",
                "client_name": "Nike Inc.",
                "is_active": True,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000103"),
                "company_id": PRIMARY_COMPANY_ID,
                "client_code": "ADIDAS",
                "client_name": "Adidas AG",
                "is_active": True,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000104"),
                "company_id": PRIMARY_COMPANY_ID,
                "client_code": "PUMA",
                "client_name": "Puma SE",
                "is_active": True,
            },
        ]

        for cl_data in clients_data:
            existing = await db.execute(select(Client).where(Client.id == cl_data["id"]))
            if not existing.scalar_one_or_none():
                db.add(Client(**cl_data))
        await db.commit()
        logger.info("Clients seeded.")

        # 5. Users (Plant Administrators)
        users_data = [
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000099"),
                "company_id": PRIMARY_COMPANY_ID,
                "keycloak_id": "kc-admin-001",
                "email": "kasun.perera@sirio.lk",
                "full_name": "Kasun Perera",
                "role": "SUPER_ADMIN",
                "supplier_id": None,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000098"),
                "company_id": PRIMARY_COMPANY_ID,
                "keycloak_id": "kc-admin-002",
                "email": "nimal.fernando@sirio.lk",
                "full_name": "Nimal Fernando",
                "role": "COMPANY_ADMIN",
                "supplier_id": None,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000097"),
                "company_id": PRIMARY_COMPANY_ID,
                "keycloak_id": "kc-admin-003",
                "email": "sarath.silva@benji.lk",
                "full_name": "Sarath Silva",
                "role": "COMPANY_ADMIN",
                "supplier_id": None,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000096"),
                "company_id": PRIMARY_COMPANY_ID,
                "keycloak_id": "kc-admin-004",
                "email": "dilini.jayasinghe@omegaline.lk",
                "full_name": "Dilini Jayasinghe",
                "role": "OPERATOR",
                "supplier_id": None,
            },
            {
                "id": uuid.UUID("00000000-0000-0000-0000-000000000095"),
                "company_id": PRIMARY_COMPANY_ID,
                "keycloak_id": "kc-admin-005",
                "email": "pradeep.kumar@alpha.lk",
                "full_name": "Pradeep Kumar",
                "role": "REVIEWER",
                "supplier_id": None,
            },
        ]

        for u_data in users_data:
            existing = await db.execute(select(User).where(User.id == u_data["id"]))
            if not existing.scalar_one_or_none():
                db.add(User(**u_data))
        await db.commit()
        logger.info("Plant administrators seeded.")

    logger.info("Database seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(seed_database())
