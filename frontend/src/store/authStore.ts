/**
 * Auth state management using Zustand.
 * Mock auth for development — switch between COMPANY_ADMIN and SUPPLIER
 * to test both portals without Keycloak.
 */

import { create } from "zustand";
import type { User, UserRole } from "@/types";
import { mockAdminUser, mockSupplierUser } from "@/data/mockData";

interface AuthState {
  /** Whether the user is logged in */
  isAuthenticated: boolean;
  /** Current user (null when logged out) */
  user: User | null;
  /** Login with a specific role (mock) */
  login: (role: UserRole) => void;
  /** Log out and clear user state */
  logout: () => void;
  /** Switch role without logging out (dev convenience) */
  switchRole: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,

  login: (role: UserRole) => {
    const user = role === "COMPANY_ADMIN" ? mockAdminUser : mockSupplierUser;
    set({ isAuthenticated: true, user });
  },

  logout: () => {
    set({ isAuthenticated: false, user: null });
  },

  switchRole: () => {
    const current = get().user;
    if (!current) return;
    const newRole: UserRole =
      current.role === "COMPANY_ADMIN" ? "SUPPLIER" : "COMPANY_ADMIN";
    const newUser =
      newRole === "COMPANY_ADMIN" ? mockAdminUser : mockSupplierUser;
    set({ user: newUser });
  },
}));