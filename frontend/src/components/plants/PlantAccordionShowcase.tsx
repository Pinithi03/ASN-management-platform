import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Lock, MapPin, Warehouse } from "lucide-react";
import { KNOWN_PLANTS, resolvePlantAndLocation } from "@/utils/plantResolver";
import type { PurchaseOrder } from "@/types/email";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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

const EMPTY_STATS: PlantStats = {
  totalOrders: 0,
  readyOrders: 0,
  historicalOrders: 0,
  isUnlocked: false,
  locationsCount: 0,
  locationsList: [],
};

/**
 * Destination plant selection: a simple hover accordion (as on zone24x7.com), no images.
 *
 * Desktop (≥ 1024 px): one row of panels, 200 px tall. The hovered panel widens
 * (flex-grow 1 → 2.5, 400 ms ease-out) and shows the location and store count;
 * with nothing hovered, the selected panel stays widened. Code, name and the
 * active-order count are always visible.
 * Selected: navy with white text and a check. Locked (no POs yet): grey, never widens.
 * Click selects, double-click / Enter opens; the summary bar below also opens.
 * Below 1024 px panels stack vertically with no width animation.
 * motion-reduce: no width or opacity transition, only instant colour changes.
 */
export default function PlantAccordionShowcase({ orders, onSelectPlant, ctaLabel }: PlantAccordionShowcaseProps) {
  const { t } = useTranslation("purchaseOrders");
  const cta = ctaLabel ?? t("gateway.ctaDefault");
  const isStacked = !useMediaQuery("(min-width: 1024px)");

  const plantStats = useMemo(() => {
    const stats: Record<string, PlantStats> = {};
    const locSets: Record<string, Set<string>> = {};
    Object.keys(KNOWN_PLANTS).forEach((id) => {
      stats[id] = { ...EMPTY_STATS, locationsList: [] };
      locSets[id] = new Set();
    });

    orders.forEach((po) => {
      if (po.status === "CANCELLED") return;
      const dest = po.delivery_address || po.destination || po.client_code;
      const res = resolvePlantAndLocation(dest, po.client_code);
      const group = res.plantGroup;
      if (!stats[group]) return;
      // Any PO ever received (active or completed) unlocks the plant and registers its store.
      stats[group].historicalOrders += 1;
      stats[group].isUnlocked = true;
      locSets[group].add(res.storageLocation || "0101");
      if (po.status !== "COMPLETED") {
        stats[group].totalOrders += 1;
        stats[group].readyOrders += 1;
      }
    });

    Object.keys(stats).forEach((k) => {
      stats[k].locationsCount = locSets[k].size;
      stats[k].locationsList = Array.from(locSets[k]).sort();
    });
    return stats;
  }, [orders]);

  const plantIds = Object.keys(KNOWN_PLANTS);
  const unlockedIds = plantIds.filter((id) => plantStats[id]?.isUnlocked);

  // Default: the unlocked plant with the most active orders.
  const defaultPlantId = useMemo(() => {
    let best = "";
    let max = -1;
    unlockedIds.forEach((id) => {
      if (plantStats[id].totalOrders > max) {
        max = plantStats[id].totalOrders;
        best = id;
      }
    });
    return best;
  }, [plantStats, unlockedIds]);

  const [selectedId, setSelectedId] = useState<string>(defaultPlantId);
  useEffect(() => {
    if (!selectedId || !plantStats[selectedId]?.isUnlocked) setSelectedId(defaultPlantId);
  }, [plantStats, selectedId, defaultPlantId]);

  // The widened panel: the hovered one, otherwise the selected one.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const expandedId = hoverId ?? selectedId;

  const panelRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Radio-group keyboard behaviour: arrow keys move between unlocked plants and select them,
  // Enter opens the plant's orders, Space selects (native button click).
  const handleKeyDown = (e: React.KeyboardEvent, plantId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (plantStats[plantId]?.isUnlocked) onSelectPlant(plantId);
      return;
    }
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const backward = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !backward) return;
    e.preventDefault();
    if (unlockedIds.length === 0) return;
    const idx = unlockedIds.indexOf(plantId);
    const next = unlockedIds[(idx + (forward ? 1 : -1) + unlockedIds.length) % unlockedIds.length];
    setSelectedId(next);
    panelRefs.current[next]?.focus();
  };

  const selectedPlant = selectedId ? KNOWN_PLANTS[selectedId] : undefined;
  const selectedStats = (selectedId && plantStats[selectedId]) || EMPTY_STATS;

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t("gateway.selectHeading")}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{t("gateway.selectHint")}</p>
      </div>

      <div
        role="radiogroup"
        aria-label={t("gateway.selectHeading")}
        onMouseLeave={() => setHoverId(null)}
        className={cn(
          "flex w-full overflow-hidden rounded-xl border border-slate-200 bg-white",
          isStacked ? "flex-col" : "h-[200px] flex-row"
        )}
      >
        {plantIds.map((plantId, index) => {
          const plant = KNOWN_PLANTS[plantId];
          const stats = plantStats[plantId] || EMPTY_STATS;
          const isUnlocked = stats.isUnlocked;
          const isSelected = selectedId === plantId;
          const isExpanded = !isStacked && isUnlocked && expandedId === plantId;

          return (
            <button
              key={plantId}
              ref={(el) => {
                panelRefs.current[plantId] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={!isUnlocked}
              disabled={!isUnlocked}
              tabIndex={isSelected || (!selectedId && plantId === unlockedIds[0]) ? 0 : -1}
              onClick={() => isUnlocked && setSelectedId(plantId)}
              onDoubleClick={() => isUnlocked && onSelectPlant(plantId)}
              onMouseEnter={() => setHoverId(isUnlocked ? plantId : null)}
              onKeyDown={(e) => handleKeyDown(e, plantId)}
              title={
                isUnlocked
                  ? t("gateway.openTitle", { plant: plant.name, count: stats.totalOrders })
                  : t("gateway.lockedTitle", { plant: plant.name })
              }
              style={isStacked ? undefined : { flexGrow: isExpanded ? 2.5 : 1, flexBasis: 0 }}
              className={cn(
                "relative min-w-0 overflow-hidden text-left outline-none",
                "transition-[flex-grow,background-color,color] duration-[400ms] ease-out-soft motion-reduce:transition-none",
                // Inset ring: the row clips overflow, so an outer offset ring would be cut off.
                "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset",
                index > 0 && (isStacked ? "border-t border-slate-200" : "border-l border-slate-200"),
                isStacked
                  ? "flex min-h-[72px] w-full items-center gap-4 px-4 py-3"
                  : "flex h-full flex-col justify-between p-4",
                isSelected
                  ? "bg-brand-900 text-white focus-visible:ring-white"
                  : isUnlocked
                  ? "bg-white text-slate-900 hover:bg-slate-50 cursor-pointer focus-visible:ring-primary"
                  : "bg-slate-50 text-slate-400 cursor-not-allowed"
              )}
            >
              {/* Top-right marker: check (selected) or lock (locked) */}
              {isSelected && (
                <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-brand-900">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
              {!isUnlocked && <Lock className="absolute right-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />}

              {/* Code + name (always visible); location + store count only when widened */}
              <span className={cn("block min-w-0 pr-7", isStacked && "flex-1")}>
                <span
                  className={cn(
                    "block font-mono text-xs uppercase tracking-[0.06em]",
                    isSelected ? "text-blue-100" : isUnlocked ? "text-slate-500" : "text-slate-400"
                  )}
                >
                  {plant.defaultCode}
                </span>
                <span className="mt-1 block truncate font-heading text-base font-semibold">{plant.name}</span>

                {!isStacked && isUnlocked && (
                  <span
                    aria-hidden={!isExpanded}
                    className={cn(
                      "mt-2 block space-y-0.5 whitespace-nowrap text-sm transition-opacity motion-reduce:transition-none",
                      isExpanded ? "opacity-100 duration-200 delay-100" : "opacity-0 duration-100",
                      isSelected ? "text-blue-100" : "text-slate-500"
                    )}
                  >
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {plant.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Warehouse className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {t("gateway.storeCount", { count: stats.locationsCount })}
                    </span>
                  </span>
                )}
              </span>

              {/* Active orders (always visible) or the locked state */}
              {isUnlocked ? (
                <span className={cn("block whitespace-nowrap", isStacked && "text-right")}>
                  <span className="block text-2xl font-bold leading-none tabular-nums">{stats.totalOrders}</span>
                  <span className={cn("mt-1 block text-xs", isSelected ? "text-blue-100" : "text-slate-500")}>
                    {t("gateway.activeOrders")}
                  </span>
                </span>
              ) : (
                <span className="block whitespace-nowrap text-xs">
                  {t("gateway.locked")} · {t("gateway.zeroPos")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedPlant && selectedStats.isUnlocked && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-heading text-sm font-medium text-slate-900">{selectedPlant.name}</div>
            {selectedStats.locationsList.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 flex items-center gap-1 text-xs text-slate-500">
                  <Warehouse className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("gateway.stores")}
                </span>
                {selectedStats.locationsList.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => onSelectPlant(selectedId, loc)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title={t("gateway.storeTitle", { plant: selectedPlant.name, store: loc })}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => onSelectPlant(selectedId)} className="btn btn-primary h-10 shrink-0">
            {t("gateway.cta", { label: cta, count: selectedStats.totalOrders })}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
