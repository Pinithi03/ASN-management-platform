import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate, useLocation } from "react-router-dom";
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
  ArrowRight,
  Copy,
  Check,
  Building,
  DollarSign,
  Mail,
  History,
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  AlertCircle,
  Factory,
  AlertTriangle,
  Warehouse,
} from "lucide-react";
import { poApi } from "../services/poApi";
import { useAuthStore } from "../store/authStore";
import type { PurchaseOrder } from "@/types/email";
import { cn } from "@/utils/cn";
import { resolvePlantAndLocation, KNOWN_PLANTS } from "@/utils/plantResolver";

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

const formatDateDisplay = (dateStr?: string | null) => {
  if (!dateStr) return "—";
  try {
    const s = dateStr.trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split("-");
      return format(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)), "MMM d, yyyy");
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return format(d, "MMM d, yyyy");
  } catch {
    return dateStr;
  }
};

interface POLineItemRow {
  line_number: string;
  item_code: string;
  partner_item_code?: string;
  description: string;
  color?: string;
  size?: string;
  quantity: number;
  shipped_quantity?: number;
  remaining_quantity?: number;
  unit_price?: number;
}

// Plant matcher helper to identify plant code and standard company name
export const getPlantInfo = (clientOrDest?: string | null) => {
  const res = resolvePlantAndLocation(clientOrDest);
  return {
    code: res.plantCode,
    name: res.plantName,
    fullName: res.displayName,
    group: res.plantGroup,
    storageLocation: res.storageLocation,
  };
};

export interface PurchaseOrdersProps {
  mode?: "all" | "manual" | "excel";
}

