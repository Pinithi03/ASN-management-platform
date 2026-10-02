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

export interface SupplierCredentials {
  supplier_id: string;
  supplier_code: string;
  name: string;
  email: string;
  temporary_password: string;
  expires_in_hours: number;
  expires_at: string;
  requires_password_change: boolean;
  message: string;
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

  /** 1-Click Activate and generate temporary credentials */
  activateAndGenerateCredentials: async (supplierIdOrCode: string): Promise<SupplierCredentials> => {
    const { data } = await api.post(`/suppliers/${supplierIdOrCode}/activate-credentials`);
    return data;
  },

  /** Get or view existing credentials */
  getCredentials: async (supplierIdOrCode: string): Promise<SupplierCredentials> => {
    const { data } = await api.get(`/suppliers/${supplierIdOrCode}/credentials`);
    return data;
  },

  /** Change password from temporary to permanent */
  changePassword: async (supplierCodeOrEmail: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.post("/suppliers/change-password", {
      supplier_code_or_email: supplierCodeOrEmail,
      current_password: currentPassword,
      new_password: newPassword,
    });
    return data;
  },
};

