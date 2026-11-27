import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Lock, MapPin } from "lucide-react";
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

const EASE_OUT_SOFT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** "Omega Line Ltd" → "Omega Line" (for the vertical label). */
const shortName = (name: string) => name.replace(/\s+ltd\.?$/i, "");

/**
 * Destination plant selection: tall full-height expanding panels (zone24x7 style), light and plain.
 *
 * Desktop (≥ 1024 px): one row of equal-height panels filling the window height.
 *   Closed panel: code tag, vertical name, active-order count.
 *   Open panel (hovered, otherwise the selected one; flex-grow 1 → 3.2, 500 ms):
 *   name, location, stat boxes, store chips and the "View Plant Orders" button.
 *   Closed content fades out in 120 ms; open content fades in after 180 ms, so text
 *   never squashes during the width animation. Hidden content is visibility:hidden
 *   (not clickable, not tabbable).
 * Selected: navy with white text and a check. Locked (no POs yet): grey, never widens.
 * Click selects, double-click / Enter opens, arrow keys move the selection.
 * Below 1024 px: stacked rows; the selected row expands below itself with stores + button.
 * prefers-reduced-motion: widths and contents switch instantly, colours still fade.
 */
export default function PlantAccordionShowcase({ orders, onSelectPlant, ctaLabel }: PlantAccordionShowcaseProps) {
  const { t } = useTranslation("purchaseOrders");
  const cta = ctaLabel ?? t("gateway.ctaDefault");
  const isStacked = !useMediaQuery("(min-width: 1024px)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

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

  // The open (widened) panel: the hovered one, otherwise the selected one.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const openId = hoverId ?? selectedId;

  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Radio-group keyboard behaviour: arrows move the selection (and open that panel),
  // Enter opens the plant's orders, Space selects.
  const handleKeyDown = (e: React.KeyboardEvent, plantId: string) => {
    if (e.target !== e.currentTarget) return; // keys on the chips / button inside
    if (e.key === "Enter") {
      e.preventDefault();
      if (plantStats[plantId]?.isUnlocked) onSelectPlant(plantId);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      if (plantStats[plantId]?.isUnlocked) setSelectedId(plantId);
      return;
    }
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const backward = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !backward) return;
    e.preventDefault();
    if (unlockedIds.length === 0) return;
    const idx = unlockedIds.indexOf(plantId);
    const next = unlockedIds[(idx + (forward ? 1 : -1) + unlockedIds.length) % unlockedIds.length];
    setHoverId(null);
    setSelectedId(next);
    panelRefs.current[next]?.focus();
  };

  /* ── Shared pieces ─────────────────────────────────────────── */

  const codeTag = (code: string, selected: boolean, unlocked: boolean) => (
    <span
      className={cn(
        "inline-block shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs uppercase tracking-[0.06em] transition-colors duration-200",
        selected
          ? "border-white/30 text-white"
          : unlocked
          ? "border-slate-200 text-slate-600"
          : "border-slate-200 text-slate-400"
      )}
    >
      {code}
    </span>
  );

  const storeChips = (plantId: string, plantName: string, stores: string[], selected: boolean) =>
    stores.length > 0 && (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("mr-1 text-xs", selected ? "text-blue-100" : "text-slate-500")}>{t("gateway.stores")}</span>
        {stores.map((loc) => (
          <button
            key={loc}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPlant(plantId, loc);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            title={t("gateway.storeTitle", { plant: plantName, store: loc })}
            className={cn(
              "cursor-pointer rounded-md border px-2 py-0.5 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2",
              selected
                ? "border-white/30 text-white hover:bg-white/10 focus-visible:ring-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-primary"
            )}
          >
            {loc}
          </button>
        ))}
      </div>
    );

  const openButton = (plantId: string, stats: PlantStats, selected: boolean, fullWidth = false) => (
    <button
      type="button"
      disabled={!stats.isUnlocked}
      onClick={(e) => {
        e.stopPropagation();
        onSelectPlant(plantId);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-6 font-heading text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        fullWidth && "w-full sm:w-auto",
        !stats.isUnlocked
          ? "cursor-not-allowed bg-slate-200 text-slate-500"
          : selected
          ? "cursor-pointer bg-white text-brand-900 hover:bg-blue-50 focus-visible:ring-white focus-visible:ring-offset-brand-900"
          : "cursor-pointer bg-brand-900 text-white hover:bg-brand-800 focus-visible:ring-primary"
      )}
    >
      {stats.isUnlocked ? (
        <>
          {t("gateway.cta", { label: cta, count: stats.totalOrders })}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </>
      ) : (
        t("gateway.lockedCta")
      )}
    </button>
  );

  const checkCircle = (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-brand-900">
      <Check className="h-4 w-4" aria-hidden="true" />
    </span>
  );

  // Fade layers: visibility is part of the transition so hidden content can't be clicked / tabbed.
  const layer = (visible: boolean) =>
    cn(
      "transition-[opacity,visibility] motion-reduce:transition-none motion-reduce:delay-0",
      visible ? "visible opacity-100 duration-200 delay-[180ms]" : "invisible opacity-0 duration-[120ms] delay-0"
    );

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
          isStacked ? "flex-col" : "h-[clamp(480px,calc(100vh-172px),760px)] flex-row"
        )}
      >
        {plantIds.map((plantId, index) => {
          const plant = KNOWN_PLANTS[plantId];
          const stats = plantStats[plantId] || EMPTY_STATS;
          const isUnlocked = stats.isUnlocked;
          const isSelected = selectedId === plantId;
          const isOpen = isUnlocked && openId === plantId;
          const isHovered = hoverId === plantId;

          const panelProps = {
            ref: (el: HTMLDivElement | null) => {
              panelRefs.current[plantId] = el;
            },
            role: "radio" as const,
            "aria-checked": isSelected,
            "aria-disabled": !isUnlocked,
            "aria-label": `${plant.name} (${plant.defaultCode})`,
            tabIndex: isUnlocked && (isSelected || (!selectedId && plantId === unlockedIds[0])) ? 0 : -1,
            onClick: () => isUnlocked && setSelectedId(plantId),
            onDoubleClick: () => isUnlocked && onSelectPlant(plantId),
            onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, plantId),
            title: isUnlocked
              ? t("gateway.openTitle", { plant: plant.name, count: stats.totalOrders })
              : t("gateway.lockedTitle", { plant: plant.name }),
          };

          const tone = isSelected
            ? "bg-brand-900 text-white focus-visible:ring-white"
            : isUnlocked
            ? cn("text-slate-900 cursor-pointer focus-visible:ring-primary", isHovered ? "bg-slate-50" : "bg-white")
            : "bg-slate-50 text-slate-400 cursor-not-allowed";
          const muted = isSelected ? "text-blue-100" : isUnlocked ? "text-slate-500" : "text-slate-400";

          /* ── Narrow screens: stacked rows ── */
          if (isStacked) {
            return (
              <div
                key={plantId}
                {...panelProps}
                className={cn(
                  "outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset",
                  index > 0 && "border-t border-slate-200",
                  tone
                )}
              >
                <div className="flex min-h-[72px] items-center gap-4 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {codeTag(plant.defaultCode, isSelected, isUnlocked)}
                    <span className="truncate font-heading text-base font-semibold">{plant.name}</span>
                  </div>
                  {isUnlocked ? (
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <div>
                        <div className="font-heading text-2xl font-bold leading-none tabular-nums">{stats.totalOrders}</div>
                        <div className={cn("mt-1 text-xs", muted)}>{t("gateway.activeOrders")}</div>
                      </div>
                      {isSelected && checkCircle}
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1.5 text-xs">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("gateway.locked")} · {t("gateway.zeroPos")}
                    </div>
                  )}
                </div>
                {isSelected && isUnlocked && (
                  <div className="space-y-3 px-4 pb-4">
                    <div className={cn("flex items-center gap-1 text-sm", muted)}>
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {t("gateway.locationCountry", { location: plant.location })}
                    </div>
                    {storeChips(plantId, plant.name, stats.locationsList, true)}
                    {openButton(plantId, stats, true, true)}
                  </div>
                )}
              </div>
            );
          }

          /* ── Desktop: tall expanding panels ── */
          return (
            <div
              key={plantId}
              {...panelProps}
              onMouseEnter={() => isUnlocked && setHoverId(plantId)}
              style={{
                flexGrow: isOpen ? 3.2 : 1,
                flexBasis: 0,
                minWidth: 88,
                transition: reduceMotion
                  ? "background-color 200ms, color 200ms"
                  : `flex-grow 500ms ${EASE_OUT_SOFT}, background-color 200ms, color 200ms`,
              }}
              className={cn(
                "relative h-full overflow-hidden outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset",
                index > 0 && "border-l border-slate-200",
                tone
              )}
            >
              {/* Closed content: code, vertical name, count */}
              <div
                aria-hidden={isOpen}
                className={cn("absolute inset-0 flex flex-col items-center gap-4 px-2 py-6", layer(!isOpen))}
              >
                <div className="flex flex-col items-center gap-2">
                  {codeTag(plant.defaultCode, isSelected, isUnlocked)}
                  {!isUnlocked && <Lock className="h-4 w-4" aria-hidden="true" />}
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                  <span
                    className="max-h-full font-heading text-sm font-semibold uppercase tracking-[0.12em]"
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                  >
                    {shortName(plant.name)}
                  </span>
                </div>
                {isUnlocked ? (
                  <div
                    className={cn(
                      "min-w-[56px] rounded-lg border px-2 py-2 text-center transition-colors duration-200",
                      isSelected ? "border-white/15 bg-white/10" : "border-slate-200 bg-slate-50"
                    )}
                  >
                    <div className="font-heading text-2xl font-bold leading-none tabular-nums">{stats.totalOrders}</div>
                    <div className={cn("mt-1 text-xs", muted)}>{t("gateway.activeShort")}</div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-center text-xs leading-tight">
                    <Lock className="mx-auto mb-1 h-4 w-4" aria-hidden="true" />
                    <div>{t("gateway.locked")}</div>
                    <div>{t("gateway.zeroPos")}</div>
                  </div>
                )}
              </div>

              {/* Open content: name, location, stats, stores, button */}
              {isUnlocked && (
                <div
                  aria-hidden={!isOpen}
                  className={cn("absolute inset-0 flex min-w-[300px] flex-col gap-6 p-8", layer(isOpen))}
                >
                  <div className="flex items-start justify-between gap-3">
                    {codeTag(plant.defaultCode, isSelected, true)}
                    {isSelected && checkCircle}
                  </div>

                  <div className="min-w-0">
                    <h3 className="break-words font-heading text-3xl font-bold leading-tight xl:text-4xl">{plant.name}</h3>
                    <p className={cn("mt-2 flex items-center gap-1.5 text-sm", muted)}>
                      <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {t("gateway.locationCountry", { location: plant.location })}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: t("gateway.activeOrders"), value: stats.totalOrders },
                      { label: t("gateway.readyOrders"), value: stats.readyOrders },
                      { label: t("gateway.deliveryStores"), value: stats.locationsCount },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className={cn(
                          "min-w-0 rounded-lg border p-3 transition-colors duration-200",
                          isSelected ? "border-white/15 bg-white/10" : "border-slate-200 bg-slate-50"
                        )}
                      >
                        <div className="font-heading text-2xl font-bold leading-none tabular-nums">{s.value}</div>
                        <div className={cn("mt-1.5 text-xs leading-tight", muted)}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto space-y-4">
                    {storeChips(plantId, plant.name, stats.locationsList, isSelected)}
                    {openButton(plantId, stats, isSelected)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
