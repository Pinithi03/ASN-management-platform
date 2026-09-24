/**
 * Login page — single entry point for both Admin & Supplier portals.
 * Allows 1-click access to Admin Portal or Supplier Portal.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Shield, Truck, ArrowLeft, Building2, ChevronRight } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/auth";
import type { SupplierSummary } from "@/types";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loginAsSupplier = useAuthStore((s) => s.loginAsSupplier);

  const [showSupplierList, setShowSupplierList] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([
    {
      id: "s1",
      supplier_code: "0000018194",
      name: "COATS THREAD EXPORTS (PRIVATE) LIMITED",
      email: "coats.exports@supplier.com",
      country: "Sri Lanka",
      total_orders: 8,
    },
    {
      id: "s2",
      supplier_code: "0000001122",
      name: "HAYLEYS FABRIC PLC",
      email: "hayleys.fabric@supplier.com",
      country: "Sri Lanka",
      total_orders: 3,
    },
    {
      id: "s3",
      supplier_code: "0000080589",
      name: "SOUTH ASIA TEXTILES (PRIVATE) LIMITED",
      email: "southasia.textiles@supplier.com",
      country: "Sri Lanka",
      total_orders: 1,
    },
  ]);

  useEffect(() => {
    authService
      .getSuppliers()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSuppliers(data.filter((s) => s.supplier_code !== "0000058376"));
        }
      })
      .catch(() => {
        // Keep defaults if API fails
      });
  }, []);

  // Admin 1-Click Login Handler — Instant Sub-10ms Navigation
  const handleAdminLogin = () => {
    login("COMPANY_ADMIN");
    navigate("/");
    authService.login("admin", "Abc123@#").catch(() => {});
  };

  // Supplier 1-Click Login Handler — Instant Sub-10ms Navigation
  const handleSupplierLogin = (supplierCode: string = "0000018194") => {
    loginAsSupplier(supplierCode);
    navigate("/");
    authService.login(supplierCode, "Abc123@#").catch(() => {});
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 py-12 px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo & Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-xl shadow-brand-500/20">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            ANS Management Platform
          </h1>
          <p className="text-sm text-gray-500">
            Oniverse Group — Email Automation & ASN Management
          </p>
        </div>

        {/* Login Selection */}
        {!showSupplierList ? (
          <div className="space-y-4">
            <p className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Select portal role to enter application
            </p>

            {/* 1. Admin Portal Button */}
            <button
              onClick={handleAdminLogin}
              className="group flex w-full items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-brand-600 hover:shadow-lg active:scale-[0.99]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <Shield className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-base font-bold text-gray-900 group-hover:text-brand-700">
                    Admin Portal
                  </p>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-brand-600 transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                  Plant admin — manage email ingestion, POs, ASNs, & suppliers
                </p>
              </div>
            </button>

            {/* 2. Supplier Portal Direct Button */}
            <div className="space-y-2">
              <button
                onClick={() => handleSupplierLogin("0000018194")}
                className="group flex w-full items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-emerald-600 hover:shadow-lg active:scale-[0.99]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                  <Truck className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-bold text-gray-900 group-hover:text-emerald-800">
                      Supplier Portal
                    </p>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 transition-transform group-hover:translate-x-1" />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                    Create shipments, generate 20-digit ASNs, view purchase orders
                  </p>
                </div>
              </button>

              {/* Sub-option to pick specific supplier account */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowSupplierList(true)}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline inline-flex items-center gap-1"
                >
                  Select specific partner account ({suppliers.length} available) →
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Specific Supplier Partner Selector */
          <div className="space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowSupplierList(false)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to main portal selection
              </button>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-300">
                Supplier Accounts
              </span>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Select Partner Supplier Account:
              </p>

              <div className="space-y-2.5">
                {suppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSupplierLogin(s.supplier_code)}
                    className="group flex w-full items-start gap-3.5 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-600 hover:bg-emerald-50/40 hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-sm font-bold text-gray-900 group-hover:text-emerald-950">
                          {s.name}
                        </p>
                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
                          #{s.supplier_code}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span>{s.total_orders} Active Orders</span>
                        <span>•</span>
                        <span>{s.country || "Sri Lanka"}</span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer info */}
        <p className="text-center text-xs text-gray-400">
          Development / Sandbox Mode — Keycloak SSO integration ready
        </p>
      </div>
    </div>
  );
}