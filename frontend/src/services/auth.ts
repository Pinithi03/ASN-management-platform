/**
 * Authentication service.
 * Only GET /auth/me remains — login and password changes are
 * handled by Keycloak directly.
 */

import { api } from "./api";
import type { AuthUser } from "@/store/authStore";
import type { AppLanguage } from "@/i18n";

export const authService = {
  /** Fetch the current user's profile from the backend. */
  getMe: async (): Promise<AuthUser> => {
    const res = await api.get<AuthUser>("/auth/me");
    return res.data;
  },

  /** Save the user's language (backend updates the Keycloak `locale` attribute). */
  updatePreferences: async (prefs: { language: AppLanguage }): Promise<{ language: AppLanguage }> => {
    const res = await api.patch<{ language: AppLanguage }>("/auth/me/preferences", prefs);
    return res.data;
  },
};
