/**
 * EmailInbox — admin-only page showing parsed email records.
 * Filterable by status/direction, searchable by subject/sender.
 */

import { useState } from "react";
import { Search, ArrowDownLeft, ArrowUpRight, X } from "lucide-react";
import { mockEmails } from "@/data/mockData";
import { cn } from "@/utils/cn";
import type { EmailRecord } from "@/types";

const STATUS_OPTIONS = ["ALL", "QUEUED", "PROCESSING", "PARSED", "REVIEW", "COMMITTED", "REJECTED", "SENT", "ERROR"] as const;
const DIRECTION_OPTIONS = ["ALL", "INBOUND", "OUTBOUND"] as const;

const statusColor: Record<string, string> = {
  PARSED: "bg-emerald-100 text-emerald-700",
  COMMITTED: "bg-emerald-100 text-emerald-700",
  SENT: "bg-blue-100 text-blue-700",
  QUEUED: "bg-gray-100 text-gray-600",
  PROCESSING: "bg-blue-100 text-blue-700",
  REVIEW: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-700",
  ERROR: "bg-red-100 text-red-700",
};

export default function EmailInbox() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dirFilter, setDirFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<EmailRecord | null>(null);

  const filtered = mockEmails.filter((e) => {
    if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
    if (dirFilter !== "ALL" && e.direction !== dirFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (e.subject || "").toLowerCase().includes(q) ||
        (e.from_address || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">
          {mockEmails.length} emails parsed — review and manage incoming messages.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject or sender…"
            className="h-9 w-64 rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s}</option>
          ))}
        </select>
        <select
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none"
        >
          {DIRECTION_OPTIONS.map((d) => (
            <option key={d} value={d}>{d === "ALL" ? "All Directions" : d}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-4">
        {/* Table */}
        <div className={cn("rounded-xl border border-gray-200 bg-white", selected ? "flex-1" : "w-full")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-gray-50",
                      selected?.id === e.id && "bg-brand-50"
                    )}
                  >
                    <td className="px-4 py-3">
                      {e.direction === "INBOUND" ? (
                        <ArrowDownLeft className="h-4 w-4 text-blue-500" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                      )}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 font-medium text-gray-900">
                      {e.subject}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.from_address}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColor[e.status] || "bg-gray-100 text-gray-600")}>
                        {e.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {e.received_at ? new Date(e.received_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No emails match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-96 shrink-0 rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Email Detail</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-xs font-medium text-gray-400">Subject</p>
                <p className="text-sm text-gray-900">{selected.subject ?? "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-400">From</p>
                  <p className="text-sm text-gray-700">{selected.from_address ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400">To</p>
                  <p className="text-sm text-gray-700">{selected.to_address ?? "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-400">Direction</p>
                  <p className="text-sm text-gray-700">{selected.direction}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400">Status</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColor[selected.status] || "bg-gray-100 text-gray-600")}>
                    {selected.status}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400">Received</p>
                <p className="text-sm text-gray-700">
                  {selected.received_at ? new Date(selected.received_at).toLocaleString() : "—"}
                </p>
              </div>
              {selected.error_message && (
                <div className="rounded-lg bg-red-50 px-3 py-2">
                  <p className="text-xs font-medium text-red-600">Error</p>
                  <p className="text-xs text-red-500">{selected.error_message}</p>
                </div>
              )}
              {selected.body_text && (
                <div>
                  <p className="text-xs font-medium text-gray-400">Preview</p>
                  <p className="mt-1 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
                    {selected.body_text}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}