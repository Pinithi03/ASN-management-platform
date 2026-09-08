/**
 * Mock data for development — aligned with types/index.ts interfaces.
 */

import type {
  User,
  Company,
  Supplier,
  EmailRecord,
  PurchaseOrder,
  Shipment,
  ASNRecord,
  DashboardStats,
} from "@/types";

// ── Activity Feed ──────────────────────────────────────────

export interface ActivityItem {
  id: string;
  type: "email" | "po" | "asn" | "shipment" | "supplier" | "review";
  message: string;
  time: string;
  status: "success" | "warning" | "error" | "info";
}

// ── Companies ──────────────────────────────────────────────

export const mockCompanies: Company[] = [
  { id: "c1", code: "SIRIO", name: "Sirio S.r.l.", is_active: true, created_at: "2024-01-01T00:00:00Z" },
  { id: "c2", code: "INCAS", name: "Incas S.p.A.", is_active: true, created_at: "2024-01-01T00:00:00Z" },
  { id: "c3", code: "RADON", name: "Radon S.r.l.", is_active: true, created_at: "2024-02-01T00:00:00Z" },
  { id: "c4", code: "GEPI", name: "GePi S.r.l.", is_active: true, created_at: "2024-03-01T00:00:00Z" },
  { id: "c5", code: "INTIM", name: "Intimissimi Plant", is_active: true, created_at: "2024-03-15T00:00:00Z" },
];

// ── Users ──────────────────────────────────────────────────

export const mockAdminUser: User = {
  id: "u1",
  email: "kasun@sirio.lk",
  full_name: "Kasun Perera",
  role: "COMPANY_ADMIN",
  company_id: "c1",
  company_name: "Sirio S.r.l.",
  company_code: "SIRIO",
  is_active: true,
  last_login_at: "2026-09-07T08:30:00Z",
};

export const mockSupplierUser: User = {
  id: "u2",
  email: "maria@textcorp.com",
  full_name: "Maria Santos",
  role: "SUPPLIER",
  company_id: "c1",
  company_name: "Sirio S.r.l.",
  company_code: "SIRIO",
  supplier_id: "s1",
  is_active: true,
  last_login_at: "2026-09-07T09:00:00Z",
};

// ── Suppliers ──────────────────────────────────────────────

export const mockSuppliers: Supplier[] = [
  { id: "s1", supplier_code: "TXCORP", name: "TextCorp Ltd", email: "ops@textcorp.com", contact_name: "Maria Santos", country: "Portugal", is_active: true, created_at: "2024-01-15T00:00:00Z" },
  { id: "s2", supplier_code: "STITCH", name: "StitchWorks", email: "info@stitchworks.com", contact_name: "Luca Rossi", country: "Italy", is_active: true, created_at: "2024-02-10T00:00:00Z" },
  { id: "s3", supplier_code: "FABIND", name: "Fabric India", email: "export@fabricindia.in", contact_name: "Priya Sharma", country: "India", is_active: true, created_at: "2024-03-01T00:00:00Z" },
  { id: "s4", supplier_code: "SILKTX", name: "SilkTex Bangladesh", email: "ops@silktex.bd", contact_name: "Rahman Ali", country: "Bangladesh", is_active: false, created_at: "2024-04-01T00:00:00Z" },
];

// ── Email Records ──────────────────────────────────────────

