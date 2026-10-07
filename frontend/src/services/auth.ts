/**
 * Authentication service.
 * Only GET /auth/me remains — login and password changes are
 * handled by Keycloak directly.
 */

import { api } from "./api";
import type { AuthUser } from "@/store/authStore";

export const authService = {
  /** Fetch the current user's profile from the backend. */
  getMe: async (): Promise<AuthUser> => {
    const res = await api.get<AuthUser>("/auth/me");
    return res.data;
  },
};
