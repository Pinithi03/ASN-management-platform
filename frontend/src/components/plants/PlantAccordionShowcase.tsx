import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Lock, MapPin, Warehouse } from "lucide-react";
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

const EMPTY_STATS: PlantStats = {
  totalOrders: 0,
  readyOrders: 0,
  historicalOrders: 0,
  isUnlocked: false,
  locationsCount: 0,
  locationsList: [],
};

/**
 * Destination plant selection.
 *
 * A plain radio-card grid: white cards, the selected card turns dark.
 * Selecting a card does not navigate; the "open" button below does,
 * so users can compare plants first and keyboard users can move freely.
 */
export default function PlantAccordionShowcase({
  orders,
  onSelectPlant,
  ctaLabel,
}: PlantAccordionShowcaseProps) {
  const { t } = useTranslation("purchaseOrders");
  const cta = ctaLabel ?? t("gateway.ctaDefault");

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

  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Radio-group keyboard behaviour: arrows move between unlocked plants.
  const handleKeyDown = (e: React.KeyboardEvent, plantId: string) => {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const backward = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !backward) {
      if (e.key === "Enter" && plantStats[plantId]?.isUnlocked) {
        e.preventDefault();
        onSelectPlant(plantId);
      }
      return;
    }
    e.preventDefault();
    if (unlockedIds.length === 0) return;
    const idx = unlockedIds.indexOf(plantId);
    const next = unlockedIds[(idx + (forward ? 1 : -1) + unlockedIds.length) % unlockedIds.length];
    setSelectedId(next);
    cardRefs.current[next]?.focus();
  };

  const selectedPlant = selectedId ? KNOWN_PLANTS[selectedId] : undefined;
  const selectedStats = (selectedId && plantStats[selectedId]) || EMPTY_STATS;

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t("gateway.selectHeading")}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{t("gateway.selectHint")}</p>
      </div>

      <div
        role="radiogroup"
        aria-label={t("gateway.selectHeading")}
        className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
      >
        {plantIds.map((plantId) => {
          const plant = KNOWN_PLANTS[plantId];
          const stats = plantStats[plantId] || EMPTY_STATS;
          const isUnlocked = stats.isUnlocked;
          const isSelected = selectedId === plantId;

          return (
            <button
              key={plantId}
              ref={(el) => {
                cardRefs.current[plantId] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={!isUnlocked}
              disabled={!isUnlocked}
              tabIndex={isSelected || (!selectedId && plantId === unlockedIds[0]) ? 0 : -1}
              onClick={() => isUnlocked && setSelectedId(plantId)}
              onDoubleClick={() => isUnlocked && onSelectPlant(plantId)}
              onKeyDown={(e) => handleKeyDown(e, plantId)}
              title={
                isUnlocked
                  ? t("gateway.openTitle", { plant: plant.name, count: stats.totalOrders })
                  : t("gateway.lockedTitle", { plant: plant.name })
              }
              className={cn(
                "relative text-left rounded-lg border p-4 transition-colors duration-150 motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                isSelected
                  ? "bg-slate-900 border-slate-900 text-white"
                  : isUnlocked
                  ? "bg-white border-slate-200 text-slate-900 hover:border-slate-300 hover:shadow-sm cursor-pointer"
                  : "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              {isSelected && (
                <span className="absolute top-3 right-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-900">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
              {!isUnlocked && <Lock className="absolute top-3 right-3 h-4 w-4 text-slate-400" aria-hidden="true" />}

              <span className={cn("font-mono text-xs", isSelected ? "text-slate-300" : "text-slate-500")}>
                {plant.defaultCode}
              </span>
              <span className="mt-1 block pr-6 text-sm font-semibold leading-snug">{plant.name}</span>
              <span className={cn("mt-0.5 flex items-center gap-1 text-xs", isSelected ? "text-slate-300" : "text-slate-500")}>
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {plant.location}
              </span>

              <span className="mt-3 block">
                {isUnlocked ? (
                  <>
                    <span className="text-2xl font-semibold tabular-nums">{stats.totalOrders}</span>
                    <span className={cn("ml-1.5 text-xs", isSelected ? "text-slate-300" : "text-slate-500")}>
                      {t("gateway.activeOrders")}
                    </span>
                  </>
                ) : (
                  <span className="text-xs">{t("gateway.locked")} · {t("gateway.zeroPos")}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {selectedPlant && selectedStats.isUnlocked && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{selectedPlant.name}</div>
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
          <button
            type="button"
            onClick={() => onSelectPlant(selectedId)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {t("gateway.cta", { label: cta, count: selectedStats.totalOrders })}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