export const mockEmails: EmailRecord[] = [
  {
    id: "em1",
    company_id: "c1",
    message_id: "msg-001-abc@sirio.lk",
    from_address: "orders@nike.com",
    to_address: "purchasing@sirio.lk",
    subject: "PO #NKE-2026-1450 — Men's Running Shorts",
    body_text: "Please find attached Purchase Order NKE-2026-1450 for 12,000 units of Men's Running Shorts, style DRI-FIT 7in...",
    direction: "INBOUND",
    status: "PARSED",
    email_type: "PO",
    retry_count: 0,
    received_at: "2026-09-06T14:23:00Z",
    created_at: "2026-09-06T14:23:00Z",
  },
  {
    id: "em2",
    company_id: "c1",
    message_id: "msg-002-def@sirio.lk",
    from_address: "supply-chain@adidas.com",
    to_address: "purchasing@sirio.lk",
    subject: "Updated PO #ADI-2026-0892 — Women's Track Jacket",
    body_text: "Revised quantities for PO ADI-2026-0892. Please review updated delivery schedule...",
    direction: "INBOUND",
    status: "REVIEW",
    email_type: "PO_UPDATE",
    retry_count: 0,
    received_at: "2026-09-06T10:15:00Z",
    created_at: "2026-09-06T10:15:00Z",
  },
  {
    id: "em3",
    company_id: "c1",
    message_id: "msg-003-ghi@sirio.lk",
    from_address: "logistics@puma.com",
    to_address: "warehouse@sirio.lk",
    subject: "ASN Confirmation — Ship #PMA-SHP-0034",
    body_text: "ASN for shipment PMA-SHP-0034 has been received and accepted. Delivery ETA: 2026-09-15...",
    direction: "INBOUND",
    status: "COMMITTED",
    email_type: "ASN_CONFIRM",
    retry_count: 0,
    received_at: "2026-09-05T16:45:00Z",
    created_at: "2026-09-05T16:45:00Z",
  },
  {
    id: "em4",
    company_id: "c1",
    message_id: "msg-004-jkl@sirio.lk",
    from_address: "purchasing@sirio.lk",
    to_address: "ops@textcorp.com",
    subject: "ASN XML — Shipment SHP-2026-0012",
    body_text: "Attached ASN XML document for shipment SHP-2026-0012 containing 3 boxes, 450 pieces...",
    direction: "OUTBOUND",
    status: "SENT",
    email_type: "ASN_XML",
    retry_count: 0,
    received_at: "2026-09-05T11:30:00Z",
    created_at: "2026-09-05T11:30:00Z",
  },
  {
    id: "em5",
    company_id: "c1",
    message_id: "msg-005-mno@sirio.lk",
    from_address: "procurement@hm.com",
    to_address: "purchasing@sirio.lk",
    subject: "PO #HM-2026-3201 — Organic Cotton T-Shirts",
    body_text: "New purchase order for 25,000 units across 4 colorways. Please confirm capacity...",
    direction: "INBOUND",
    status: "QUEUED",
    email_type: "PO",
    retry_count: 0,
    received_at: "2026-09-07T08:05:00Z",
    created_at: "2026-09-07T08:05:00Z",
  },
  {
    id: "em6",
    company_id: "c1",
    message_id: "msg-006-pqr@sirio.lk",
    from_address: "vendor-portal@zara.com",
    to_address: "purchasing@sirio.lk",
    subject: "Rejected: PO #ZRA-2026-0100 format error",
    body_text: "The submitted PO could not be processed due to XML validation failure.",
    direction: "INBOUND",
    status: "ERROR",
    email_type: "PO",
    error_message: "XML validation failed: missing required field 'delivery_date'",
    retry_count: 2,
    received_at: "2026-09-04T09:00:00Z",
    created_at: "2026-09-04T09:00:00Z",
  },
];

// ── Purchase Orders ────────────────────────────────────────

