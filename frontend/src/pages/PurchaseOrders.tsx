/**
 * PurchaseOrders — shared page for both Admin and Supplier.
 * Admin sees all POs; Supplier sees only their own.
 */

import { useState } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { mockPurchaseOrders, mockSuppliers } from "@/data/mockData";
import { cn } from "@/utils/cn";
import type { PurchaseOrder } from "@/types";

const STATUS_OPTIONS = ["ALL", "ACTIVE", "UPDATED", "XML_SENT", "SHIPMENT_RECEIVED", "SHIPPED", "CANCELLED", "COMPLETED"] as const;

const statusColor: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-700",
  UPDATED: "bg-amber-100 text-amber-700",
  XML_SENT: "bg-purple-100 text-purple-700",
  SHIPMENT_RECEIVED: "bg-emerald-100 text-emerald-700",
  SHIPPED: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-red-100 text-red-700",
};

function formatCurrency(val: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
}

// Helper to look up supplier name
function getSupplierName(supplierId?: string): string {
  if (!supplierId) return "—";
  const s = mockSuppliers.find((sup) => sup.id === supplierId);
  return s ? s.name : supplierId;
}

export default function PurchaseOrders() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "COMPANY_ADMIN";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const basePOs = isAdmin
    ? mockPurchaseOrders
    : mockPurchaseOrders.filter((po) => po.supplier_id === user?.supplier_id);

  const filtered = basePOs.filter((po) => {
    if (statusFilter !== "ALL" && po.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        po.po_number.toLowerCase().includes(q) ||
        (po.description || "").toLowerCase().includes(q) ||
        getSupplierName(po.supplier_id).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggle = (id: string) => setExpanded(expanded === id ? null : id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin
            ? `${basePOs.length} purchase orders across all suppliers.`
            : `${basePOs.length} purchase orders assigned to you.`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO number, description…"
            className={cn(
              "h-9 w-64 rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:outline-none focus:ring-1",
              isAdmin ? "focus:border-brand-500 focus:ring-brand-500" : "focus:border-emerald-500 focus:ring-emerald-500"
            )}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-gray-400">
          {filtered.length} result{filtered.length !== 1 && "s"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3">PO Number</th>
                {isAdmin && <th className="px-4 py-3">Supplier</th>}
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((po) => (
                <PORow key={po.id} po={po} isAdmin={isAdmin} isExpanded={expanded === po.id} onToggle={() => toggle(po.id)} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-gray-400">
                    No purchase orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PORow({ po, isAdmin, isExpanded, onToggle }: { po: PurchaseOrder; isAdmin: boolean; isExpanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer transition-colors hover:bg-gray-50">
        <td className="px-4 py-3 text-gray-400">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-gray-900">{po.po_number}</td>
        {isAdmin && <td className="px-4 py-3 text-gray-700">{getSupplierName(po.supplier_id)}</td>}
        <td className="max-w-[200px] truncate px-4 py-3 text-gray-700">{po.description}</td>
        <td className="px-4 py-3 text-gray-700">{po.quantity?.toLocaleString() ?? "—"}</td>
        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
          {po.total_value ? formatCurrency(po.total_value, po.currency) : "—"}
        </td>
        <td className="px-4 py-3">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColor[po.status] || "bg-gray-100 text-gray-600")}>
            {po.status.replace(/_/g, " ")}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-gray-500">{new Date(po.created_at).toLocaleDateString()}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={isAdmin ? 8 : 7} className="bg-gray-50 px-8 py-4">
            <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm sm:grid-cols-4">
              <Detail label="PO Number" value={po.po_number} />
              <Detail label="Supplier" value={getSupplierName(po.supplier_id)} />
              <Detail label="Destination" value={po.destination || "—"} />
              <Detail label="Delivery Date" value={po.delivery_date ? new Date(po.delivery_date).toLocaleDateString() : "—"} />
              <Detail label="Quantity" value={po.quantity?.toLocaleString() || "—"} />
              <Detail label="Total Value" value={po.total_value ? formatCurrency(po.total_value, po.currency) : "—"} />
              <Detail label="Currency" value={po.currency} />
              <Detail label="Version" value={String(po.version)} />
            </div>
            {po.description && (
              <p className="mt-3 text-sm text-gray-600">
                <span className="font-medium text-gray-500">Description:</span> {po.description}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}