import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Lock,
  MapPin,
  Warehouse,
} from "lucide-react";
import { KNOWN_PLANTS, resolvePlantAndLocation } from "@/utils/plantResolver";
import type { PurchaseOrder } from "@/types/email";
import { cn } from "@/utils/cn";

export interface PlantStats {
  totalOrders: number;
  readyOrders: number;
  historicalOrders: number;
  isUnlocked: boolean;
  locationsCount: number;
  locationsList: string[];
}

interface PlantAccordionShowcaseProps {
  orders: PurchaseOrder[];
  onSelectPlant: (plantId: string, location?: string) => void;
  onOpenWithPO?: (plantId: string, poNumber: string) => void;
  onSwitchToGlobalView?: () => void;
  isSupplier?: boolean;
  ctaLabel?: string;
}

export default function PlantAccordionShowcase({
  orders,
  onSelectPlant,
  onOpenWithPO: _onOpenWithPO,
  onSwitchToGlobalView: _onSwitchToGlobalView,
  isSupplier = false,
  ctaLabel,
}: PlantAccordionShowcaseProps) {
  const { t } = useTranslation("purchaseOrders");
  const cta = ctaLabel ?? t("gateway.ctaDefault");

  // Compute live statistics & permanent unlock/store state per plant
  const plantStats = useMemo(() => {
    const stats: Record<string, PlantStats> = {
      OMEGA: { totalOrders: 0, readyOrders: 0, historicalOrders: 0, isUnlocked: false, locationsCount: 0, locationsList: [] },
      ALPHA: { totalOrders: 0, readyOrders: 0, historicalOrders: 0, isUnlocked: false, locationsCount: 0, locationsList: [] },
      BENJI: { totalOrders: 0, readyOrders: 0, historicalOrders: 0, isUnlocked: false, locationsCount: 0, locationsList: [] },
      SIRIO: { totalOrders: 0, readyOrders: 0, historicalOrders: 0, isUnlocked: false, locationsCount: 0, locationsList: [] },
      VAVUNIYA: { totalOrders: 0, readyOrders: 0, historicalOrders: 0, isUnlocked: false, locationsCount: 0, locationsList: [] },
    };

    const locSets: Record<string, Set<string>> = {
      OMEGA: new Set(),
      ALPHA: new Set(),
      BENJI: new Set(),
      SIRIO: new Set(),
      VAVUNIYA: new Set(),
    };

    orders.forEach((po) => {
      if (po.status === "CANCELLED") {
        return;
      }
      const dest = po.delivery_address || po.destination || po.client_code;
      const res = resolvePlantAndLocation(dest, po.client_code);
      const group = res.plantGroup;
      if (stats[group]) {
        // Any PO ever received (active or COMPLETED) permanently unlocks this plant & registers its store location
        stats[group].historicalOrders += 1;
        stats[group].isUnlocked = true;

        const loc = res.storageLocation || "0101";
        if (loc) locSets[group].add(loc);

        // Only count non-completed orders towards active/ready PO counters
        if (po.status !== "COMPLETED") {
          stats[group].totalOrders += 1;
          stats[group].readyOrders += 1;
        }
      }
    });

    Object.keys(stats).forEach((k) => {
      stats[k].locationsCount = locSets[k].size;
      stats[k].locationsList = Array.from(locSets[k]).sort();
    });

    return stats;
  }, [orders]);

  // Determine initial active plant (unlocked plant with most active orders, or first unlocked plant)
  const defaultPlantId = useMemo(() => {
    let best = "";
    let max = -1;
    Object.entries(plantStats).forEach(([id, st]) => {
      if (st.isUnlocked && st.totalOrders > max) {
        max = st.totalOrders;
        best = id;
      }
    });
    return best || "OMEGA";
  }, [plantStats]);

  const [activeHoverId, setActiveHoverId] = useState<string>(defaultPlantId);

  useEffect(() => {
    if (plantStats[activeHoverId] && !plantStats[activeHoverId].isUnlocked && plantStats[defaultPlantId]?.isUnlocked) {
      setActiveHoverId(defaultPlantId);
    }
  }, [plantStats, activeHoverId, defaultPlantId]);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300 w-full">

      {/* ─── 5-Column Horizontal Accordion Showcase (Responsive Full Height) ─── */}
      <div className="relative w-full">
        <div
          className="relative flex flex-col lg:flex-row w-full min-h-[520px] lg:h-[calc(100vh-130px)] lg:min-h-[580px] lg:max-h-[880px] rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-gray-950 bg-cover bg-center"
          style={{
            backgroundImage: "url('/images/logistics-network.jpg')",
          }}
        >
          {Object.entries(KNOWN_PLANTS).map(([plantId, plant]) => {
            const isExpanded = activeHoverId === plantId;
            const stats = plantStats[plantId] || {
              totalOrders: 0,
              readyOrders: 0,
              historicalOrders: 0,
              isUnlocked: false,
              locationsCount: 0,
              locationsList: [],
            };
            const isUnlocked = stats.isUnlocked;

            return (
              <div
                key={plantId}
                onMouseEnter={() => {
                  if (isUnlocked) setActiveHoverId(plantId);
                }}
                onClick={() => {
                  if (isUnlocked) onSelectPlant(plantId);
                }}
                title={
                  isUnlocked
                    ? t("gateway.openTitle", { plant: plant.name, count: stats.totalOrders })
                    : t("gateway.lockedTitle", { plant: plant.name })
                }
                className={cn(
                  "relative group transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden select-none",
                  isUnlocked ? "cursor-pointer" : "cursor-not-allowed",
                  isExpanded
                    ? "lg:flex-[3.5] xl:flex-[4.2] min-h-[380px] lg:min-h-0"
                    : "lg:flex-1 min-h-[75px] sm:min-h-[85px] lg:min-h-0 hover:bg-black/20"
                )}
              >
                {/* Dark Vignette & Gradient Overlays */}
                <div
                  className={cn(
                    "absolute inset-0 transition-all duration-500",
                    isExpanded
                      ? "bg-gradient-to-t from-gray-950 via-gray-950/85 to-gray-950/45 opacity-95"
                      : "bg-gray-950/75 hover:bg-gray-950/60 opacity-100"
                  )}
                />

                {/* Ambient Plant Accent Glow */}
                <div
                  className="absolute inset-0 opacity-25 pointer-events-none transition-opacity duration-500"
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
                  <div className="w-full flex flex-col items-center justify-center gap-1.5">
                    <span
                      className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold tracking-wider text-white shadow-xs border border-white/10"
                      style={{ backgroundColor: `${plant.accentHex}40` }}
                    >
                      {plant.defaultCode}
                    </span>
                    {!isUnlocked && (
                      <Lock className="w-3.5 h-3.5 text-gray-300 hidden lg:block" />
                    )}
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
                    <span className={cn("text-sm font-bold flex items-center gap-2", isUnlocked ? "text-white" : "text-gray-400")}>
                      {!isUnlocked && <Lock className="w-4 h-4 text-gray-400" />}
                      {plant.name}
                    </span>
                    <span className="px-3 py-1 rounded-full text-sm font-bold bg-white/10 text-gray-200 border border-white/10">
                      {t("gateway.mobileCount", { count: stats.totalOrders })}
                    </span>
                  </div>

                  {/* Desktop Bottom Badge — Prominent Active POs Counter (Neutral Frosted Glass, No Accent Colors) */}
                  <div className="hidden lg:flex w-full items-center justify-center">
                    {isUnlocked ? (
                      <div className="px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs flex flex-col items-center justify-center min-w-[92px] transition-all duration-300 group-hover:scale-105">
                        <span className="text-2xl xl:text-3xl font-black leading-none tracking-tight text-white">
                          {stats.totalOrders}
                        </span>
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-300 mt-1">
                          {t("gateway.badgeUnit", { count: stats.totalOrders })}
                        </span>
                      </div>
                    ) : (
                      <div className="px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs flex flex-col items-center justify-center min-w-[92px]">
                        <Lock className="w-5 h-5 text-gray-400 mb-1" />
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
                          {t("gateway.locked")}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-500 mt-0.5">
                          {t("gateway.zeroPos")}
                        </span>
                      </div>
                    )}
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
                        {isUnlocked ? (
                          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 backdrop-blur-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {t("gateway.directHub")}
                          </span>
                        ) : (
                          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-amber-300 bg-amber-950/60 border border-amber-500/30 backdrop-blur-xs">
                            <Lock className="w-3 h-3 text-amber-400" />
                            {t("gateway.plantLocked")}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] font-medium text-slate-400 hidden xl:inline-block">
                        {t("gateway.destinationFactory")}
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
                        <span>{t("gateway.locationCountry", { location: plant.location })}</span>
                      </p>
                    </div>

                    {/* Live Statistics Counters (3-column responsive) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-1">
                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                        <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                          {t("gateway.activeOrders")}
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-white mt-0.5">
                          {stats.totalOrders}
                          <span className="text-xs font-medium text-gray-400 ml-1.5">{t("gateway.posUnit", { count: stats.totalOrders })}</span>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                        <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                          {t("gateway.readyOrders")}
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5 flex items-center gap-1">
                          {stats.readyOrders}
                          <span className="text-xs font-medium text-gray-400 ml-1.5">{t("gateway.toDispatch")}</span>
                        </div>
                      </div>

                      <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                        <div className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
                          {t("gateway.deliveryStores")}
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-white mt-0.5">
                          {stats.locationsCount}
                          <span className="text-xs font-medium text-gray-400 ml-1.5">{t("gateway.locations")}</span>
                        </div>
                      </div>
                    </div>

                    {/* Discovered Storage Locations (Only stores that have received POs) */}
                    {stats.locationsList.length > 0 && (
                      <div className="hidden sm:flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-gray-400 font-medium mr-1 flex items-center gap-1">
                          <Warehouse className="w-3 h-3 text-gray-400" />
                          {t("gateway.stores")}
                        </span>
                        {stats.locationsList.map((loc) => (
                          <button
                            key={loc}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isUnlocked) onSelectPlant(plantId, loc);
                            }}
                            className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-white/10 hover:bg-white/20 text-gray-200 border border-white/15 backdrop-blur-xs transition-colors cursor-pointer"
                            title={t("gateway.storeTitle", { plant: plant.name, store: loc })}
                          >
                            {loc}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Call To Action Button (Primary CTA) */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      {isUnlocked ? (
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
                          <span>{t("gateway.cta", { label: cta, count: stats.totalOrders })}</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="h-11 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-gray-400 bg-gray-800/80 border border-gray-700 cursor-not-allowed flex items-center gap-2"
                        >
                          <Lock className="w-4 h-4 text-amber-400/80" />
                          <span>{t("gateway.lockedCta")}</span>
                        </button>
                      )}
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
