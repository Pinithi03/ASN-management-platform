/**
 * Authentication service.
 * Connects to /api/v1/auth/login and /api/v1/auth/suppliers.
 */

import { api } from "./api";
import type { User, SupplierSummary } from "@/types";

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  user: User;
}

export const authService = {
  /** Authenticate with Partner ID or Admin username */
  login: async (username: string, password: string = "Abc123@#"): Promise<LoginResponse> => {
    const res = await api.post<LoginResponse>("/auth/login", {
      username,
      password,
    });
    return res.data;
  },

  /** Get list of available registered supplier portals */
  getSuppliers: async (): Promise<SupplierSummary[]> => {
    const res = await api.get<SupplierSummary[]>("/auth/suppliers");
    return res.data;
  },
};
