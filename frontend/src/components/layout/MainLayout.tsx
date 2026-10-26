/**
 * Main Layout — Sidebar, Header & Supplier Security Lockout Check
 */

import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";
import { supplierApi } from "@/services/supplierApi";
import { ShieldAlert, Lock, Building2 } from "lucide-react";

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isSupplier = user?.role === "SUPPLIER";

  // Determine supplier status from live backend API (live sync across all sessions)
  const { data: supplierProfile } = useQuery({
    queryKey: ["currentSupplierStatus", user?.supplier_code],
    queryFn: async () => {
      if (!isSupplier || !user?.supplier_code) return null;
      const list = await supplierApi.list({ include_deleted: true });
      return (
        list.find(
          (s) =>
            s.supplier_code === user.supplier_code ||
            (s.email && s.email.toLowerCase() === user.email?.toLowerCase())
        ) || null
      );
    },
    enabled: isSupplier && !!user?.supplier_code,
    refetchInterval: 10000,
  });

  let supplierAccountState: "ACTIVE" | "INACTIVE" | "DELETED" = "ACTIVE";
  if (isSupplier && supplierProfile) {
    if (supplierProfile.is_deleted) {
      supplierAccountState = "DELETED";
    } else if (!supplierProfile.is_active) {
      supplierAccountState = "INACTIVE";
    }
  }

  const isLockoutActive = isSupplier && supplierAccountState !== "ACTIVE";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className="flex-1 overflow-y-auto">
          {isLockoutActive ? (
            <div className="flex flex-col items-center justify-center min-h-[75vh] p-6 text-center animate-in fade-in">
              <div className="bg-white rounded-3xl border border-red-200 p-8 shadow-xl max-w-lg w-full space-y-5 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 shadow-inner">
                  {supplierAccountState === "DELETED" ? (
                    <ShieldAlert className="w-8 h-8" />
                  ) : (
                    <Lock className="w-8 h-8" />
                  )}
                </div>

                <div className="space-y-2">
                  <span
                    className={`inline-block px-3 py-1 text-xs font-semibold font-mono rounded-full ${
                      supplierAccountState === "DELETED"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {supplierAccountState === "DELETED" ? "Account Revoked" : "Account Suspended"}
                  </span>

                  <h2 className="text-xl font-bold text-slate-900">
                    {supplierAccountState === "DELETED"
                      ? "Account Access Revoked"
                      : "Account Temporarily Suspended"}
                  </h2>

                  <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                    {supplierAccountState === "DELETED"
                      ? "This supplier account has been removed. Platform access has been disabled."
                      : "Your supplier partner account is currently suspended by central administration."}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                  <p>Contact Administration at <a href="mailto:sirio.asn.dev@gmail.com" className="text-brand-600 font-medium hover:underline">sirio.asn.dev@gmail.com</a> to resolve your account status.</p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-center">
                  <button
                    onClick={() => logout()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 rounded-lg shadow-2xs transition-all"
                  >
                    <Building2 className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
