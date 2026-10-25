import { useState, useMemo } from "react";
import {
  ArrowRight,
  Warehouse,
  Search,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
} from "lucide-react";
import { KNOWN_PLANTS, resolvePlantAndLocation } from "@/utils/plantResolver";
import type { PurchaseOrder } from "@/types/email";
import { cn } from "@/utils/cn";

export interface PlantStats {
  totalOrders: number;
  readyOrders: number;
  locationsCount: number;
  locationsList: string[];
}

interface PlantAccordionShowcaseProps {
  orders: PurchaseOrder[];
  onSelectPlant: (plantId: string) => void;
  onOpenWithPO?: (plantId: string, poNumber: string) => void;
  onSwitchToGlobalView?: () => void;
  isSupplier?: boolean;
}

export default function PlantAccordionShowcase({
  orders,
  onSelectPlant,
  onOpenWithPO,
  onSwitchToGlobalView,
  isSupplier = false,
}: PlantAccordionShowcaseProps) {
  // Compute live statistics per plant
  const plantStats = useMemo(() => {
    const stats: Record<string, PlantStats> = {
      OMEGA: { totalOrders: 0, readyOrders: 0, locationsCount: 0, locationsList: [] },
      ALPHA: { totalOrders: 0, readyOrders: 0, locationsCount: 0, locationsList: [] },
      BENJI: { totalOrders: 0, readyOrders: 0, locationsCount: 0, locationsList: [] },
      SIRIO: { totalOrders: 0, readyOrders: 0, locationsCount: 0, locationsList: [] },
      VAVUNIYA: { totalOrders: 0, readyOrders: 0, locationsCount: 0, locationsList: [] },
    };

    const locSets: Record<string, Set<string>> = {
      OMEGA: new Set(),
      ALPHA: new Set(),
      BENJI: new Set(),
      SIRIO: new Set(),
      VAVUNIYA: new Set(),
    };

    orders.forEach((po) => {
      const dest = po.delivery_address || po.destination || po.client_code;
      const res = resolvePlantAndLocation(dest, po.client_code);
      const group = res.plantGroup;
      if (stats[group]) {
        stats[group].totalOrders += 1;
        if (po.status !== "COMPLETED" && po.status !== "CANCELLED") {
          stats[group].readyOrders += 1;
        }
        const loc = res.fullDeliveryAddress || res.storageLocation;
        if (loc) locSets[group].add(loc);
      }
    });

    Object.keys(stats).forEach((k) => {
      stats[k].locationsCount = locSets[k].size;
      stats[k].locationsList = Array.from(locSets[k]);
    });

    return stats;
  }, [orders]);

  // Determine initial active plant (plant with most orders, or OMEGA by default)
  const defaultPlantId = useMemo(() => {
    let best = "OMEGA";
    let max = -1;
    Object.entries(plantStats).forEach(([id, st]) => {
      if (st.totalOrders > max) {
        max = st.totalOrders;
        best = id;
      }
    });
    return best;
  }, [plantStats]);

  const [activeHoverId, setActiveHoverId] = useState<string>(defaultPlantId);

  // Universal PO Quick Finder state
  const [quickSearchInput, setQuickSearchInput] = useState("");

  const quickSearchMatch = useMemo(() => {
    const q = quickSearchInput.trim().toUpperCase();
    if (!q) return null;

    const tokens = q.split(/[\s,;]+/).filter(Boolean);
    const matchedPOs: { po: PurchaseOrder; plantGroup: string; plantName: string }[] = [];

    tokens.forEach((t) => {
      const found = orders.find((p) => {
        const poNum = (p.po_number || "").toUpperCase();
        return poNum === t || poNum.endsWith(t) || poNum.includes(t);
      });
      if (found) {
        const dest = found.delivery_address || found.destination || found.client_code;
        const res = resolvePlantAndLocation(dest, found.client_code);
        matchedPOs.push({ po: found, plantGroup: res.plantGroup, plantName: res.plantName });
      }
    });

    if (matchedPOs.length === 0) return { status: "not_found", query: q };

    // Check if multiple plants matched
    const plantGroups = Array.from(new Set(matchedPOs.map((m) => m.plantGroup)));
    if (plantGroups.length > 1) {
      return {
        status: "cross_plant_conflict",
        items: matchedPOs,
        plants: plantGroups.map((g) => KNOWN_PLANTS[g]?.name || g),
      };
    }

    return {
      status: "single_match",
      plantId: plantGroups[0],
      plantName: matchedPOs[0].plantName,
      poNumber: matchedPOs[0].po.po_number,
      totalMatches: matchedPOs.length,
    };
  }, [quickSearchInput, orders]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner & Quick Auto-Detect PO Bar */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-900 to-gray-950 p-6 rounded-2xl border border-gray-800 shadow-xl text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Sparkles className="w-3 h-3" />
                Factory-First Dispatch System
              </span>
              <span className="text-xs text-gray-400">· 5 Oniverse Plants</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Select Destination Factory Plant
            </h2>
            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
              To ensure compliance and avoid rejected dispatches, all shipments must be created for a single plant.
              Explore the factory hubs below or paste a PO number to auto-detect its destination.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {onSwitchToGlobalView && (
              <button
                type="button"
                onClick={onSwitchToGlobalView}
                className="h-10 px-4 text-xs font-semibold text-gray-300 bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Layers className="w-4 h-4 text-blue-400" />
                <span>All Orders (Global View)</span>
              </button>
            )}
          </div>
        </div>

        {/* PO Quick Auto-Detect Finder Input */}
        <div className="mt-5 pt-5 border-t border-gray-800/80">
          <div className="relative max-w-2xl">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={quickSearchInput}
              onChange={(e) => setQuickSearchInput(e.target.value)}
              placeholder="Have specific PO numbers? Paste here to auto-detect destination plant (e.g. 2001330500)..."
              className="w-full h-10 pl-10 pr-24 text-xs sm:text-sm bg-gray-950/70 border border-gray-700/80 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all shadow-inner"
            />
            {quickSearchInput && (
              <button
                type="button"
                onClick={() => setQuickSearchInput("")}
                className="absolute right-3 top-2.5 px-2 py-0.5 text-[11px] font-medium text-gray-400 hover:text-white bg-gray-800 rounded cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Quick Search Match Feedback */}
          {quickSearchMatch && (
            <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
              {quickSearchMatch.status === "single_match" && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/40 border border-emerald-600/40 text-emerald-200 text-xs shadow-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Found PO <span className="font-mono font-bold text-white">#{quickSearchMatch.poNumber}</span> destined for{" "}
                      <span className="font-semibold text-emerald-300">{quickSearchMatch.plantName}</span>
                      {quickSearchMatch.totalMatches && quickSearchMatch.totalMatches > 1 ? ` (+${quickSearchMatch.totalMatches - 1} more)` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenWithPO && quickSearchMatch.poNumber) {
                        onOpenWithPO(quickSearchMatch.plantId!, quickSearchMatch.poNumber);
                      } else if (quickSearchMatch.plantId) {
                        onSelectPlant(quickSearchMatch.plantId);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-all shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <span>Enter {KNOWN_PLANTS[quickSearchMatch.plantId!]?.name.replace(" Ltd", "")}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {quickSearchMatch.status === "cross_plant_conflict" && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs shadow-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong className="text-white">Multi-Plant Detected:</strong> These POs belong to multiple distinct plants (
                    {quickSearchMatch.plants?.join(", ")}). You must dispatch orders plant-by-plant.
                  </span>
                </div>
              )}

              {quickSearchMatch.status === "not_found" && (
                <div className="p-2.5 text-xs text-gray-400">
                  No active orders matching &ldquo;{quickSearchMatch.query}&rdquo; found. Try selecting a plant below to browse all available orders.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Zone24x7 Style 5-Column Horizontal Accordion Showcase ─── */}
      <div className="relative">
        <div className="flex flex-col lg:flex-row w-full min-h-[500px] lg:h-[540px] rounded-2xl overflow-hidden bg-gray-950 border border-gray-800 shadow-2xl">
          {Object.entries(KNOWN_PLANTS).map(([plantId, plant]) => {
            const isExpanded = activeHoverId === plantId;
            const stats = plantStats[plantId] || { totalOrders: 0, readyOrders: 0, locationsCount: 0, locationsList: [] };

            return (
              <div
                key={plantId}
                onMouseEnter={() => setActiveHoverId(plantId)}
                onClick={() => onSelectPlant(plantId)}
                style={{
                  backgroundImage: `url(${plant.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                className={cn(
                  "relative group cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden select-none",
                  isExpanded
                    ? "lg:flex-[3.8] min-h-[360px] lg:min-h-0"
                    : "lg:flex-1 min-h-[90px] lg:min-h-0 hover:bg-black/30"
                )}
              >
                {/* Dark Vignette & Gradient Overlays */}
                <div
                  className={cn(
                    "absolute inset-0 transition-opacity duration-500",
                    isExpanded
                      ? "bg-gradient-to-t from-gray-950 via-gray-950/80 to-gray-950/40 opacity-95"
                      : "bg-gradient-to-t from-gray-950 via-gray-950/85 to-gray-950/70 opacity-90 group-hover:opacity-75"
                  )}
                />

                {/* Ambient Plant Accent Glow */}
                <div
                  className="absolute inset-0 opacity-20 pointer-events-none transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(circle at bottom left, ${plant.accentHex} 0%, transparent 70%)`,
                  }}
                />

                {/* Top Highlight Line */}
                <div
                  className={cn(
                    "absolute top-0 left-0 right-0 h-1 transition-all duration-300",
                    isExpanded ? "opacity-100" : "opacity-30 group-hover:opacity-70"
                  )}
                  style={{ backgroundColor: plant.accentHex }}
                />

                {/* ─── COLLAPSED VIEW (Desktop Vertical Bar) ─── */}
                <div
                  className={cn(
                    "absolute inset-0 p-5 flex flex-col justify-between items-center transition-all duration-300 pointer-events-none",
                    isExpanded ? "opacity-0 invisible" : "opacity-100 visible"
                  )}
                >
                  <div className="w-full flex items-center justify-center">
                    <span
                      className="px-2 py-1 rounded-md text-[11px] font-mono font-bold tracking-wider text-white shadow-xs border border-white/10"
                      style={{ backgroundColor: `${plant.accentHex}40` }}
                    >
                      {plant.codePrefix}
                    </span>
                  </div>

                  <div className="hidden lg:flex items-center justify-center my-auto">
                    <span
                      className="text-xs sm:text-sm font-bold tracking-widest text-gray-300 uppercase whitespace-nowrap"
                      style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                      }}
                    >
                      {plant.name.replace(" Ltd", "")}
                    </span>
                  </div>

                  {/* Mobile horizontal summary */}
                  <div className="lg:hidden flex items-center justify-between w-full">
                    <span className="text-sm font-bold text-white">{plant.name}</span>
                    <span className="text-xs font-semibold text-gray-300">{stats.totalOrders} POs</span>
                  </div>

                  <div className="w-full flex items-center justify-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-gray-300 border border-white/10">
                      {stats.totalOrders} POs
                    </span>
                  </div>
                </div>

                {/* ─── EXPANDED VIEW (Full Content Card) ─── */}
                <div
                  className={cn(
                    "relative h-full p-6 sm:p-8 flex flex-col justify-between z-10 transition-all duration-500",
                    isExpanded ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                  )}
                >
                  {/* Top Metadata & Hashtags */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-wider text-white border border-white/15 uppercase shadow-xs"
                        style={{ backgroundColor: plant.accentHex }}
                      >
                        {plant.badge}
                      </span>
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-white/10 text-gray-300 border border-white/10">
                        {plant.codePrefix}1 / {plant.codePrefix}2
                      </span>
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Ready for Dispatch
                      </span>
                    </div>

                    {/* Hashtags like Zone24x7 */}
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-mono text-gray-400">
                      {plant.hashtags.map((tag) => (
                        <span key={tag} className="hover:text-gray-200 transition-colors">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Middle / Bottom Content */}
                  <div className="space-y-4 mt-8 lg:mt-0">
                    <div>
                      <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase drop-shadow-sm">
                        {plant.name}
                      </h3>
                      <p className="text-xs sm:text-sm font-medium text-gray-300 mt-1 flex items-center gap-2">
                        <span>{plant.location}</span>
                        <span>·</span>
                        <span className="text-gray-400">{plant.tagline}</span>
                      </p>
                    </div>

                    <p className="text-xs sm:text-sm text-gray-300/90 leading-relaxed max-w-xl line-clamp-3">
                      {plant.description}
                    </p>

                    {/* Live Statistics Counters */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 max-w-lg">
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                        <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                          Active Orders
                        </div>
                        <div className="text-lg font-bold text-white mt-0.5">
                          {stats.totalOrders}
                          <span className="text-[11px] font-normal text-gray-400 ml-1">POs</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                        <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                          Delivery Stores
                        </div>
                        <div className="text-lg font-bold text-white mt-0.5">
                          {stats.locationsCount > 0 ? stats.locationsCount : plant.storageLocationsHint.length}
                          <span className="text-[11px] font-normal text-gray-400 ml-1">locations</span>
                        </div>
                      </div>

                      <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                        <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                          Dispatch Status
                        </div>
                        <div className="text-xs font-semibold text-emerald-400 mt-1.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Single-Plant OK</span>
                        </div>
                      </div>
                    </div>

                    {/* Zone24x7 Call To Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3 pt-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPlant(plantId);
                        }}
                        className={cn(
                          "h-11 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-lg transition-all transform active:scale-95 flex items-center gap-2 cursor-pointer",
                          isSupplier
                            ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50"
                            : "bg-red-600 hover:bg-red-500 shadow-red-950/50"
                        )}
                      >
                        <span>Enter Plant</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPlant(plantId);
                        }}
                        className="h-11 px-5 rounded-xl font-semibold text-xs text-gray-200 bg-white/10 hover:bg-white/20 border border-white/15 transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-xs"
                      >
                        <Warehouse className="w-4 h-4 text-gray-300" />
                        <span>Filter By Storage Location</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
