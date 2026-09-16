// ─── Email Processing Page ──────────────────────────────────────
// frontend/src/pages/EmailInbox.tsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Search, RefreshCw, Eye, CheckCircle, XCircle, RotateCcw, ChevronLeft, ChevronRight, Clock, AlertCircle, Inbox } from "lucide-react";
import { emailApi } from "@/services/emailApi";
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
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Reset page when tab changes
  useEffect(() => { setPage(1); }, [activeTab]);

  const currentTab = TABS.find((t) => t.key === activeTab)!;

  const openEmail = (id: string) => navigate(`/emails/${id}`);

  // ─── Queries ────────────────────────────────────────────────
  const { data: emailsData, isLoading } = useQuery({
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

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSyncMailbox = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = (await emailApi.testPipeline("00000000-0000-0000-0000-000000000001")) as {
        emails_processed?: number;
      };
      const count = res?.emails_processed ?? 0;
      setSyncMessage(`Successfully fetched & processed ${count} unread email(s) from mailbox!`);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["emailStats"] });
      setTimeout(() => setSyncMessage(null), 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncMessage(`Failed to sync from mailbox: ${msg}`);
    } finally {
      setIsSyncing(false);
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
            Monitor and manage inbound email processing from IUNGO & suppliers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncMailbox}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Fetching Mailbox..." : "Fetch & Sync Emails"}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg flex items-center justify-between shadow-sm">
          <span>{syncMessage}</span>
          <button onClick={() => setSyncMessage(null)} className="text-blue-500 hover:text-blue-700 font-bold ml-4">
            ✕
          </button>
        </div>
      )}

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

      {/* Email Table — click a row to open the full email view */}
      <div>
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
                    onClick={() => openEmail(email.id)}
                    className="cursor-pointer hover:bg-blue-50 transition-colors"
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
                            openEmail(email.id);
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                          title="Open full email"
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
    </div>
  );
}
