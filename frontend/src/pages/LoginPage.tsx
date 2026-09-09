/**
 * Login page — single entry point for both portals.
 * In production this will redirect to Keycloak; for now
 * it lets you pick a role to enter the mock portal.
 */

import { useNavigate } from "react-router-dom";
import { Package, Shield, Truck } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const handleLogin = (role: UserRole) => {
    login(role);
    navigate("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="w-full max-w-md space-y-8 px-4">
        {/* Logo & title */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            ANS Management Platform
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Oniverse Group — Email Automation & ASN Management
          </p>
        </div>

        {/* Role selection cards */}
        <div className="space-y-3">
          <p className="text-center text-sm font-medium text-gray-600">
            Select your role to continue
          </p>

          {/* Admin card */}
          <button
            onClick={() => handleLogin("COMPANY_ADMIN")}
            className="group flex w-full items-center gap-4 rounded-xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-brand-500 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-600">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">
                Admin Portal
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                Plant admin — manage emails, POs, ASNs, and suppliers
              </p>
            </div>
          </button>

          {/* Supplier card */}
          <button
            onClick={() => handleLogin("SUPPLIER")}
            className="group flex w-full items-center gap-4 rounded-xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-emerald-500 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-200">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">
                Supplier Portal
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                Create shipments, generate ASNs, view purchase orders
              </p>
            </div>
          </button>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400">
          Development mode — in production, login is handled by Keycloak SSO
        </p>
      </div>
    </div>
  );
}