// ─── Supplier API Service ────────────────────────────────────────
// frontend/src/services/supplierApi.ts

import { api } from "./api";
import type { SupplierItem } from "@/pages/Suppliers";

export interface SupplierCreateParams {
  supplier_code: string;
  name: string;
  email: string;
  contact_name?: string;
  phone?: string;
  address?: string;
  country?: string;
  tax_id?: string;
  category?: string;
  is_active?: boolean;
}

export interface SupplierUpdateParams {
  name?: string;
  supplier_code?: string;
  email?: string;
  contact_name?: string;
  phone?: string;
  address?: string;
  country?: string;
  tax_id?: string;
  category?: string;
  is_active?: boolean;
}

export const supplierApi = {
  /** Fetch all onboarded and email-detected suppliers from database */
  list: async (search?: string, activeOnly?: boolean): Promise<SupplierItem[]> => {
    const params: Record<string, string | boolean> = {};
    if (search) params.search = search;
    if (activeOnly !== undefined) params.active_only = activeOnly;
    const { data } = await api.get("/suppliers", { params });
    return data;
  },

  /** Onboard a new supplier profile */
  create: async (payload: SupplierCreateParams): Promise<SupplierItem> => {
    const { data } = await api.post("/suppliers", payload);
    return data;
  },

  /** Update an existing supplier profile */
  update: async (supplierIdOrCode: string, payload: SupplierUpdateParams): Promise<SupplierItem> => {
    const { data } = await api.put(`/suppliers/${supplierIdOrCode}`, payload);
    return data;
  },

  /** Delete a supplier */
  delete: async (supplierIdOrCode: string): Promise<{ status: string }> => {
    const { data } = await api.delete(`/suppliers/${supplierIdOrCode}`);
    return data;
  },
};