export const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: "po1",
    company_id: "c1",
    po_number: "NKE-2026-1450",
    client_code: "NIKE",
    supplier_id: "s1",
    style_number: "DRI-FIT-7IN",
    description: "Men's Dri-FIT 7\" Running Shorts — Black/White",
    quantity: 12000,
    unit_price: 8.50,
    total_value: 102000,
    currency: "USD",
    delivery_date: "2026-10-15T00:00:00Z",
    ship_date: "2026-09-25T00:00:00Z",
    destination: "SIRIO Plant 1",
    status: "ACTIVE",
    version: 1,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
  },
  {
    id: "po2",
    company_id: "c1",
    po_number: "ADI-2026-0892",
    client_code: "ADIDAS",
    supplier_id: "s2",
    style_number: "TRK-JKT-W",
    description: "Women's Tiro Track Jacket — Navy/Gold",
    quantity: 8000,
    unit_price: 12.75,
    total_value: 102000,
    currency: "EUR",
    delivery_date: "2026-11-01T00:00:00Z",
    ship_date: "2026-10-10T00:00:00Z",
    destination: "INCAS Plant",
    status: "UPDATED",
    version: 3,
    created_at: "2026-08-15T09:00:00Z",
    updated_at: "2026-09-06T10:15:00Z",
  },
  {
    id: "po3",
    company_id: "c1",
    po_number: "PMA-2026-0567",
    client_code: "PUMA",
    supplier_id: "s1",
    style_number: "ESS-TEE-M",
    description: "Men's Essentials Logo Tee — 5 colorways",
    quantity: 20000,
    unit_price: 4.25,
    total_value: 85000,
    currency: "USD",
    delivery_date: "2026-09-30T00:00:00Z",
    destination: "SIRIO Plant 1",
    status: "SHIPPED",
    version: 1,
    created_at: "2026-07-20T14:00:00Z",
    updated_at: "2026-09-05T16:45:00Z",
  },
  {
    id: "po4",
    company_id: "c1",
    po_number: "HM-2026-3201",
    client_code: "H&M",
    supplier_id: "s3",
    style_number: "ORG-COT-TEE",
    description: "Organic Cotton Basic T-Shirts — 4 colorways",
    quantity: 25000,
    unit_price: 3.80,
    total_value: 95000,
    currency: "EUR",
    delivery_date: "2026-12-01T00:00:00Z",
    destination: "RADON Plant",
    status: "ACTIVE",
    version: 1,
    created_at: "2026-09-07T08:05:00Z",
    updated_at: "2026-09-07T08:05:00Z",
  },
  {
    id: "po5",
    company_id: "c1",
    po_number: "ZRA-2026-0100",
    client_code: "ZARA",
    supplier_id: "s4",
    style_number: "SLK-BLS-W",
    description: "Women's Silk Blend Blouse — Ivory",
    quantity: 5000,
    unit_price: 15.00,
    total_value: 75000,
    currency: "EUR",
    delivery_date: "2026-10-20T00:00:00Z",
    destination: "GEPI Plant",
    status: "CANCELLED",
    version: 2,
    created_at: "2026-08-01T11:00:00Z",
    updated_at: "2026-09-04T09:00:00Z",
  },
];

// ── Shipments ──────────────────────────────────────────────

export const mockShipments: Shipment[] = [
  {
    id: "shp1",
    company_id: "c1",
    supplier_id: "s1",
    shipment_number: "SHP-2026-0012",
    plant_code: "SIRIO",
    status: "DISPATCHED",
    total_boxes: 3,
    total_pieces: 450,
    ship_date: "2026-09-05T00:00:00Z",
    estimated_arrival: "2026-09-12T00:00:00Z",
    carrier: "DHL Express",
    tracking_number: "DHL-9876543210",
    created_at: "2026-09-04T10:00:00Z",
    updated_at: "2026-09-05T11:30:00Z",
  },
  {
    id: "shp2",
    company_id: "c1",
    supplier_id: "s2",
    shipment_number: "SHP-2026-0013",
    plant_code: "INCAS",
    status: "PACKING",
    total_boxes: 5,
    total_pieces: 800,
    carrier: "Maersk",
    created_at: "2026-09-06T14:00:00Z",
    updated_at: "2026-09-06T14:00:00Z",
  },
  {
    id: "shp3",
    company_id: "c1",
    supplier_id: "s1",
    shipment_number: "SHP-2026-0014",
    plant_code: "SIRIO",
    status: "DELIVERED",
    total_boxes: 10,
    total_pieces: 2000,
    ship_date: "2026-08-25T00:00:00Z",
    estimated_arrival: "2026-09-01T00:00:00Z",
    carrier: "FedEx",
    tracking_number: "FDX-1234567890",
    created_at: "2026-08-24T09:00:00Z",
    updated_at: "2026-09-01T15:00:00Z",
  },
  {
    id: "shp4",
    company_id: "c1",
    supplier_id: "s3",
    shipment_number: "SHP-2026-0015",
    plant_code: "RADON",
    status: "DRAFT",
    total_boxes: 0,
    total_pieces: 0,
    created_at: "2026-09-07T07:00:00Z",
    updated_at: "2026-09-07T07:00:00Z",
  },
];

