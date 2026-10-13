import { useState, useEffect, useCallback, useRef } from "react";

export interface ShipmentDraft<T = any> {
  poQuery: string;
  step: number;
  packingSlipNumber: string;
  packedItems: T[];
  savedAt: string;
}

export function useDraftPersistence<T = any>(
  storageKey: string,
  currentState: {
    poQuery: string;
    step: number;
    packingSlipNumber: string;
    packedItems: T[];
  },
  onRestore: (draft: ShipmentDraft<T>) => void
) {
  const [draftAvailable, setDraftAvailable] = useState<ShipmentDraft<T> | null>(null);
  const isRestoredOrDiscarded = useRef(false);

  // Check for existing draft on initial mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: ShipmentDraft<T> = JSON.parse(raw);
        if (
          parsed &&
          (parsed.packingSlipNumber || (parsed.packedItems && parsed.packedItems.length > 0))
        ) {
          setDraftAvailable(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to read draft from localStorage:", e);
    }
  }, [storageKey]);

  // Auto-save changes (debounced by 800ms)
  useEffect(() => {
    // Only auto-save if user has entered something meaningful
    const hasContent =
      currentState.packingSlipNumber.trim().length > 0 ||
      (currentState.packedItems && currentState.packedItems.length > 0);

    if (!hasContent) return;

    const timer = setTimeout(() => {
      try {
        const payload: ShipmentDraft<T> = {
          poQuery: currentState.poQuery,
          step: currentState.step,
          packingSlipNumber: currentState.packingSlipNumber,
          packedItems: currentState.packedItems,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch (e) {
        console.warn("Failed to auto-save shipment draft:", e);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [storageKey, currentState.poQuery, currentState.step, currentState.packingSlipNumber, currentState.packedItems]);

  const restore = useCallback(() => {
    if (draftAvailable) {
      onRestore(draftAvailable);
      setDraftAvailable(null);
      isRestoredOrDiscarded.current = true;
    }
  }, [draftAvailable, onRestore]);

  const discard = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn("Failed to remove draft:", e);
    }
    setDraftAvailable(null);
    isRestoredOrDiscarded.current = true;
  }, [storageKey]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn("Failed to clear draft:", e);
    }
    setDraftAvailable(null);
  }, [storageKey]);

  return {
    draftAvailable,
    restoreDraft: restore,
    discardDraft: discard,
    clearDraft: clear,
  };
}
