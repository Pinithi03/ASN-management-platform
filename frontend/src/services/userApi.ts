// ─── Plant Administrators & Users API Service ───────────────────────
// frontend/src/services/userApi.ts

import { api } from "./api";

export interface UserItem {
  id: string;
  company_id: string;
  keycloak_id: string;
  email: string;
  full_name?: string | null;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "OPERATOR" | "REVIEWER" | string;
  plant_code: string;
  plant_name: string;
  is_active: boolean;
  last_login_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface UserListParams {
  search?: string;
  role?: string;
  is_active?: boolean;
  company_id?: string;
}

export interface CreateUserPayload {
  email: string;
  full_name: string;
  role: string;
  plant_code: string;
  is_active?: boolean;
}

export interface UpdateUserPayload {
  full_name?: string;
  role?: string;
  plant_code?: string;
  is_active?: boolean;
}

export const userApi = {
  /** Fetch all plant admins matching filters */
  list: async (params: UserListParams = {}): Promise<UserItem[]> => {
    const { data } = await api.get<UserItem[]>("/users", { params });
    return data;
  },

  /** Get admin user detail by ID */
  getById: async (userId: string): Promise<UserItem> => {
    const { data } = await api.get<UserItem>(`/users/${userId}`);
    return data;
  },

  /** Create a new plant administrator */
  create: async (body: CreateUserPayload): Promise<UserItem> => {
    const { data } = await api.post<UserItem>("/users", body);
    return data;
  },

  /** Update administrator profile, plant assignment, or active status */
  update: async (userId: string, body: UpdateUserPayload): Promise<UserItem> => {
    const { data } = await api.patch<UserItem>(`/users/${userId}`, body);
    return data;
  },

  /** Remove/Soft-delete administrator */
  delete: async (userId: string): Promise<{ message: string }> => {
    const { data } = await api.delete<{ message: string }>(`/users/${userId}`);
    return data;
  },

  /** Trigger password reset credentials */
  resetPassword: async (userId: string): Promise<{ message: string; temporary_password?: string }> => {
    const { data } = await api.post<{ message: string; temporary_password?: string }>(
      `/users/${userId}/reset-password`
    );
    return data;
  },
};
