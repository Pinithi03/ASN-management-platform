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
  Calendar,
  X,
  Eye,
  ArrowRight,
  Copy,
  Check,
  Building,
  DollarSign,
  Mail,
  History,
  FileSpreadsheet,
  Truck,
} from "lucide-react";
import { poApi } from "../services/poApi";
import { useAuthStore } from "../store/authStore";
import type { PurchaseOrder } from "@/types/email";
import { cn } from "@/utils/cn";

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Partial", value: "PARTIAL" },
  { label: "Updated", value: "UPDATED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const STATUS_BADGES: Record<string, string> = {
  ACTIVE: "bg-blue-50 text-blue-700 border border-blue-200",
  UPDATED: "bg-amber-50 text-amber-700 border border-amber-200",
  PARTIAL: "bg-orange-50 text-orange-700 border border-orange-200",
  SHIPPED: "bg-orange-50 text-orange-700 border border-orange-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  CANCELLED: "bg-red-50 text-red-700 border border-red-200",
};

interface POLineItemRow {
  line_number: string;
  item_code: string;
  partner_item_code?: string;
  description: string;
  color?: string;
  size?: string;
  quantity: number;
  unit_price?: number;
}

// Plant matcher helper to identify plant code and standard company name
export const getPlantInfo = (clientOrDest?: string | null) => {
  if (!clientOrDest) return { code: "PPA1", name: "Omega Line Ltd", fullName: "Omega Line (PPA1)" };
  const s = clientOrDest.toLowerCase();
  if (s.includes("alpha") || s.includes("ppb1")) return { code: "PPB1", name: "Alpha Apparels Ltd", fullName: "Alpha Apparels (PPB1)" };
  if (s.includes("benji") || s.includes("ppc1")) return { code: "PPC1", name: "Benji Ltd", fullName: "Benji (PPC1)" };
  if (s.includes("sirio") || s.includes("ppd1")) return { code: "PPD1", name: "Sirio Ltd", fullName: "Sirio (PPD1)" };
  if (s.includes("vavuniya") || s.includes("ppe1") || s.includes("ppa4")) return { code: "PPE1", name: "Vavuniya Apparels", fullName: "Vavuniya Apparels (PPE1)" };
  if (s.includes("omega") || s.includes("ppa1") || s.includes("ppa2") || s.includes("bauddhaloka")) return { code: "PPA1", name: "Omega Line Ltd", fullName: "Omega Line (PPA1)" };
  return { code: "PPA1", name: clientOrDest, fullName: clientOrDest };
};

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const supplierId = isSupplier ? (user?.supplier_id || user?.supplier_code || undefined) : undefined;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // State for multi-selecting POs
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());

  // State for previewing a specific PO
  const [selectedPOForPreview, setSelectedPOForPreview] = useState<PurchaseOrder | null>(null);
  const [copiedPO, setCopiedPO] = useState(false);

  const { data, isLoading } = useQuery({
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
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });



  // Query to fetch complete details for the previewed PO (including history & source email)
  const { data: fullPODetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ["purchaseOrderDetail", selectedPOForPreview?.id],
    queryFn: () => poApi.getById(selectedPOForPreview!.id),
    enabled: Boolean(selectedPOForPreview?.id),
  });

  const activePO: PurchaseOrder | null = fullPODetail || selectedPOForPreview;

  const orders: PurchaseOrder[] = data?.items || [];
  const totalOrders = data?.total || 0;
  const totalPages = data?.pages || 1;

  const startItem = totalOrders === 0 ? 0 : (page - 1) * 50 + 1;
  const endItem = Math.min(page * 50, totalOrders);
  const paginationText =
    totalOrders === 0
      ? "0 of 0"
      : `${startItem.toLocaleString()}–${endItem.toLocaleString()} of ${totalOrders.toLocaleString()}`;


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

  const handleCreateShipment = (mode: "web" | "excel" = "web", poNumber?: string) => {
    const poList = poNumber || Array.from(selectedPOs).join(",");
    navigate(`/shipments?pos=${encodeURIComponent(poList)}&mode=${mode}`);
  };

  const handleCopyPONumber = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPO(true);
    setTimeout(() => setCopiedPO(false), 2000);
  };

  // Safely extract line items from extra_data
  const rawItems = (activePO?.extra_data as any)?.items;
  const lineItems: POLineItemRow[] = Array.isArray(rawItems) && rawItems.length > 0
    ? rawItems.map((it: any, idx: number) => {
        const itemCode = it.item_code || it.material_code || activePO?.style_number || "—";
        const partnerCode = it.partner_item_code || it.partner_code || "";
        const desc = it.description || it.item_description || activePO?.description || "—";
        const qty = Number(it.quantity || 0);

        let unitPrice: number | undefined = undefined;
        if (it.unit_price !== undefined && it.unit_price !== null && Number(it.unit_price) > 0) {
          unitPrice = Number(it.unit_price);
        } else if (activePO?.unit_price && Number(activePO.unit_price) > 0) {
          unitPrice = Number(activePO.unit_price);
        }

        return {
          line_number: String(it.order_line_number || it.line_number || idx + 1),
          item_code: itemCode,
          partner_item_code: partnerCode,
          description: desc,
          color: it.color || "",
          size: it.size || it.qty_unit || it.uom || "M",
          quantity: qty,
          unit_price: unitPrice,
        };
      })
    : activePO
    ? [
        {
          line_number: "1",
          item_code: activePO.style_number || "—",
          partner_item_code: "",
          description: activePO.description || "Primary Line Item",
          color: "",
          size: "PCS",
          quantity: activePO.quantity || 0,
          unit_price: activePO.unit_price ? Number(activePO.unit_price) : undefined,
        },
      ]
    : [];

  const totalLineQuantity = lineItems.reduce((acc, item) => acc + (item.quantity || 0), 0);
  const totalLineValue = lineItems.reduce((acc, item) => {
    if (item.unit_price && item.quantity) {
      return acc + item.quantity * item.unit_price;
    }
    return acc;
  }, 0);

  // Check if any line has a distinct partner code to show a dedicated column
  const hasDistinctPartner = lineItems.some(
    (li) => li.partner_item_code && li.partner_item_code.trim() !== "" && li.partner_item_code !== li.item_code
  );

  // Check if pricing is available
  const hasPricing =
    lineItems.some((li) => li.unit_price !== undefined && li.unit_price > 0) ||
    Boolean(activePO?.total_value && activePO.total_value > 0);

  const displayTotalValue =
    activePO?.total_value && activePO.total_value > 0
      ? activePO.total_value
      : totalLineValue;

  // Resolved plant and order info for the active previewed PO
  const plantInfo = getPlantInfo(activePO?.client_code || activePO?.destination);
  const orderType = (activePO?.extra_data as any)?.order_type || "ZA6A";
  const colSpanBeforeQty = hasDistinctPartner ? 6 : 5;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Purchase Orders</h1>
        </div>

      </div>

      {/* Selected Action Banner */}
      {selectedPOs.size > 0 && (
        <div
          className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-xs transition-all animate-in fade-in",
            isSupplier
              ? "bg-emerald-50/90 border border-emerald-200"
              : "bg-blue-50/90 border border-blue-200"
          )}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "w-2.5 h-2.5 rounded-full inline-block animate-pulse",
                isSupplier ? "bg-emerald-600" : "bg-blue-600"
              )}
            />
            <span
              className={cn(
                "text-sm font-semibold",
                isSupplier ? "text-emerald-950" : "text-blue-950"
              )}
            >
              {selectedPOs.size} order{selectedPOs.size > 1 ? "s" : ""} selected for delivery
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCreateShipment("web")}
              className={cn(
                "px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer",
                isSupplier
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              <PackagePlus className="w-3.5 h-3.5" />
              + Create Delivery
            </button>
            <button
              type="button"
              onClick={() => handleCreateShipment("excel")}
              className="px-3.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              Excel Drop
            </button>
            <button
              type="button"
              onClick={() => setSelectedPOs(new Set())}
              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 cursor-pointer font-medium"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}



      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
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
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[180px] text-gray-700"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Google-Style Top Pagination Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200/90 bg-white select-none">
          <div className="text-xs text-gray-500 font-medium">
            <span className="font-semibold text-gray-700">{totalOrders.toLocaleString()}</span> purchase orders
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <span className="px-2 font-normal tracking-tight text-gray-600">
              {paginationText}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              title="Previous page"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
              title="Next page"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2 text-blue-500" />
            Loading purchase orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <FileText className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">No purchase orders found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3.5 w-12 text-center">
                    <button
                      type="button"
                      onClick={toggleAllSelection}
                      className={cn(
                        "transition-colors cursor-pointer",
                        isSupplier ? "text-gray-400 hover:text-emerald-600" : "text-gray-400 hover:text-blue-600"
                      )}
                      title="Select all"
                    >
                      {selectedPOs.size === orders.length && orders.length > 0 ? (
                        <CheckSquare className={cn("w-4 h-4", isSupplier ? "text-emerald-600" : "text-blue-600")} />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5">PO Number</th>
                  <th className="px-4 py-3.5">Client / Destination</th>
                  <th className="px-4 py-3.5">Style / Material</th>
                  <th className="px-4 py-3.5 text-right">Quantity</th>
                  <th className="px-4 py-3.5">Delivery Date</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((po: PurchaseOrder) => {
                  const isSelected = po.po_number ? selectedPOs.has(po.po_number) : false;
                  return (
                    <tr
                      key={po.id}
                      onClick={() => setSelectedPOForPreview(po)}
                      className={cn(
                        "cursor-pointer transition-colors group",
                        isSelected
                          ? isSupplier
                            ? "bg-emerald-50/70 border-l-4 border-emerald-600"
                            : "bg-blue-50/70 border-l-4 border-blue-600"
                          : isSupplier
                          ? "hover:bg-emerald-50/30"
                          : "hover:bg-blue-50/30"
                      )}
                    >
                      {/* Selection Checkbox */}
                      <td
                        className="px-4 py-3 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (po.po_number) togglePOSelection(po.po_number);
                        }}
                      >
                        <button
                          type="button"
                          className={cn(
                            "text-gray-300 transition-colors",
                            isSupplier ? "hover:text-emerald-600" : "hover:text-blue-600"
                          )}
                        >
                          {isSelected ? (
                            <CheckSquare className={cn("w-4 h-4", isSupplier ? "text-emerald-600" : "text-blue-600")} />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* PO Number */}
                      <td className="px-4 py-3">
                        <div
                          className={cn(
                            "flex items-center gap-1.5 font-mono font-semibold text-gray-900 transition-colors",
                            isSupplier ? "group-hover:text-emerald-600" : "group-hover:text-blue-600"
                          )}
                        >
                          <span>{po.po_number || "—"}</span>
                        </div>
                      </td>

                      {/* Client / Destination */}
                      <td className="px-4 py-3 text-gray-700">
                        <div className="font-medium text-gray-900">{po.destination || po.client_code || "—"}</div>
                        {po.client_code && po.destination && po.client_code !== po.destination && (
                          <div className="text-xs text-gray-400">{po.client_code}</div>
                        )}
                      </td>

                      {/* Style */}
                      <td className="px-4 py-3 text-gray-700">
                        <div className="font-medium text-gray-900">{po.style_number || "—"}</div>
                        {po.description && (
                          <div className="text-xs text-gray-400 truncate max-w-xs">{po.description}</div>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                        {po.quantity?.toLocaleString() ?? "—"}
                      </td>

                      {/* Delivery Date */}
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {po.delivery_date ? format(new Date(po.delivery_date), "MMM d, yyyy") : "—"}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2.5 py-1 text-xs font-semibold rounded-full inline-flex items-center ${
                              STATUS_BADGES[po.status] || "bg-gray-100 text-gray-700 border border-gray-200"
                            }`}
                          >
                            {po.status}
                          </span>
                          {po.version && po.version > 1 ? (
                            <span
                              className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded border border-amber-200 inline-flex items-center shadow-2xs"
                              title={`Order revised/amended by customer (Version ${po.version})`}
                            >
                              v{po.version}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Actions */}
                      <td
                        className="px-4 py-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedPOForPreview(po)}
                            title="Preview PO Details"
                            className={cn(
                              "p-1.5 text-gray-500 rounded-lg transition-colors cursor-pointer",
                              isSupplier
                                ? "hover:text-emerald-600 hover:bg-emerald-50"
                                : "hover:text-blue-600 hover:bg-blue-50"
                            )}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => po.po_number && handleCreateShipment("web", po.po_number)}
                            title="Create Delivery for this PO"
                            className={cn(
                              "p-1.5 text-gray-500 rounded-lg transition-colors cursor-pointer",
                              isSupplier
                                ? "hover:text-emerald-600 hover:bg-emerald-50"
                                : "hover:text-blue-600 hover:bg-blue-50"
                            )}
                          >
                            <PackagePlus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Google-Style Bottom Pagination Footer */}
        {totalOrders > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50/70 select-none text-xs text-gray-600">
            <div className="font-medium text-gray-500">
              <span className="font-semibold text-gray-700">{totalOrders.toLocaleString()} total orders</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <span className="px-2 font-normal tracking-tight text-gray-600">
                {paginationText}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                title="Previous page"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                title="Next page"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PO Preview & Details Modal */}
      {activePO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold font-mono text-gray-900 tracking-tight">
                      PO# {activePO.po_number || "—"}
                    </h2>
                    {activePO.version && activePO.version > 1 ? (
                      <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-md border border-amber-200">
                        v{activePO.version} Revision
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-md border border-gray-200">
                        v1 Original
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded-full inline-flex items-center ${
                        STATUS_BADGES[activePO.status] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {activePO.status}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-200 font-mono">
                      Type: {orderType}
                    </span>
                    {activePO.po_number && (
                      <button
                        type="button"
                        onClick={() => handleCopyPONumber(activePO.po_number!)}
                        className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-md hover:bg-gray-100 flex items-center gap-1 text-xs"
                        title="Copy PO Number"
                      >
                        {copiedPO ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600 font-medium">Copied</span>
                          </>
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1">
                    <span>
                      Plant: <strong className="text-gray-800 font-medium">{plantInfo.fullName}</strong>
                    </span>
                    {activePO.style_number && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span>
                          Primary Style: <strong className="text-gray-800 font-mono">{activePO.style_number}</strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPOForPreview(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              {/* Summary Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Card 1: Plant & Destination */}
                <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Building className="w-3.5 h-3.5 text-blue-600" />
                      Plant & Destination
                    </span>
                    <span className="px-1.5 py-0.5 font-bold font-mono text-[10px] bg-blue-50 text-blue-700 rounded border border-blue-200">
                      {plantInfo.code}
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 text-sm leading-snug">
                    {plantInfo.name}
                  </p>
                  <p className="text-xs text-gray-600 mt-1 break-words">
                    {activePO.destination || activePO.client_code || "Direct Delivery"}
                  </p>
                </div>

                {/* Card 2: Dates & Transit */}
                <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      Delivery Schedule
                    </span>
                    {activePO.ship_date && (
                      <span className="text-[10px] text-gray-400 font-mono">
                        Ship: {format(new Date(activePO.ship_date), "MMM d")}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-gray-900 text-sm">
                    {activePO.delivery_date ? format(new Date(activePO.delivery_date), "MMM d, yyyy") : "Not Specified"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Truck className="w-3 h-3 text-gray-400" />
                    {activePO.ship_date ? `Scheduled Ship: ${format(new Date(activePO.ship_date), "MMM d, yyyy")}` : "Standard Factory Transit"}
                  </p>
                </div>

                {/* Card 3: Total Quantities */}
                <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Package className="w-3.5 h-3.5 text-emerald-600" />
                      Total Quantity
                    </span>
                    <span className="px-1.5 py-0.5 font-medium text-[10px] bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                      {lineItems.length} {lineItems.length === 1 ? "line" : "lines"}
                    </span>
                  </div>
                  <p className="font-extrabold text-gray-900 text-xl font-mono">
                    {(activePO.quantity || totalLineQuantity).toLocaleString()}
                    <span className="text-xs font-normal text-gray-500 ml-1.5">units</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Across {lineItems.length} active order line{lineItems.length === 1 ? "" : "s"}
                  </p>
                </div>

                {/* Card 4: Order Valuation */}
                <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-200/90 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <DollarSign className="w-3.5 h-3.5 text-purple-600" />
                      Total Order Value
                    </span>
                    <span className="px-1.5 py-0.5 font-bold font-mono text-[10px] bg-purple-50 text-purple-700 rounded border border-purple-200">
                      {activePO.currency || "USD"}
                    </span>
                  </div>
                  <p className="font-extrabold text-gray-900 text-xl font-mono">
                    {activePO.currency || "USD"}{" "}
                    {displayTotalValue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {hasPricing ? "Valued via email line items" : "Standard procurement rate"}
                  </p>
                </div>
              </div>

              {/* Ingestion Source Email (if present) */}
              {activePO.source_email_subject && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-950">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-semibold text-gray-600 shrink-0">Source Email Ingestion:</span>
                  <span className="truncate font-mono text-blue-900">{activePO.source_email_subject}</span>
                </div>
              )}

              {/* Line Items Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-base">Line Items & Quantities</h3>
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 font-semibold rounded-full border border-gray-200">
                      {lineItems.length}
                    </span>
                  </div>
                  {isLoadingDetail && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin text-blue-500" /> Refreshing lines...
                    </span>
                  )}
                </div>

                <div className="border border-gray-200 rounded-xl overflow-x-auto shadow-xs bg-white">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50/90 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider">
                        <th className="px-3 py-2.5 w-10 text-center">#</th>
                        <th className="px-3 py-2.5 min-w-[150px]">Item / Material Code</th>
                        {hasDistinctPartner && (
                          <th className="px-3 py-2.5 min-w-[110px]">Partner Code</th>
                        )}
                        <th className="px-3 py-2.5 min-w-[180px]">Description</th>
                        <th className="px-2.5 py-2.5 min-w-[80px]">Color</th>
                        <th className="px-2.5 py-2.5 text-center w-20">Size / UOM</th>
                        <th className="px-3 py-2.5 text-right font-semibold min-w-[90px]">Quantity</th>
                        {hasPricing && (
                          <th className="px-3 py-2.5 text-right min-w-[95px]">Unit Price</th>
                        )}
                        {hasPricing && (
                          <th className="px-3 py-2.5 text-right font-semibold min-w-[105px]">Subtotal</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {lineItems.map((item, idx) => {
                        const lineSubtotal = item.unit_price ? item.quantity * item.unit_price : undefined;
                        return (
                          <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                            <td className="px-3 py-2.5 text-center font-mono text-gray-400">
                              {item.line_number}
                            </td>
                            <td className="px-3 py-2.5 font-mono">
                              <div className="font-bold text-gray-900">{item.item_code}</div>
                              {/* If no distinct partner column, show partner code under item code if present */}
                              {!hasDistinctPartner && item.partner_item_code && item.partner_item_code !== item.item_code && (
                                <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                                  <span className="text-gray-400">Partner:</span>
                                  <span className="font-medium text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                    {item.partner_item_code}
                                  </span>
                                </div>
                              )}
                            </td>
                            {hasDistinctPartner && (
                              <td className="px-3 py-2.5 font-mono text-gray-700 font-medium">
                                {item.partner_item_code || "—"}
                              </td>
                            )}
                            <td className="px-3 py-2.5 text-gray-700 font-medium break-words max-w-xs">
                              {item.description}
                            </td>
                            <td className="px-2.5 py-2.5 text-gray-700 whitespace-nowrap">
                              {item.color ? (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-800 rounded font-medium text-[11px] border border-gray-200">
                                  {item.color}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-2.5 py-2.5 text-center font-mono text-gray-700 whitespace-nowrap">
                              <span className="px-2 py-0.5 bg-gray-100 rounded text-[11px] font-semibold border border-gray-200">
                                {item.size || "M"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 text-sm whitespace-nowrap">
                              {item.quantity.toLocaleString()}
                            </td>
                            {hasPricing && (
                              <td className="px-3 py-2.5 text-right font-mono text-gray-600 whitespace-nowrap">
                                {item.unit_price !== undefined
                                  ? `${activePO.currency || "USD"} ${item.unit_price.toFixed(2)}`
                                  : "—"}
                              </td>
                            )}
                            {hasPricing && (
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                                {lineSubtotal !== undefined
                                  ? `${activePO.currency || "USD"} ${lineSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : "—"}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50/90 border-t-2 border-gray-200 font-semibold text-gray-900">
                      <tr>
                        <td colSpan={colSpanBeforeQty} className="px-3 py-2.5 text-right text-gray-600 text-xs">
                          Total Order Quantity ({lineItems.length} lines):
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-blue-600 whitespace-nowrap">
                          {totalLineQuantity.toLocaleString()}
                        </td>
                        {hasPricing && <td className="px-3 py-2.5"></td>}
                        {hasPricing && (
                          <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-gray-900 whitespace-nowrap">
                            {activePO?.currency || "USD"}{" "}
                            {displayTotalValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Revision History (if available) */}
              {(fullPODetail as any)?.history && (fullPODetail as any).history.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <History className="w-3.5 h-3.5 text-gray-500" />
                    Revision & Update History
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2">
                    {(fullPODetail as any).history.map((h: any, idx: number) => (
                      <div key={idx} className="flex items-start justify-between text-xs border-b border-gray-100 pb-1.5 last:border-0 last:pb-0">
                        <div>
                          <span className="font-semibold text-gray-900">Version {h.version}</span>
                          <span className="text-gray-500 ml-2">Source: {h.change_source}</span>
                          {h.changed_fields?.quantity && (
                            <span className="ml-2 text-blue-600 font-mono">
                              Qty: {h.changed_fields.quantity.old} → {h.changed_fields.quantity.new}
                            </span>
                          )}
                        </div>
                        <span className="text-gray-400 font-mono">
                          {h.created_at ? format(new Date(h.created_at), "yyyy-MM-dd HH:mm") : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Sticky Footer Actions */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                {activePO.po_number && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activePO.po_number) togglePOSelection(activePO.po_number);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    {activePO.po_number && selectedPOs.has(activePO.po_number) ? (
                      <>
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                        Selected for Batch Delivery
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4 text-gray-400" />
                        Add to Batch Selection
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedPOForPreview(null)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const poNum = activePO.po_number || "";
                    setSelectedPOForPreview(null);
                    handleCreateShipment("excel", poNum);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Prepare Outbound Delivery using Excel drop"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Excel Drop
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const poNum = activePO.po_number || "";
                    setSelectedPOForPreview(null);
                    handleCreateShipment("web", poNum);
                  }}
                  className={cn(
                    "px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer",
                    isSupplier
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  Proceed with Shipments
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

