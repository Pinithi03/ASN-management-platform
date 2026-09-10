// ─── Email Processing Page ──────────────────────────────────────
// frontend/src/pages/EmailInbox.tsx

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Search, RefreshCw, Eye, CheckCircle, XCircle, RotateCcw, ChevronLeft, ChevronRight, Clock, AlertCircle, Inbox, Filter } from "lucide-react";
import { emailApi } from "@/services/emailApi";
import type { EmailRecord, EmailDetail, EmailStatus } from "@/types/email";
import { format } from "date-fns";

type TabKey = "ALL" | "REVIEW" | "PARSED" | "COMMITTED" | "ERROR";

const TABS: { key: TabKey; label: string; status?: string; icon: typeof Mail }[] = [
  { key: "ALL", label: "All Emails", icon: Inbox },
  { key: "PARSED", label: "Parsed", status: "PARSED", icon: CheckCircle },
  { key: "REVIEW", label: "In Review", status: "REVIEW", icon: Clock },
  { key: "COMMITTED", label: "Committed", status: "COMMITTED", icon: CheckCircle },
  { key: "ERROR", label: "Errors", status: "ERROR", icon: AlertCircle },
];

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-gray-100 text-gray-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  PARSED: "bg-green-100 text-green-700",
  REVIEW: "bg-yellow-100 text-yellow-700",
  COMMITTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  ERROR: "bg-red-100 text-red-700",
};

