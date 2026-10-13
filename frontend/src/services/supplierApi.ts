// ─── Supplier API Service ────────────────────────────────────────
// frontend/src/services/supplierApi.ts

import { api } from "./api";
import type { SupplierItem } from "@/pages/Suppliers";

export interface SupplierCreateParams {
  supplier_code: string;
  name: string;
  email?: string;
  contact_name?: string;
  phone?: string;
  address?: string;
  country?: string;
  tax_id?: string;
  category?: string;
  profile_picture_url?: string;
  current_hu_number?: string;
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
  profile_picture_url?: string;
  current_hu_number?: string;
  hu_locked?: boolean;
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
  list: async (
    searchOrOptions?: string | { search?: string; active_only?: boolean; include_deleted?: boolean; archived_only?: boolean },
    activeOnly?: boolean,
    includeDeleted: boolean = true
  ): Promise<SupplierItem[]> => {
    const params: Record<string, string | boolean> = {};
    if (typeof searchOrOptions === "object" && searchOrOptions !== null) {
      if (searchOrOptions.search) params.search = searchOrOptions.search;
      if (searchOrOptions.active_only !== undefined) params.active_only = searchOrOptions.active_only;
      if (searchOrOptions.include_deleted !== undefined) params.include_deleted = searchOrOptions.include_deleted;
      if (searchOrOptions.archived_only !== undefined) params.archived_only = searchOrOptions.archived_only;
    } else {
      if (searchOrOptions) params.search = searchOrOptions;
      if (activeOnly !== undefined) params.active_only = activeOnly;
      if (includeDeleted !== undefined) params.include_deleted = includeDeleted;
    }
    const { data } = await api.get("/suppliers", { params });
    return data;
  },

  /** Onboard a new supplier profile */
  create: async (payload: SupplierCreateParams): Promise<SupplierItem> => {
    const { data } = await api.post("/suppliers", payload);
    return data;
  },

  /** Look up parsed XML data in inbound email mailbox for a supplier code */
  lookupXml: async (supplierCode: string): Promise<{
    found: boolean;
    supplier_code: string;
    name?: string;
    email?: string;
    contact_name?: string;
    phone?: string;
    address?: string;
    country?: string;
    tax_id?: string;
    category?: string;
    source_filename?: string;
  }> => {
    const { data } = await api.get(`/suppliers/lookup-xml/${encodeURIComponent(supplierCode.trim())}`);
    return data;
  },

  /** Update an existing supplier profile */
  update: async (supplierIdOrCode: string, payload: SupplierUpdateParams): Promise<SupplierItem> => {
    const { data } = await api.put(`/suppliers/${supplierIdOrCode}`, payload);
    return data;
  },

  /** Upload or change supplier profile picture / avatar */
  uploadAvatar: async (supplierIdOrCode: string, profilePictureUrl: string | null): Promise<SupplierItem> => {
    const { data } = await api.post(`/suppliers/${supplierIdOrCode}/avatar`, {
      profile_picture_url: profilePictureUrl,
    });
    return data;
  },

  /** Safely soft-delete / archive a supplier with admin password verification */
  delete: async (supplierIdOrCode: string, adminPassword?: string): Promise<{ status: string; message: string }> => {
    const { data } = await api.post(`/suppliers/${supplierIdOrCode}/delete`, {
      admin_password: adminPassword,
    });
    return data;
  },

  /** Restore an archived / soft-deleted supplier partner */
  restore: async (supplierIdOrCode: string): Promise<SupplierItem> => {
    const { data } = await api.post(`/suppliers/${supplierIdOrCode}/restore`);
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

  /** Configure or update starting handling unit (HU) number */
  setHuNumber: async (supplierIdOrCode: string, currentHuNumber: string): Promise<SupplierItem> => {
    const { data } = await api.post(`/suppliers/${supplierIdOrCode}/hu-number`, {
      current_hu_number: currentHuNumber,
    });
    return data;
  },
};

