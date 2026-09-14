/**
 * Login page — single entry point for both portals.
 * In production this will redirect to Keycloak; for now
 * it lets you pick a role to enter the portal.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Shield, Truck, ArrowLeft, Loader2, Building2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/auth";
import type { SupplierSummary } from "@/types";

export default function LoginPage() {
  const navigate = useNavigate();
  const loginWithCredentials = useAuthStore((s) => s.loginWithCredentials);

  const [selectedRole, setSelectedRole] = useState<"SUPPLIER" | null>(null);
  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          // Filter out SIRIO supplier division
          setSuppliers(data.filter((s) => s.supplier_code !== "0000058376"));
        }
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  const handleAdminLogin = async () => {
    setLoadingCode("admin");
    setError(null);
    try {
      await loginWithCredentials("admin", "Abc123@#");
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Admin authentication failed.");
    } finally {
      setLoadingCode(null);
    }
  };

  const handleSupplierLogin = async (supplierCode: string) => {
    setLoadingCode(supplierCode);
    setError(null);
    try {
      await loginWithCredentials(supplierCode, "Abc123@#");
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Supplier authentication failed.");
    } finally {
      setLoadingCode(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 py-12 px-4">
      <div className="w-full max-w-md space-y-8">
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

        {/* Error notification */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Dynamic view based on role selection */}
        {selectedRole === null ? (
          /* Main Role selection cards */
          <div className="space-y-3">
            <p className="text-center text-sm font-medium text-gray-600">
              Select your role to continue
            </p>

            {/* Admin card */}
            <button
              onClick={handleAdminLogin}
              disabled={loadingCode !== null}
              className="group flex w-full items-center gap-4 rounded-xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-brand-500 hover:shadow-md disabled:opacity-60"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-600">
                {loadingCode === "admin" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
                ) : (
                  <Shield className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1">
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
              onClick={() => setSelectedRole("SUPPLIER")}
              disabled={loadingCode !== null}
              className="group flex w-full items-center gap-4 rounded-xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-emerald-500 hover:shadow-md"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-200">
                <Truck className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900">
                  Supplier Portal
                </p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Create shipments, generate ASNs, view purchase orders
                </p>
              </div>
            </button>
          </div>
        ) : (
          /* Supplier Portal: Verified Partners (1-Click Login) */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedRole(null)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to role selection
              </button>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                Supplier Portal
              </span>
            </div>

            <div className="space-y-2.5">
              <p className="text-sm font-semibold text-gray-800">
                Verified Partners (1-Click Login):
              </p>

              <div className="space-y-2.5">
                {suppliers.map((s) => {
                  const isLoading = loadingCode === s.supplier_code;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSupplierLogin(s.supplier_code)}
                      disabled={loadingCode !== null}
                      className="group flex w-full items-start gap-3.5 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-500 hover:bg-emerald-50/20 hover:shadow-md disabled:opacity-60"
                    >
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 transition-colors group-hover:bg-emerald-200">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
                        ) : (
                          <Building2 className="h-4 w-4" />
                        )}
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
                        <p className="text-xs text-gray-500 mt-1">
                          {s.total_orders} Active Orders • {s.country || "Sri Lanka"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400">
          Development mode — in production, login is handled by Keycloak SSO
        </p>
      </div>
    </div>
  );
}