export default function EmailInbox() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  // Reset page when tab changes
  useEffect(() => { setPage(1); }, [activeTab]);

  const currentTab = TABS.find((t) => t.key === activeTab)!;

  // ─── Queries ────────────────────────────────────────────────
  const { data: emailsData, isLoading, refetch } = useQuery({
    queryKey: ["emails", activeTab, search, page],
    queryFn: () =>
      emailApi.list({
        status: currentTab.status,
        search: search || undefined,
        page,
        per_page: 15,
      }),
  });

  const { data: stats } = useQuery({
    queryKey: ["emailStats"],
    queryFn: () => emailApi.getStats(),
  });

  const { data: emailDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["emailDetail", selectedEmailId],
    queryFn: () => emailApi.getById(selectedEmailId!),
    enabled: !!selectedEmailId,
  });

  // ─── Mutations ──────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: (id: string) => emailApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["emailStats"] });
      queryClient.invalidateQueries({ queryKey: ["emailDetail"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      emailApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["emailStats"] });
      queryClient.invalidateQueries({ queryKey: ["emailDetail"] });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => emailApi.reprocess(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["emailStats"] });
    },
  });

  const handleReject = (id: string) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason) {
      rejectMutation.mutate({ id, reason });
    }
  };

  const emails = emailsData?.items ?? [];
  const totalPages = emailsData?.pages ?? 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Email Processing</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor and manage inbound email processing
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Total", value: stats.total, color: "border-gray-300" },
            { label: "Queued", value: stats.queued, color: "border-gray-400" },
            { label: "Parsed", value: stats.parsed, color: "border-green-400" },
            { label: "Review", value: stats.review, color: "border-yellow-400" },
            { label: "Committed", value: stats.committed, color: "border-emerald-400" },
            { label: "Rejected", value: stats.rejected, color: "border-red-400" },
            { label: "Errors", value: stats.error, color: "border-red-500" },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-white rounded-lg border-l-4 ${stat.color} p-3 shadow-sm`}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const count =
              tab.key === "ALL"
                ? stats?.total
                : stats?.[tab.status?.toLowerCase() as keyof typeof stats];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <tab.icon className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                {tab.label}
                {count !== undefined && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-gray-100 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by subject, sender..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Main Content: Table + Detail Panel */}
      <div className="flex gap-6">
        {/* Email Table */}
        <div className={`${selectedEmailId ? "w-1/2" : "w-full"} transition-all`}>
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              Loading emails...
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Mail className="w-12 h-12 mb-3" />
              <p className="text-lg">No emails found</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Sender</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Subject</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Received</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {emails.map((email) => (
                    <tr
                      key={email.id}
                      onClick={() => setSelectedEmailId(email.id)}
                      className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                        selectedEmailId === email.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 max-w-[160px] truncate text-gray-900">
                        {email.from_address || "—"}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-gray-700">
                        {email.subject || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded">
                          {email.email_type || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${
                            STATUS_COLORS[email.status] || "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {email.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {email.received_at
                          ? format(new Date(email.received_at), "MMM d, HH:mm")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEmailId(email.id);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {(email.status === "PARSED" || email.status === "REVIEW") && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  approveMutation.mutate(email.id);
                                }}
                                className="p-1.5 text-gray-400 hover:text-green-600 rounded"
                                title="Approve"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReject(email.id);
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {email.status === "ERROR" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                reprocessMutation.mutate(email.id);
                              }}
                              className="p-1.5 text-gray-400 hover:text-orange-600 rounded"
                              title="Reprocess"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <p className="text-sm text-gray-500">
                    Page {page} of {totalPages} ({emailsData?.total} total)
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="p-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedEmailId && (
          <div className="w-1/2 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="font-medium text-gray-900">Email Detail</h3>
              <button
                onClick={() => setSelectedEmailId(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕ Close
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Loading...
              </div>
            ) : emailDetail ? (
              <div className="p-4 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
                {/* Email Meta */}
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium text-gray-900 text-lg leading-tight">
                      {emailDetail.subject || "No subject"}
                    </h4>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded shrink-0 ml-2 ${
                        STATUS_COLORS[emailDetail.status] || ""
                      }`}
                    >
                      {emailDetail.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">From:</span>{" "}
                      <span className="text-gray-900">{emailDetail.from_address || "—"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">To:</span>{" "}
                      <span className="text-gray-900">{emailDetail.to_address || "—"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Type:</span>{" "}
                      <span className="text-gray-900">{emailDetail.email_type || "—"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Received:</span>{" "}
                      <span className="text-gray-900">
                        {emailDetail.received_at
                          ? format(new Date(emailDetail.received_at), "MMM d yyyy, HH:mm")
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Error message */}
                {emailDetail.error_message && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 inline mr-1 -mt-0.5" />
                    {emailDetail.error_message}
                  </div>
                )}

                {/* Body preview */}
                {emailDetail.body_text && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-500 mb-1">Body Preview</h5>
                    <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-xs">
                      {emailDetail.body_text.substring(0, 1000)}
                    </div>
                  </div>
                )}

                {/* Parsed Data */}
                {emailDetail.parsed_data.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-500 mb-2">
                      Parsed Data ({emailDetail.parsed_data.length})
                    </h5>
                    {emailDetail.parsed_data.map((pd) => (
                      <div
                        key={pd.id}
                        className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2 mb-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
                            {pd.parser_used}
                          </span>
                          {pd.po_number_extracted && (
                            <span className="text-sm font-medium text-gray-900">
                              PO# {pd.po_number_extracted}
                            </span>
                          )}
                        </div>
                        {pd.normalized && (
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            {pd.normalized.supplier_name && (
                              <div>
                                <span className="text-gray-500">Supplier:</span>{" "}
                                {pd.normalized.supplier_name}
                              </div>
                            )}
                            {pd.normalized.total_quantity !== undefined && (
                              <div>
                                <span className="text-gray-500">Qty:</span>{" "}
                                {pd.normalized.total_quantity?.toLocaleString()}
                              </div>
                            )}
                            {pd.normalized.currency && (
                              <div>
                                <span className="text-gray-500">Currency:</span>{" "}
                                {pd.normalized.currency}
                              </div>
                            )}
                            {pd.normalized.line_count !== undefined && (
                              <div>
                                <span className="text-gray-500">Lines:</span>{" "}
                                {pd.normalized.line_count}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                {(emailDetail.status === "PARSED" || emailDetail.status === "REVIEW") && (
                  <div className="flex gap-2 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => approveMutation.mutate(emailDetail.id)}
                      disabled={approveMutation.isPending}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(emailDetail.id)}
                      disabled={rejectMutation.isPending}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
                {emailDetail.status === "ERROR" && (
                  <div className="pt-2 border-t border-gray-200">
                    <button
                      onClick={() => reprocessMutation.mutate(emailDetail.id)}
                      disabled={reprocessMutation.isPending}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reprocess
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}