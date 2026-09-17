/**
 * Main Layout — Sidebar, Header & Supplier Security Lockout Check
 */

import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useAuthStore } from "@/store/authStore";
import { ShieldAlert, Lock, Building2 } from "lucide-react";

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const user = useAuthStore((s) => s.user);
  const switchSupplier = useAuthStore((s) => s.switchSupplier);
  const isSupplier = user?.role === "SUPPLIER";

  // Determine supplier status from localStorage (live sync with Admin modifications)
  let supplierAccountState: "ACTIVE" | "INACTIVE" | "DELETED" = "ACTIVE";

  if (isSupplier && user?.supplier_code) {
    const savedStr = localStorage.getItem("asn_onboarded_suppliers");
    if (savedStr) {
      try {
        const suppliersList = JSON.parse(savedStr);
        const match = suppliersList.find(
          (s: any) =>
            s.supplier_code === user.supplier_code ||
            (s.email && s.email.toLowerCase() === user.email?.toLowerCase())
        );

        if (!match) {
          supplierAccountState = "DELETED";
        } else if (!match.is_active) {
          supplierAccountState = "INACTIVE";
        }
      } catch {
        supplierAccountState = "ACTIVE";
      }
    }
  }

  const isLockoutActive = isSupplier && supplierAccountState !== "ACTIVE";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className="flex-1 overflow-y-auto p-6">
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
                    className={`inline-block px-3 py-1 text-xs font-bold font-mono rounded-full ${
                      supplierAccountState === "DELETED"
                        ? "bg-red-100 text-red-700 border border-red-200"
                        : "bg-amber-100 text-amber-800 border border-amber-200"
                    }`}
                  >
                    STATUS: {supplierAccountState === "DELETED" ? "DELETED / REVOKED" : "INACTIVE / SUSPENDED"}
                  </span>

                  <h2 className="text-2xl font-extrabold text-gray-900">
                    {supplierAccountState === "DELETED"
                      ? "Supplier Account Access Revoked"
                      : "Supplier Partner Account Suspended"}
                  </h2>

                  <p className="text-sm text-gray-600 leading-relaxed">
                    {supplierAccountState === "DELETED" ? (
                      <>
                        This supplier partner account (<strong className="font-mono text-gray-900">#{user?.supplier_code}</strong>) has been <strong className="text-red-600">deleted</strong> from the platform by Sirio Central Admin. Access to emails, purchase orders, shipments, and ASNs has been permanently disabled.
                      </>
                    ) : (
                      <>
                        Your supplier partner account (<strong className="font-mono text-gray-900">#{user?.supplier_code} — {user?.supplier_name}</strong>) has been marked <strong className="text-amber-700">INACTIVE / SUSPENDED</strong> by Sirio Central Admin. Access to business data, inbound emails, purchase orders, and ASN dispatching is currently blocked.
                      </>
                    )}
                  </p>
                </div>

                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500 space-y-1">
                  <p className="font-semibold text-gray-700">Need Access Reactivation?</p>
                  <p>Please contact Sirio Admin HQ (<a href="mailto:sirio.asn.dev@gmail.com" className="text-blue-600 font-medium hover:underline">sirio.asn.dev@gmail.com</a>) to resolve account status.</p>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-center gap-3">
                  <button
                    onClick={() => switchSupplier("admin")}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 rounded-xl shadow-sm transition-all"
                  >
                    <Building2 className="w-4 h-4" />
                    Switch to Admin Portal
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
