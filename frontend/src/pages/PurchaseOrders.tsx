// ─── Purchase Orders Page ───────────────────────────────────────
// frontend/src/pages/PurchaseOrders.tsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Package,
  Calendar,
  DollarSign,
  X,
  PackagePlus,
} from "lucide-react";
import { poApi } from "@/services/poApi";
import type { PurchaseOrder } from "@/types/email";
import { format } from "date-fns";
import { useAuthStore } from "@/store/authStore";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  UPDATED: "bg-blue-100 text-blue-700",
  XML_SENT: "bg-purple-100 text-purple-700",
  SHIPMENT_RECEIVED: "bg-cyan-100 text-cyan-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  CANCELLED: "bg-red-100 text-red-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "UPDATED", label: "Updated" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "COMPLETED", label: "Completed" },
];

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const supplierId = isSupplier ? user.supplier_id : undefined;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  // ─── Queries ────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["purchaseOrders", search, statusFilter, page, supplierId],
    queryFn: () =>
      poApi.list({
        search: search || undefined,
        status: statusFilter || undefined,
        supplier_id: supplierId || undefined,
        page,
        per_page: 15,
      }),
  });

  const { data: stats } = useQuery({
    queryKey: ["poStats", supplierId],
    queryFn: () => poApi.getStats(supplierId),
  });

  // Detail query when a PO is selected
  const { data: poDetail } = useQuery({
    queryKey: ["poDetail", selectedPO?.id],
    queryFn: () => poApi.getById(selectedPO!.id),
    enabled: !!selectedPO,
  });

  const orders = data?.items ?? [];
  const totalPages = data?.pages ?? 1;

  const handleShipExcel = (e: React.MouseEvent, poNumber?: string) => {
    e.stopPropagation();
    if (poNumber) {
      navigate(`/shipments?po=${encodeURIComponent(poNumber)}`);
    } else {
      navigate("/shipments");
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            View and manage purchase orders parsed from IUNGO emails with progressive revisions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (selectedPO?.po_number) {
                navigate(`/shipments?po=${encodeURIComponent(selectedPO.po_number)}`);
              } else if (orders.length > 0 && orders[0].po_number) {
                navigate(`/shipments?po=${encodeURIComponent(orders[0].po_number)}`);
              } else {
                navigate("/shipments");
              }
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <PackagePlus className="w-4 h-4" />
            Ship via Excel Drop
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total POs", value: stats.total, icon: FileText, color: "border-gray-300" },
            { label: "Active", value: stats.active, icon: Package, color: "border-green-400" },
            { label: "Updated", value: stats.updated, icon: RefreshCw, color: "border-blue-400" },
            { label: "Shipped", value: stats.shipped, icon: Package, color: "border-indigo-400" },
            { label: "Cancelled", value: stats.cancelled, icon: X, color: "border-red-400" },
            { label: "Completed", value: stats.completed, icon: FileText, color: "border-emerald-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-white rounded-lg border-l-4 ${stat.color} p-3 shadow-sm`}
            >
              <div className="flex items-center gap-2">
                <stat.icon className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search PO#, client, style..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Table */}
        <div className={`${selectedPO ? "w-3/5" : "w-full"} transition-all`}>
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              Loading purchase orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-lg border border-gray-200">
              <FileText className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-base font-medium text-gray-600">No purchase orders found</p>
              <p className="text-xs text-gray-400 mt-1">Inbound PO emails from IUNGO will populate here automatically</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">PO #</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Client</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Style</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Qty</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Value</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Delivery</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-500">Ver</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((po) => (
                      <tr
                        key={po.id}
                        onClick={() => setSelectedPO(po)}
                        className={`cursor-pointer hover:bg-blue-50/70 transition-colors ${
                          selectedPO?.id === po.id ? "bg-blue-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs">{po.po_number || "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {po.client_code || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {po.style_number || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">
                          {po.quantity?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">
                          {po.total_value
                            ? `${po.currency || "$"}${Number(po.total_value).toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                          {po.delivery_date
                            ? format(new Date(po.delivery_date), "MMM d, yyyy")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded ${
                              STATUS_COLORS[po.status] || "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 text-[11px] font-bold rounded ${
                              (po.version || 1) > 1
                                ? "bg-amber-100 text-amber-800"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            v{po.version || 1}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={(e) => handleShipExcel(e, po.po_number || undefined)}
                            className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 shadow-sm transition-colors"
                          >
                            📦 Ship ➔
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <p className="text-sm text-gray-500">
                    Page {page} of {totalPages} ({data?.total} total)
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
        {selectedPO && (
          <div className="w-2/5 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="font-medium text-gray-900">
                PO# {poDetail?.po_number || selectedPO.po_number}
              </h3>
              <button
                onClick={() => setSelectedPO(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
              {/* Status & Version */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 text-xs font-medium rounded ${
                    STATUS_COLORS[poDetail?.status || selectedPO.status] || ""
                  }`}
                >
                  {poDetail?.status || selectedPO.status}
                </span>
                <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                  Version {poDetail?.version || selectedPO.version || 1}
                </span>
              </div>

              {/* Action */}
              <button
                onClick={(e) => handleShipExcel(e, poDetail?.po_number || selectedPO.po_number || undefined)}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <PackagePlus className="w-4 h-4" />
                Create Shipment for PO #{poDetail?.po_number || selectedPO.po_number}
              </button>

              {/* Fields */}
              <div className="space-y-3">
                {[
                  { label: "PO Number", value: poDetail?.po_number },
                  { label: "Client Code", value: poDetail?.client_code },
                  { label: "Style Number", value: poDetail?.style_number },
                  { label: "Description", value: poDetail?.description },
                  {
                    label: "Quantity",
                    value: poDetail?.quantity?.toLocaleString(),
                    icon: Package,
                  },
                  {
                    label: "Unit Price",
                    value: poDetail?.unit_price
                      ? `${poDetail.currency || "USD"} ${poDetail.unit_price.toLocaleString()}`
                      : null,
                    icon: DollarSign,
                  },
                  {
                    label: "Total Value",
                    value: poDetail?.total_value
                      ? `${poDetail.currency || "USD"} ${Number(poDetail.total_value).toLocaleString()}`
                      : null,
                    icon: DollarSign,
                  },
                  { label: "Currency", value: poDetail?.currency },
                  {
                    label: "Delivery Date",
                    value: poDetail?.delivery_date
                      ? format(new Date(poDetail.delivery_date), "MMM d, yyyy")
                      : null,
                    icon: Calendar,
                  },
                  {
                    label: "Ship Date",
                    value: poDetail?.ship_date
                      ? format(new Date(poDetail.ship_date), "MMM d, yyyy")
                      : null,
                    icon: Calendar,
                  },
                  { label: "Destination", value: poDetail?.destination },
                ].map(
                  (field) =>
                    field.value && (
                      <div key={field.label} className="flex justify-between text-sm">
                        <span className="text-gray-500">{field.label}</span>
                        <span className="text-gray-900 font-medium text-right">
                          {field.value}
                        </span>
                      </div>
                    )
                )}
              </div>

              {/* Source Email */}
              {poDetail?.source_email_subject && (
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Source Email</p>
                  <p className="text-sm text-gray-700">{poDetail.source_email_subject}</p>
                </div>
              )}

              {/* Timestamps */}
              <div className="pt-3 border-t border-gray-200 text-xs text-gray-400 space-y-1">
                {poDetail?.created_at && (
                  <p>
                    Created: {format(new Date(poDetail.created_at), "MMM d yyyy, HH:mm")}
                  </p>
                )}
                {poDetail?.updated_at && (
                  <p>
                    Updated: {format(new Date(poDetail.updated_at), "MMM d yyyy, HH:mm")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}