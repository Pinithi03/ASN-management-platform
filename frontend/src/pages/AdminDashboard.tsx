// ─── Admin Dashboard Page ──────────────────────────────────────────
// frontend/src/pages/AdminDashboard.tsx

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, FileText, Package, Truck, RefreshCw, ScrollText, ShieldAlert, BarChart3, TrendingUp } from "lucide-react";
import { emailApi } from "@/services/emailApi";
import { poApi } from "@/services/poApi";
import { auditApi } from "@/services/auditApi";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const PLANT_METRICS = [
  { name: "Sirio Ltd", code: "SIRIO", location: "Badalgama", asns: 42, emails: 128, success: 98, color: "bg-blue-500", text: "text-blue-600", lightBg: "bg-blue-50" },
  { name: "Benji Ltd", code: "BENJI", location: "Bingiriya", asns: 35, emails: 94, success: 96, color: "bg-emerald-500", text: "text-emerald-600", lightBg: "bg-emerald-50" },
  { name: "Omega Line Ltd", code: "OMEGA", location: "Sandalankawa", asns: 48, emails: 142, success: 100, color: "bg-purple-500", text: "text-purple-600", lightBg: "bg-purple-50" },
  { name: "Alpha Apparels", code: "ALPHA", location: "Polgahawela", asns: 29, emails: 82, success: 95, color: "bg-amber-500", text: "text-amber-600", lightBg: "bg-amber-50" },
  { name: "Vavuniya Apparels", code: "VAVUNIYA", location: "Vavuniya", asns: 38, emails: 105, success: 97, color: "bg-indigo-500", text: "text-indigo-600", lightBg: "bg-indigo-50" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeMetric, setActiveMetric] = useState<"asns" | "emails" | "success">("asns");

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

  const { data: recentAuditLogs } = useQuery({
    queryKey: ["recentAuditLogs"],
    queryFn: () => auditApi.list({ per_page: 5 }),
  });

  const isLoading = emailLoading || poLoading;

  // Calculate success rate for automated email parsing
  const successRate = emailStats?.total
    ? Math.round(((emailStats.committed + emailStats.parsed) / emailStats.total) * 100)
    : 100;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Multi-company Email Automation & ASN Management Platform — Oniverse Group Sri Lanka
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mr-2 text-blue-500" />
          Loading admin dashboard...
        </div>
      ) : (
        <>
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Emails Processed */}
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

          {/* Middle Section — PO Status Breakdown & Plant Operations */}
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
                  Lifecycle status breakdown of active, updated, and completed POs across system:
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

            {/* Plant Operations & Throughput Graph */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col justify-between h-full">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Plant Operations & Throughput
                    </h2>
                  </div>

                  {/* Metric Toggle Pills */}
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg self-start sm:self-auto">
                    {[
                      { id: "asns", label: "ASNs" },
                      { id: "emails", label: "Emails" },
                      { id: "success", label: "Success %" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setActiveMetric(m.id as "asns" | "emails" | "success")}
                        className={`px-2.5 py-0.5 text-xs font-semibold rounded-md transition-all ${
                          activeMetric === m.id
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-gray-500 mb-4">
                  Comparative performance & volume distribution across 5 apparel manufacturing plants:
                </p>

                {/* Graph Visualization Container */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="h-44 flex items-end justify-between gap-3 px-2 pb-2">
                    {PLANT_METRICS.map((plant) => {
                      const maxVal = Math.max(...PLANT_METRICS.map((p) => p[activeMetric]));
                      const val = plant[activeMetric];
                      const heightPct = maxVal > 0 ? Math.max(18, Math.round((val / maxVal) * 100)) : 10;

                      return (
                        <div key={plant.code} className="flex-1 flex flex-col items-center group relative">
                          {/* Floating Hover Tooltip */}
                          <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gray-900 text-white text-[11px] rounded-lg py-1 px-2.5 shadow-xl whitespace-nowrap z-20">
                            <p className="font-bold">{plant.name}</p>
                            <p className="text-gray-300">
                              {activeMetric === "asns"
                                ? `${val} ASNs Dispatched`
                                : activeMetric === "emails"
                                ? `${val} Emails Parsed`
                                : `${val}% Auto-Parsed`}
                              {" • "}{plant.location}
                            </p>
                          </div>

                          {/* Value Badge above Bar */}
                          <span className="text-xs font-bold text-gray-700 mb-1.5 font-mono transition-transform group-hover:scale-110">
                            {val}{activeMetric === "success" ? "%" : ""}
                          </span>

                          {/* Bar Graphic with Hover Effect */}
                          <div className="w-full bg-gray-100 rounded-t-lg overflow-hidden flex items-end h-32 p-0.5">
                            <div
                              className={`w-full ${plant.color} rounded-t-md transition-all duration-500 group-hover:brightness-110 shadow-sm`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>

                          {/* Plant Code Label below Bar */}
                          <span className="mt-2 text-[11px] font-bold text-gray-500 font-mono tracking-wider group-hover:text-gray-900">
                            {plant.code}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Card Footer Summary */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span>5-Plant Operations Active</span>
                </span>
                <span className="font-semibold text-gray-700 font-mono">
                  {PLANT_METRICS.reduce((acc, p) => acc + p.asns, 0)} Total ASNs
                </span>
              </div>
            </div>
          </div>

          {/* Recent Activity Grid: Inbound Emails & Audit Trail */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent System Inbound Emails */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent Inbound System Emails</h2>
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
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800 border border-blue-200">
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

            {/* Audit Trail & System Activity Stream */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ScrollText className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-lg font-semibold text-gray-900">System Audit Stream</h2>
                </div>
                <button
                  onClick={() => navigate("/audit-logs")}
                  className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
                >
                  View full audit log →
                </button>
              </div>

              {recentAuditLogs?.items.length ? (
                <div className="space-y-2">
                  {recentAuditLogs.items.map((log) => (
                    <div
                      key={log.id}
                      onClick={() => navigate("/audit-logs")}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-gray-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                          <ShieldAlert className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {log.action}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {log.user?.email || log.user?.full_name || log.user_id || "System"} • {log.entity_type}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-gray-400">
                          {log.created_at ? format(new Date(log.created_at), "MMM d, HH:mm") : "—"}
                        </span>
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {log.entity_type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No administrative audit records logged yet</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
