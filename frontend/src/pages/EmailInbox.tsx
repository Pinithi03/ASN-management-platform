// ─── Email Processing Page ──────────────────────────────────────
// frontend/src/pages/EmailInbox.tsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Search,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Filter,
  FileText,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { emailApi } from "@/services/emailApi";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";

export default function EmailInbox() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "COMPANY_ADMIN";

  const [search, setSearch] = useState("");
  const [poNumberFilter, setPoNumberFilter] = useState("");
  const [vendorCodeFilter, setVendorCodeFilter] = useState("");
  const [page, setPage] = useState(1);

  // Effective vendor filter — automatically enforced for Supplier Role users
  const effectiveVendorCode = !isAdmin ? user?.supplier_code : vendorCodeFilter;

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1);
  }, [search, poNumberFilter, effectiveVendorCode]);

  // ─── Queries ────────────────────────────────────────────────
  const { data: emailsData, isLoading, isFetching } = useQuery({
    queryKey: ["emails", search, poNumberFilter, effectiveVendorCode, page, user?.role],
    queryFn: () =>
      emailApi.list({
        search: search || undefined,
        po_number: poNumberFilter || undefined,
        vendor_code: effectiveVendorCode || undefined,
        page,
        per_page: 50,
      }),
    placeholderData: (previousData) => previousData,
    refetchInterval: 5000, // Continuous autonomous polling every 5s
    refetchIntervalInBackground: true,
  });



  // ─── Instant Mailbox Sync ────────────────────────────────────
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
      setSyncMessage(`Fetched & processed ${count} new email(s) from mailbox.`);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["emailStats"] });
      queryClient.invalidateQueries({ queryKey: ["poStats"] });
      setTimeout(() => setSyncMessage(null), 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncMessage(`Failed to fetch from mailbox: ${msg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const hasActiveFilters = Boolean(search || poNumberFilter || vendorCodeFilter);

  const clearFilters = () => {
    setSearch("");
    setPoNumberFilter("");
    setVendorCodeFilter("");
    setPage(1);
  };

  const emails = emailsData?.items ?? [];
  const totalEmails = emailsData?.total ?? 0;
  const totalPages = emailsData?.pages ?? 1;

  const startItem = totalEmails === 0 ? 0 : (page - 1) * 50 + 1;
  const endItem = Math.min(page * 50, totalEmails);
  const paginationText = totalEmails === 0 ? "0 of 0" : `${startItem.toLocaleString()}–${endItem.toLocaleString()} of ${totalEmails.toLocaleString()}`;

  return (
    <div className="p-6 space-y-6">
      {/* Header with Fetch & Sync Emails Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {isAdmin ? "Email Processing Queue" : "My Inbound Supplier Emails"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? "Autonomous inbound PO email ingestion from IUNGO & suppliers"
              : `Ingested order emails matching Partner #${user?.supplier_code} (${user?.supplier_name})`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 shadow-2xs">
            <span className={`w-2 h-2 rounded-full ${isFetching ? "bg-emerald-500 animate-ping" : "bg-emerald-500 animate-pulse"}`} />
            <span>Auto-Sync Active (Every 5s)</span>
          </div>
          <button
            onClick={handleSyncMailbox}
            disabled={isSyncing}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-all shadow-sm ${isAdmin
                ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
              } disabled:opacity-60`}
            title="Immediately trigger an emergency mailbox check"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Fetching Mailbox..." : "Fetch Now (Manual)"}
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Supplier Privacy Protection Active:</strong> Viewing emails strictly scoped to{" "}
              <strong className="font-mono">#{user?.supplier_code} ({user?.supplier_name})</strong>. Access to other partner emails is restricted.
            </span>
          </div>
        </div>
      )}

      {syncMessage && (
        <div
          className={`p-3.5 text-sm rounded-xl flex items-center justify-between shadow-sm ${isAdmin
              ? "bg-blue-50 border border-blue-200 text-blue-900"
              : "bg-emerald-50 border border-emerald-200 text-emerald-900"
            }`}
        >
          <div className="flex items-center gap-2">
            <FileCheck2 className={`w-4 h-4 ${isAdmin ? "text-blue-600" : "text-emerald-600"}`} />
            <span>{syncMessage}</span>
          </div>
          <button
            onClick={() => setSyncMessage(null)}
            className={`font-bold ml-4 text-xs ${isAdmin ? "text-blue-500 hover:text-blue-700" : "text-emerald-500 hover:text-emerald-700"
              }`}
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* Advanced Search & Filtering Controls */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <Filter className={`w-3.5 h-3.5 ${isAdmin ? "text-blue-600" : "text-emerald-600"}`} />
            Filter & Search Email Queue
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className={`text-xs font-semibold flex items-center gap-1 ${isAdmin ? "text-blue-600 hover:text-blue-800" : "text-emerald-600 hover:text-emerald-800"
                }`}
            >
              ✕ Clear All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* General Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by keywords, POs, vendors, subject, sender..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 outline-none transition-all ${isAdmin
                  ? "focus:ring-blue-500 focus:border-blue-500"
                  : "focus:ring-emerald-500 focus:border-emerald-500"
                }`}
            />
          </div>

          {/* Filter by PO Number */}
          <div className="relative">
            <FileText className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isAdmin ? "text-blue-500" : "text-emerald-500"}`} />
            <input
              type="text"
              placeholder="Filter by PO Number (e.g. ZA6A-2001605039)..."
              value={poNumberFilter}
              onChange={(e) => setPoNumberFilter(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 outline-none transition-all ${isAdmin
                  ? "focus:ring-blue-500 focus:border-blue-500"
                  : "focus:ring-emerald-500 focus:border-emerald-500"
                }`}
            />
          </div>

          {/* Filter by Vendor / Supplier Code */}
          <div className="relative">
            <Building2 className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isAdmin ? "text-blue-500" : "text-emerald-500"}`} />
            <input
              type="text"
              placeholder="Filter by Vendor Code (e.g. SUPP-9901)..."
              value={vendorCodeFilter}
              onChange={(e) => setVendorCodeFilter(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 outline-none transition-all ${isAdmin
                  ? "focus:ring-blue-500 focus:border-blue-500"
                  : "focus:ring-emerald-500 focus:border-emerald-500"
                }`}
            />
          </div>
        </div>
      </div>

      {/* Email List Table */}
      <div className="w-full">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 bg-white rounded-xl border border-gray-200">
              <RefreshCw className="w-6 h-6 animate-spin mr-2 text-blue-500" />
              Loading email queue...
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border border-gray-200">
              <Mail className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-lg font-medium text-gray-700">No emails matching filters</p>
              <p className="text-xs text-gray-400 mt-1">Try clearing filters or click "Fetch & Sync Emails" to check mailbox</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Google-Style Top Pagination Toolbar */}
              <div className="flex items-center justify-end px-3 py-2 border-b border-gray-200/90 bg-white select-none">
                {/* Google-style Pagination Controls: 1–50 of 4,069  <  > */}
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span className="px-2 font-normal tracking-tight text-gray-600">
                    {paginationText}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    title="Newer"
                    aria-label="Newer emails"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    title="Older"
                    aria-label="Older emails"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-500 w-1/4 sm:w-1/5">Sender</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Subject</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 w-36 whitespace-nowrap">Received</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {emails.map((email) => {
                      const isUnread = email.status === "QUEUED" || email.status === "PROCESSING" || email.status === "PARSED";

                      return (
                        <tr
                          key={email.id}
                          onClick={() => navigate(`/emails/${email.id}`)}
                          className={`cursor-pointer transition-all hover:bg-gray-50/80 ${
                            isUnread
                              ? isAdmin
                                ? "bg-blue-50/90 border-l-4 border-blue-600 font-semibold text-blue-950 hover:bg-blue-100/70"
                                : "bg-emerald-50/90 border-l-4 border-emerald-500 font-semibold text-emerald-950 hover:bg-emerald-100/70"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-3 max-w-[180px] sm:max-w-[220px] truncate text-gray-900 font-bold" title={email.from_address || ""}>
                            {isAdmin ? (
                              isUnread ? (
                                <span
                                  className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block mr-2 shrink-0 animate-pulse shadow-xs"
                                  title="Unread Inbound Email"
                                />
                              ) : (
                                <span
                                  className="w-2 h-2 rounded-full bg-blue-300 inline-block mr-2 shrink-0"
                                  title="Processed Email"
                                />
                              )
                            ) : (
                              isUnread ? (
                                <span
                                  className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block mr-2 shrink-0 animate-pulse shadow-xs"
                                  title="Unread Inbound Email"
                                />
                              ) : (
                                <span
                                  className="w-2 h-2 rounded-full bg-emerald-400 inline-block mr-2 shrink-0"
                                  title="Processed Email"
                                />
                              )
                            )}
                            {email.from_address || " "}
                          </td>
                          <td className="px-4 py-3 max-w-xs sm:max-w-md lg:max-w-xl xl:max-w-3xl truncate text-gray-800 font-medium" title={email.subject || ""}>
                            {email.subject || " "}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                            {email.received_at
                              ? format(new Date(email.received_at), "MMM d, HH:mm")
                              : " "}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/emails/${email.id}`);
                              }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isAdmin
                                  ? "text-gray-400 hover:text-blue-700 hover:bg-blue-100/50"
                                  : "text-gray-400 hover:text-emerald-700 hover:bg-emerald-100/50"
                              }`}
                              title="View Email Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Google-Style Bottom Pagination Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-gray-50/70 select-none">
                <div className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{totalEmails.toLocaleString()} total emails</span>
                </div>

                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span className="px-2 font-normal tracking-tight text-gray-600">
                    {paginationText}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    title="Newer"
                    aria-label="Newer emails"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    title="Older"
                    aria-label="Older emails"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
