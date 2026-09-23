// ─── Audit Logs API Service ─────────────────────────────────────────
// frontend/src/services/auditApi.ts

import { api } from "./api";

export interface AuditLogItem {
  id: string;
  company_id: string;
  user_id?: string | null;
  user?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface PaginatedAuditLogResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface AuditLogListParams {
  page?: number;
  per_page?: number;
  action?: string;
  entity_type?: string;
  search?: string;
  company_id?: string;
}

export const auditApi = {
  /** List audit logs with pagination and search filters (Admin Only) */
  list: async (params: AuditLogListParams = {}): Promise<PaginatedAuditLogResponse> => {
    const { data } = await api.get("/audit-logs", { params });
    return data;
  },

  /** Create an audit log entry for frontend-triggered admin actions */
  create: async (body: {
    action: string;
    entity_type: string;
    entity_id?: string;
    old_values?: Record<string, unknown>;
    new_values?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    user_id?: string;
  }): Promise<AuditLogItem> => {
    const { data } = await api.post("/audit-logs", body);
    return data;
  },
};
