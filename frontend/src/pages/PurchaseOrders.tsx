import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDate, formatNumber } from "@/i18n/format";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  Search,
  RefreshCw,
  ChevronRight,
  PackagePlus,
  CheckSquare,
  Square,
  Calendar,
  X,
  Mail,
  FileSpreadsheet,
  Layers,
  Factory,
  AlertTriangle,
  Warehouse,
} from "lucide-react";
import { poApi } from "../services/poApi";
import { useAuthStore } from "../store/authStore";
import type { PurchaseOrder } from "@/types/email";
import { cn } from "@/utils/cn";
import { resolvePlantAndLocation, KNOWN_PLANTS } from "@/utils/plantResolver";
import PlantAccordionShowcase from "@/components/plants/PlantAccordionShowcase";
import { usePlantSelection } from "@/hooks/usePlantSelection";
import StatusBadge from "@/components/ui/StatusBadge";
import { statusBorderClass } from "@/utils/statusStyles";
import { poDetailPath } from "@/utils/poLineItems";

const STATUS_OPTIONS = [
  { labelKey: "all", value: "" },
  { labelKey: "active", value: "ACTIVE" },
  { labelKey: "partial", value: "PARTIAL" },
  { labelKey: "updated", value: "UPDATED" },
] as const;

const formatDateDisplay = (dateStr?: string | null) => {
  if (!dateStr) return "—";
  try {
    const s = dateStr.trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split("-");
      return formatDate(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return formatDate(d);
  } catch {
    return dateStr;
  }
};

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
  const { t } = useTranslation(["purchaseOrders", "layout"]);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const supplierId = isSupplier ? (user?.supplier_id || user?.supplier_code || undefined) : undefined;

  const activeMode: "manual" | "excel" =
    mode === "excel" || location.pathname.includes("/excel")
      ? "excel"
      : "manual";

  const {
    selectedPlant: gatewayPlant,
    selectedLocation,
    selectPlant: gatewaySelectPlant,
    selectLocation: gatewaySelectLocation,
    clearPlant,
  } = usePlantSelection();

  const selectedPlant = gatewayPlant || "ALL";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [poChips, setPoChips] = useState<string[]>([]);
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    const st = (searchParams.get("status") || "").toUpperCase();
    return ["ACTIVE", "PARTIAL", "UPDATED"].includes(st) ? st : "";
  });
  const [crossPlantWarning, setCrossPlantWarning] = useState<{
    attemptedPO: string;
    targetPlant: string;
    currentPlant: string;
  } | null>(null);

  // State for multi-selecting POs. Keeps the PO objects so selections survive
  // searches that no longer include the selected rows.
  const [selectedPOMap, setSelectedPOMap] = useState<Map<string, PurchaseOrder>>(new Map());
  const selectedPOs = useMemo(() => new Set(selectedPOMap.keys()), [selectedPOMap]);
  const canSelect = selectedPlant !== "ALL";

  const clearSelection = () => {
    setSelectedPOMap(new Map());
    setCrossPlantWarning(null);
  };

  const selectPlant = (plantId: string, targetLoc?: string) => {
    setPage(1);
    clearSelection();
    if (!plantId || plantId === "ALL") {
      clearPlant();
    } else {
      gatewaySelectPlant(plantId, targetLoc);
    }
  };

  const handleOpenWithPO = (plantId: string, poNumber: string) => {
    setPoChips([poNumber.trim()]);
    setSearch("");
    setPage(1);
    clearSelection();
    gatewaySelectPlant(plantId);
  };


  // Query to fetch overview of all orders (used for live 5-plant accordion unlock state, active metrics & permanent storage locations)
  const { data: allOverviewData } = useQuery({
    queryKey: ["purchaseOrdersOverviewAll", supplierId],
    queryFn: () => poApi.list({ per_page: 500, supplier_id: supplierId, exclude_completed: false }),
    staleTime: 15000,
    refetchInterval: 10000,
  });
  const allOrdersList: PurchaseOrder[] = allOverviewData?.items || [];



  const { data, isLoading } = useQuery({
    queryKey: ["purchaseOrders", page, search, poChips, statusFilter, deliveryDateFilter, supplierId, selectedPlant, selectedLocation],
    queryFn: () =>
      poApi.list({
        page,
        per_page: 500,
        search: poChips.length === 0 && search ? search : undefined,
        po_numbers: poChips.length > 0 ? poChips.join(",") : undefined,
        status: statusFilter || undefined,
        delivery_date: deliveryDateFilter || undefined,
        exclude_completed: true,
        supplier_id: supplierId,
        plant: selectedPlant !== "ALL" ? selectedPlant : undefined,
        storage_location: selectedPlant !== "ALL" && selectedLocation !== "ALL" ? selectedLocation : undefined,
      }),
    placeholderData: (previousData) => previousData,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const orders: PurchaseOrder[] = data?.items || [];

  // Compute available storage locations for the currently selected plant (only stores that have received at least 1 PO)
  const availableLocations = useMemo(() => {
    const locMap = new Map<string, number>();
    const sourceOrders = allOrdersList.length > 0 ? allOrdersList : orders;
    sourceOrders.forEach((po) => {
      if (po.status === "CANCELLED") return;
      const dest = po.delivery_address || po.destination || po.client_code;
      const res = resolvePlantAndLocation(dest, po.client_code);
      if (selectedPlant === "ALL" || res.plantGroup === selectedPlant || res.plantCode === selectedPlant) {
        const key = res.storageLocation || "0101";
        if (key) {
          // Permanently register any store location that has received at least 1 PO (even if now COMPLETED)
          if (!locMap.has(key)) {
            locMap.set(key, 0);
          }
          // Count only active (non-completed) POs for the notification badge
          if (po.status !== "COMPLETED") {
            locMap.set(key, (locMap.get(key) || 0) + 1);
          }
        }
      }
    });

    return Array.from(locMap.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  }, [orders, allOrdersList, selectedPlant]);

  // Keep selectedLocation synchronized to an active valid location in plant view
  useEffect(() => {
    if (selectedPlant !== "ALL") {
      if (availableLocations.length > 0) {
        const hasMatch = availableLocations.some((l) => l.code === selectedLocation);
        if (!hasMatch) {
          gatewaySelectLocation(availableLocations[0].code);
        }
      } else if (allOverviewData && allOrdersList.length > 0) {
        clearPlant();
      }
    }
  }, [selectedPlant, availableLocations, selectedLocation, gatewaySelectLocation, allOverviewData, allOrdersList.length, clearPlant]);

  // Helper to parse delivery date into a comparable timestamp (nearest first, nulls last)
  const parseComparableTime = (rawDate?: string | null): number => {
    if (!rawDate) return Number.MAX_SAFE_INTEGER;
    const s = rawDate.trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split("-");
      const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      return isNaN(dt.getTime()) ? Number.MAX_SAFE_INTEGER : dt.getTime();
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? Number.MAX_SAFE_INTEGER : dt.getTime();
  };

  // Filter orders for display (strictly active orders & plant/storage location scoped, sorted by delivery_date ASC)
  const displayedOrders = useMemo(() => {
    const filtered = orders.filter((po) => {
      if (po.status === "COMPLETED" || po.status === "CANCELLED") {
        return false;
      }
      if (selectedPlant !== "ALL") {
        const dest = po.delivery_address || po.destination || po.client_code;
        const res = resolvePlantAndLocation(dest, po.client_code);

        if (res.plantGroup !== selectedPlant && res.plantCode !== selectedPlant) {
          return false;
        }

        if (selectedLocation !== "ALL") {
          const poLoc = (res.storageLocation || "").toUpperCase();
          const targetLoc = selectedLocation.toUpperCase();
          if (poLoc !== targetLoc && !res.fullDeliveryAddress.toUpperCase().includes(targetLoc)) {
            return false;
          }
        }
      }

      if (deliveryDateFilter) {
        const targetTime = parseComparableTime(deliveryDateFilter);
        if (targetTime !== Number.MAX_SAFE_INTEGER) {
          const poTime = parseComparableTime(po.delivery_date || (po.extra_data as any)?.delivery_date);
          const rawItems = (po.extra_data as any)?.items;
          const itemMatches =
            Array.isArray(rawItems) &&
            rawItems.some((it: any) => parseComparableTime(it?.delivery_date) === targetTime);
          if (poTime !== targetTime && !itemMatches) {
            return false;
          }
        }
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const tA = parseComparableTime(a.delivery_date || (a.extra_data as any)?.delivery_date);
      const tB = parseComparableTime(b.delivery_date || (b.extra_data as any)?.delivery_date);
      if (tA !== tB) return tA - tB;
      return (a.po_number || "").localeCompare(b.po_number || "");
    });
  }, [orders, selectedPlant, selectedLocation, deliveryDateFilter]);

  const selectableOrders = displayedOrders.filter(
    (p) => p.status !== "COMPLETED" && p.status !== "CANCELLED" && Boolean(p.po_number)
  );

  // Determine plant of currently selected POs
  const currentSelectedPlantInfo = useMemo(() => {
    const poObj = selectedPOMap.values().next().value;
    if (!poObj) return null;
    const dest = poObj.delivery_address || poObj.destination || poObj.client_code;
    return resolvePlantAndLocation(dest, poObj.client_code);
  }, [selectedPOMap]);

  const togglePOSelection = (poObj: PurchaseOrder) => {
    const poNumber = poObj.po_number;
    if (!canSelect || !poNumber || poObj.status === "COMPLETED" || poObj.status === "CANCELLED") {
      return;
    }

    if (selectedPOMap.has(poNumber)) {
      const newSelection = new Map(selectedPOMap);
      newSelection.delete(poNumber);
      setSelectedPOMap(newSelection);
      if (newSelection.size === 0) {
        setCrossPlantWarning(null);
      }
      return;
    }

    // Check cross-plant and cross-location conflict
    if (selectedPOMap.size > 0 && currentSelectedPlantInfo) {
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

      if (thisPlant.storageLocation !== currentSelectedPlantInfo.storageLocation) {
        // BLOCK SELECTION across different storage locations!
        setCrossPlantWarning({
          attemptedPO: poNumber,
          targetPlant: t("purchaseOrders:crossWarning.location", { code: thisPlant.storageLocation }),
          currentPlant: t("purchaseOrders:crossWarning.location", { code: currentSelectedPlantInfo.storageLocation }),
        });
        return;
      }
    }

    // Allow selection
    setCrossPlantWarning(null);
    const newSelection = new Map(selectedPOMap);
    newSelection.set(poNumber, poObj);
    setSelectedPOMap(newSelection);
  };

  const allSelectableSelected =
    selectableOrders.length > 0 && selectableOrders.every((p) => selectedPOs.has(p.po_number!));

  const toggleAllSelection = () => {
    if (!canSelect) return;
    const newSelection = new Map(selectedPOMap);
    if (allSelectableSelected) {
      selectableOrders.forEach((p) => newSelection.delete(p.po_number!));
    } else {
      selectableOrders.forEach((p) => newSelection.set(p.po_number!, p));
    }
    setSelectedPOMap(newSelection);
    setCrossPlantWarning(null);
  };

  // ─── Multi-PO search chips & Autocomplete ──────────────────────────────────
  const normalizePO = (value: string) =>
    value
      .trim()
      .replace(/^(?:PO|P\.O\.)\s*[-#:\s]*/i, "")
      .replace(/^[A-Z0-9]{2,6}\s*[-–—_]\s*(?=[A-Z0-9]{4,}$)/i, "");

  const isPOToken = (value: string) => {
    const v = value.trim();
    if (!v || v.length < 3) return false;
    return /^(?:[A-Z0-9]{2,6}\s*[-–—_]\s*)?[A-Z0-9_-]{3,25}$/i.test(v);
  };

  // Autocomplete & search navigation state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const originalInputRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search for remote queries
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 150);
    return () => clearTimeout(timer);
  }, [search]);

  // Query remote POs matching search if typed (scoped to plant/storage location when not ALL)
  const { data: remoteSuggestionsData } = useQuery({
    queryKey: ["poSearchSuggestions", debouncedSearch, supplierId, selectedPlant, selectedLocation],
    queryFn: () =>
      poApi.list({
        search: debouncedSearch,
        per_page: 8,
        exclude_completed: true,
        supplier_id: supplierId,
        plant: selectedPlant !== "ALL" ? selectedPlant : undefined,
        storage_location: selectedPlant !== "ALL" && selectedLocation !== "ALL" ? selectedLocation : undefined,
      }),
    enabled: Boolean(debouncedSearch && debouncedSearch.length >= 2),
    staleTime: 30000,
  });
  const remoteSuggestions: PurchaseOrder[] = remoteSuggestionsData?.items || [];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute autocomplete suggestions combining local overview, current page, and remote
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length < 1) return [];

    const cleanQ = normalizePO(q).toLowerCase();
    const existingChipsSet = new Set(poChips.map((c) => normalizePO(c).toLowerCase()));

    const pool = [...allOrdersList, ...orders, ...remoteSuggestions];
    const seen = new Set<string>();
    const uniquePool: PurchaseOrder[] = [];

    for (const po of pool) {
      if (!po || !po.po_number || po.status === "COMPLETED" || po.status === "CANCELLED") continue;

      // When inside a plant tab, strictly scope suggestions to this plant & storage location
      if (selectedPlant !== "ALL") {
        const dest = po.delivery_address || po.destination || po.client_code;
        const res = resolvePlantAndLocation(dest, po.client_code);

        if (res.plantGroup !== selectedPlant && res.plantCode !== selectedPlant) {
          continue;
        }

        if (selectedLocation !== "ALL") {
          const poLoc = (res.storageLocation || "").toUpperCase();
          const targetLoc = selectedLocation.toUpperCase();
          if (poLoc !== targetLoc && !res.fullDeliveryAddress.toUpperCase().includes(targetLoc)) {
            continue;
          }
        }
      }

      const norm = normalizePO(po.po_number).toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      if (existingChipsSet.has(norm)) continue;
      uniquePool.push(po);
    }

    // Only match against PO number as requested
    const matches = uniquePool.filter((po) => {
      const poNum = (po.po_number || "").toLowerCase();
      const normNum = normalizePO(po.po_number || "").toLowerCase();

      return normNum.includes(cleanQ) || poNum.includes(q);
    });

    matches.sort((a, b) => {
      const aNorm = normalizePO(a.po_number || "").toLowerCase();
      const bNorm = normalizePO(b.po_number || "").toLowerCase();

      const aStarts = aNorm.startsWith(cleanQ);
      const bStarts = bNorm.startsWith(cleanQ);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      const aIncludes = aNorm.includes(cleanQ);
      const bIncludes = bNorm.includes(cleanQ);
      if (aIncludes && !bIncludes) return -1;
      if (!aIncludes && bIncludes) return 1;

      return (a.po_number || "").localeCompare(b.po_number || "");
    });

    return matches.slice(0, 8);
  }, [search, allOrdersList, orders, remoteSuggestions, poChips, selectedPlant, selectedLocation]);

  const handleSelectPO = (poNumber: string | null | undefined) => {
    const clean = normalizePO(poNumber || "");
    if (clean) {
      setPoChips((prev) => Array.from(new Set([...prev, clean])));
      setPage(1);
    }
    setSearch("");
    originalInputRef.current = "";
    setActiveIndex(-1);
    setIsDropdownOpen(false);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const handleSearchChange = (value: string) => {
    // If user typed a comma, e.g. "4500123456,"
    if (value.includes(",")) {
      const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        setPoChips((prev) => Array.from(new Set([...prev, ...parts.map(normalizePO)])));
        setPage(1);
      }
      setSearch("");
      originalInputRef.current = "";
      setActiveIndex(-1);
      setIsDropdownOpen(false);
      return;
    }

    setSearch(value);
    originalInputRef.current = value;
    setActiveIndex(-1);
    setIsDropdownOpen(value.trim().length > 0);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Dropdown is open and has suggestions
    if (isDropdownOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = activeIndex < suggestions.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(nextIndex);
        setSearch(suggestions[nextIndex].po_number || "");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (activeIndex > 0) {
          const prevIndex = activeIndex - 1;
          setActiveIndex(prevIndex);
          setSearch(suggestions[prevIndex].po_number || "");
        } else if (activeIndex === 0) {
          setActiveIndex(-1);
          setSearch(originalInputRef.current);
        } else {
          const lastIndex = suggestions.length - 1;
          setActiveIndex(lastIndex);
          setSearch(suggestions[lastIndex].po_number || "");
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsDropdownOpen(false);
        setActiveIndex(-1);
        setSearch(originalInputRef.current);
        return;
      }
      if (e.key === "Tab") {
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          e.preventDefault();
          handleSelectPO(suggestions[activeIndex].po_number);
          return;
        }
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (isDropdownOpen && activeIndex >= 0 && suggestions[activeIndex]) {
        handleSelectPO(suggestions[activeIndex].po_number);
        return;
      }
      const trimmed = search.trim();
      if (trimmed) {
        if (
          suggestions.length > 0 &&
          normalizePO(suggestions[0].po_number || "").toLowerCase() === normalizePO(trimmed).toLowerCase()
        ) {
          handleSelectPO(suggestions[0].po_number);
        } else {
          handleSelectPO(trimmed);
        }
      }
      return;
    }

    if (e.key === "," || e.key === ";") {
      e.preventDefault();
      const trimmed = search.trim();
      if (trimmed) {
        handleSelectPO(trimmed);
      }
      return;
    }

    if (e.key === "Backspace" && search === "" && poChips.length > 0) {
      removePOChip(poChips[poChips.length - 1]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;

    e.preventDefault();
    const leftover = addPOChips(pasted);
    setSearch(leftover);
    originalInputRef.current = leftover;
    setActiveIndex(-1);
    setIsDropdownOpen(false);
  };

  // Turns PO-like tokens into chips; returns the leftover non-PO text.
  const addPOChips = (text: string): string => {
    const tokens = text.split(/[\s,;\r\n\t]+/).map((t) => t.trim()).filter(Boolean);
    const poTokens = tokens.filter(isPOToken).map(normalizePO);
    if (poTokens.length > 0) {
      setPoChips((prev) => Array.from(new Set([...prev, ...poTokens])));
      setPage(1);
    }
    return tokens.filter((t) => !isPOToken(t)).join(" ");
  };

  const removePOChip = (chip: string) => {
    setPoChips((prev) => prev.filter((c) => c !== chip));
    setPage(1);
  };

  const clearSearch = () => {
    setPoChips([]);
    setSearch("");
    originalInputRef.current = "";
    setActiveIndex(-1);
    setIsDropdownOpen(false);
    setPage(1);
  };

  const foundPOs = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((p) => {
      if (p.po_number) {
        s.add(p.po_number.trim());
        s.add(normalizePO(p.po_number));
      }
    });
    return s;
  }, [orders]);

  const missingChips = useMemo(() => {
    return poChips.filter((c) => !foundPOs.has(c) && !foundPOs.has(normalizePO(c)));
  }, [poChips, foundPOs]);

  const handleCreateShipment = (mode: "web" | "excel" = "web", poNumber?: string) => {
    const poList = poNumber || Array.from(selectedPOMap.keys()).join(",");
    navigate(`/shipments?pos=${encodeURIComponent(poList)}&mode=${mode}`);
  };

  return (
    <div
      className={cn(
        selectedPlant === "ALL"
          ? "p-4 sm:p-6 space-y-4 sm:space-y-5"
          : "h-full flex flex-col overflow-hidden px-4 pt-4 pb-0 sm:px-6 sm:pt-5 sm:pb-0 gap-3"
      )}
    >
      {/* Page Header with Plant Breadcrumb, Mode Indicator & Location Pills */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div className="space-y-1">
          {selectedPlant !== "ALL" && KNOWN_PLANTS[selectedPlant] && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <button
                type="button"
                onClick={() => selectPlant("ALL")}
                className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                title={t("purchaseOrders:shared.switchPlant")}
              >
                <Factory className="w-3.5 h-3.5" />
                <span>{t("purchaseOrders:shared.breadcrumb")}</span>
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <span className="font-semibold text-slate-700">
                {KNOWN_PLANTS[selectedPlant].name} ({KNOWN_PLANTS[selectedPlant].defaultCode})
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">{t("purchaseOrders:header.title")}</h1>
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
                {t("layout:nav.manualProcess")}
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
                {t("layout:nav.excelDrop")}
              </span>
            )}
          </div>
        </div>

        {/* Location Pills with Notification Badges (replaces the dropdown & Change Plant button) */}
        {selectedPlant !== "ALL" && availableLocations.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 border border-slate-200 rounded-2xl shadow-2xs self-start lg:self-center">
            {/* Individual Store Location Pills */}
            {availableLocations.map((loc) => {
              const isSelected = selectedLocation === loc.code;
              const hasCount = loc.count > 0;
              return (
                <button
                  key={loc.code}
                  type="button"
                  onClick={() => {
                    if (selectedLocation !== loc.code) {
                      setPage(1);
                      clearSelection();
                      gatewaySelectLocation(loc.code);
                    }
                  }}
                  className={cn(
                    "group relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none border",
                    isSelected
                      ? isSupplier
                        ? "bg-emerald-600 text-white shadow-xs font-bold"
                        : "bg-blue-600 text-white shadow-xs font-bold"
                      : "bg-white text-slate-700 hover:text-slate-950 hover:bg-slate-50 border border-slate-200/80 hover:border-slate-300 shadow-2xs"
                  )}
                  title={t("purchaseOrders:shared.storeTitle", { code: loc.code, count: loc.count })}
                >
                  <Warehouse className={cn("w-3.5 h-3.5 transition-colors", isSelected ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
                  <span>{t("purchaseOrders:shared.store", { code: loc.code })}</span>
                  {/* Notification badge */}
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-extrabold shadow-2xs transition-all",
                      hasCount
                        ? isSelected
                          ? "bg-white text-slate-900 border border-white font-black"
                          : "bg-rose-500 text-white font-black animate-in fade-in"
                        : isSelected
                        ? "bg-white/20 text-white font-medium"
                        : "bg-slate-100 text-slate-400 font-medium"
                    )}
                  >
                    {loc.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── PLANT GATEWAY MODE: 5-Plant Horizontal Accordion Showcase ─── */}
      {selectedPlant === "ALL" ? (
        <PlantAccordionShowcase
          orders={allOrdersList.length > 0 ? allOrdersList : orders}
          onSelectPlant={selectPlant}
          onOpenWithPO={handleOpenWithPO}
          isSupplier={isSupplier}
          ctaLabel={t("purchaseOrders:gateway.ctaDefault")}
        />
      ) : (
        /* ─── PLANT WORKSPACE / GLOBAL LIST MODE ─── */
        <div className="flex-1 min-h-0 flex flex-col gap-3">

          {/* Cross-Plant Selection Mismatch Warning */}
          {crossPlantWarning && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-start sm:items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                <div className="text-xs">
                  <Trans
                    t={t}
                    i18nKey="purchaseOrders:crossWarning.message"
                    values={{
                      current: crossPlantWarning.currentPlant,
                      target: crossPlantWarning.targetPlant,
                      po: crossPlantWarning.attemptedPO,
                    }}
                    components={{
                      b: <span className="font-bold" />,
                      u: <span className="font-semibold underline" />,
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const attempted = orders.find((p) => p.po_number === crossPlantWarning.attemptedPO);
                    setSelectedPOMap(
                      attempted ? new Map([[crossPlantWarning.attemptedPO, attempted]]) : new Map()
                    );
                    setCrossPlantWarning(null);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  {t("purchaseOrders:crossWarning.clearAndSelect", { po: crossPlantWarning.attemptedPO })}
                </button>
                <button
                  type="button"
                  onClick={() => setCrossPlantWarning(null)}
                  className="p-1 hover:bg-amber-200/60 rounded-md text-amber-700 transition-colors cursor-pointer"
                  title={t("purchaseOrders:crossWarning.dismiss")}
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
                "w-full flex items-center justify-between gap-3 px-3.5 py-1.5 rounded-xl border shadow-2xs transition-all animate-in fade-in slide-in-from-top-1 duration-150",
                isSupplier
                  ? "bg-emerald-50/90 border-emerald-200"
                  : "bg-blue-50/90 border-blue-200"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={cn(
                    "flex h-6 min-w-6 px-1.5 shrink-0 items-center justify-center rounded-md font-bold text-xs text-white shadow-2xs",
                    isSupplier ? "bg-emerald-600" : "bg-blue-600"
                  )}
                >
                  {selectedPOs.size}
                </span>
                <span
                  className={cn(
                    "text-xs font-bold truncate",
                    isSupplier ? "text-emerald-950" : "text-blue-950"
                  )}
                >
                  {t("purchaseOrders:selection.selected", { count: selectedPOs.size })}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="h-8 px-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                  {t("purchaseOrders:selection.clear")}
                </button>

                {activeMode === "manual" ? (
                  <button
                    type="button"
                    onClick={() => handleCreateShipment("web")}
                    className={cn(
                      "h-8 px-3 text-xs font-semibold text-white rounded-lg shadow-2xs flex items-center gap-1.5 transition-all active:scale-[0.99] cursor-pointer",
                      isSupplier
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    )}
                  >
                    <PackagePlus className="w-3.5 h-3.5" />
                    <span>{t("purchaseOrders:shared.createDelivery")}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCreateShipment("excel")}
                    className={cn(
                      "h-8 px-3 text-xs font-semibold text-white rounded-lg shadow-2xs flex items-center gap-1.5 transition-all active:scale-[0.99] cursor-pointer",
                      isSupplier
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    )}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{t("purchaseOrders:shared.excelDropDelivery")}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1 relative" ref={dropdownRef}>
              <div
                onClick={() => inputRef.current?.focus()}
                className="relative flex flex-wrap items-center gap-1.5 min-h-[42px] pl-10 pr-9 py-1.5 text-sm border border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-blue-500 bg-white shadow-2xs cursor-text"
              >
                <Search className="absolute left-3.5 top-[13px] w-4 h-4 text-gray-400 pointer-events-none" />
                {poChips.map((chip) => (
                  <span
                    key={chip}
                    className={cn(
                      "inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-mono font-semibold rounded-md border transition-all",
                      missingChips.includes(chip)
                        ? "bg-gray-50 text-gray-400 border-gray-200 line-through"
                        : isSupplier
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    )}
                  >
                    {chip}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePOChip(chip);
                      }}
                      className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
                      title={t("purchaseOrders:shared.removeChip", { chip })}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={
                    poChips.length > 0
                      ? t("purchaseOrders:search.addAnother")
                      : selectedPlant !== "ALL"
                      ? selectedLocation !== "ALL"
                        ? t("purchaseOrders:search.inPlantLocation", {
                            plant: KNOWN_PLANTS[selectedPlant]?.name.replace(" Ltd", ""),
                            location: selectedLocation,
                          })
                        : t("purchaseOrders:search.inPlant", { plant: KNOWN_PLANTS[selectedPlant]?.name.replace(" Ltd", "") })
                      : t("purchaseOrders:search.default")
                  }
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => {
                    if (search.trim().length > 0 && suggestions.length > 0) {
                      setIsDropdownOpen(true);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  className="flex-1 min-w-[170px] py-0.5 bg-transparent focus:outline-none text-sm text-gray-900"
                />
                {(poChips.length > 0 || search) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearSearch();
                    }}
                    className="absolute right-2.5 top-[11px] p-0.5 text-gray-400 hover:text-gray-600 rounded cursor-pointer"
                    title={t("purchaseOrders:shared.clearSearch")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Suggestions Dropdown (Clean PO list only) */}
              {isDropdownOpen && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3.5 py-1.5 bg-gray-50/90 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                    <span>{t("purchaseOrders:shared.suggested")}</span>
                    <span className="text-xs text-gray-400 font-normal">{t("purchaseOrders:shared.keysHint")}</span>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto py-1">
                    {suggestions.map((po, idx) => {
                      const isSelected = activeIndex === idx;
                      return (
                        <div
                          key={po.id || `${po.po_number || idx}-${idx}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectPO(po.po_number);
                          }}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={cn(
                            "px-3.5 py-2 flex items-center justify-between gap-3 cursor-pointer transition-colors text-left",
                            isSelected
                              ? "bg-blue-50/90 text-blue-900 font-semibold"
                              : "hover:bg-gray-50 text-gray-800"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Search
                              className={cn(
                                "w-3.5 h-3.5 shrink-0 transition-colors",
                                isSelected ? "text-blue-600" : "text-gray-400"
                              )}
                            />
                            <span className="font-mono text-sm tracking-tight">
                              {po.po_number}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="text-xs text-blue-600 font-sans font-medium">{t("purchaseOrders:search.selectHint")}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3.5 py-1.5 bg-gray-50/70 text-xs text-gray-400 flex items-center justify-between">
                    <span>{t("purchaseOrders:search.pasteHint")}</span>
                    <span className="font-mono text-xs">{t("purchaseOrders:search.escHint")}</span>
                  </div>
                </div>
              )}

              {poChips.length > 0 && !isLoading && (
                <p className="text-xs text-gray-500 mt-1.5">
                  {t("purchaseOrders:search.found", {
                    found: poChips.length - missingChips.length,
                    total: poChips.length,
                  })}
                  {missingChips.length > 0 && (
                    <span className="text-amber-700">
                      {" · "}
                      {selectedPlant !== "ALL"
                        ? t("purchaseOrders:search.notFoundIn", {
                            plant: KNOWN_PLANTS[selectedPlant]?.name.replace(" Ltd", ""),
                          })
                        : t("purchaseOrders:search.notFound")}{" "}
                      <span className="font-mono">{missingChips.join(", ")}</span>
                    </span>
                  )}
                </p>
              )}
            </div>
            {/* Delivery Date Filter */}
            <div className="relative flex items-center">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
              <input
                type="date"
                value={deliveryDateFilter}
                onChange={(e) => {
                  setDeliveryDateFilter(e.target.value);
                  setPage(1);
                }}
                title={t("purchaseOrders:shared.filterDeliveryDate")}
                className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700 shadow-2xs font-medium min-h-[42px]"
              />
              {deliveryDateFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryDateFilter("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 p-0.5 text-gray-400 hover:text-gray-600 rounded cursor-pointer"
                  title={t("purchaseOrders:shared.clearDeliveryDate")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[180px] text-gray-700 shadow-2xs font-medium"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`purchaseOrders:statusFilter.${opt.labelKey}`)}
                </option>
              ))}
            </select>
          </div>

      {/* Main Table */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-t-xl border-x border-t border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2 text-blue-500" />
            {t("purchaseOrders:loading")}
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Warehouse className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">{t("purchaseOrders:empty.title")}</p>
            <p className="text-xs text-gray-400 mt-1">
              {selectedPlant !== "ALL" || selectedLocation !== "ALL" || deliveryDateFilter
                ? t("purchaseOrders:empty.filtered")
                : t("purchaseOrders:empty.hint")}
            </p>
            {(selectedPlant !== "ALL" || selectedLocation !== "ALL" || deliveryDateFilter) && (
              <div className="flex items-center gap-2 mt-4">
                {deliveryDateFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryDateFilter("");
                      setPage(1);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {t("purchaseOrders:empty.clearDate")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => selectPlant("ALL")}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                >
                  {t("purchaseOrders:empty.resetPlant")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-zinc-700 shadow-xs">
                <tr className="bg-zinc-700 text-white text-xs font-semibold uppercase tracking-wider border-b border-zinc-800">
                  {canSelect && (
                    <th className="py-1.5 px-2 w-9 text-center border-r border-zinc-600">
                      <button
                        type="button"
                        onClick={toggleAllSelection}
                        className="text-zinc-200 hover:text-white transition-colors cursor-pointer inline-flex items-center justify-center"
                        title={t("purchaseOrders:table.selectAll")}
                      >
                        {allSelectableSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("purchaseOrders:table.poNumber")}</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("purchaseOrders:table.orderDate")}</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("purchaseOrders:table.deliveryDate")}</th>
                  <th className="py-1.5 px-2 min-w-[240px] border-r border-zinc-600">{t("purchaseOrders:table.contact")}</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("purchaseOrders:table.notation")}</th>
                  <th className="py-1.5 px-2 text-right whitespace-nowrap border-r border-zinc-600">{t("purchaseOrders:table.quantity")}</th>
                  <th className="py-1.5 px-2 whitespace-nowrap">{t("purchaseOrders:table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {displayedOrders.map((po: PurchaseOrder) => {
                  const isSelected = po.po_number ? selectedPOs.has(po.po_number) : false;
                  const poPlant = resolvePlantAndLocation(
                    po.delivery_address || po.destination || (po.extra_data as any)?.delivery_address,
                    po.client_code
                  );
                  const isClosed = po.status === "COMPLETED" || po.status === "CANCELLED";
                  const rowSelectable = canSelect && !isClosed;
                  const isCrossConflict =
                    selectedPOs.size > 0 &&
                    currentSelectedPlantInfo &&
                    !isSelected &&
                    (poPlant.plantGroup !== currentSelectedPlantInfo.plantGroup ||
                     poPlant.storageLocation !== currentSelectedPlantInfo.storageLocation);

                  return (
                    <tr
                      key={po.id}
                      onClick={(e) => {
                        // A real click on the row opens the PO in a new tab. Clicks on links,
                        // buttons and inputs inside the row keep their own behaviour.
                        if ((e.target as HTMLElement).closest("a,button,input,label")) return;
                        window.open(poDetailPath(po.id, activeMode), "_blank", "noopener");
                      }}
                      className={cn(
                        "cursor-pointer transition-colors group border-b border-slate-200 text-sm",
                        statusBorderClass(po.status),
                        isSelected
                          ? isSupplier
                            ? "bg-emerald-50/90 hover:bg-emerald-100/80"
                            : "bg-blue-50/90 hover:bg-blue-100/80"
                          : isCrossConflict
                          ? "bg-white opacity-60 hover:bg-amber-50/40"
                          : "bg-white hover:bg-slate-50"
                      )}
                    >
                      {/* Selection Checkbox (only when a plant is selected) */}
                      {canSelect && (
                        <td
                          className={cn(
                            "py-1 px-2 text-center whitespace-nowrap border-r border-gray-200",
                            rowSelectable ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (rowSelectable) togglePOSelection(po);
                          }}
                        >
                          <button
                            type="button"
                            disabled={!rowSelectable}
                            title={
                              po.status === "COMPLETED"
                                ? t("purchaseOrders:row.completed")
                                : po.status === "CANCELLED"
                                ? t("purchaseOrders:row.cancelled")
                                : isCrossConflict
                                ? t("purchaseOrders:row.conflict", {
                                    plant: poPlant.plantName,
                                    store: poPlant.storageLocation,
                                    current: currentSelectedPlantInfo?.storageLocation,
                                  })
                                : t("purchaseOrders:row.select")
                            }
                            className={cn(
                              "text-gray-400 transition-colors inline-flex items-center justify-center",
                              !rowSelectable
                                ? "cursor-not-allowed"
                                : isCrossConflict
                                ? "text-gray-300 hover:text-amber-500"
                                : isSupplier ? "hover:text-emerald-600" : "hover:text-blue-600"
                            )}
                          >
                            {isSelected ? (
                              <CheckSquare className={cn("w-3.5 h-3.5", isSupplier ? "text-emerald-600" : "text-blue-600")} />
                            ) : (
                              <Square className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      )}

                      {/* PO Number */}
                      <td className="py-1 px-2 whitespace-nowrap border-r border-gray-200">
                        <div
                          className={cn(
                            "flex items-center gap-1.5 font-mono font-semibold text-gray-900 transition-colors text-xs",
                            isSupplier ? "group-hover:text-emerald-600" : "group-hover:text-blue-600"
                          )}
                        >
                          <a
                            href={poDetailPath(po.id, activeMode)}
                            target="_blank"
                            rel="noopener"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                            aria-label={t("purchaseOrders:detail.openInNewTab", { po: po.po_number || "" })}
                          >
                            {po.po_number || "—"}
                          </a>
                          {po.version && po.version > 1 ? (
                            <span
                              className="px-1 py-0 text-xs font-bold bg-amber-100 text-amber-800 rounded border border-amber-200 inline-flex items-center shadow-2xs font-sans shrink-0 leading-tight"
                              title={t("purchaseOrders:row.revised", { version: po.version })}
                            >
                              V{po.version}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Order Date */}
                      <td className="py-1 px-2 text-gray-600 whitespace-nowrap text-xs border-r border-gray-200">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>{formatDateDisplay(po.order_date || (po.extra_data as any)?.order_date)}</span>
                        </div>
                      </td>

                      {/* Delivery Date */}
                      <td className="py-1 px-2 text-gray-700 font-medium whitespace-nowrap text-xs border-r border-gray-200">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>{formatDateDisplay(po.delivery_date)}</span>
                        </div>
                      </td>

                      {/* Contact (<ContactPerson> on top / inline with <AuxHead1> email) */}
                      <td className="py-1 px-2 text-gray-700 whitespace-nowrap border-r border-gray-200 max-w-[320px] truncate">
                        {po.contact_person || (po.extra_data as any)?.contact_person ? (
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-semibold text-gray-900 text-xs truncate">
                              {po.contact_person || (po.extra_data as any)?.contact_person}
                            </span>
                            {(po.contact_email || (po.extra_data as any)?.contact_email) && (
                              <a
                                href={`mailto:${po.contact_email || (po.extra_data as any)?.contact_email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline hover:text-blue-700 font-mono tracking-tight truncate select-all"
                                title={po.contact_email || (po.extra_data as any)?.contact_email}
                              >
                                <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                                {po.contact_email || (po.extra_data as any)?.contact_email}
                              </a>
                            )}
                          </div>
                        ) : (po.contact_email || (po.extra_data as any)?.contact_email) ? (
                          <div className="flex items-center gap-1 text-xs">
                            <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                            <a
                              href={`mailto:${po.contact_email || (po.extra_data as any)?.contact_email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-blue-600 hover:underline hover:text-blue-700 font-mono tracking-tight truncate select-all"
                              title={po.contact_email || (po.extra_data as any)?.contact_email}
                            >
                              {po.contact_email || (po.extra_data as any)?.contact_email}
                            </a>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Notation */}
                      <td className="py-1 px-2 text-gray-700 whitespace-nowrap text-xs border-r border-gray-200">
                        {po.notations || (po.extra_data as any)?.notations || (po.extra_data as any)?.aux_head8 || (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="py-1 px-2 text-right font-mono text-xs whitespace-nowrap border-r border-gray-200">
                        {po.status === "PARTIAL" && po.remaining_quantity !== undefined && po.remaining_quantity !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="font-bold text-orange-600">
                              {formatNumber(po.remaining_quantity)}
                            </span>
                            <span className="text-xs text-gray-400">
                              / {formatNumber(po.quantity)}
                            </span>
                          </span>
                        ) : po.status === "COMPLETED" ? (
                          <span className="font-bold text-emerald-600">0</span>
                        ) : (
                          <span className="font-semibold text-gray-900">
                            {po.quantity != null ? formatNumber(po.quantity) : "—"}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-1 px-2 whitespace-nowrap text-xs">
                        <StatusBadge status={po.status} />
                      </td>


                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )}

    </div>
  );
}

