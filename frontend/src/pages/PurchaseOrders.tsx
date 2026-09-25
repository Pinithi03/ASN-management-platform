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
  Sparkles,
  FileSpreadsheet,
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
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review incoming orders and select multiple POs to generate a batch shipment.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
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

      {/* Floating Action Bar for Selected POs */}
      {selectedPOs.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-700">
            <div className="flex items-center gap-3 px-2">
              <div className="bg-blue-500/20 text-blue-400 p-2.5 rounded-xl">
                <PackagePlus className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-base text-white">
                  {selectedPOs.size} Purchase Order{selectedPOs.size > 1 ? "s" : ""} Selected
                </p>
                <p className="text-xs text-slate-400">Choose your preferred shipping method:</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => handleCreateShipment("web")}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg transition-all active:scale-95 flex items-center gap-2 text-xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Online Web Wizard
              </button>
              <button
                onClick={() => handleCreateShipment("excel")}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg transition-all active:scale-95 flex items-center gap-2 text-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel Packing Drop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
