import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  FileText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PackagePlus,
  CheckSquare,
  Square,
  Calendar,
  X,
  ArrowRight,
  Copy,
  Check,
  Building,
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
import PlantAccordionShowcase from "@/components/plants/PlantAccordionShowcase";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const supplierId = isSupplier ? (user?.supplier_id || user?.supplier_code || undefined) : undefined;

  const activeMode: "manual" | "excel" =
    mode === "excel" || location.pathname.includes("/excel")
      ? "excel"
      : "manual";

  const plantFromUrl = searchParams.get("plant");
  const viewFromUrl = searchParams.get("view");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [poChips, setPoChips] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const locFromUrl = searchParams.get("loc");
  const [selectedPlant, setSelectedPlant] = useState<string>(
    plantFromUrl && KNOWN_PLANTS[plantFromUrl.toUpperCase()] ? plantFromUrl.toUpperCase() : "ALL"
  );
  const [selectedLocation, setSelectedLocation] = useState<string>(() => {
    if (locFromUrl) return locFromUrl;
    if (plantFromUrl && KNOWN_PLANTS[plantFromUrl.toUpperCase()]) {
      return KNOWN_PLANTS[plantFromUrl.toUpperCase()].storageLocationsHint?.[0] || "0101";
    }
    return "0101";
  });
  const [viewMode, setViewMode] = useState<"hub" | "global" | "plant">(
    plantFromUrl && KNOWN_PLANTS[plantFromUrl.toUpperCase()]
      ? "plant"
      : viewFromUrl === "global"
      ? "global"
      : "hub"
  );
  const [crossPlantWarning, setCrossPlantWarning] = useState<{
    attemptedPO: string;
    targetPlant: string;
    currentPlant: string;
  } | null>(null);

  // State for multi-selecting POs. Keeps the PO objects so selections survive
  // searches that no longer include the selected rows.
  const [selectedPOMap, setSelectedPOMap] = useState<Map<string, PurchaseOrder>>(new Map());
  const selectedPOs = useMemo(() => new Set(selectedPOMap.keys()), [selectedPOMap]);
  const canSelect = selectedPlant !== "ALL" || viewMode === "global";

  const clearSelection = () => {
    setSelectedPOMap(new Map());
    setCrossPlantWarning(null);
  };

  const selectPlant = (plantId: string, targetLoc?: string) => {
    setSelectedPlant(plantId);
    setPage(1);
    clearSelection();

    const newParams = new URLSearchParams(searchParams);
    if (plantId === "ALL") {
      setSelectedLocation("ALL");
      setViewMode("hub");
      newParams.delete("plant");
      newParams.delete("view");
      newParams.delete("loc");
    } else {
      let defaultLoc = targetLoc;
      if (!defaultLoc) {
        defaultLoc = KNOWN_PLANTS[plantId]?.storageLocationsHint?.[0] || "0101";
      }
      setSelectedLocation(defaultLoc);
      setViewMode("plant");
      newParams.set("plant", plantId);
      newParams.set("loc", defaultLoc);
      newParams.delete("view");
    }
    setSearchParams(newParams, { replace: true });
  };

  const handleOpenWithPO = (plantId: string, poNumber: string) => {
    setSelectedPlant(plantId);
    const defaultLoc = KNOWN_PLANTS[plantId]?.storageLocationsHint?.[0] || "0101";
    setSelectedLocation(defaultLoc);
    setPoChips([poNumber.trim()]);
    setSearch("");
    setPage(1);
    clearSelection();
    setViewMode("plant");

    const newParams = new URLSearchParams(searchParams);
    newParams.set("plant", plantId);
    newParams.set("loc", defaultLoc);
    newParams.delete("view");
    setSearchParams(newParams, { replace: true });
  };

  // State for previewing a specific PO
  const [selectedPOForPreview, setSelectedPOForPreview] = useState<PurchaseOrder | null>(null);
  const [copiedPO, setCopiedPO] = useState(false);

  // Query to fetch overview of all orders (used for live 5-plant accordion metrics & quick auto-detect PO search)
  const { data: allOverviewData } = useQuery({
    queryKey: ["purchaseOrdersOverviewAll", supplierId],
    queryFn: () => poApi.list({ per_page: 200, supplier_id: supplierId }),
    staleTime: 15000,
    refetchInterval: 10000,
  });
  const allOrdersList: PurchaseOrder[] = allOverviewData?.items || [];



  const { data, isLoading } = useQuery({
    queryKey: ["purchaseOrders", page, search, poChips, statusFilter, supplierId, selectedPlant, selectedLocation],
    queryFn: () =>
      poApi.list({
        page,
        per_page: 50,
        search: poChips.length === 0 && search ? search : undefined,
        po_numbers: poChips.length > 0 ? poChips.join(",") : undefined,
        status: statusFilter || undefined,
        supplier_id: supplierId,
        plant: selectedPlant !== "ALL" && poChips.length === 0 ? selectedPlant : undefined,
        storage_location: selectedLocation !== "ALL" && poChips.length === 0 ? selectedLocation : undefined,
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

  // Compute available storage locations for the currently selected plant
  const availableLocations = useMemo(() => {
    const locMap = new Map<string, number>();
    const sourceOrders = allOrdersList.length > 0 ? allOrdersList : orders;
    sourceOrders.forEach((po) => {
      const dest = po.delivery_address || po.destination || po.client_code;
      const res = resolvePlantAndLocation(dest, po.client_code);
      if (selectedPlant === "ALL" || res.plantGroup === selectedPlant || res.plantCode === selectedPlant) {
        const key = res.storageLocation || "0101";
        if (key) {
          locMap.set(key, (locMap.get(key) || 0) + 1);
        }
      }
    });

    if (selectedPlant !== "ALL" && KNOWN_PLANTS[selectedPlant]) {
      KNOWN_PLANTS[selectedPlant].storageLocationsHint?.forEach((hint) => {
        const clean = hint.match(/\b\d{4}\b/)?.[0] || hint.trim();
        if (!locMap.has(clean)) {
          locMap.set(clean, 0);
        }
      });
    }

    return Array.from(locMap.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders, allOrdersList, selectedPlant]);

  // Keep selectedLocation synchronized to an active valid location in plant view
  useEffect(() => {
    if (selectedPlant !== "ALL" && availableLocations.length > 0) {
      const hasMatch = availableLocations.some((l) => l.code === selectedLocation);
      if (!hasMatch) {
        setSelectedLocation(availableLocations[0].code);
      }
    }
  }, [selectedPlant, availableLocations, selectedLocation]);

  // Filter orders for display
  const displayedOrders = useMemo(() => {
    return orders.filter((po) => {
      // If user specifically searched for PO chips, display all found POs across plants
      if (poChips.length > 0) {
        return true;
      }

      const dest = po.delivery_address || po.destination || po.client_code;
      const res = resolvePlantAndLocation(dest, po.client_code);

      if (selectedPlant !== "ALL" && res.plantGroup !== selectedPlant && res.plantCode !== selectedPlant) {
        return false;
      }

      if (selectedPlant !== "ALL" && selectedLocation !== "ALL") {
        const poLoc = (res.storageLocation || "").toUpperCase();
        const targetLoc = selectedLocation.toUpperCase();
        if (poLoc !== targetLoc && !res.fullDeliveryAddress.toUpperCase().includes(targetLoc)) {
          return false;
        }
      }

      return true;
    });
  }, [orders, selectedPlant, selectedLocation, poChips]);

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
          targetPlant: `Location ${thisPlant.storageLocation}`,
          currentPlant: `Location ${currentSelectedPlantInfo.storageLocation}`,
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

  // Query remote POs matching search if typed
  const { data: remoteSuggestionsData } = useQuery({
    queryKey: ["poSearchSuggestions", debouncedSearch, supplierId],
    queryFn: () => poApi.list({ search: debouncedSearch, per_page: 8, supplier_id: supplierId }),
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
      if (!po || !po.po_number) continue;
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
  }, [search, allOrdersList, orders, remoteSuggestions, poChips]);

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
  const colSpanBeforeQty = hasDistinctPartner ? 6 : 5;

  return (
    <div
      className={cn(
        "p-4 sm:p-6",
        selectedPlant === "ALL" && viewMode === "hub"
          ? "space-y-4 sm:space-y-5"
          : "space-y-6"
      )}
    >
      {/* Page Header with Mode Indicator & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Purchase Orders</h1>
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

            {selectedPlant !== "ALL" && KNOWN_PLANTS[selectedPlant] && (
              <div className="inline-flex items-center gap-2 pl-2 border-l border-slate-200">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase text-white shadow-xs"
                  style={{ backgroundColor: KNOWN_PLANTS[selectedPlant].accentHex }}
                >
                  {KNOWN_PLANTS[selectedPlant].defaultCode}
                </span>
                <span className="text-sm font-bold text-slate-800">
                  {KNOWN_PLANTS[selectedPlant].name}
                </span>
                <span className="text-xs text-slate-400 font-normal">
                  ({KNOWN_PLANTS[selectedPlant].location})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* View Switcher & Filter Dropdowns (Top Right) */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">


          {/* Delivery Storage Location Dropdown (Strictly Scoped, No 'ALL' option) */}
          {selectedPlant !== "ALL" && availableLocations.length > 0 && (
            <div className="relative">
              <select
                value={selectedLocation}
                onChange={(e) => {
                  const newLoc = e.target.value;
                  if (selectedLocation !== newLoc) {
                    setSelectedLocation(newLoc);
                    setPage(1);
                    clearSelection();
                    const p = new URLSearchParams(searchParams);
                    p.set("loc", newLoc);
                    setSearchParams(p, { replace: true });
                  }
                }}
                className="h-9 pl-8 pr-8 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-800 shadow-2xs hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none min-w-[145px]"
                title="Select Storage Location"
              >
                {availableLocations.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    Store {loc.code} ({loc.count})
                  </option>
                ))}
              </select>
              <Warehouse className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* View Mode Toggle: Factory Plants (5) vs All Orders */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => selectPlant("ALL")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                selectedPlant === "ALL" && viewMode === "hub"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="Show Factory Plants Overview"
            >
              <Factory className="w-3.5 h-3.5 text-blue-600" />
              <span>Factory Plants (5)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedPlant("ALL");
                setViewMode("global");
                const p = new URLSearchParams(searchParams);
                p.set("view", "global");
                p.delete("plant");
                setSearchParams(p, { replace: true });
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                viewMode === "global"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="View All Orders Table across all plants"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>All Orders</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── SHOWCASE MODE: 5-Plant Horizontal Accordion Showcase ─── */}
      {selectedPlant === "ALL" && viewMode === "hub" ? (
        <PlantAccordionShowcase
          orders={allOrdersList.length > 0 ? allOrdersList : orders}
          onSelectPlant={selectPlant}
          onOpenWithPO={handleOpenWithPO}
          onSwitchToGlobalView={() => {
            setViewMode("global");
            const p = new URLSearchParams(searchParams);
            p.set("view", "global");
            p.delete("plant");
            setSearchParams(p, { replace: true });
          }}
          isSupplier={isSupplier}
        />
      ) : (
        /* ─── PLANT WORKSPACE / GLOBAL LIST MODE ─── */
        <div className="space-y-4">

          {/* Cross-Plant Selection Mismatch Warning */}
          {crossPlantWarning && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-start sm:items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                <div className="text-xs">
                  <span className="font-bold">Cannot Mix Plants or Storage Locations: </span>
                  Your current selection is for <span className="font-semibold underline">{crossPlantWarning.currentPlant}</span>.
                  Orders for <span className="font-semibold underline">{crossPlantWarning.targetPlant}</span> (e.g. {crossPlantWarning.attemptedPO}) must be dispatched in a separate delivery.
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
                  Clear & Select {crossPlantWarning.attemptedPO}
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
                        for <span className="font-semibold text-gray-900">{currentSelectedPlantInfo.plantName}</span>
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white text-slate-800 border border-slate-300 shadow-2xs">
                          Store {currentSelectedPlantInfo.storageLocation}
                        </span>
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
                      ? "Manual Packing Wizard"
                      : "Excel Drop Manifest"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="h-10 px-4 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
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
                      title={`Remove ${chip}`}
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
                      ? "Add another PO number..."
                      : "Search PO number or paste comma-separated POs..."
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
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Suggestions Dropdown (Clean PO list only) */}
              {isDropdownOpen && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3.5 py-1.5 bg-gray-50/90 text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Suggested PO Numbers</span>
                    <span className="text-[10px] text-gray-400 font-normal">Use ↑ ↓ & Enter</span>
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
                            <span className="text-[10px] text-blue-600 font-sans font-medium">Select ↵</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3.5 py-1.5 bg-gray-50/70 text-[11px] text-gray-400 flex items-center justify-between">
                    <span>Paste comma-separated POs to search multiple</span>
                    <span className="font-mono text-[10px]">Esc to close</span>
                  </div>
                </div>
              )}

              {poChips.length > 0 && !isLoading && (
                <p className="text-xs text-gray-500 mt-1.5">
                  Found {poChips.length - missingChips.length} of {poChips.length}
                  {missingChips.length > 0 && (
                    <span className="text-amber-700">
                      {" · "}Not found{selectedPlant !== "ALL" ? ` in ${KNOWN_PLANTS[selectedPlant]?.name.replace(" Ltd", "")}` : ""}:{" "}
                      <span className="font-mono">{missingChips.join(", ")}</span>
                    </span>
                  )}
                </p>
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
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
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
                onClick={() => selectPlant("ALL")}
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
                  {canSelect && (
                    <th className="px-3.5 py-2 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleAllSelection}
                        className={cn(
                          "transition-colors cursor-pointer",
                          isSupplier
                            ? "text-gray-400 hover:text-emerald-600"
                            : "text-gray-400 hover:text-blue-600"
                        )}
                        title="Select all"
                      >
                        {allSelectableSelected ? (
                          <CheckSquare className={cn("w-4 h-4", isSupplier ? "text-emerald-600" : "text-blue-600")} />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="px-3.5 py-2 whitespace-nowrap">PO Number</th>
                  {viewMode === "global" && (
                    <th className="px-3.5 py-2 whitespace-nowrap">Plant & Storage</th>
                  )}
                  <th className="px-3.5 py-2 whitespace-nowrap">Order Date</th>
                  <th className="px-3.5 py-2 whitespace-nowrap">Delivery Date</th>
                  <th className="px-3.5 py-2 min-w-[260px]">Contact</th>
                  <th className="px-3.5 py-2 whitespace-nowrap">Notation</th>
                  <th className="px-3.5 py-2 text-right whitespace-nowrap">Quantity</th>
                  <th className="px-3.5 py-2 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
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
                      onClick={() => setSelectedPOForPreview(po)}
                      className={cn(
                        "cursor-pointer transition-colors group",
                        isSelected
                          ? isSupplier
                            ? "bg-emerald-50/70 border-l-4 border-emerald-600"
                            : "bg-blue-50/70 border-l-4 border-blue-600"
                          : isCrossConflict
                          ? "opacity-60 hover:bg-amber-50/20"
                          : isSupplier
                            ? "hover:bg-emerald-50/30"
                            : "hover:bg-blue-50/30"
                      )}
                    >
                      {/* Selection Checkbox (only when a plant is selected) */}
                      {canSelect && (
                        <td
                          className={cn(
                            "px-3.5 py-1.5 text-center",
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
                                ? "This PO is fully fulfilled (Completed)"
                                : po.status === "CANCELLED"
                                ? "This PO is cancelled"
                                : isCrossConflict
                                ? `Cannot mix: Belongs to ${poPlant.plantName} (Store ${poPlant.storageLocation}). Current batch is for Store ${currentSelectedPlantInfo?.storageLocation}.`
                                : "Select PO"
                            }
                            className={cn(
                              "text-gray-300 transition-colors inline-flex items-center justify-center",
                              !rowSelectable
                                ? "cursor-not-allowed"
                                : isCrossConflict
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
                      )}

                      {/* PO Number */}
                      <td className="px-3.5 py-1.5 whitespace-nowrap">
                        <div
                          className={cn(
                            "flex items-center gap-1.5 font-mono font-semibold text-gray-900 transition-colors text-xs",
                            isSupplier ? "group-hover:text-emerald-600" : "group-hover:text-blue-600"
                          )}
                        >
                          <span>{po.po_number || "—"}</span>
                          {po.version && po.version > 1 ? (
                            <span
                              className="px-1.5 py-0.2 text-[10px] font-bold bg-amber-100 text-amber-800 rounded border border-amber-200 inline-flex items-center shadow-2xs font-sans shrink-0 leading-tight"
                              title={`Order revised/amended by customer (Version ${po.version})`}
                            >
                              V{po.version}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Plant & Storage Location (Only shown in Global All-Orders view) */}
                      {viewMode === "global" && (
                        <td className="px-3.5 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 text-xs">
                              {poPlant.plantName}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-gray-100 text-gray-700 border border-gray-200 rounded">
                              {poPlant.fullDeliveryAddress}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Order Date */}
                      <td className="px-3.5 py-1.5 text-gray-600 whitespace-nowrap text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{formatDateDisplay(po.order_date || (po.extra_data as any)?.order_date)}</span>
                        </div>
                      </td>

                      {/* Delivery Date */}
                      <td className="px-3.5 py-1.5 text-gray-600 whitespace-nowrap text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{formatDateDisplay(po.delivery_date)}</span>
                        </div>
                      </td>

                      {/* Contact (<ContactPerson> on top, <AuxHead1> email underneath) */}
                      <td className="px-3.5 py-1.5 text-gray-700 min-w-[260px] max-w-[340px]">
                        {po.contact_person || (po.extra_data as any)?.contact_person ? (
                          <div className="leading-tight">
                            <div className="font-semibold text-gray-900 text-xs truncate">
                              {po.contact_person || (po.extra_data as any)?.contact_person}
                            </div>
                            {(po.contact_email || (po.extra_data as any)?.contact_email) && (
                              <div className="flex items-center gap-1 text-[11px] mt-0.5">
                                <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                                <a
                                  href={`mailto:${po.contact_email || (po.extra_data as any)?.contact_email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-600 hover:underline hover:text-blue-700 font-mono tracking-tight truncate select-all"
                                  title={po.contact_email || (po.extra_data as any)?.contact_email}
                                >
                                  {po.contact_email || (po.extra_data as any)?.contact_email}
                                </a>
                              </div>
                            )}
                          </div>
                        ) : (po.contact_email || (po.extra_data as any)?.contact_email) ? (
                          <div className="flex items-center gap-1 text-xs">
                            <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                            <a
                              href={`mailto:${po.contact_email || (po.extra_data as any)?.contact_email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[11px] text-blue-600 hover:underline hover:text-blue-700 font-mono tracking-tight truncate select-all"
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
                      <td className="px-3.5 py-1.5 text-gray-700 whitespace-nowrap text-xs">
                        {po.notations || (po.extra_data as any)?.notations || (po.extra_data as any)?.aux_head8 || (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="px-3.5 py-1.5 text-right font-mono text-xs">
                        {po.status === "PARTIAL" && po.remaining_quantity !== undefined && po.remaining_quantity !== null ? (
                          <div className="leading-tight">
                            <div className="font-bold text-orange-600">
                              {po.remaining_quantity.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              bal of {po.quantity?.toLocaleString()}
                            </div>
                          </div>
                        ) : po.status === "COMPLETED" ? (
                          <div className="leading-tight">
                            <div className="font-bold text-emerald-600">0</div>
                            <div className="text-[10px] text-gray-400">
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
                      <td className="px-3.5 py-1.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded-full inline-flex items-center ${STATUS_BADGES[po.status] || "bg-gray-100 text-gray-700 border border-gray-200"
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

        {/* Bottom Pagination Footer */}
        {totalOrders > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50/70 select-none text-xs text-slate-500">
            <div className="font-medium text-slate-500">
              <span className="font-semibold text-slate-700">{totalOrders.toLocaleString()} total orders</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <span className="px-2 font-normal tracking-tight text-slate-600">
                {paginationText}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                title="Previous page"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                title="Next page"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )}

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
                        <th className="px-3 py-1.5 w-10 text-center">No.</th>
                        <th className="px-3 py-1.5 min-w-[140px]">Item / Material Code</th>
                        {hasDistinctPartner && (
                          <th className="px-3 py-1.5 min-w-[110px]">Partner Code</th>
                        )}
                        <th className="px-3 py-1.5 min-w-[160px]">Description</th>
                        <th className="px-2 py-1.5 min-w-[70px]">Color</th>
                        <th className="px-2 py-1.5 text-center w-16">UOM</th>
                        <th className="px-3 py-1.5 text-right font-semibold min-w-[85px]">Ordered</th>
                        <th className="px-3 py-1.5 text-right font-semibold min-w-[85px]">Shipped</th>
                        <th className="px-3 py-1.5 text-right font-semibold min-w-[95px]">Open Balance</th>
                        <th className="px-3 py-1.5 text-center min-w-[90px]">Status</th>
                        {hasPricing && (
                          <th className="px-3 py-1.5 text-right min-w-[90px]">Unit Price</th>
                        )}
                        {hasPricing && (
                          <th className="px-3 py-1.5 text-right font-semibold min-w-[100px]">Subtotal</th>
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
                            <td className="px-3 py-1.5 text-center font-mono text-gray-400">
                              {item.line_number}
                            </td>
                            <td className="px-3 py-1.5 font-mono">
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
                              <td className="px-3 py-1.5 font-mono text-gray-700 font-medium">
                                {item.partner_item_code || " "}
                              </td>
                            )}
                            <td className="px-3 py-1.5 text-gray-700 font-medium break-words max-w-xs">
                              {item.description}
                            </td>
                            <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                              {item.color ? (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-800 rounded font-medium text-[11px] border border-gray-200">
                                  {item.color}
                                </span>
                              ) : (
                                <span className="text-gray-300"> </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center font-mono text-gray-700 whitespace-nowrap">
                              <span className="px-2 py-0.5 bg-gray-100 rounded text-[11px] font-semibold border border-gray-200">
                                {item.size || "M"}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-gray-700 whitespace-nowrap">
                              {item.quantity.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-emerald-700 font-semibold whitespace-nowrap">
                              {lineShip.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                              {lineRem.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-center whitespace-nowrap">
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
                              <td className="px-3 py-1.5 text-right font-mono text-gray-600 whitespace-nowrap">
                                {item.unit_price !== undefined
                                  ? `${activePO.currency || "USD"} ${item.unit_price.toFixed(2)}`
                                  : " "}
                              </td>
                            )}
                            {hasPricing && (
                              <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
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
                    onClick={() => togglePOSelection(activePO)}
                    disabled={!canSelect}
                    title={canSelect ? undefined : "Open a plant to select POs"}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
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

