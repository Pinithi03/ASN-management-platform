import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Package,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  PackagePlus,
  CheckSquare,
  Square,
} from "lucide-react";
import { poApi } from "../services/poApi";
import { useAuthStore } from "../store/authStore";
import type { PurchaseOrder } from "@/types/email";

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Updated", value: "UPDATED" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-800",
  UPDATED: "bg-amber-100 text-amber-800",
  SHIPPED: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const supplierId = isSupplier ? user.supplier_id : undefined;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  
  // State for multi-selecting POs
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["purchaseOrders", page, search, statusFilter, supplierId],
    queryFn: () =>
      poApi.list({
        page,
        per_page: 50,
        search: search || undefined,
        status: statusFilter || undefined,
        supplier_id: supplierId,
      }),
    placeholderData: (previousData) => previousData,
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery({
    queryKey: ["poStats", supplierId],
    queryFn: () => poApi.getStats(supplierId),
  });

  const orders: PurchaseOrder[] = data?.items || [];
  const totalPages = data?.pages || 1;

  const togglePOSelection = (poNumber: string) => {
    const newSelection = new Set(selectedPOs);
    if (newSelection.has(poNumber)) {
      newSelection.delete(poNumber);
    } else {
      newSelection.add(poNumber);
    }
    setSelectedPOs(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedPOs.size === orders.length && orders.length > 0) {
      setSelectedPOs(new Set());
    } else {
      const allNumbers = orders
        .map((p) => p.po_number)
        .filter((num): num is string => Boolean(num));
      setSelectedPOs(new Set(allNumbers));
    }
  };

  const handleCreateShipment = (mode: "web" | "excel" = "web") => {
    const poList = Array.from(selectedPOs).join(",");
    navigate(`/shipments?pos=${encodeURIComponent(poList)}&mode=${mode}`);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Top Header & Sticky Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Purchase Orders</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Calzedonia Group incoming purchase orders. Select orders to generate outbound delivery.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedPOs.size > 0 && (
            <div className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-lg shadow-sm">
              <span className="text-xs font-mono font-bold text-slate-200">
                {selectedPOs.size} Selected
              </span>
              <div className="h-4 w-px bg-slate-700" />
              <button
                type="button"
                onClick={() => handleCreateShipment("web")}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                + Create Delivery
              </button>
              <button
                type="button"
                onClick={() => handleCreateShipment("excel")}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                Excel Drop
              </button>
              <button
                type="button"
                onClick={() => setSelectedPOs(new Set())}
                className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
                title="Clear selection"
              >
                ✕
              </button>
            </div>
          )}
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Active POs", value: stats.active || 0, icon: FileText, color: "border-blue-400" },
            { label: "Updated Orders", value: stats.updated || 0, icon: RefreshCw, color: "border-amber-400" },
            { label: "Partially Shipped", value: stats.shipped || 0, icon: Package, color: "border-indigo-400" },
            { label: "Completed", value: stats.completed || 0, icon: PackagePlus, color: "border-emerald-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-white rounded-xl border-l-4 ${stat.color} p-4 shadow-sm border-t border-r border-b border-gray-100 flex items-center justify-between`}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value.toLocaleString()}</p>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg text-gray-500">
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
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
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-4 py-2.5 text-sm bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all min-w-[200px]"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Table Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mb-4 text-blue-500" />
            <p className="font-medium text-gray-600">Loading purchase orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <FileText className="w-16 h-16 mb-4 text-gray-200" />
            <p className="text-lg font-medium text-gray-600">No purchase orders found</p>
            <p className="text-sm text-gray-400 mt-2">Try adjusting your search filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500">
                  <th className="px-4 py-4 w-12 text-center">
                    <button onClick={toggleAllSelection} className="text-gray-400 hover:text-blue-600 cursor-pointer">
                      {selectedPOs.size === orders.length && orders.length > 0 ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-4 font-semibold">PO Number</th>
                  <th className="px-4 py-4 font-semibold">Client</th>
                  <th className="px-4 py-4 font-semibold">Style</th>
                  <th className="px-4 py-4 font-semibold text-right">Quantity</th>
                  <th className="px-4 py-4 font-semibold text-left">Delivery Date</th>
                  <th className="px-4 py-4 font-semibold text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((po: PurchaseOrder) => {
                  const isSelected = po.po_number ? selectedPOs.has(po.po_number) : false;
                  return (
                    <tr
                      key={po.id}
                      onClick={() => po.po_number && togglePOSelection(po.po_number)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? "bg-blue-50/40" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <button className="text-gray-300">
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {po.po_number || "—"}
                        {po.version && po.version > 1 ? (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] uppercase font-bold bg-amber-100 text-amber-800 rounded">
                            v{po.version}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{po.client_code || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{po.style_number || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-gray-700">
                        {po.quantity?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {po.delivery_date ? format(new Date(po.delivery_date), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                            STATUS_COLORS[po.status] || "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {po.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
            <p className="text-sm font-medium text-gray-500">
              Page <span className="text-gray-900">{page}</span> of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
