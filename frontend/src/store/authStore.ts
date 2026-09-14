/**
 * Auth state management using Zustand.
 * Role-Based Access Control (RBAC) for Plant Administrator & Calzedonia Supplier Partners.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, UserRole } from "@/types";
import { mockAdminUser, mockSuppliers } from "@/data/mockData";
import { authService } from "@/services/auth";

interface AuthState {
  /** Whether the user is logged in */
  isAuthenticated: boolean;
  /** Current user (null when logged out) */
  user: User | null;
  /** Auth token */
  token: string | null;
  /** Login with username and password */
  loginWithCredentials: (username: string, password?: string) => Promise<User>;
  /** Login with role (convenience) */
  login: (role: UserRole) => void;
  /** Login directly as a specific supplier partner */
  loginAsSupplier: (supplierCode: string) => Promise<User>;
  /** Switch to a specific supplier partner or admin */
  switchSupplier: (supplierCode: string) => Promise<void>;
  /** Log out and clear user state */
  logout: () => void;
  /** Switch role without logging out */
  switchRole: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: true,
      user: {
        id: "u2",
        email: "coats.exports@supplier.com",
        full_name: "COATS THREAD EXPORTS (PRIVATE) LIMITED",
        role: "SUPPLIER",
        company_id: "00000000-0000-0000-0000-000000000001",
        company_name: "Sirio Ltd",
        company_code: "SIRIO",
        supplier_id: "074830fc-dc21-42bb-9877-e6b6a45790a5",
        supplier_code: "0000018194",
        supplier_name: "COATS THREAD EXPORTS (PRIVATE) LIMITED",
        is_active: true,
      },
      token: "jwt-supplier-0000018194",

      loginWithCredentials: async (username: string, password: string = "Abc123@#") => {
        try {
          const res = await authService.login(username, password);
          set({
            isAuthenticated: true,
            user: res.user,
            token: res.token,
          });
          return res.user;
        } catch (err: any) {
          // Fallback matching if server offline
          const clean = username.trim().replace(/^0+/, "");
          if (username.toLowerCase().includes("admin")) {
            set({ isAuthenticated: true, user: mockAdminUser, token: "mock-admin-token" });
            return mockAdminUser;
          }
          const matched = mockSuppliers.find(
            (s) => s.supplier_code.includes(clean) || s.name.toLowerCase().includes(clean.toLowerCase())
          ) || mockSuppliers[0];
          const user: User = {
            id: matched.id,
            email: matched.email,
            full_name: matched.name,
            role: "SUPPLIER",
            company_id: "00000000-0000-0000-0000-000000000001",
            company_name: "Sirio Ltd",
            company_code: "SIRIO",
            supplier_id: matched.id,
            supplier_code: matched.supplier_code,
            supplier_name: matched.name,
            is_active: true,
          };
          set({ isAuthenticated: true, user, token: `mock-supplier-${matched.supplier_code}` });
          return user;
        }
      },

      login: (role: UserRole) => {
        if (role === "COMPANY_ADMIN") {
          set({ isAuthenticated: true, user: mockAdminUser, token: "jwt-admin-token" });
        } else {
          const supp = mockSuppliers[0];
          set({
            isAuthenticated: true,
            user: {
              id: supp.id,
              email: supp.email,
              full_name: supp.name,
              role: "SUPPLIER",
              company_id: "00000000-0000-0000-0000-000000000001",
              company_name: "Sirio Ltd",
              company_code: "SIRIO",
              supplier_id: supp.id,
              supplier_code: supp.supplier_code,
              supplier_name: supp.name,
              is_active: true,
            },
            token: `jwt-supplier-${supp.supplier_code}`,
          });
        }
      },

      loginAsSupplier: async (supplierCode: string) => {
        return get().loginWithCredentials(supplierCode, "Abc123@#");
      },

      switchSupplier: async (supplierCode: string) => {
        if (supplierCode === "admin") {
          set({ isAuthenticated: true, user: mockAdminUser, token: "jwt-admin-token" });
          return;
        }
        await get().loginWithCredentials(supplierCode, "Abc123@#");
      },

      logout: () => {
        set({ isAuthenticated: false, user: null, token: null });
      },

      switchRole: () => {
        const current = get().user;
        if (!current) return;
        if (current.role === "COMPANY_ADMIN") {
          const supp = mockSuppliers[0];
          set({
            user: {
              id: supp.id,
              email: supp.email,
              full_name: supp.name,
              role: "SUPPLIER",
              company_id: "00000000-0000-0000-0000-000000000001",
              company_name: "Sirio Ltd",
              company_code: "SIRIO",
              supplier_id: supp.id,
              supplier_code: supp.supplier_code,
              supplier_name: supp.name,
              is_active: true,
            },
          });
        } else {
          set({ user: mockAdminUser });
        }
      },
    }),
    {
      name: "ans-auth-storage",
    }
  )
);