// ── ASN Records ────────────────────────────────────────────

export const mockASNs: ASNRecord[] = [
  {
    id: "asn1",
    shipment_id: "shp1",
    company_id: "c1",
    supplier_id: "s1",
    asn_number: "ASN-2026-0012",
    xml_validated: true,
    status: "SUBMITTED",
    sent_at: "2026-09-05T12:00:00Z",
    created_at: "2026-09-05T11:30:00Z",
    updated_at: "2026-09-05T12:00:00Z",
  },
  {
    id: "asn2",
    shipment_id: "shp3",
    company_id: "c1",
    supplier_id: "s1",
    asn_number: "ASN-2026-0010",
    xml_validated: true,
    status: "ACCEPTED",
    sent_at: "2026-08-25T14:00:00Z",
    accepted_at: "2026-08-26T09:00:00Z",
    created_at: "2026-08-25T13:00:00Z",
    updated_at: "2026-08-26T09:00:00Z",
  },
  {
    id: "asn3",
    shipment_id: "shp2",
    company_id: "c1",
    supplier_id: "s2",
    asn_number: "ASN-2026-0013",
    xml_validated: false,
    status: "DRAFT",
    created_at: "2026-09-06T15:00:00Z",
    updated_at: "2026-09-06T15:00:00Z",
  },
  {
    id: "asn4",
    shipment_id: "shp4",
    company_id: "c1",
    supplier_id: "s3",
    asn_number: "ASN-2026-0015",
    xml_validated: false,
    status: "FAILED",
    rejection_reason: "XML schema validation error: missing ship_date element",
    created_at: "2026-09-07T08:00:00Z",
    updated_at: "2026-09-07T08:30:00Z",
  },
];

// ── Dashboard Stats ────────────────────────────────────────

export const adminDashboardStats: DashboardStats = {
  emails_received: 48,
  emails_parsed: 42,
  emails_pending_review: 3,
  emails_errors: 1,
  active_pos: 12,
  active_shipments: 4,
  asns_pending: 2,
  asns_dispatched: 8,
};

export const supplierDashboardStats: DashboardStats = {
  emails_received: 0,
  emails_parsed: 0,
  emails_pending_review: 0,
  emails_errors: 0,
  active_pos: 5,
  active_shipments: 3,
  asns_pending: 1,
  asns_dispatched: 4,
};

// ── Activity Feeds ─────────────────────────────────────────

export const adminActivityFeed: ActivityItem[] = [
  { id: "a1", type: "email", message: "New PO email from Nike — NKE-2026-1450", time: "2 hours ago", status: "info" },
  { id: "a2", type: "po", message: "PO ADI-2026-0892 updated to version 3", time: "5 hours ago", status: "warning" },
  { id: "a3", type: "asn", message: "ASN-2026-0012 submitted to SIRIO plant", time: "Yesterday", status: "success" },
  { id: "a4", type: "email", message: "Email from Zara failed XML validation", time: "2 days ago", status: "error" },
  { id: "a5", type: "supplier", message: "SilkTex Bangladesh marked inactive", time: "3 days ago", status: "warning" },
];

export const supplierActivityFeed: ActivityItem[] = [
  { id: "s1", type: "shipment", message: "Shipment SHP-2026-0012 dispatched via DHL", time: "2 days ago", status: "success" },
  { id: "s2", type: "asn", message: "ASN-2026-0010 accepted by plant", time: "Last week", status: "success" },
  { id: "s3", type: "po", message: "New PO NKE-2026-1450 assigned — 12,000 units", time: "Yesterday", status: "info" },
  { id: "s4", type: "shipment", message: "Shipment SHP-2026-0014 delivered", time: "1 week ago", status: "success" },
  { id: "s5", type: "asn", message: "ASN-2026-0013 draft created", time: "Yesterday", status: "info" },
];