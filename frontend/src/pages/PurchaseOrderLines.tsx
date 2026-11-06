import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDate, formatNumber } from "@/i18n/format";
import { useNavigate, useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  ListOrdered,
  Search,
  RefreshCw,
  ChevronRight,
  PackagePlus,
  CheckSquare,
  Square,
  Calendar,
  X,
  Copy,
  Check,
  FileSpreadsheet,
  Layers,
  Factory,
  AlertTriangle,
  Warehouse,
  FileEdit,
  CheckCircle2,
} from "lucide-react";
import { poApi } from "@/services/poApi";
import { useAuthStore } from "@/store/authStore";
import type { POLineItemRecord, PurchaseOrder } from "@/types/email";
import { cn } from "@/utils/cn";
import { resolvePlantAndLocation, KNOWN_PLANTS } from "@/utils/plantResolver";
import PlantAccordionShowcase from "@/components/plants/PlantAccordionShowcase";
import { usePlantSelection } from "@/hooks/usePlantSelection";
import { saveManualDraft, saveExcelDraft } from "@/utils/draftStorage";

const formatDateDisplay = (dateStr?: string | null) => {
  if (!dateStr) return "â€”";
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

const getDaysDiff = (dateStr?: string | null): number | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export interface PurchaseOrderLinesProps {
  mode?: "manual" | "excel";
}

export default function PurchaseOrderLines({ mode }: PurchaseOrderLinesProps = {}) {
  const { t } = useTranslation(["purchaseOrderLines", "purchaseOrders", "layout"]);
  const navigate = useNavigate();
  const location = useLocation();
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
  const PER_PAGE = 500;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [poChips, setPoChips] = useState<string[]>([]);
  const [deliveryDateFilter, setDeliveryDateFilter] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const originalInputRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [selectedLineMap, setSelectedLineMap] = useState<Map<string, POLineItemRecord>>(new Map());
  const selectedLineUids = useMemo(() => new Set(selectedLineMap.keys()), [selectedLineMap]);
  const [crossLocationWarning, setCrossLocationWarning] = useState<{
    attemptedLabel: string;
    targetDesc: string;
    currentDesc: string;
  } | null>(null);

  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const [draftToast, setDraftToast] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const clearSelection = () => {
    setSelectedLineMap(new Map());
    setCrossLocationWarning(null);
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

  // Overview all POs (used for PlantAccordionShowcase unlock state, active metrics & permanent storage locations)
  const { data: allOverviewData } = useQuery({
    queryKey: ["purchaseOrdersOverviewAll", supplierId],
    queryFn: () => poApi.list({ per_page: 500, supplier_id: supplierId, exclude_completed: false }),
    staleTime: 15000,
    refetchInterval: 10000,
  });
  const allOrdersList: PurchaseOrder[] = allOverviewData?.items || [];

  // Compute available storage locations for the active plant (only stores that have received at least 1 PO)
  const availableLocations = useMemo(() => {
    const locMap = new Map<string, number>();
    allOrdersList.forEach((po) => {
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
  }, [allOrdersList, selectedPlant]);

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

  // Query flat active PO lines for the selected plant & storage location (sorted by delivery_date ASC)
  const { data: linesData, isLoading } = useQuery({
    queryKey: [
      "purchaseOrderLinesFlat",
      page,
      debouncedSearch,
      poChips,
      deliveryDateFilter,
      supplierId,
      selectedPlant,
      selectedLocation,
    ],
    queryFn: () =>
      poApi.listLines({
        page,
        per_page: PER_PAGE,
        search: debouncedSearch || undefined,
        po_numbers: poChips.length > 0 ? poChips.join(",") : undefined,
        delivery_date: deliveryDateFilter || undefined,
        supplier_id: supplierId,
        plant: selectedPlant !== "ALL" ? selectedPlant : undefined,
        storage_location: selectedPlant !== "ALL" && selectedLocation !== "ALL" ? selectedLocation : undefined,
      }),
    enabled: selectedPlant !== "ALL",
    placeholderData: (prev) => prev,
    refetchInterval: 8000,
  });

  const lines: POLineItemRecord[] = linesData?.items || [];

  // Remote PO suggestions for search bar
  const { data: remoteSuggestionsData } = useQuery({
    queryKey: ["poLineSearchSuggestions", debouncedSearch, supplierId, selectedPlant, selectedLocation],
    queryFn: () =>
      poApi.list({
        search: debouncedSearch,
        per_page: 8,
        exclude_completed: true,
        supplier_id: supplierId,
        plant: selectedPlant !== "ALL" ? selectedPlant : undefined,
        storage_location: selectedPlant !== "ALL" && selectedLocation !== "ALL" ? selectedLocation : undefined,
      }),
    enabled: selectedPlant !== "ALL" && Boolean(debouncedSearch && debouncedSearch.length >= 2),
    staleTime: 30000,
  });
  const remoteSuggestions: PurchaseOrder[] = remoteSuggestionsData?.items || [];

  // Close autocomplete dropdown on outside click
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

  // Multi-PO chips & autocomplete helpers
  const normalizePO = (value: string) =>
    value.trim().replace(/^[A-Z0-9]{2,6}\s*[-â€“â€”_]\s*(?=\d{6,}$)/i, "");
  const isPOToken = (value: string) =>
    /^(?:[A-Z0-9]{2,6}\s*[-â€“â€”_]\s*)?\d{6,15}$/i.test(value.trim());

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length < 1) return [];

    const cleanQ = normalizePO(q).toLowerCase();
    const existingSet = new Set(poChips.map((c) => normalizePO(c).toLowerCase()));

    const pool = [...allOrdersList, ...remoteSuggestions];
    const seen = new Set<string>();
    const matches: string[] = [];

    for (const po of pool) {
      if (!po || !po.po_number || po.status === "COMPLETED" || po.status === "CANCELLED") continue;
      if (selectedPlant !== "ALL") {
        const dest = po.delivery_address || po.destination || po.client_code;
        const res = resolvePlantAndLocation(dest, po.client_code);
        if (res.plantGroup !== selectedPlant && res.plantCode !== selectedPlant) continue;
        if (selectedLocation !== "ALL") {
          const poLoc = (res.storageLocation || "").toUpperCase();
          const targetLoc = selectedLocation.toUpperCase();
          if (poLoc !== targetLoc && !res.fullDeliveryAddress.toUpperCase().includes(targetLoc)) {
            continue;
          }
        }
      }
      const norm = normalizePO(po.po_number);
      const normLow = norm.toLowerCase();
      if (seen.has(normLow) || existingSet.has(normLow)) continue;
      if (normLow.includes(cleanQ) || po.po_number.toLowerCase().includes(q)) {
        seen.add(normLow);
        matches.push(po.po_number);
      }
    }

    // Also include PO numbers currently visible in lines
    for (const ln of lines) {
      const normLow = normalizePO(ln.po_number).toLowerCase();
      if (seen.has(normLow) || existingSet.has(normLow)) continue;
      if (normLow.includes(cleanQ) || ln.po_number.toLowerCase().includes(q)) {
        seen.add(normLow);
        matches.push(ln.po_number);
      }
    }

    matches.sort((a, b) => {
      const aNorm = normalizePO(a).toLowerCase();
      const bNorm = normalizePO(b).toLowerCase();
      const aStarts = aNorm.startsWith(cleanQ);
      const bStarts = bNorm.startsWith(cleanQ);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    });

    return matches.slice(0, 8);
  }, [search, allOrdersList, remoteSuggestions, lines, poChips, selectedPlant, selectedLocation]);

  const handleSelectPOChip = (poNumber: string) => {
    const clean = normalizePO(poNumber);
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
    if (value.includes(",")) {
      const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
      const poParts = parts.filter(isPOToken).map(normalizePO);
      const leftover = parts.filter((p) => !isPOToken(p)).join(" ");
      if (poParts.length > 0) {
        setPoChips((prev) => Array.from(new Set([...prev, ...poParts])));
        setPage(1);
      }
      setSearch(leftover);
      originalInputRef.current = leftover;
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
    if (isDropdownOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = activeIndex < suggestions.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(nextIdx);
        setSearch(suggestions[nextIdx]);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (activeIndex > 0) {
          const prevIdx = activeIndex - 1;
          setActiveIndex(prevIdx);
          setSearch(suggestions[prevIdx]);
        } else if (activeIndex === 0) {
          setActiveIndex(-1);
          setSearch(originalInputRef.current);
        } else {
          const lastIdx = suggestions.length - 1;
          setActiveIndex(lastIdx);
          setSearch(suggestions[lastIdx]);
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
      if (e.key === "Tab" && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        handleSelectPOChip(suggestions[activeIndex]);
        return;
      }
    }

    if (e.key === "Enter") {
      if (isDropdownOpen && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        handleSelectPOChip(suggestions[activeIndex]);
        return;
      }
      const trimmed = search.trim();
      if (trimmed && isPOToken(trimmed)) {
        e.preventDefault();
        handleSelectPOChip(trimmed);
      }
      return;
    }

    if (e.key === "Backspace" && search === "" && poChips.length > 0) {
      setPoChips((prev) => prev.slice(0, -1));
      setPage(1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;
    const tokens = pasted.split(/[\s,;\r\n\t]+/).map((t) => t.trim()).filter(Boolean);
    const poTokens = tokens.filter(isPOToken).map(normalizePO);
    if (poTokens.length > 0) {
      e.preventDefault();
      setPoChips((prev) => Array.from(new Set([...prev, ...poTokens])));
      const leftover = tokens.filter((t) => !isPOToken(t)).join(" ");
      setSearch(leftover);
      originalInputRef.current = leftover;
      setIsDropdownOpen(false);
      setActiveIndex(-1);
      setPage(1);
    }
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

  // Multi-line selection logic (enforces same plant + storage location)
  const firstSelectedLine = useMemo(() => {
    return selectedLineMap.values().next().value || null;
  }, [selectedLineMap]);

  const toggleLineSelection = (line: POLineItemRecord) => {
    if (selectedLineMap.has(line.line_uid)) {
      const next = new Map(selectedLineMap);
      next.delete(line.line_uid);
      setSelectedLineMap(next);
      if (next.size === 0) setCrossLocationWarning(null);
      return;
    }

    if (selectedLineMap.size > 0 && firstSelectedLine) {
      const firstGroup = (firstSelectedLine.plant_group || "").toUpperCase();
      const thisGroup = (line.plant_group || "").toUpperCase();
      const firstLoc = (firstSelectedLine.storage_location || "0101").toUpperCase();
      const thisLoc = (line.storage_location || "0101").toUpperCase();

      if ((firstGroup && thisGroup && firstGroup !== thisGroup) || firstLoc !== thisLoc) {
        setCrossLocationWarning({
          attemptedLabel: line.po_line_label,
          targetDesc: t("purchaseOrderLines:crossWarning.storeDesc", {
            plant: line.plant_name || line.plant_code,
            store: thisLoc,
          }),
          currentDesc: t("purchaseOrderLines:crossWarning.storeDesc", {
            plant: firstSelectedLine.plant_name || firstSelectedLine.plant_code,
            store: firstLoc,
          }),
        });
        return;
      }
    }

    setCrossLocationWarning(null);
    const next = new Map(selectedLineMap);
    next.set(line.line_uid, line);
    setSelectedLineMap(next);
  };

  const allCurrentPageSelected =
    lines.length > 0 && lines.every((ln) => selectedLineUids.has(ln.line_uid));

  const toggleAllCurrentPage = () => {
    const next = new Map(selectedLineMap);
    if (allCurrentPageSelected) {
      lines.forEach((ln) => next.delete(ln.line_uid));
    } else {
      const refLine = firstSelectedLine || lines[0];
      const refGroup = (refLine?.plant_group || "").toUpperCase();
      const refLoc = (refLine?.storage_location || "0101").toUpperCase();
      lines.forEach((ln) => {
        const g = (ln.plant_group || "").toUpperCase();
        const l = (ln.storage_location || "0101").toUpperCase();
        if ((!refGroup || !g || refGroup === g) && l === refLoc) {
          next.set(ln.line_uid, ln);
        }
      });
    }
    setSelectedLineMap(next);
    setCrossLocationWarning(null);
  };

  const selectedUniquePOs = useMemo(() => {
    return Array.from(new Set(Array.from(selectedLineMap.values()).map((l) => l.po_number)));
  }, [selectedLineMap]);

  const handleDispatchSelectedLines = (dispatchMode: "web" | "excel") => {
    if (selectedLineMap.size === 0) return;
    const poList = selectedUniquePOs.join(",");
    const lineList = Array.from(selectedLineMap.keys()).join(",");
    navigate(
      `/shipments?pos=${encodeURIComponent(poList)}&lines=${encodeURIComponent(
        lineList
      )}&mode=${dispatchMode}&source=lines`
    );
  };

  const handleSaveSelectedAsDraft = () => {
    if (selectedLineMap.size === 0) return;
    const suppCode = user?.supplier_code || "0000018194";
    const selectedItems = Array.from(selectedLineMap.values());

    if (activeMode === "excel") {
      saveExcelDraft(suppCode, selectedUniquePOs, {
        plantCode: selectedItems[0]?.plant_code || KNOWN_PLANTS[selectedPlant]?.defaultCode || "PPA1",
        estimatedArrival: "",
        packingSlipNumber: "",
        packingSlipDates: {},
        validationResult: null,
      });
    } else {
      const wizardItems = selectedItems.map((m, idx) => ({
        id: `${m.po_number}-${m.po_item || idx}`,
        po_number: m.po_number,
        po_item: m.po_item,
        item_code: m.material_code || `ITEM-${idx + 1}`,
        partner_product_code: m.partner_code || "",
        description: m.material_description || "PO Line Item",
        ordered_qty: Number(m.ordered_qty || 0),
        shipped_qty: Number(m.shipped_qty || 0),
        remaining_qty: Number(m.remaining_qty || 0),
        shipping_now: Number(m.remaining_qty || 0),
        packaging_type: "BOX" as const,
        uom: m.uom || "M",
        destination: m.destination || "",
        delivery_date: m.delivery_date || "",
        order_date: m.order_date || "",
        supplier_id: m.supplier_id || "",
      }));

      saveManualDraft(suppCode, selectedUniquePOs, {
        step: 1,
        items: wizardItems,
        packedItems: [],
        startingSeq: 1,
        packingSlipNumber: "",
        deliveryDate: "",
      });
    }

    setDraftToast(
      t("purchaseOrderLines:draft.saved", {
        lines: t("purchaseOrderLines:draft.linesCount", { count: selectedItems.length }),
        pos: t("purchaseOrderLines:draft.posCount", { count: selectedUniquePOs.length }),
      })
    );
    setTimeout(() => setDraftToast(null), 4000);
  };

  const handleCopyIdentifier = (label: string, uid: string) => {
    navigator.clipboard.writeText(label);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 1800);
  };

  return (
    <div
      className={cn(
        selectedPlant === "ALL"
          ? "p-4 sm:p-6 space-y-4 sm:space-y-5"
          : "h-full flex flex-col overflow-hidden px-4 pt-4 pb-0 sm:px-6 sm:pt-5 sm:pb-0 gap-3"
      )}
    >
      {/* Page Header with Plant Breadcrumb, Mode Badge & Location Pills */}
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
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">
              {t("purchaseOrderLines:header.title")}
            </h1>
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
                    "group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none",
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
                      "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-extrabold shadow-2xs transition-all",
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

      {/* â”€â”€â”€ PLANT GATEWAY MODE: 5-Plant Horizontal Accordion Showcase â”€â”€â”€ */}
      {selectedPlant === "ALL" ? (
        <PlantAccordionShowcase
          orders={allOrdersList}
          onSelectPlant={selectPlant}
          isSupplier={isSupplier}
          ctaLabel={t("purchaseOrderLines:gatewayCta")}
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {/* Draft Saved Toast */}
          {draftToast && (
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{draftToast}</span>
              </div>
              <button
                type="button"
                onClick={() => navigate("/drafts")}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                {t("purchaseOrderLines:draft.openDrafts")}
              </button>
            </div>
          )}

          {/* Cross-Location Selection Warning */}
          {crossLocationWarning && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 shadow-sm animate-in fade-in">
              <div className="flex items-start sm:items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                <div className="text-xs">
                  <Trans
                    t={t}
                    i18nKey="purchaseOrderLines:crossWarning.message"
                    values={{
                      current: crossLocationWarning.currentDesc,
                      line: crossLocationWarning.attemptedLabel,
                      target: crossLocationWarning.targetDesc,
                    }}
                    components={{
                      b: <span className="font-bold" />,
                      u: <span className="font-semibold underline" />,
                      mono: <span className="font-mono font-semibold" />,
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCrossLocationWarning(null)}
                className="p-1 hover:bg-amber-200/60 rounded-md text-amber-700 transition-colors cursor-pointer self-end sm:self-auto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Selected Lines Action Banner */}
          {selectedLineMap.size > 0 && (
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
                  {selectedLineMap.size}
                </span>
                <span
                  className={cn(
                    "text-xs font-bold truncate",
                    isSupplier ? "text-emerald-950" : "text-blue-950"
                  )}
                >
                  {t("purchaseOrderLines:selection.selected", { count: selectedLineMap.size })}
                  <span className="font-normal text-xs text-slate-500 ml-1.5">
                    {t("purchaseOrderLines:selection.selectedPos", {
                      pos: t("purchaseOrderLines:draft.posCount", { count: selectedUniquePOs.length }),
                    })}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="h-8 px-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                  {t("purchaseOrderLines:selection.clear")}
                </button>

                <button
                  type="button"
                  onClick={handleSaveSelectedAsDraft}
                  className="h-8 px-3 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <FileEdit className="w-3.5 h-3.5 text-slate-600" />
                  <span>{t("purchaseOrderLines:selection.saveDraft")}</span>
                </button>

                {activeMode === "manual" ? (
                  <button
                    type="button"
                    onClick={() => handleDispatchSelectedLines("web")}
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
                    onClick={() => handleDispatchSelectedLines("excel")}
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

          {/* Plant-Scoped Search & Multi-PO Autocomplete Bar */}
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
                      isSupplier
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
                      ? t("purchaseOrderLines:search.addAnother")
                      : t("purchaseOrderLines:search.placeholder", {
                          plant:
                            KNOWN_PLANTS[selectedPlant]?.name?.replace(" Ltd", "") ||
                            t("purchaseOrderLines:search.plantFallback"),
                          location:
                            selectedLocation === "ALL" ? t("purchaseOrderLines:empty.allStores") : selectedLocation,
                        })
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
                  className="flex-1 min-w-[200px] py-0.5 bg-transparent focus:outline-none text-sm text-gray-900"
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

              {/* Clean PO Number Suggestions Dropdown */}
              {isDropdownOpen && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3.5 py-1.5 bg-gray-50/90 text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                    <span>{t("purchaseOrders:shared.suggested")}</span>
                    <span className="text-[10px] text-gray-400 font-normal">{t("purchaseOrders:shared.keysHint")}</span>
                  </div>
                  <div className="max-h-[240px] overflow-y-auto py-1">
                    {suggestions.map((poNum, idx) => {
                      const isHighlighted = activeIndex === idx;
                      return (
                        <div
                          key={poNum}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectPOChip(poNum);
                          }}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={cn(
                            "px-3.5 py-2 flex items-center gap-2.5 cursor-pointer transition-colors text-left",
                            isHighlighted
                              ? "bg-blue-50/90 text-blue-900"
                              : "hover:bg-gray-50 text-gray-800"
                          )}
                        >
                          <Search className={cn("w-3.5 h-3.5 shrink-0", isHighlighted ? "text-blue-600" : "text-gray-400")} />
                          <span className="font-mono font-semibold text-sm">{poNum}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
          </div>

          {/* Flat Active PO Lines Table */}
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-t-xl border-x border-t border-slate-200 shadow-2xs overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-24 text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin mr-2 text-blue-500" />
                {t("purchaseOrderLines:loading")}
              </div>
            ) : lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 px-4 text-center">
                <ListOrdered className="w-12 h-12 mb-3 text-gray-300" />
                <p className="text-lg font-medium text-gray-700">{t("purchaseOrderLines:empty.title")}</p>
                <p className="text-xs text-gray-400 mt-1 max-w-md">
                  {t("purchaseOrderLines:empty.text", {
                    plant: KNOWN_PLANTS[selectedPlant]?.name,
                    location:
                      selectedLocation === "ALL"
                        ? t("purchaseOrderLines:empty.allStores")
                        : t("purchaseOrders:shared.store", { code: selectedLocation }),
                  })}
                </p>
                <div className="flex items-center gap-2 mt-4">
                  {(poChips.length > 0 || search || deliveryDateFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        clearSearch();
                        setDeliveryDateFilter("");
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      {t("purchaseOrderLines:empty.clearFilters")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => selectPlant("ALL")}
                    className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                  >
                    {t("purchaseOrderLines:empty.changePlant")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-zinc-700 shadow-xs">
                    <tr className="bg-zinc-700 text-white text-xs font-semibold uppercase tracking-wider border-b border-zinc-800">
                      <th className="py-1.5 px-2 w-9 text-center border-r border-zinc-600">
                        <button
                          type="button"
                          onClick={toggleAllCurrentPage}
                          className="text-zinc-200 hover:text-white transition-colors cursor-pointer inline-flex items-center justify-center"
                          title={t("purchaseOrderLines:table.selectAll")}
                        >
                          {allCurrentPageSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </th>
                      <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("purchaseOrderLines:table.poLine")}</th>
                      <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("purchaseOrderLines:table.material")}</th>
                      <th className="py-1.5 px-2 min-w-[220px] border-r border-zinc-600">{t("purchaseOrders:modalTable.description")}</th>
                      <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("purchaseOrders:table.deliveryDate")}</th>
                      <th className="py-1.5 px-2 text-right whitespace-nowrap border-r border-zinc-600">{t("purchaseOrders:modalTable.ordered")}</th>
                      <th className="py-1.5 px-2 text-right whitespace-nowrap border-r border-zinc-600">{t("purchaseOrders:modalTable.shipped")}</th>
                      <th className="py-1.5 px-2 text-right whitespace-nowrap">{t("purchaseOrderLines:table.remaining")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((ln) => {
                      const isSelected = selectedLineUids.has(ln.line_uid);
                      const daysDiff = getDaysDiff(ln.delivery_date);
                      const isOverdue = daysDiff !== null && daysDiff < 0;
                      const isDueSoon = daysDiff !== null && daysDiff >= 0 && daysDiff <= 3;

                      return (
                        <tr
                          key={ln.line_uid}
                          onClick={() => toggleLineSelection(ln)}
                          className={cn(
                            "cursor-pointer transition-colors group border-b border-gray-300 text-xs",
                            isSelected
                              ? isSupplier
                                ? "bg-emerald-50/90 hover:bg-emerald-100/80 border-l-4 border-l-emerald-600"
                                : "bg-blue-50/90 hover:bg-blue-100/80 border-l-4 border-l-blue-600"
                              : "bg-white even:bg-gray-100 hover:bg-blue-50/70"
                          )}
                        >
                          {/* Multi-line Checkbox */}
                          <td
                            className="py-1 px-2 text-center whitespace-nowrap border-r border-gray-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLineSelection(ln);
                            }}
                          >
                            <button
                              type="button"
                              className={cn(
                                "text-gray-400 transition-colors inline-flex items-center justify-center cursor-pointer",
                                isSupplier ? "hover:text-emerald-600" : "hover:text-blue-600"
                              )}
                              title={t("purchaseOrderLines:table.selectLine", { line: ln.po_line_label })}
                            >
                              {isSelected ? (
                                <CheckSquare className={cn("w-3.5 h-3.5", isSupplier ? "text-emerald-600" : "text-blue-600")} />
                              ) : (
                                <Square className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>

                          {/* PO / Line Identifier (e.g. 2001382767 00100-0001) */}
                          <td className="py-1 px-2 whitespace-nowrap border-r border-gray-200">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-slate-900">
                                {ln.po_number}
                              </span>
                              <span
                                className={cn(
                                  "font-mono text-xs font-semibold",
                                  isSupplier ? "text-emerald-700" : "text-blue-700"
                                )}
                              >
                                {ln.po_item}
                              </span>

                              {ln.po_version && ln.po_version > 1 ? (
                                <span
                                  className="text-[10px] font-bold text-amber-700"
                                  title={t("purchaseOrderLines:table.revised", { version: ln.po_version })}
                                >
                                  v{ln.po_version}
                                </span>
                              ) : null}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyIdentifier(ln.po_line_label, ln.line_uid);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                                title={t("purchaseOrderLines:table.copy", { label: ln.po_line_label })}
                              >
                                {copiedUid === ln.line_uid ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Material / Partner Code */}
                          <td className="py-1 px-2 whitespace-nowrap border-r border-gray-200">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-semibold text-slate-900">
                                {ln.material_code || "â€”"}
                              </span>
                              {(ln.partner_code || ln.color) && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  ({[ln.partner_code, ln.color].filter(Boolean).join(" Â· ")})
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Description */}
                          <td className="py-1 px-2 max-w-[300px] whitespace-nowrap border-r border-gray-200">
                            <p className="text-xs text-slate-700 truncate" title={ln.material_description || undefined}>
                              {ln.material_description || "â€”"}
                            </p>
                          </td>

                          {/* Delivery Date */}
                          <td className="py-1 px-2 whitespace-nowrap text-xs border-r border-gray-200">
                            <div className="flex items-center gap-1">
                              <Calendar
                                className={cn(
                                  "w-3 h-3 shrink-0",
                                  isOverdue
                                    ? "text-red-500"
                                    : isDueSoon
                                    ? "text-amber-500"
                                    : "text-slate-400"
                                )}
                              />
                              <span
                                className={cn(
                                  "font-medium",
                                  isOverdue
                                    ? "text-red-700 font-semibold"
                                    : isDueSoon
                                    ? "text-amber-700 font-semibold"
                                    : "text-slate-700"
                                )}
                              >
                                {formatDateDisplay(ln.delivery_date)}
                              </span>
                            </div>
                          </td>

                          {/* Ordered Qty */}
                          <td className="py-1 px-2 text-right whitespace-nowrap font-mono text-xs text-slate-600 border-r border-gray-200">
                            {formatNumber(ln.ordered_qty)}{" "}
                            <span className="text-[10px] text-slate-400">{ln.uom || "M"}</span>
                          </td>

                          {/* Shipped Qty */}
                          <td className="py-1 px-2 text-right whitespace-nowrap font-mono text-xs text-slate-500 border-r border-gray-200">
                            {ln.shipped_qty > 0 ? formatNumber(ln.shipped_qty) : "0"}
                          </td>

                          {/* Remaining Open Balance */}
                          <td className="py-1 px-2 text-right whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0 rounded font-mono text-xs font-bold border",
                                isSupplier
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-blue-50 text-blue-800 border-blue-200"
                              )}
                            >
                              {formatNumber(ln.remaining_qty)}
                              <span className="text-[10px] font-semibold opacity-75">{ln.uom || "M"}</span>
                            </span>
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
