/**
 * Shared TypeScript type definitions.
 * Aligned with KB 05 database schema and KB 06 RBAC.
 */

// ── Enums ──────────────────────────────────────────────────

export type UserRole = "COMPANY_ADMIN" | "SUPPLIER";

export type EmailDirection = "INBOUND" | "OUTBOUND";

export type EmailStatus =
  | "QUEUED"
  | "PROCESSING"
  | "PARSED"
  | "REVIEW"
  | "COMMITTED"
  | "REJECTED"
  | "SENT"
  | "ERROR";

export type POStatus =
  | "ACTIVE"
  | "UPDATED"
  | "XML_SENT"
  | "SHIPMENT_RECEIVED"
  | "SHIPPED"
  | "CANCELLED"
  | "COMPLETED";

export type ShipmentStatus =
  | "DRAFT"
  | "PACKING"
  | "PACKED"
  | "XML_SENT"
  | "RECEIVED"
  | "ACCEPTED"
  | "REJECTED"
  | "DISPATCHED"
  | "DELIVERED";

export type ASNStatus =
  | "DRAFT"
  | "VALIDATED"
  | "XML_SENT"
  | "SUBMITTED"
  | "RECEIVED"
  | "ACCEPTED"
  | "REJECTED"
  | "FAILED"
  | "COMPLETED"
  | "CANCELLED";

// ── API Response Wrappers ──────────────────────────────────

export interface ApiError {
  error: {
    message: string;
    detail?: unknown;
    type: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ── Domain Models ──────────────────────────────────────────

export interface Company {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  minio_bucket?: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string;
  company_name?: string;   // Denormalized for display
  company_code?: string;
  supplier_id?: string;    // Set for SUPPLIER role
  supplier_code?: string;  // e.g. "0000018194"
  supplier_name?: string;  // e.g. "COATS THREAD EXPORTS (PRIVATE) LIMITED"
  is_active: boolean;
  last_login_at?: string;
}

export interface SupplierSummary {
  id: string;
  supplier_code: string;
  name: string;
  email: string;
  contact_name?: string;
  country?: string;
  total_orders: number;
}

export interface Supplier {
  id: string;
  supplier_code: string;
  name: string;
  email: string;
  contact_name?: string;
  phone?: string;
  address?: string;
  country?: string;
  is_active: boolean;
  registered_plants?: SupplierPlant[];
  created_at: string;
}

export interface SupplierPlant {
  id: string;
  supplier_id: string;
  company_id: string;
  plant_code: string;
  is_active: boolean;
  registered_at: string;
}

export interface Client {
  id: string;
  company_id: string;
  client_code: string;
  client_name?: string;
  is_active: boolean;
}

export interface EmailRecord {
  id: string;
  company_id: string;
  message_id: string;
  from_address?: string;
  to_address?: string;
  subject?: string;
  body_text?: string;
  direction: EmailDirection;
  status: EmailStatus;
  email_type?: string;
  supplier_id?: string;
  error_message?: string;
  retry_count: number;
  received_at?: string;
  created_at: string;
}

export interface EmailAttachment {
  id: string;
  email_record_id: string;
  filename?: string;
  content_type?: string;
  file_size?: number;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  company_id: string;
  po_number: string;
  client_code?: string;
  supplier_id?: string;
  style_number?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  total_value?: number;
  currency: string;
  delivery_date?: string;
  ship_date?: string;
  destination?: string;
  status: POStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface POHistory {
  id: string;
  po_id: string;
  version: number;
  changed_fields: Record<string, unknown>;
  change_source?: string;
  created_at: string;
}

export interface Shipment {
  id: string;
  company_id: string;
  supplier_id: string;
  shipment_number: string;
  plant_code?: string;
  status: ShipmentStatus;
  total_boxes: number;
  total_pieces: number;
  ship_date?: string;
  estimated_arrival?: string;
  carrier?: string;
  tracking_number?: string;
  created_at: string;
  updated_at: string;
  lines?: ShipmentLine[];
}

export interface ShipmentLine {
  id: string;
  shipment_id: string;
  po_number?: string;
  material_number?: string;
  material_description?: string;
  style_number?: string;
  color_code?: string;
  size?: string;
  quantity: number;
  unit_of_measure: string;
}

export interface PackingSlip {
  id: string;
  shipment_id: string;
  slip_number: string;
  box_number?: number;
  hu_number?: string;
  net_weight?: number;
  gross_weight?: number;
  status: string;
}

export interface ASNRecord {
  id: string;
  shipment_id: string;
  company_id: string;
  supplier_id: string;
  asn_number: string;
  xml_validated: boolean;
  status: ASNStatus;
  sent_at?: string;
  accepted_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  company_id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  created_at: string;
}

// ── Health Check ───────────────────────────────────────────

export interface HealthCheck {
  status: string;
  service: string;
  version: string;
}

// ── Dashboard Stats ────────────────────────────────────────

export interface DashboardStats {
  emails_received: number;
  emails_parsed: number;
  emails_pending_review: number;
  emails_errors: number;
  active_pos: number;
  active_shipments: number;
  asns_pending: number;
  asns_dispatched: number;
}