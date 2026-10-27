import { useState, useMemo } from "react";
import {
  ArrowRight,
  MapPin,
  Warehouse,
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
  onOpenWithPO: _onOpenWithPO,
  onSwitchToGlobalView: _onSwitchToGlobalView,
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

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300 w-full">

      {/* ─── 5-Column Horizontal Accordion Showcase (Responsive Full Height) ─── */}
      <div className="relative w-full">
        <div className="flex flex-col lg:flex-row w-full min-h-[520px] lg:h-[calc(100vh-130px)] lg:min-h-[580px] lg:max-h-[880px] rounded-2xl overflow-hidden bg-gray-950 border border-gray-800 shadow-2xl">
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
                    ? "lg:flex-[3.5] xl:flex-[4.2] min-h-[380px] lg:min-h-0"
                    : "lg:flex-1 min-h-[75px] sm:min-h-[85px] lg:min-h-0 hover:bg-black/30"
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

                {/* ─── COLLAPSED VIEW (Desktop Vertical Bar & Mobile Quick Strip) ─── */}
                <div
                  className={cn(
                    "absolute inset-0 p-4 sm:p-5 flex flex-col justify-between items-center transition-all duration-300 pointer-events-none",
                    isExpanded ? "opacity-0 invisible" : "opacity-100 visible"
                  )}
                >
                  <div className="w-full flex items-center justify-center">
                    <span
                      className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold tracking-wider text-white shadow-xs border border-white/10"
                      style={{ backgroundColor: `${plant.accentHex}40` }}
                    >
                      {plant.defaultCode}
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
                  <div className="lg:hidden flex items-center justify-between w-full px-2">
                    <span className="text-sm font-bold text-white">{plant.name}</span>
                    <span className="text-xs font-semibold text-gray-300">{stats.totalOrders} POs</span>
                  </div>

                  <div className="w-full flex items-center justify-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-gray-300 border border-white/10 backdrop-blur-xs">
                      {stats.totalOrders} POs
                    </span>
                  </div>
                </div>

                {/* ─── EXPANDED VIEW (Full Content Card) ─── */}
                <div
                  className={cn(
                    "relative h-full p-6 sm:p-8 lg:p-10 flex flex-col justify-between z-10 transition-all duration-500",
                    isExpanded ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                  )}
                >
                  {/* Top Metadata */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-3 py-1 rounded-lg text-xs font-mono font-bold tracking-wider text-white border border-white/15 uppercase shadow-sm"
                          style={{ backgroundColor: plant.accentHex }}
                        >
                          {plant.defaultCode}
                        </span>
                        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 backdrop-blur-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Direct Dispatch Hub
                        </span>
                      </div>

                      <span className="text-[11px] font-medium text-slate-400 hidden xl:inline-block">
                        Destination Factory
                      </span>
                    </div>
                  </div>

                  {/* Middle / Bottom Content */}
                  <div className="space-y-4 sm:space-y-5 mt-6 lg:mt-0 max-w-2xl">
                    <div>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white uppercase drop-shadow-md">
                        {plant.name}
                      </h3>
                      <p className="text-xs sm:text-sm font-medium text-slate-300 mt-1 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{plant.location}, Sri Lanka</span>
                      </p>
                    </div>

                    {/* Live Statistics Counters (3-column responsive) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-1">
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                        <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                          Active Orders
                        </div>
                        <div className="text-lg sm:text-xl font-bold text-white mt-0.5">
                          {stats.totalOrders}
                          <span className="text-[11px] font-normal text-gray-400 ml-1">POs</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                        <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                          Ready Orders
                        </div>
                        <div className="text-lg sm:text-xl font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                          {stats.readyOrders}
                          <span className="text-[11px] font-normal text-gray-400 ml-1">to dispatch</span>
                        </div>
                      </div>

                      <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                        <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                          Delivery Stores
                        </div>
                        <div className="text-lg sm:text-xl font-bold text-white mt-0.5">
                          {stats.locationsCount > 0 ? stats.locationsCount : plant.storageLocationsHint.length}
                          <span className="text-[11px] font-normal text-gray-400 ml-1">locations</span>
                        </div>
                      </div>
                    </div>

                    {/* Storage Locations hints */}
                    {plant.storageLocationsHint && plant.storageLocationsHint.length > 0 && (
                      <div className="hidden sm:flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-gray-400 font-medium mr-1 flex items-center gap-1">
                          <Warehouse className="w-3 h-3 text-gray-400" />
                          Stores:
                        </span>
                        {plant.storageLocationsHint.map((loc) => {
                          const cleanLoc = loc.match(/\b\d{4}\b/)?.[0] || loc.trim();
                          return (
                            <span
                              key={loc}
                              className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-white/10 text-gray-200 border border-white/10 backdrop-blur-xs"
                            >
                              {cleanLoc}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Call To Action Button (Primary CTA) */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPlant(plantId);
                        }}
                        className={cn(
                          "h-11 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-lg transition-all transform active:scale-95 flex items-center gap-2 cursor-pointer",
                          isSupplier
                            ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-950/30"
                            : "bg-brand-600 hover:bg-brand-700 shadow-blue-950/30"
                        )}
                      >
                        <span>View Plant Orders ({stats.totalOrders})</span>
                        <ArrowRight className="w-4 h-4" />
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
