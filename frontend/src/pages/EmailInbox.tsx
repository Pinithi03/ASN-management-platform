// ─── Email Processing Page ──────────────────────────────────────
// frontend/src/pages/EmailInbox.tsx

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Search,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Paperclip,
  Download,
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
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "COMPANY_ADMIN";

  const [search, setSearch] = useState("");
  const [poNumberFilter, setPoNumberFilter] = useState("");
  const [vendorCodeFilter, setVendorCodeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"html" | "parsed" | "attachments">("html");

  // Effective vendor filter — automatically enforced for Supplier Role users
  const effectiveVendorCode = !isAdmin ? user?.supplier_code : vendorCodeFilter;

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1);
  }, [search, poNumberFilter, effectiveVendorCode]);

  // ─── Queries ────────────────────────────────────────────────
  const { data: emailsData, isLoading } = useQuery({
    queryKey: ["emails", search, poNumberFilter, effectiveVendorCode, page, user?.role],
    queryFn: () =>
      emailApi.list({
        search: search || undefined,
        po_number: poNumberFilter || undefined,
        vendor_code: effectiveVendorCode || undefined,
        page,
        per_page: 15,
      }),
  });

  const { data: selectedEmail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["emailDetail", selectedEmailId],
    queryFn: () => emailApi.getById(selectedEmailId!),
    enabled: !!selectedEmailId,
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
  const totalPages = emailsData?.pages ?? 1;

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
          <button
            onClick={handleSyncMailbox}
            disabled={isSyncing}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-all shadow-sm ${
              isAdmin
                ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
            } disabled:opacity-60`}
            title="Immediately check mailbox for new unread order emails"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Fetching Mailbox..." : "Fetch & Sync Emails"}
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
          className={`p-3.5 text-sm rounded-xl flex items-center justify-between shadow-sm ${
            isAdmin
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
            className={`font-bold ml-4 text-xs ${
              isAdmin ? "text-blue-500 hover:text-blue-700" : "text-emerald-500 hover:text-emerald-700"
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
              className={`text-xs font-semibold flex items-center gap-1 ${
                isAdmin ? "text-blue-600 hover:text-blue-800" : "text-emerald-600 hover:text-emerald-800"
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
              className={`w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 outline-none transition-all ${
                isAdmin
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
              className={`w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 outline-none transition-all ${
                isAdmin
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
              className={`w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 outline-none transition-all ${
                isAdmin
                  ? "focus:ring-blue-500 focus:border-blue-500"
                  : "focus:ring-emerald-500 focus:border-emerald-500"
              }`}
            />
          </div>
        </div>
      </div>

      {/* Main Content Split Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Email List Table */}
        <div className={`transition-all duration-200 ${selectedEmailId ? "w-full lg:w-1/2" : "w-full"}`}>
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Sender</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Subject</th>
                      {!selectedEmailId && <th className="text-left px-4 py-3 font-medium text-gray-500">Format</th>}
                      {!selectedEmailId && <th className="text-left px-4 py-3 font-medium text-gray-500">Received</th>}
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {emails.map((email) => {
                      const isSelected = email.id === selectedEmailId;
                      const isUnread = email.status === "QUEUED" || email.status === "PROCESSING" || email.status === "PARSED";

                      return (
                        <tr
                          key={email.id}
                          onClick={() => setSelectedEmailId(email.id)}
                          className={`cursor-pointer transition-all ${
                            isSelected
                              ? isAdmin
                                ? "bg-blue-100/90 border-l-4 border-blue-800 font-extrabold text-blue-950 shadow-xs"
                                : "bg-emerald-100/90 border-l-4 border-emerald-700 font-extrabold text-emerald-950 shadow-xs"
                              : isUnread
                              ? isAdmin
                                ? "bg-blue-50/90 border-l-4 border-blue-600 font-semibold text-blue-950 hover:bg-blue-100/70"
                                : "bg-emerald-50/90 border-l-4 border-emerald-500 font-semibold text-emerald-950 hover:bg-emerald-100/70"
                              : "hover:bg-gray-50/80"
                          }`}
                        >
                          <td className="px-4 py-3 max-w-[140px] truncate text-gray-900 font-bold">
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
                            {email.from_address || "—"}
                          </td>
                          <td className="px-4 py-3 max-w-[200px] truncate text-gray-800 font-medium">
                            {email.subject || "—"}
                          </td>
                          {!selectedEmailId && (
                            <td className="px-4 py-3">
                              <span
                                className={`px-2.5 py-0.5 text-xs font-bold rounded-md border shadow-xs ${
                                  isAdmin
                                    ? "bg-blue-100 text-blue-800 border-blue-300"
                                    : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                }`}
                              >
                                {email.email_type || "PO Email"}
                              </span>
                            </td>
                          )}
                          {!selectedEmailId && (
                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                              {email.received_at
                                ? format(new Date(email.received_at), "MMM d, HH:mm")
                                : "—"}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEmailId(email.id);
                              }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isSelected
                                  ? isAdmin
                                    ? "text-blue-800 bg-blue-200/90 font-bold"
                                    : "text-emerald-800 bg-emerald-200/90 font-bold"
                                  : isAdmin
                                  ? "text-gray-400 hover:text-blue-700 hover:bg-blue-100/50"
                                  : "text-gray-400 hover:text-emerald-700 hover:bg-emerald-100/50"
                              }`}
                              title="Preview Email"
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <p className="text-xs text-gray-500">
                    Page {page} of {totalPages} ({emailsData?.total} total emails)
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-100 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-100 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email Preview Panel (Side Drawer) */}
        {selectedEmailId && (
          <div className="w-full lg:w-1/2 bg-white rounded-xl border border-gray-200 shadow-lg flex flex-col h-[75vh] sticky top-6 overflow-hidden">
            {isDetailLoading || !selectedEmail ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin mb-2 text-blue-500" />
                <span>Loading email details...</span>
              </div>
            ) : (
              <>
                {/* Preview Header */}
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded ${
                          isAdmin
                            ? "bg-blue-100 text-blue-800 border border-blue-200"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        AUTO-PARSED
                      </span>
                      <span className="text-xs text-gray-500 truncate font-mono">
                        {selectedEmail.from_address}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-gray-900 truncate">
                      {selectedEmail.subject || "No Subject"}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Received: {selectedEmail.received_at ? format(new Date(selectedEmail.received_at), "MMM d, yyyy HH:mm") : "—"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Link
                      to={`/emails/${selectedEmail.id}`}
                      className="p-1.5 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Open full page view"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => setSelectedEmailId(null)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Close Preview"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sub-tabs bar */}
                <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Email Content & Data
                  </span>
                  <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-medium">
                    <button
                      onClick={() => setPreviewTab("html")}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        previewTab === "html"
                          ? isAdmin
                            ? "bg-white text-blue-700 font-semibold shadow-sm"
                            : "bg-white text-emerald-700 font-semibold shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      HTML Body
                    </button>
                    <button
                      onClick={() => setPreviewTab("parsed")}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        previewTab === "parsed"
                          ? isAdmin
                            ? "bg-white text-blue-700 font-semibold shadow-sm"
                            : "bg-white text-emerald-700 font-semibold shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Parsed PO ({selectedEmail.parsed_data?.length ?? 0})
                    </button>
                    <button
                      onClick={() => setPreviewTab("attachments")}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        previewTab === "attachments"
                          ? isAdmin
                            ? "bg-white text-blue-700 font-semibold shadow-sm"
                            : "bg-white text-emerald-700 font-semibold shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Files ({selectedEmail.attachments?.length ?? 0})
                    </button>
                  </div>
                </div>

                {/* Tab Content Area */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                  {previewTab === "html" && (
                    selectedEmail.body_html ? (
                      <iframe
                        title="Email Body Preview"
                        srcDoc={`<base target="_blank">${selectedEmail.body_html}`}
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        className="w-full h-full min-h-[420px] bg-white border border-gray-200 rounded-xl shadow-inner"
                      />
                    ) : (
                      <div className="p-4 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 whitespace-pre-wrap font-sans">
                        {selectedEmail.body_text || "No email body content available."}
                      </div>
                    )
                  )}

                  {previewTab === "parsed" && (
                    <div className="space-y-4">
                      {selectedEmail.parsed_data?.length === 0 ? (
                        <div className="p-6 bg-white border border-gray-200 rounded-xl text-center text-sm text-gray-500">
                          No parsed purchase order data extracted for this email.
                        </div>
                      ) : (
                        selectedEmail.parsed_data?.map((data) => (
                          <div key={data.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                            <div className="flex items-center justify-between border-b pb-2">
                              <span className="font-bold text-gray-900 text-sm">
                                PO#: {data.po_number_extracted || "Unknown"}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  isAdmin
                                    ? "bg-blue-100 text-blue-800 border border-blue-200"
                                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                }`}
                              >
                                Parser: {data.parser_used}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-gray-400">Supplier:</span>{" "}
                                <span className="text-gray-800 font-medium">
                                  {String(data.raw_extracted?.supplier_code || "—")}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Buyer:</span>{" "}
                                <span className="text-gray-800 font-medium">
                                  {String(data.raw_extracted?.buyer_name || "—")}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Delivery Date:</span>{" "}
                                <span className="text-gray-800 font-medium">
                                  {String(data.raw_extracted?.delivery_date || "—")}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Total Qty:</span>{" "}
                                <span className="text-gray-800 font-medium">
                                  {Number(data.raw_extracted?.total_quantity || 0).toLocaleString()}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400">Total Value:</span>{" "}
                                <span className="text-gray-800 font-bold">
                                  {data.raw_extracted?.currency === "USD"
                                    ? `$${Number(data.raw_extracted?.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                    : `${Number(data.raw_extracted?.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${data.raw_extracted?.currency || "USD"}`}
                                </span>
                              </div>
                            </div>

                            {/* Line items snippet */}
                            {Array.isArray(data.raw_extracted?.line_items) &&
                              (data.raw_extracted?.line_items as Record<string, unknown>[]).length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-semibold text-gray-500 mb-1">
                                    Line Items ({(data.raw_extracted?.line_items as Record<string, unknown>[]).length}):
                                  </p>
                                  <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-gray-50 text-gray-500">
                                        <tr>
                                          <th className="p-1.5">#</th>
                                          <th className="p-1.5">Style</th>
                                          <th className="p-1.5">Qty</th>
                                          <th className="p-1.5">
                                            {data.raw_extracted?.currency ? `Price (${data.raw_extracted.currency})` : "Price"}
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {(data.raw_extracted?.line_items as Record<string, unknown>[]).map((item, idx) => (
                                          <tr key={idx}>
                                            <td className="p-1.5">{String(item.line_number || idx + 1)}</td>
                                            <td className="p-1.5 font-medium">{String(item.style || "—")}</td>
                                            <td className="p-1.5">{Number(item.quantity || 0).toLocaleString()}</td>
                                            <td className="p-1.5 font-semibold text-gray-900">
                                              {data.raw_extracted?.currency === "USD"
                                                ? `$${Number(item.unit_price || 0).toFixed(2)}`
                                                : `${Number(item.unit_price || 0).toFixed(2)} ${data.raw_extracted?.currency || ""}`}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {previewTab === "attachments" && (
                    <div className="space-y-2">
                      {selectedEmail.attachments?.length === 0 ? (
                        <div className="p-6 bg-white border border-gray-200 rounded-xl text-center text-sm text-gray-500">
                          No attachments found in this email.
                        </div>
                      ) : (
                        selectedEmail.attachments?.map((att) => (
                          <div
                            key={att.id}
                            className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between text-xs shadow-sm"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Paperclip className="w-4 h-4 text-blue-500 shrink-0" />
                              <span className="font-medium text-gray-800 truncate">
                                {att.filename || "Attachment"}
                              </span>
                              {att.is_original && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded font-semibold">
                                  Original .eml
                                </span>
                              )}
                            </div>
                            <button
                              onClick={async () => {
                                const blob = await emailApi.getAttachment(selectedEmail.id, att.id);
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement("a");
                                link.href = url;
                                link.download = att.filename || "attachment";
                                link.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="p-1.5 text-gray-600 hover:text-blue-600 rounded-lg hover:bg-gray-100 flex items-center gap-1 font-medium transition-colors"
                              title="Download Attachment"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
