// frontend/src/hooks/usePlantSelection.ts
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  KNOWN_PLANTS,
  SHARED_LOC_STORAGE_KEY,
  SHARED_PLANT_STORAGE_KEY,
  clearSharedPlantState,
  getSavedSharedPlant,
  normalizePlantKey,
} from "@/utils/plantResolver";

export interface UsePlantSelectionResult {
  /** Canonical plant key ("OMEGA", "ALPHA", "BENJI", "SIRIO", "VAVUNIYA") or null when none selected */
  selectedPlant: string | null;
  /** Active storage location code (e.g. "0101") */
  selectedLocation: string;
  /** Select a plant (and optional storage location), persisting to URL & shared state */
  selectPlant: (plantIdOrCode: string, targetLoc?: string) => void;
  /** Switch storage location within the currently selected plant */
  selectLocation: (targetLoc: string) => void;
  /** Clear plant selection to return to PlantAccordionShowcase gateway */
  clearPlant: () => void;
}

/**
 * Shared Plant Selection Gateway hook used across both Purchase Orders
 * and Purchase Order Lines (Manual Process & Excel Drop).
 *
 * Checks `?plant=<code_or_id>` first, falling back to shared session state.
 * If neither is set, `selectedPlant` is `null` so `PlantAccordionShowcase` renders first.
 */
export function usePlantSelection(): UsePlantSelectionResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlPlant = normalizePlantKey(searchParams.get("plant"));
  const urlLoc = searchParams.get("loc");

  const [selectedPlant, setSelectedPlant] = useState<string | null>(() => {
    if (urlPlant) return urlPlant;
    return getSavedSharedPlant().plant;
  });

  const [selectedLocation, setSelectedLocation] = useState<string>(() => {
    if (urlLoc) return urlLoc;
    const saved = getSavedSharedPlant();
    if (saved.loc) return saved.loc;
    const active = urlPlant || saved.plant;
    if (active && KNOWN_PLANTS[active]) {
      return KNOWN_PLANTS[active].storageLocationsHint?.[0] || "0101";
    }
    return "0101";
  });

  // Sync URL -> state/sessionStorage OR restore saved shared state -> URL
  useEffect(() => {
    const paramPlant = normalizePlantKey(searchParams.get("plant"));
    const paramLoc = searchParams.get("loc");

    if (paramPlant) {
      const resolvedLoc =
        paramLoc ||
        getSavedSharedPlant().loc ||
        KNOWN_PLANTS[paramPlant]?.storageLocationsHint?.[0] ||
        "0101";

      if (selectedPlant !== paramPlant) setSelectedPlant(paramPlant);
      if (selectedLocation !== resolvedLoc) setSelectedLocation(resolvedLoc);

      try {
        sessionStorage.setItem(SHARED_PLANT_STORAGE_KEY, paramPlant);
        sessionStorage.setItem(SHARED_LOC_STORAGE_KEY, resolvedLoc);
      } catch {
        // ignore storage errors
      }
      return;
    }

    // No ?plant in URL: check if shared state has an active plant (e.g. tab switch)
    const saved = getSavedSharedPlant();
    if (saved.plant) {
      const resolvedLoc =
        saved.loc || KNOWN_PLANTS[saved.plant]?.storageLocationsHint?.[0] || "0101";
      if (selectedPlant !== saved.plant) setSelectedPlant(saved.plant);
      if (selectedLocation !== resolvedLoc) setSelectedLocation(resolvedLoc);

      const next = new URLSearchParams(searchParams);
      next.set("plant", saved.plant);
      next.set("loc", resolvedLoc);
      setSearchParams(next, { replace: true });
    } else if (selectedPlant !== null) {
      setSelectedPlant(null);
    }
  }, [searchParams, selectedPlant, selectedLocation, setSearchParams]);

  const clearPlant = useCallback(() => {
    clearSharedPlantState();
    setSelectedPlant(null);
    const next = new URLSearchParams(searchParams);
    next.delete("plant");
    next.delete("loc");
    next.delete("view");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const selectPlant = useCallback(
    (plantIdOrCode: string, targetLoc?: string) => {
      const norm = normalizePlantKey(plantIdOrCode);
      if (!norm) {
        clearPlant();
        return;
      }
      const resolvedLoc =
        targetLoc || KNOWN_PLANTS[norm]?.storageLocationsHint?.[0] || "0101";

      try {
        sessionStorage.setItem(SHARED_PLANT_STORAGE_KEY, norm);
        sessionStorage.setItem(SHARED_LOC_STORAGE_KEY, resolvedLoc);
      } catch {
        // ignore storage errors
      }

      setSelectedPlant(norm);
      setSelectedLocation(resolvedLoc);

      const next = new URLSearchParams(searchParams);
      next.set("plant", norm);
      next.set("loc", resolvedLoc);
      next.delete("view");
      setSearchParams(next, { replace: true });
    },
    [clearPlant, searchParams, setSearchParams]
  );

  const selectLocation = useCallback(
    (targetLoc: string) => {
      setSelectedLocation(targetLoc);
      try {
        sessionStorage.setItem(SHARED_LOC_STORAGE_KEY, targetLoc);
      } catch {
        // ignore storage errors
      }
      const next = new URLSearchParams(searchParams);
      if (selectedPlant) {
        next.set("plant", selectedPlant);
      }
      next.set("loc", targetLoc);
      setSearchParams(next, { replace: true });
    },
    [ searchParams, selectedPlant, setSearchParams ]
  );

  return {
    selectedPlant,
    selectedLocation,
    selectPlant,
    selectLocation,
    clearPlant,
  };
}
