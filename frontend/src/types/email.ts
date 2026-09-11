// ─── Email & PO Types ───────────────────────────────────────────
// frontend/src/types/email.ts

export type EmailStatus =
  | "QUEUED"
  | "PROCESSING"
  | "PARSED"
  | "REVIEW"
  | "COMMITTED"
  | "REJECTED"
  | "ERROR";

export type POStatus =
  | "ACTIVE"
  | "UPDATED"
  | "XML_SENT"
  | "SHIPMENT_RECEIVED"
  | "SHIPPED"
  | "CANCELLED"
  | "COMPLETED";

export interface EmailRecord {
  id: string;
  company_id: string;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  status: EmailStatus;
  email_type: string | null;
  direction: string | null;
  received_at: string | null;
  created_at: string | null;
  error_message: string | null;
}

export interface ParsedData {
  id: string;
  parser_used: string | null;
  raw_extracted: Record<string, unknown> | null;
  normalized: {
    po_number?: string;
    supplier_code?: string;
    supplier_name?: string;
    currency?: string;
    total_quantity?: number;
    total_value?: number;
    line_count?: number;
  } | null;
  validation_errors: string[];
  po_number_extracted: string | null;
  supplier_id_extracted: string | null;
  created_at: string | null;
}

export interface EmailDetail extends EmailRecord {
  body_text: string | null;
  message_id: string | null;
  parsed_data: ParsedData[];
}

export interface PurchaseOrder {
  id: string;
  company_id: string;
  po_number: string | null;
  client_code: string | null;
  style_number: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_value: number | null;
  currency: string | null;
  delivery_date: string | null;
  ship_date: string | null;
  destination: string | null;
  status: POStatus;
  version: number | null;
  extra_data: Record<string, unknown> | null;
  source_email_id: string | null;
  source_email_subject: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface EmailStats {
  total: number;
  queued: number;
  processing: number;
  parsed: number;
  review: number;
  committed: number;
  rejected: number;
  error: number;
}

export interface POStats {
  total: number;
  active: number;
  updated: number;
  shipped: number;
  cancelled: number;
  completed: number;
}