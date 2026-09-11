// ─── Purchase Order API Service ─────────────────────────────────
// frontend/src/services/poApi.ts

import { api } from "./api";
import type {
  PurchaseOrder,
  POStats,
  PaginatedResponse,
} from "@/types/email";

export interface POListParams {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
  company_id?: string;
}

export interface POUpdateBody {
  status?: string;
  quantity?: number;
  delivery_date?: string;
  ship_date?: string;
  destination?: string;
  description?: string;
  style_number?: string;
  currency?: string;
}

// ─── API Calls ──────────────────────────────────────────────────

export const poApi = {
  /** List POs with filters & pagination */
  list: async (params: POListParams = {}): Promise<PaginatedResponse<PurchaseOrder>> => {
    const { data } = await api.get("/purchase-orders", { params });
    return data;
  },

  /** Get PO detail */
  getById: async (poId: string): Promise<PurchaseOrder> => {
    const { data } = await api.get(`/purchase-orders/${poId}`);
    return data;
  },

  /** Get PO statistics */
  getStats: async (companyId?: string): Promise<POStats> => {
    const { data } = await api.get("/purchase-orders/stats", {
      params: companyId ? { company_id: companyId } : {},
    });
    return data;
  },

  /** Update PO fields */
  update: async (poId: string, body: POUpdateBody): Promise<{ status: string }> => {
    const { data } = await api.patch(`/purchase-orders/${poId}`, body);
    return data;
  },
};