// ─── Email Processing Page ──────────────────────────────────────
// frontend/src/pages/EmailInbox.tsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Mail,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileText,
  Building2,
} from "lucide-react";
import { emailApi } from "@/services/emailApi";
import { useAuthStore } from "@/store/authStore";
import { formatDate, formatNumber } from "@/i18n/format";

export default function EmailInbox() {
  const { t } = useTranslation(["emails", "layout"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

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

  const { data: emailsData, isLoading } = useQuery({
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
      setSyncMessage(t("emails:inbox.syncResult", { count }));
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["emailStats"] });
      queryClient.invalidateQueries({ queryKey: ["poStats"] });
      setTimeout(() => setSyncMessage(null), 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncMessage(t("emails:inbox.syncFailed", { error: msg }));
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
  const paginationText =
    totalEmails === 0
      ? t("emails:inbox.paginationEmpty")
      : t("emails:inbox.pagination", {
          start: formatNumber(startItem),
          end: formatNumber(endItem),
          total: formatNumber(totalEmails),
        });

  return (
    <div className="p-6 space-y-5 bg-slate-50 min-h-screen text-slate-900 font-sans">
      {/* Header with Fetch & Sync Emails Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">
            {isAdmin ? "Email Inbox" : t("layout:nav.myEmails")}
          </h1>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {t("emails:inbox.autoSync")}
          </span>
        </div>

        <button
          onClick={handleSyncMailbox}
          disabled={isSyncing}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer text-white shadow-2xs ${isAdmin
              ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
              : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
            } disabled:opacity-60`}
          title={t("emails:inbox.syncTitle")}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? t("emails:inbox.syncing") : t("emails:inbox.sync")}
        </button>
      </div>

      {syncMessage && (
        <div
          className={`p-3 text-xs rounded-xl flex items-center justify-between border shadow-2xs ${isAdmin
              ? "bg-blue-50 border-blue-200 text-blue-900"
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
            }`}
        >
          <div className="flex items-center gap-2">
            <FileCheck2 className={`w-4 h-4 ${isAdmin ? "text-blue-600" : "text-emerald-600"}`} />
            <span>{syncMessage}</span>
          </div>
          <button
            onClick={() => setSyncMessage(null)}
            className={`font-semibold ml-4 text-xs cursor-pointer ${isAdmin ? "text-blue-600 hover:text-blue-800" : "text-emerald-600 hover:text-emerald-800"
              }`}
          >
            ✕
          </button>
        </div>
      )}

      {/* Advanced Search & Filtering Controls */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t("emails:inbox.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white outline-none"
          />
        </div>

        <div className="relative w-full md:w-52">
          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t("emails:inbox.poPlaceholder")}
            value={poNumberFilter}
            onChange={(e) => setPoNumberFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white outline-none"
          />
        </div>

        {isAdmin && (
          <div className="relative w-full md:w-48">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Vendor Code..."
              value={vendorCodeFilter}
              onChange={(e) => setVendorCodeFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white outline-none"
            />
          </div>
        )}

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 cursor-pointer shrink-0"
          >
            {t("emails:inbox.clear")}
          </button>
        )}
      </div>

      {/* Email List Table */}
      <div className="w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
            {t("emails:inbox.loading")}
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
            <Mail className="w-10 h-10 mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">{t("emails:inbox.empty")}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-260px)]">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 shadow-xs">
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="px-3.5 py-2 w-1/4 sm:w-1/5">{t("emails:table.sender")}</th>
                    <th className="px-3.5 py-2">{t("emails:table.subject")}</th>
                    <th className="px-3.5 py-2 text-right w-36 whitespace-nowrap">{t("emails:table.received")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {emails.map((email) => {
                    const isUnread = email.status === "QUEUED" || email.status === "PROCESSING" || email.status === "PARSED";

                    return (
                      <tr
                        key={email.id}
                        onClick={() => navigate(`/emails/${email.id}`)}
                        className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                          isUnread
                            ? isAdmin
                              ? "bg-blue-50/50 font-semibold text-blue-950"
                              : "bg-emerald-50/50 font-semibold text-emerald-950"
                            : "text-slate-700"
                        }`}
                      >
                        <td className="px-3.5 py-1.5 max-w-[180px] sm:max-w-[220px] truncate font-medium text-slate-900" title={email.from_address || ""}>
                          <span
                            className={`w-2 h-2 rounded-full inline-block mr-2 shrink-0 ${
                              isUnread
                                ? isAdmin
                                  ? "bg-blue-600"
                                  : "bg-emerald-600"
                                : "bg-slate-300"
                            }`}
                          />
                          {email.from_address || " "}
                        </td>
                        <td className="px-3.5 py-1.5 max-w-xs sm:max-w-md lg:max-w-xl xl:max-w-3xl truncate text-slate-800" title={email.subject || ""}>
                          {email.subject || " "}
                        </td>
                        <td className="px-3.5 py-1.5 text-right text-slate-500 whitespace-nowrap">
                          {email.received_at
                            ? formatDate(email.received_at, "shortDateTime")
                            : " "}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Google-Style Bottom Pagination Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 bg-slate-50/60 select-none text-xs text-slate-500">
              <div>
                <span className="font-semibold text-slate-700">
                  {t("emails:inbox.totalEmails", { total: formatNumber(totalEmails) })}
                </span>
              </div>

              <div className="flex items-center gap-1 text-slate-600">
                <span className="px-2 font-normal tracking-tight">
                  {paginationText}
                </span>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title={t("emails:inbox.newer")}
                  aria-label={t("emails:inbox.newerAria")}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title={t("emails:inbox.older")}
                  aria-label={t("emails:inbox.olderAria")}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
