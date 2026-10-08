/**
 * Auth store — holds the user profile from GET /auth/me.
 *
 * No passwords, no tokens, no localStorage.
 * Tokens live only in keycloak-js (in memory).
 */

import { create } from "zustand";
import { keycloak } from "@/lib/keycloak";

export interface AuthUser {
  keycloak_id: string;
  email: string | null;
  name: string | null;
  role: "ADMIN" | "SUPPLIER";
  permissions: string[];
  supplier_id: string | null;
  supplier_code: string | null;
  supplier_name: string | null;
}

interface AuthState {
  /** Whether the profile has been loaded from /auth/me */
  isAuthenticated: boolean;
  /** Current user profile (null until /auth/me returns) */
  user: AuthUser | null;

  /** Called by AuthProvider after /auth/me succeeds */
  setProfile: (me: AuthUser) => void;

  /** Log out: ends the Keycloak session and clears the store */
  logout: () => void;

  // --- Convenience getters ---
  /** Is the current user an admin? */
  isAdmin: () => boolean;
  /** Does the current user have a specific permission? */
  hasPermission: (perm: string) => boolean;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  isAuthenticated: false,
  user: null,

  setProfile: (me) => {
    set({ isAuthenticated: true, user: me });
  },

  logout: () => {
    set({ isAuthenticated: false, user: null });
    keycloak.logout({ redirectUri: window.location.origin });
  },

  isAdmin: () => get().user?.role === "ADMIN",

  hasPermission: (perm) => {
    const perms = get().user?.permissions ?? [];
    return perms.includes("*") || perms.includes(perm);
  },
}));
