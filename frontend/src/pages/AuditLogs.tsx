// ─── Audit Logs Page (Admin Only) ────────────────────────────────────
// frontend/src/pages/AuditLogs.tsx

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  Search,
  RefreshCw,
  Filter,
  Clock,
  ChevronLeft,
  ChevronRight,
  FileCode,
  Eye,
  X,
} from "lucide-react";
import { auditApi, AuditLogItem } from "@/services/auditApi";
import { format } from "date-fns";
import { cn } from "@/utils/cn";

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["auditLogs", page, search, actionFilter, entityFilter],
    queryFn: () =>
      auditApi.list({
        page,
        per_page: 15,
        search: search || undefined,
        action: actionFilter || undefined,
        entity_type: entityFilter || undefined,
      }),
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case "CREATE":
      case "SUPPLIER_REGISTERED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "UPDATE":
      case "CONFIG_CHANGED":
      case "SUPPLIER_UPDATED":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "DELETE":
      case "SUPPLIER_DELETED":
        return "bg-red-50 text-red-700 border-red-200";
      case "EMAIL_REPROCESSED":
        return "bg-purple-50 text-purple-700 border-purple-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-brand-600" />
            <h1 className="text-2xl font-semibold text-gray-900">System Audit Trail</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-brand-50 text-brand-700 rounded-md border border-brand-200">
              Admin Exclusive
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Immutable log of all administrative operations, supplier changes, settings updates, and reprocessing events.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm"
        >
          <RefreshCw className={cn("w-4 h-4 text-brand-600", isFetching && "animate-spin")} />
          Refresh Stream
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search action, entity type, metadata, or IP..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Action Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="w-full md:w-44 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-brand-500"
          >
            <option value="">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="SUPPLIER_REGISTERED">SUPPLIER_REGISTERED</option>
            <option value="SUPPLIER_DELETED">SUPPLIER_DELETED</option>
            <option value="EMAIL_REPROCESSED">EMAIL_REPROCESSED</option>
            <option value="CONFIG_CHANGED">CONFIG_CHANGED</option>
          </select>
        </div>

        {/* Entity Type Filter */}
        <div className="w-full md:w-auto">
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            className="w-full md:w-44 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-brand-500"
          >
            <option value="">All Entities</option>
            <option value="SUPPLIER">SUPPLIER</option>
            <option value="CONFIG">CONFIG</option>
            <option value="EMAIL">EMAIL</option>
            <option value="USER">USER</option>
            <option value="SHIPMENT">SHIPMENT</option>
          </select>
        </div>
      </div>

      {/* Main Audit Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2 text-brand-500" />
            Loading audit trail...
          </div>
        ) : data?.items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Action</th>
                  <th className="px-6 py-3.5">Entity Type</th>
                  <th className="px-6 py-3.5">User / Actor</th>
                  <th className="px-6 py-3.5">Details</th>
                  <th className="px-6 py-3.5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                    {/* Timestamp */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {log.created_at ? format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss") : "—"}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={cn("px-2.5 py-1 text-xs font-bold rounded-md border font-mono", getActionBadge(log.action))}>
                        {log.action}
                      </span>
                    </td>

                    {/* Entity Type */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-gray-900 font-mono">
                      {log.entity_type}
                    </td>

                    {/* User / Actor */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      {log.user ? (
                        <div>
                          <p className="font-bold text-gray-900">{log.user.full_name || "Admin"}</p>
                          <p className="text-gray-400 font-mono text-[11px]">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">System Auto</span>
                      )}
                    </td>

                    {/* Details Summary */}
                    <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">
                      {log.metadata?.subject ? (
                        <span>Email: <code className="font-mono">{String(log.metadata.subject)}</code></span>
                      ) : log.metadata?.supplier_name ? (
                        <span>Supplier: <strong>{String(log.metadata.supplier_name)}</strong></span>
                      ) : log.entity_id ? (
                        <span className="font-mono text-gray-400">ID: {log.entity_id.slice(0, 12)}...</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Action Button */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1 rounded-lg border border-brand-100 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-gray-400 text-sm">
            <ShieldAlert className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            No audit logs found matching criteria.
          </div>
        )}

        {/* Pagination Footer */}
        {data && data.pages > 1 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>
              Showing page <strong>{data.page}</strong> of <strong>{data.pages}</strong> ({data.total} records)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* JSON Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-brand-600" />
                <h3 className="text-lg font-bold text-gray-900">Audit Log Details</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div>
                <span className="text-gray-400">Action:</span>
                <p className="font-mono font-bold text-gray-900">{selectedLog.action}</p>
              </div>
              <div>
                <span className="text-gray-400">Entity Type:</span>
                <p className="font-mono font-bold text-gray-900">{selectedLog.entity_type}</p>
              </div>
              <div>
                <span className="text-gray-400">Entity ID:</span>
                <p className="font-mono text-gray-700 truncate">{selectedLog.entity_id || "—"}</p>
              </div>
              <div>
                <span className="text-gray-400">Logged At:</span>
                <p className="font-mono text-gray-700">{format(new Date(selectedLog.created_at), "yyyy-MM-dd HH:mm:ss")}</p>
              </div>
            </div>

            {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Metadata Attributes</p>
                <pre className="p-3 bg-gray-900 text-emerald-400 rounded-xl text-xs font-mono overflow-x-auto">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.new_values && Object.keys(selectedLog.new_values).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">New Values Payload</p>
                <pre className="p-3 bg-gray-900 text-blue-400 rounded-xl text-xs font-mono overflow-x-auto">
                  {JSON.stringify(selectedLog.new_values, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.old_values && Object.keys(selectedLog.old_values).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Previous Values Payload</p>
                <pre className="p-3 bg-gray-900 text-amber-400 rounded-xl text-xs font-mono overflow-x-auto">
                  {JSON.stringify(selectedLog.old_values, null, 2)}
                </pre>
              </div>
            )}

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
