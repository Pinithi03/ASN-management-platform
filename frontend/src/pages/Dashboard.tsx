// ─── Dashboard Page ─────────────────────────────────────────────
// frontend/src/pages/Dashboard.tsx

import { useQuery } from "@tanstack/react-query";
import { Mail, FileText, Package, Truck, RefreshCw, Building2, MapPin, ArrowRight } from "lucide-react";
import { emailApi } from "@/services/emailApi";
import { poApi } from "@/services/poApi";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const SRI_LANKA_PLANTS = [
  { name: "Sirio Ltd", code: "SIRIO (PPA1)", location: "Badalgama", status: "Active", bg: "bg-blue-50 text-blue-700 border-blue-200" },
  { name: "Benjio Ltd", code: "BENJIO (PPC1)", location: "Bingiriya", status: "Active", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { name: "Omega Line Ltd", code: "OMEGA (PPA2)", location: "Sandalankawa", status: "Active", bg: "bg-purple-50 text-purple-700 border-purple-200" },
  { name: "Alpha Apparels Ltd", code: "ALPHA (PPA3)", location: "Polgahawela", status: "Active", bg: "bg-amber-50 text-amber-700 border-amber-200" },
  { name: "Aqua Dynamics Ltd", code: "AQUA (PPA4)", location: "Negombo", status: "Active", bg: "bg-indigo-50 text-indigo-700 border-indigo-200" },
];

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: emailStats, isLoading: emailLoading } = useQuery({
    queryKey: ["emailStats"],
    queryFn: () => emailApi.getStats(),
  });

  const { data: poStats, isLoading: poLoading } = useQuery({
    queryKey: ["poStats"],
    queryFn: () => poApi.getStats(),
  });

  const { data: recentEmails } = useQuery({
    queryKey: ["recentEmails"],
    queryFn: () => emailApi.list({ per_page: 5 }),
  });

  const isLoading = emailLoading || poLoading;

  // Calculate success rate for automated email parsing
  const successRate = emailStats?.total
    ? Math.round(
        ((emailStats.committed + emailStats.parsed) / emailStats.total) * 100
      )
    : 100;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Multi-company Email Automation & ASN Management Platform — Oniverse Group Sri Lanka
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mr-2 text-blue-500" />
          Loading dashboard...
        </div>
      ) : (
        <>
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Emails Processed */}
            <div
              onClick={() => navigate("/emails")}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Emails Processed</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {emailStats?.total ?? 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-500" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs">
                <span className="text-green-600 font-semibold">{successRate}% auto-parsed</span>
              </div>
            </div>

            {/* Card 2: Active Purchase Orders */}
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
                {poStats?.total ?? 0} total POs in system
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
                Ready for packing list generation
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
                Calzedonia XML generated & sent
              </div>
            </div>
          </div>

          {/* Middle Section — Perfectly Aligned Height Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Purchase Order Status Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Purchase Order Status
                    </h2>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
                    {poStats?.total ?? 0} Total POs
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Lifecycle status breakdown of active, updated, and completed POs:
                </p>

                <div className="space-y-4 my-auto">
                  {poStats &&
                    [
                      { label: "Active", count: poStats.active, color: "bg-emerald-500", total: poStats.total },
                      { label: "Updated", count: poStats.updated, color: "bg-blue-500", total: poStats.total },
                      { label: "Shipped", count: poStats.shipped, color: "bg-indigo-500", total: poStats.total },
                      { label: "Completed", count: poStats.completed, color: "bg-green-600", total: poStats.total },
                      { label: "Cancelled", count: poStats.cancelled, color: "bg-gray-400", total: poStats.total },
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
                <span>All company purchase orders</span>
                <button
                  onClick={() => navigate("/purchase-orders")}
                  className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                >
                  Manage Purchase Orders →
                </button>
              </div>
            </div>

            {/* Plant Operations Overview — 5 Sri Lanka Plants */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Plant Operations Overview
                    </h2>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
                    5 Plants
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Manufacturing plant status & ASN dispatch centers across Sri Lanka:
                </p>

                <div className="space-y-2">
                  {SRI_LANKA_PLANTS.map((plant) => (
                    <div
                      key={plant.name}
                      onClick={() => navigate("/shipments")}
                      className="p-2.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 flex items-center justify-between transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {plant.name}{" "}
                            <span className="font-normal text-gray-400">({plant.location})</span>
                          </p>
                          <p className="text-[11px] text-gray-500 font-mono">{plant.code}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${plant.bg}`}>
                          {plant.status}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>Oniverse Group (Calzedonia) Sri Lanka</span>
                <button
                  onClick={() => navigate("/shipments")}
                  className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                >
                  Manage Shipments →
                </button>
              </div>
            </div>
          </div>

          {/* Recent Emails Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Inbound Emails</h2>
              <button
                onClick={() => navigate("/emails")}
                className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
              >
                View all emails →
              </button>
            </div>

            {recentEmails?.items.length ? (
              <div className="space-y-2">
                {recentEmails.items.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => navigate("/emails")}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-blue-50/50 cursor-pointer transition-colors border border-transparent hover:border-gray-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-blue-600" />
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
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800">
                        AUTO-PARSED
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">No emails ingested yet</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}