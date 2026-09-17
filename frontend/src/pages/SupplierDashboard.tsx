// ─── Supplier Dashboard Page ───────────────────────────────────────
// frontend/src/pages/SupplierDashboard.tsx

import { useQuery } from "@tanstack/react-query";
import { Mail, FileText, Package, Truck, RefreshCw, UserCheck, ShieldCheck } from "lucide-react";
import { emailApi } from "@/services/emailApi";
import { poApi } from "@/services/poApi";
import { useAuthStore } from "@/store/authStore";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

export default function SupplierDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const { isLoading: emailLoading } = useQuery({
    queryKey: ["emailStats", user?.supplier_code],
    queryFn: () => emailApi.getStats(),
  });

  const { data: poStats, isLoading: poLoading } = useQuery({
    queryKey: ["poStats", user?.supplier_code],
    queryFn: () => poApi.getStats(user?.supplier_code),
  });

  const { data: recentEmails } = useQuery({
    queryKey: ["recentEmails", user?.supplier_code],
    queryFn: () =>
      emailApi.list({
        vendor_code: user?.supplier_code,
        per_page: 5,
      }),
  });

  const isLoading = emailLoading || poLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">Supplier Portal Dashboard</h1>
          <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-md border border-emerald-200 font-mono">
            #{user?.supplier_code}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, <span className="font-semibold text-gray-700">{user?.supplier_name || user?.full_name}</span>. Scoped partner overview for Oniverse Group Sri Lanka.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mr-2 text-emerald-500" />
          Loading supplier portal...
        </div>
      ) : (
        <>
          {/* Top 4 KPI Cards (Scoped) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Assigned Emails */}
            <div
              onClick={() => navigate("/emails")}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Emails Processed</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {recentEmails?.total ?? 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-500" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs">
                <span className="text-green-600 font-semibold">Scoped to #{user?.supplier_code}</span>
              </div>
            </div>

            {/* Card 2: Assigned Active POs */}
            <div
              onClick={() => navigate("/purchase-orders")}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Active Purchase Orders</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {poStats?.active ?? 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-emerald-500" />
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                {poStats?.total ?? 0} assigned POs
              </div>
            </div>

            {/* Card 3: Shipment Drafts */}
            <div
              onClick={() => navigate("/shipments")}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Shipment Drafts</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {poStats?.updated ?? 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                  <Package className="w-6 h-6 text-amber-500" />
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Your ready packing lists
              </div>
            </div>

            {/* Card 4: Dispatched ASNs */}
            <div
              onClick={() => navigate("/shipments")}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Dispatched ASNs</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {poStats?.shipped ?? 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <Truck className="w-6 h-6 text-indigo-500" />
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Your dispatched XML ASNs
              </div>
            </div>
          </div>

          {/* Middle Section — PO Breakdown & Supplier Partner Profile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Assigned PO Status Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Assigned Purchase Orders
                    </h2>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
                    {poStats?.total ?? 0} Assigned POs
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Status breakdown of your assigned purchase orders:
                </p>

                <div className="space-y-4 my-auto">
                  {poStats &&
                    [
                      { label: "Active", count: poStats.active, color: "bg-emerald-500" },
                      { label: "Updated", count: poStats.updated, color: "bg-blue-500" },
                      { label: "Shipped", count: poStats.shipped, color: "bg-indigo-500" },
                      { label: "Completed", count: poStats.completed, color: "bg-green-600" },
                      { label: "Cancelled", count: poStats.cancelled, color: "bg-gray-400" },
                    ].map((item) => {
                      const pct = poStats.total > 0 ? (item.count / poStats.total) * 100 : 0;
                      return (
                        <div
                          key={item.label}
                          onClick={() => navigate("/purchase-orders")}
                          className="flex items-center gap-3 p-1 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <span className="text-xs font-semibold text-gray-700 w-24">{item.label}</span>
                          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${item.color} rounded-full transition-all duration-300`}
                              style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-gray-900 w-10 text-right font-mono">
                            {item.count}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>Assigned purchase order list</span>
                <button
                  onClick={() => navigate("/purchase-orders")}
                  className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                >
                  View My Purchase Orders →
                </button>
              </div>
            </div>

            {/* Supplier Partner Profile Card */}
            <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm flex flex-col justify-between h-full bg-gradient-to-br from-white to-emerald-50/30">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Supplier Partner Profile
                    </h2>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md border border-emerald-200 font-mono">
                    #{user?.supplier_code}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Authenticated supplier portal context — scoped strictly to your assigned POs & ASNs:
                </p>

                <div className="space-y-3 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <div>
                    <span className="text-xs text-gray-400 font-medium">Partner Name</span>
                    <p className="text-sm font-bold text-gray-900">{user?.supplier_name || user?.full_name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">Supplier Code:</span>
                      <p className="font-mono font-bold text-emerald-700">{user?.supplier_code}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Portal Security:</span>
                      <p className="font-semibold text-green-600 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Scoped Access
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>Authorized Calzedonia Partner</span>
                <button
                  onClick={() => navigate("/shipments")}
                  className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                >
                  Dispatch New ASN →
                </button>
              </div>
            </div>
          </div>

          {/* Assigned Recent Inbound Emails */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Assigned Inbound Emails</h2>
              <button
                onClick={() => navigate("/emails")}
                className="text-sm text-emerald-700 hover:text-emerald-800 font-semibold"
              >
                View my emails →
              </button>
            </div>

            {recentEmails?.items.length ? (
              <div className="space-y-2">
                {recentEmails.items.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => navigate("/emails")}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-emerald-50/50 cursor-pointer transition-colors border border-transparent hover:border-gray-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {email.subject || "No subject"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {email.from_address || "Unknown sender"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs text-gray-400">
                        {email.received_at ? format(new Date(email.received_at), "MMM d, HH:mm") : "—"}
                      </span>
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800 font-mono">
                        #{user?.supplier_code}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">No emails assigned to supplier code #{user?.supplier_code} yet</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