export default function PurchaseOrders({ mode }: PurchaseOrdersProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const supplierId = isSupplier ? (user?.supplier_id || user?.supplier_code || undefined) : undefined;

  const activeMode: "manual" | "excel" =
    mode === "excel" || location.pathname.includes("/excel")
      ? "excel"
      : "manual";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedPlant, setSelectedPlant] = useState<string>("ALL");
  const [selectedLocation, setSelectedLocation] = useState<string>("ALL");
  const [crossPlantWarning, setCrossPlantWarning] = useState<{
    attemptedPO: string;
    targetPlant: string;
    currentPlant: string;
  } | null>(null);

  // State for multi-selecting POs
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());

  // State for previewing a specific PO
  const [selectedPOForPreview, setSelectedPOForPreview] = useState<PurchaseOrder | null>(null);
  const [copiedPO, setCopiedPO] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["purchaseOrders", page, search, statusFilter, supplierId, selectedPlant, selectedLocation],
    queryFn: () =>
      poApi.list({
        page,
        per_page: 50,
        search: search || undefined,
        status: statusFilter || undefined,
        supplier_id: supplierId,
        plant: selectedPlant !== "ALL" ? selectedPlant : undefined,
        storage_location: selectedLocation !== "ALL" ? selectedLocation : undefined,
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

  // Compute Plant Breakdown Counts
  const plantCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: orders.length };
    Object.keys(KNOWN_PLANTS).forEach((pId) => {
      counts[pId] = 0;
    });

    orders.forEach((po) => {
      const dest = po.delivery_address || po.destination || po.client_code;
      const res = resolvePlantAndLocation(dest, po.client_code);
      counts[res.plantGroup] = (counts[res.plantGroup] || 0) + 1;
    });
    return counts;
  }, [orders]);

  // Compute available storage locations for the currently selected plant
  const availableLocations = useMemo(() => {
    const locMap = new Map<string, number>();
    orders.forEach((po) => {
      const dest = po.delivery_address || po.destination || po.client_code;
      const res = resolvePlantAndLocation(dest, po.client_code);
      if (selectedPlant === "ALL" || res.plantGroup === selectedPlant || res.plantCode === selectedPlant) {
        const key = res.fullDeliveryAddress || res.storageLocation;
        locMap.set(key, (locMap.get(key) || 0) + 1);
      }
    });

    return Array.from(locMap.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders, selectedPlant]);

  // Filter orders for display
  const displayedOrders = useMemo(() => {
    return orders.filter((po) => {
      const dest = po.delivery_address || po.destination || po.client_code;
      const res = resolvePlantAndLocation(dest, po.client_code);

      if (selectedPlant !== "ALL" && res.plantGroup !== selectedPlant && res.plantCode !== selectedPlant) {
        return false;
      }

      if (selectedLocation !== "ALL" && res.fullDeliveryAddress !== selectedLocation && res.storageLocation !== selectedLocation) {
        return false;
      }

      return true;
    });
  }, [orders, selectedPlant, selectedLocation]);

  const startItem = totalOrders === 0 ? 0 : (page - 1) * 50 + 1;
  const endItem = Math.min(page * 50, totalOrders);
  const paginationText =
    totalOrders === 0
      ? "0 of 0"
      : `${startItem.toLocaleString()}–${endItem.toLocaleString()} of ${totalOrders.toLocaleString()}`;

  const selectableOrders = displayedOrders.filter(
    (p) => p.status !== "COMPLETED" && p.status !== "CANCELLED" && Boolean(p.po_number)
  );

  // Determine plant of currently selected POs
  const currentSelectedPlantInfo = useMemo(() => {
    if (selectedPOs.size === 0) return null;
    const firstNum = Array.from(selectedPOs)[0];
    const poObj = orders.find((p) => p.po_number === firstNum);
    if (!poObj) return null;
    const dest = poObj.delivery_address || poObj.destination || poObj.client_code;
    return resolvePlantAndLocation(dest, poObj.client_code);
  }, [selectedPOs, orders]);

  const togglePOSelection = (poNumber: string) => {
    const poObj = orders.find((p) => p.po_number === poNumber);
    if (poObj && (poObj.status === "COMPLETED" || poObj.status === "CANCELLED")) {
      return;
    }

    if (selectedPOs.has(poNumber)) {
      const newSelection = new Set(selectedPOs);
      newSelection.delete(poNumber);
      setSelectedPOs(newSelection);
      if (newSelection.size === 0) {
        setCrossPlantWarning(null);
      }
      return;
    }

    // Check cross-plant conflict
    if (selectedPOs.size > 0 && currentSelectedPlantInfo && poObj) {
      const thisDest = poObj.delivery_address || poObj.destination || poObj.client_code;
      const thisPlant = resolvePlantAndLocation(thisDest, poObj.client_code);

      if (thisPlant.plantGroup !== currentSelectedPlantInfo.plantGroup) {
        // BLOCK SELECTION across different plants!
        setCrossPlantWarning({
          attemptedPO: poNumber,
          targetPlant: thisPlant.plantName,
          currentPlant: currentSelectedPlantInfo.plantName,
        });
        return;
      }
    }

    // Allow selection
    setCrossPlantWarning(null);
    const newSelection = new Set(selectedPOs);
    newSelection.add(poNumber);
    setSelectedPOs(newSelection);
  };

  const toggleAllSelection = () => {
    const selectableNumbers = selectableOrders
      .map((p) => p.po_number)
      .filter((num): num is string => Boolean(num));

    const allSelected = selectableNumbers.length > 0 && selectableNumbers.every((num) => selectedPOs.has(num));

    if (allSelected) {
      const newSelection = new Set(selectedPOs);
      selectableNumbers.forEach((n) => newSelection.delete(n));
      setSelectedPOs(newSelection);
    } else {
      // If currently on "ALL" plants view and there are multiple plants:
      if (selectedPlant === "ALL" && selectableOrders.length > 0) {
        const firstPo = selectableOrders[0];
        const firstPlant = resolvePlantAndLocation(firstPo.delivery_address || firstPo.destination, firstPo.client_code);
        // Only select orders belonging to that plant to guarantee NO cross-plant deliveries
        const samePlantOrders = selectableOrders.filter((p) => {
          const res = resolvePlantAndLocation(p.delivery_address || p.destination, p.client_code);
          return res.plantGroup === firstPlant.plantGroup;
        });
        const numbers = samePlantOrders.map((p) => p.po_number).filter(Boolean) as string[];
        setSelectedPOs(new Set(numbers));
        setCrossPlantWarning({
          attemptedPO: "Batch",
          targetPlant: "Other Plants",
          currentPlant: firstPlant.plantName,
        });
      } else {
        setSelectedPOs(new Set(selectableNumbers));
        setCrossPlantWarning(null);
      }
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
      const itemCode = it.item_code || it.material_code || activePO?.style_number || " ";
      const partnerCode = it.partner_item_code || it.partner_code || "";
      const desc = it.item_description || it.description || activePO?.description || " ";
      const qty = Number(it.quantity || 0);
      const shipped = Number(it.shipped_quantity ?? 0);
      const remaining = it.remaining_quantity !== undefined ? Number(it.remaining_quantity) : Math.max(0, qty - shipped);

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
        shipped_quantity: shipped,
        remaining_quantity: remaining,
        unit_price: unitPrice,
      };
    })
    : activePO
      ? [
        {
          line_number: "1",
          item_code: activePO.style_number || " ",
          partner_item_code: "",
          description: activePO.description || "Primary Line Item",
          color: "",
          size: "PCS",
          quantity: activePO.quantity || 0,
          shipped_quantity: Number((activePO as any).shipped_quantity || 0),
          remaining_quantity: (activePO as any).remaining_quantity !== undefined
            ? Number((activePO as any).remaining_quantity)
            : Math.max(0, Number(activePO.quantity || 0) - Number((activePO as any).shipped_quantity || 0)),
          unit_price: activePO.unit_price ? Number(activePO.unit_price) : undefined,
        },
      ]
      : [];

  const totalLineQuantity = lineItems.reduce((acc, item) => acc + (item.quantity || 0), 0);
  const totalShippedQuantity = (activePO as any)?.shipped_quantity !== undefined
    ? Number((activePO as any).shipped_quantity)
    : lineItems.reduce((acc, item) => acc + (item.shipped_quantity || 0), 0);
  const totalRemainingQuantity = (activePO as any)?.remaining_quantity !== undefined
    ? Number((activePO as any).remaining_quantity)
    : Math.max(0, totalLineQuantity - totalShippedQuantity);

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
  const plantInfo = getPlantInfo(
    activePO?.destination ||
    (activePO as any)?.delivery_address ||
    (activePO?.extra_data as any)?.delivery_address ||
    activePO?.client_code
  );
  const orderType = (activePO?.extra_data as any)?.order_type || "ZA6A";
  const colSpanBeforeQty = hasDistinctPartner ? 6 : 5;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">Purchase Orders</h1>
            {activeMode === "manual" ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-2xs border",
                  isSupplier
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                )}
              >
                <Layers className={cn("w-3.5 h-3.5", isSupplier ? "text-emerald-600" : "text-blue-600")} />
                Manual Process
              </span>
            ) : (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-2xs border",
                  isSupplier
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                )}
              >
                <FileSpreadsheet className={cn("w-3.5 h-3.5", isSupplier ? "text-emerald-600" : "text-blue-600")} />
                Excel Drop
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {activeMode === "manual"
              ? "Select purchase order lines below to prepare deliveries and assign packings manually using the step-by-step wizard."
              : "Select purchase orders below to download standard templates or upload completed Excel packing manifests."}
          </p>
        </div>
      </div>

      {/* Cross-Plant Selection Mismatch Warning */}
      {crossPlantWarning && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-start sm:items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div className="text-xs">
              <span className="font-bold">Cannot Mix Plants in One Delivery: </span>
              Your current selection contains orders for <span className="font-semibold underline">{crossPlantWarning.currentPlant}</span>.
              Orders destined for <span className="font-semibold underline">{crossPlantWarning.targetPlant}</span> (e.g. #{crossPlantWarning.attemptedPO}) must be dispatched in a separate delivery.
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                if (crossPlantWarning.attemptedPO && crossPlantWarning.attemptedPO !== "Batch") {
                  setSelectedPOs(new Set([crossPlantWarning.attemptedPO]));
                } else {
                  setSelectedPOs(new Set());
                }
                setCrossPlantWarning(null);
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Clear & Select #{crossPlantWarning.attemptedPO}
            </button>
            <button
              type="button"
              onClick={() => setCrossPlantWarning(null)}
              className="p-1 hover:bg-amber-200/60 rounded-md text-amber-700 transition-colors cursor-pointer"
              title="Dismiss warning"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Selected Action Banner */}
      {selectedPOs.size > 0 && (
        <div
          className={cn(
            "w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border shadow-xs transition-all animate-in fade-in slide-in-from-top-1 duration-200",
            isSupplier
              ? "bg-emerald-50/80 border-emerald-200"
              : "bg-blue-50/80 border-blue-200"
          )}
        >
          <div className="flex items-center gap-3.5">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-xs text-white shadow-xs",
                isSupplier ? "bg-emerald-600" : "bg-blue-600"
              )}
            >
              {selectedPOs.size}
            </div>
            <div>
              <p
                className={cn(
                  "text-sm font-semibold leading-tight",
                  isSupplier ? "text-emerald-950" : "text-blue-950"
                )}
              >
                {selectedPOs.size} Purchase Order{selectedPOs.size > 1 ? "s" : ""} Selected
                {currentSelectedPlantInfo ? (
                  <span className="font-normal text-xs text-gray-600 ml-1.5">
                    for <span className="font-semibold text-gray-900">{currentSelectedPlantInfo.plantName}</span> ({currentSelectedPlantInfo.plantCode})
                  </span>
                ) : null}
              </p>
              <p
                className={cn(
                  "text-xs mt-0.5",
                  isSupplier ? "text-emerald-700" : "text-blue-700"
                )}
              >
                {activeMode === "manual"
                  ? "Ready to dispatch via Manual Packing Wizard (Single-Plant Scoped)"
                  : "Ready to dispatch via 12-Column Excel Drop Manifest"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setSelectedPOs(new Set());
                setCrossPlantWarning(null);
              }}
              className="h-10 px-4 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
              Clear Selection
            </button>

            {activeMode === "manual" ? (
              <button
                type="button"
                onClick={() => handleCreateShipment("web")}
                className={cn(
                  "h-10 px-5 text-xs font-semibold text-white rounded-lg shadow-xs flex items-center gap-2 transition-all active:scale-[0.99] cursor-pointer",
                  isSupplier
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                <PackagePlus className="w-4 h-4" />
                <span>+ Create Delivery</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleCreateShipment("excel")}
                className={cn(
                  "h-10 px-5 text-xs font-semibold text-white rounded-lg shadow-xs flex items-center gap-2 transition-all active:scale-[0.99] cursor-pointer",
                  isSupplier
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel Drop Delivery</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Level 1: Plant Hierarchy Selector Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Factory className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-600">
              1. Select Destination Plant (Oniverse Group Factories)
            </span>
          </div>
          {selectedPlant !== "ALL" && (
            <button
              type="button"
              onClick={() => {
                setSelectedPlant("ALL");
                setSelectedLocation("ALL");
                setPage(1);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer flex items-center gap-1"
            >
              <span>Show All Plants</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          {/* All Plants Tab */}
          <button
            type="button"
            onClick={() => {
              setSelectedPlant("ALL");
              setSelectedLocation("ALL");
              setPage(1);
            }}
            className={cn(
              "p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between",
              selectedPlant === "ALL"
                ? isSupplier
                  ? "bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                  : "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/70"
            )}
          >
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                All Factories
              </div>
              <div className="text-xs font-bold text-gray-900 mt-0.5 truncate">
                All Plants
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
              <span className="text-[10px] text-gray-400">Total POs</span>
              <span className={cn(
                "px-2 py-0.5 text-[11px] font-bold rounded-full",
                selectedPlant === "ALL"
                  ? isSupplier ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700"
              )}>
                {orders.length}
              </span>
            </div>
          </button>

          {/* 5 Oniverse Plants */}
          {Object.entries(KNOWN_PLANTS).map(([pId, plant]) => {
            const count = plantCounts[pId] || 0;
            const isSelected = selectedPlant === pId;

            return (
              <button
                key={pId}
                type="button"
                onClick={() => {
                  setSelectedPlant(pId);
                  setSelectedLocation("ALL");
                  setPage(1);
                }}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between",
                  isSelected
                    ? isSupplier
                      ? "bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                      : "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                    : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/70"
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "px-1.5 py-0.5 text-[10px] font-bold font-mono rounded",
                      isSelected
                        ? isSupplier ? "bg-emerald-200/80 text-emerald-900" : "bg-blue-200/80 text-blue-900"
                        : "bg-gray-100 text-gray-600"
                    )}>
                      {plant.codePrefix}
                    </span>
                    <span className={cn(
                      "px-1.5 py-0.2 text-[11px] font-bold rounded-full",
                      isSelected
                        ? isSupplier ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700"
                    )}>
                      {count}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-gray-900 mt-1.5 truncate" title={plant.name}>
                    {plant.name.replace(" Ltd", "")}
                  </div>
                  <div className="text-[10px] text-gray-400 truncate" title={plant.location}>
                    {plant.location}
                  </div>
                </div>
                <div className="text-[9px] text-gray-400 mt-2 pt-1 border-t border-gray-100 flex items-center justify-between">
                  <span>Factory</span>
                  <span className="font-mono font-semibold">{plant.defaultCode}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Level 2: Storage Locations Drilldown Pills */}
      {availableLocations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50/90 border border-gray-200 rounded-xl">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mr-1 shrink-0">
            <Warehouse className="w-3.5 h-3.5 text-blue-600" />
            <span>2. Delivery Location / Dock:</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedLocation("ALL");
              setPage(1);
            }}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              selectedLocation === "ALL"
                ? isSupplier
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-blue-600 text-white shadow-2xs"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
            )}
          >
            All Locations ({selectedPlant === "ALL" ? orders.length : (plantCounts[selectedPlant] || 0)})
          </button>

          {availableLocations.map((loc) => {
            const isSelected = selectedLocation === loc.code;
            return (
              <button
                key={loc.code}
                type="button"
                onClick={() => {
                  setSelectedLocation(loc.code);
                  setPage(1);
                }}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                  isSelected
                    ? isSupplier
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-blue-600 text-white shadow-2xs"
                    : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                )}
              >
                <span>{loc.code}</span>
                <span className={cn(
                  "px-1.5 py-0.2 text-[10px] rounded-full",
                  isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                )}>
                  {loc.count}
                </span>
              </button>
            );
          })}
        </div>
      )}



      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search PO, client, style..."
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
            <span className="font-semibold text-gray-700">{displayedOrders.length.toLocaleString()}</span> purchase orders
            {(selectedPlant !== "ALL" || selectedLocation !== "ALL") && (
              <span className="ml-1 text-gray-400">
                (filtered from {totalOrders.toLocaleString()})
              </span>
            )}
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
        ) : displayedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Warehouse className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">No purchase orders found</p>
            <p className="text-xs text-gray-400 mt-1">
              {selectedPlant !== "ALL" || selectedLocation !== "ALL"
                ? "No purchase orders match the selected factory plant or storage location."
                : "Try adjusting your search or filters"}
            </p>
            {(selectedPlant !== "ALL" || selectedLocation !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPlant("ALL");
                  setSelectedLocation("ALL");
                  setPage(1);
                }}
                className="mt-4 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
              >
                Reset Plant & Location Filters
              </button>
            )}
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
                      {selectedPOs.size === selectableOrders.length && selectableOrders.length > 0 ? (
                        <CheckSquare className={cn("w-4 h-4", isSupplier ? "text-emerald-600" : "text-blue-600")} />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5 whitespace-nowrap">PO Number</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Plant & Storage</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Order Date</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Delivery Date</th>
                  <th className="px-4 py-3.5 min-w-[320px]">Contact</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Notation</th>
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">Quantity</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedOrders.map((po: PurchaseOrder) => {
                  const isSelected = po.po_number ? selectedPOs.has(po.po_number) : false;
                  const poPlant = resolvePlantAndLocation(
                    po.delivery_address || po.destination || (po.extra_data as any)?.delivery_address,
                    po.client_code
                  );
                  const isCrossPlant =
                    selectedPOs.size > 0 &&
                    currentSelectedPlantInfo &&
                    !isSelected &&
                    poPlant.plantGroup !== currentSelectedPlantInfo.plantGroup;

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
                          : isCrossPlant
                          ? "opacity-60 hover:bg-amber-50/20"
                          : isSupplier
                            ? "hover:bg-emerald-50/30"
                            : "hover:bg-blue-50/30"
                      )}
                    >
                      {/* Selection Checkbox */}
                      <td
                        className={cn(
                          "px-4 py-3 text-center",
                          (po.status === "COMPLETED" || po.status === "CANCELLED") ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (po.status === "COMPLETED" || po.status === "CANCELLED") return;
                          if (po.po_number) togglePOSelection(po.po_number);
                        }}
                      >
                        <button
                          type="button"
                          disabled={po.status === "COMPLETED" || po.status === "CANCELLED"}
                          title={
                            po.status === "COMPLETED"
                              ? "This PO is fully fulfilled (Completed)"
                              : po.status === "CANCELLED"
                              ? "This PO is cancelled"
                              : isCrossPlant
                              ? `Cannot mix plants: Belongs to ${poPlant.plantName}. Current selection is for ${currentSelectedPlantInfo?.plantName}.`
                              : "Select PO"
                          }
                          className={cn(
                            "text-gray-300 transition-colors",
                            (po.status === "COMPLETED" || po.status === "CANCELLED")
                              ? "cursor-not-allowed"
                              : isCrossPlant
                              ? "text-gray-200 hover:text-amber-500"
                              : isSupplier ? "hover:text-emerald-600" : "hover:text-blue-600"
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

                      {/* Plant & Storage Location */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-medium text-gray-900 text-xs">
                            <Factory className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{poPlant.plantName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-gray-100 text-gray-700 border border-gray-200 rounded-md">
                              {poPlant.fullDeliveryAddress}
                            </span>
                            {poPlant.storageLocation && poPlant.storageLocation !== poPlant.fullDeliveryAddress && (
                              <span className="text-[10px] text-gray-400 font-mono">
                                Dock: {poPlant.storageLocation}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Order Date */}
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>{formatDateDisplay(po.order_date || (po.extra_data as any)?.order_date)}</span>
                        </div>
                      </td>

                      {/* Delivery Date */}
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>{formatDateDisplay(po.delivery_date)}</span>
                        </div>
                      </td>

                      {/* Contact (<ContactPerson> on top, <AuxHead1> email underneath) */}
                      <td className="px-4 py-3 text-gray-700 min-w-[320px]">
                        {po.contact_person || (po.extra_data as any)?.contact_person ? (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-gray-900 leading-tight">
                              {po.contact_person || (po.extra_data as any)?.contact_person}
                            </div>
                            {(po.contact_email || (po.extra_data as any)?.contact_email) && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <a
                                  href={`mailto:${po.contact_email || (po.extra_data as any)?.contact_email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-blue-600 hover:underline hover:text-blue-700 font-mono tracking-tight select-all"
                                  title={po.contact_email || (po.extra_data as any)?.contact_email}
                                >
                                  {po.contact_email || (po.extra_data as any)?.contact_email}
                                </a>
                              </div>
                            )}
                          </div>
                        ) : (po.contact_email || (po.extra_data as any)?.contact_email) ? (
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <a
                              href={`mailto:${po.contact_email || (po.extra_data as any)?.contact_email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-blue-600 hover:underline hover:text-blue-700 font-mono tracking-tight select-all"
                              title={po.contact_email || (po.extra_data as any)?.contact_email}
                            >
                              {po.contact_email || (po.extra_data as any)?.contact_email}
                            </a>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Notation */}
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {po.notations || (po.extra_data as any)?.notations || (po.extra_data as any)?.aux_head8 || (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="px-4 py-3 text-right font-mono">
                        {po.status === "PARTIAL" && po.remaining_quantity !== undefined && po.remaining_quantity !== null ? (
                          <div>
                            <div className="font-bold text-orange-600">
                              {po.remaining_quantity.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              bal of {po.quantity?.toLocaleString()}
                            </div>
                          </div>
                        ) : po.status === "COMPLETED" ? (
                          <div>
                            <div className="font-bold text-emerald-600">0</div>
                            <div className="text-[11px] text-gray-400">
                              fulfilled ({po.quantity?.toLocaleString()})
                            </div>
                          </div>
                        ) : (
                          <div className="font-semibold text-gray-900">
                            {po.quantity?.toLocaleString() ?? "—"}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2.5 py-1 text-xs font-semibold rounded-full inline-flex items-center ${STATUS_BADGES[po.status] || "bg-gray-100 text-gray-700 border border-gray-200"
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
                      PO {activePO.po_number || " "}
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
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded-full inline-flex items-center ${STATUS_BADGES[activePO.status] || "bg-gray-100 text-gray-700"
                        }`}
                    >
                      {activePO.status}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-200 font-mono">
                      Type: {orderType}
                    </span>
                    {activePO.delivery_date && (
                      <span className="px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-800 rounded-md border border-amber-200 inline-flex items-center gap-1.5 font-sans">
                        <Calendar className="w-3 h-3 text-amber-600" />
                        Delivery: <strong className="font-semibold">{format(new Date(activePO.delivery_date), "MMM d, yyyy")}</strong>
                      </span>
                    )}
                    <span className="px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-800 rounded-md border border-emerald-200 inline-flex items-center gap-1.5 font-sans">
                      <Package className="w-3 h-3 text-emerald-600" />
                      Balance: <strong className="font-mono font-bold text-emerald-900">{totalRemainingQuantity.toLocaleString()}</strong>
                      <span className="text-emerald-700 font-normal">/ {totalLineQuantity.toLocaleString()}</span>
                    </span>
                    {displayTotalValue > 0 && (
                      <span className="px-2.5 py-0.5 text-xs font-medium bg-purple-50 text-purple-800 rounded-md border border-purple-200 font-mono inline-flex items-center gap-1.5">
                        <DollarSign className="w-3 h-3 text-purple-600" />
                        <strong>{activePO.currency || "USD"} {displayTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </span>
                    )}
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
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-blue-600" />
                      Plant:{" "}
                      <strong className="text-blue-900 font-bold font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs">
                        {plantInfo.code}
                      </strong>
                      <span className="text-gray-700 font-medium">
                        ({plantInfo.name})
                      </span>
                    </span>
                    {(activePO.contact_person || (activePO.extra_data as any)?.contact_person) && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span>
                          Contact: <strong className="text-gray-800 font-medium">{activePO.contact_person || (activePO.extra_data as any)?.contact_person}</strong>
                          {(activePO.contact_email || (activePO.extra_data as any)?.contact_email) && (
                            <span className="text-gray-500 ml-1">({activePO.contact_email || (activePO.extra_data as any)?.contact_email})</span>
                          )}
                        </span>
                      </>
                    )}
                    {(activePO.notations || (activePO.extra_data as any)?.notations || (activePO.extra_data as any)?.aux_head8) && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span>
                          Notation: <span className="text-gray-800 font-medium">{activePO.notations || (activePO.extra_data as any)?.notations || (activePO.extra_data as any)?.aux_head8}</span>
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
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">

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
                      <tr className="bg-gray-50/90 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                        <th className="px-3 py-2.5 w-10 text-center">#</th>
                        <th className="px-3 py-2.5 min-w-[140px]">Item / Material Code</th>
                        {hasDistinctPartner && (
                          <th className="px-3 py-2.5 min-w-[110px]">Partner Code</th>
                        )}
                        <th className="px-3 py-2.5 min-w-[160px]">Description</th>
                        <th className="px-2.5 py-2.5 min-w-[70px]">Color</th>
                        <th className="px-2.5 py-2.5 text-center w-16">UOM</th>
                        <th className="px-3 py-2.5 text-right font-semibold min-w-[85px]">Ordered</th>
                        <th className="px-3 py-2.5 text-right font-semibold min-w-[85px]">Shipped</th>
                        <th className="px-3 py-2.5 text-right font-semibold min-w-[95px]">Open Balance</th>
                        <th className="px-3 py-2.5 text-center min-w-[90px]">Status</th>
                        {hasPricing && (
                          <th className="px-3 py-2.5 text-right min-w-[90px]">Unit Price</th>
                        )}
                        {hasPricing && (
                          <th className="px-3 py-2.5 text-right font-semibold min-w-[100px]">Subtotal</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {lineItems.map((item, idx) => {
                        const lineSubtotal = item.unit_price ? item.quantity * item.unit_price : undefined;
                        const lineRem = item.remaining_quantity !== undefined ? item.remaining_quantity : Math.max(0, item.quantity - (item.shipped_quantity || 0));
                        const lineShip = item.shipped_quantity || 0;
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
                                {item.partner_item_code || " "}
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
                                <span className="text-gray-300"> </span>
                              )}
                            </td>
                            <td className="px-2.5 py-2.5 text-center font-mono text-gray-700 whitespace-nowrap">
                              <span className="px-2 py-0.5 bg-gray-100 rounded text-[11px] font-semibold border border-gray-200">
                                {item.size || "M"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-700 whitespace-nowrap">
                              {item.quantity.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-emerald-700 font-semibold whitespace-nowrap">
                              {lineShip.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                              {lineRem.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              {lineRem <= 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Fulfilled
                                </span>
                              ) : lineShip > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                                  Partial
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  Pending
                                </span>
                              )}
                            </td>
                            {hasPricing && (
                              <td className="px-3 py-2.5 text-right font-mono text-gray-600 whitespace-nowrap">
                                {item.unit_price !== undefined
                                  ? `${activePO.currency || "USD"} ${item.unit_price.toFixed(2)}`
                                  : " "}
                              </td>
                            )}
                            {hasPricing && (
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                                {lineSubtotal !== undefined
                                  ? `${activePO.currency || "USD"} ${lineSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : " "}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50/90 border-t-2 border-gray-200 font-semibold text-gray-900">
                      <tr>
                        <td colSpan={colSpanBeforeQty} className="px-3 py-2.5 text-right text-gray-600 text-xs">
                          Totals ({lineItems.length} lines):
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-700 whitespace-nowrap">
                          {totalLineQuantity.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-bold text-emerald-700 whitespace-nowrap">
                          {totalShippedQuantity.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-blue-600 whitespace-nowrap">
                          {totalRemainingQuantity.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5"></td>
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
                {activePO.po_number && activePO.status !== "COMPLETED" && activePO.status !== "CANCELLED" && (
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

                {activePO.status === "COMPLETED" ? (
                  <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Fully Fulfilled (Completed)</span>
                  </div>
                ) : activePO.status === "CANCELLED" ? (
                  <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>Cancelled PO</span>
                  </div>
                ) : activeMode === "excel" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const poNum = activePO.po_number || "";
                      setSelectedPOForPreview(null);
                      handleCreateShipment("excel", poNum);
                    }}
                    className={cn(
                      "px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer",
                      isSupplier
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    )}
                    title="Prepare Outbound Delivery using Excel drop"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Proceed with Excel Drop
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
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
                    Proceed with Manual Delivery
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

