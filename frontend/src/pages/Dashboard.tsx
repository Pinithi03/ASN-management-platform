// ─── Dashboard Page ─────────────────────────────────────────────
// frontend/src/pages/Dashboard.tsx

import { useQuery } from "@tanstack/react-query";
import { Mail, FileText, AlertCircle, CheckCircle, Clock, Package, TrendingUp, RefreshCw } from "lucide-react";
import { emailApi } from "@/services/emailApi";
import { poApi } from "@/services/poApi";
import { useNavigate } from "react-router-dom";

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

  // Calculate success rate
  const successRate = emailStats?.total
    ? Math.round(
        ((emailStats.committed + emailStats.parsed) / emailStats.total) * 100
      )
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Email processing and purchase order overview
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          Loading dashboard...
        </div>
      ) : (
        <>
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Emails Processed */}
            <div
              onClick={() => navigate("/emails")}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Emails Processed</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {emailStats?.total ?? 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-500" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-green-600 font-medium">{successRate}% success rate</span>
              </div>
            </div>

            {/* Active POs */}
            <div
              onClick={() => navigate("/purchase-orders")}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Active Purchase Orders</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {poStats?.active ?? 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-500" />
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                {poStats?.total ?? 0} total POs
              </div>
            </div>

            {/* Review Queue */}
            <div
              onClick={() => navigate("/review")}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Review</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {emailStats?.review ?? 0}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  (emailStats?.review ?? 0) > 0 ? "bg-yellow-50" : "bg-gray-50"
                }`}>
                  <Clock className={`w-6 h-6 ${
                    (emailStats?.review ?? 0) > 0 ? "text-yellow-500" : "text-gray-400"
                  }`} />
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                {(emailStats?.review ?? 0) > 0 ? "Needs attention" : "Queue clear"}
              </div>
            </div>

            {/* Errors */}
            <div
              onClick={() => navigate("/emails")}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Errors</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {emailStats?.error ?? 0}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  (emailStats?.error ?? 0) > 0 ? "bg-red-50" : "bg-gray-50"
                }`}>
                  <AlertCircle className={`w-6 h-6 ${
                    (emailStats?.error ?? 0) > 0 ? "text-red-500" : "text-gray-400"
                  }`} />
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                {(emailStats?.error ?? 0) > 0 ? "Requires reprocessing" : "No errors"}
              </div>
            </div>
          </div>

          {/* Two-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Email Status Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Email Processing Status
              </h2>
              <div className="space-y-3">
                {emailStats &&
                  [
                    { label: "Parsed", count: emailStats.parsed, color: "bg-green-500", total: emailStats.total },
                    { label: "Committed", count: emailStats.committed, color: "bg-emerald-500", total: emailStats.total },
                    { label: "In Review", count: emailStats.review, color: "bg-yellow-500", total: emailStats.total },
                    { label: "Queued", count: emailStats.queued, color: "bg-gray-400", total: emailStats.total },
                    { label: "Errors", count: emailStats.error, color: "bg-red-500", total: emailStats.total },
                    { label: "Rejected", count: emailStats.rejected, color: "bg-red-300", total: emailStats.total },
                  ].map((item) => {
                    const pct = emailStats.total > 0 ? (item.count / emailStats.total) * 100 : 0;
                    return (
                      <div key={item.label} className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 w-24">{item.label}</span>
                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${item.color} rounded-full transition-all`}
                            style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-10 text-right">
                          {item.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* PO Status Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Purchase Order Status
              </h2>
              <div className="space-y-3">
                {poStats &&
                  [
                    { label: "Active", count: poStats.active, color: "bg-green-500", total: poStats.total },
                    { label: "Updated", count: poStats.updated, color: "bg-blue-500", total: poStats.total },
                    { label: "Shipped", count: poStats.shipped, color: "bg-indigo-500", total: poStats.total },
                    { label: "Completed", count: poStats.completed, color: "bg-emerald-500", total: poStats.total },
                    { label: "Cancelled", count: poStats.cancelled, color: "bg-red-500", total: poStats.total },
                  ].map((item) => {
                    const pct = poStats.total > 0 ? (item.count / poStats.total) * 100 : 0;
                    return (
                      <div key={item.label} className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 w-24">{item.label}</span>
                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${item.color} rounded-full transition-all`}
                            style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-10 text-right">
                          {item.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Recent Emails */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Recent Emails</h2>
              <button
                onClick={() => navigate("/emails")}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View all →
              </button>
            </div>

            {recentEmails?.items.length ? (
              <div className="space-y-2">
                {recentEmails.items.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => navigate("/emails")}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate">
                          {email.subject || "No subject"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {email.from_address}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                          STATUS_COLORS[email.status as keyof typeof STATUS_COLORS] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {email.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">No emails yet</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Re-use email status colors here
const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-gray-100 text-gray-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  PARSED: "bg-green-100 text-green-700",
  REVIEW: "bg-yellow-100 text-yellow-700",
  COMMITTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  ERROR: "bg-red-100 text-red-700",
};