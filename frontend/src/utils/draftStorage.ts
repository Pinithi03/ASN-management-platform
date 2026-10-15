/**
 * Draft Storage & Offline Resilience Utility for ASN Creation Workflows.
 *
 * Supports both:
 * 1. Smart Web Packing Wizard (quantities, carton splits, HUs, weights, batch, packing slip)
 * 2. 12-Column Excel Drop (validation results, packing slip, plant, estimated arrival)
 *
 * Features:
 * - Scoped local storage with quota protection
 * - Automatic expiration (> 48 hours)
 * - Network connection status hook
 * - Safe JSON serialization
 */

import { useState, useEffect } from "react";

const DRAFT_PREFIX_MANUAL = "asn_draft_manual_v1_";
const DRAFT_PREFIX_EXCEL = "asn_draft_excel_v1_";
const MAX_DRAFT_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

export interface ManualPackingDraft {
  poNumbers: string[];
  supplierCode: string;
  step: 1 | 2 | 3;
  items: any[];
  packedItems: any[];
  startingSeq: number;
  packingSlipNumber: string;
  deliveryDate?: string;
  updatedAt: number;
}

export interface ExcelPackingDraft {
  poNumbers: string[];
  supplierCode: string;
  plantCode: string;
  estimatedArrival: string;
  packingSlipNumber: string;
  validationResult: any | null;
  fileName?: string;
  updatedAt: number;
}

/**
 * Generate a deterministic key for the active draft based on supplier & POs
 */
function buildKey(prefix: string, supplierCode: string, poNumbers: string[]): string {
  const cleanCode = (supplierCode || "default").trim().toLowerCase();
  const sortedPos = [...poNumbers].sort().join("_");
  return `${prefix}${cleanCode}_${sortedPos}`;
}

/**
 * Hook to monitor online/offline network connectivity in real-time.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Clean up old expired drafts to preserve browser storage quota
 */
function cleanupExpiredDrafts() {
  try {
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(DRAFT_PREFIX_MANUAL) || key.startsWith(DRAFT_PREFIX_EXCEL))) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.updatedAt && now - parsed.updatedAt > MAX_DRAFT_AGE_MS) {
              localStorage.removeItem(key);
            }
          } catch {
            localStorage.removeItem(key);
          }
        }
      }
    }
  } catch (err) {
    console.warn("Error running draft cleanup:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual Wizard Draft Methods
// ─────────────────────────────────────────────────────────────────────────────

function notifyDraftsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("asn_drafts_updated"));
  }
}

export function saveManualDraft(
  supplierCode: string,
  poNumbers: string[],
  data: Omit<ManualPackingDraft, "poNumbers" | "supplierCode" | "updatedAt">
): boolean {
  if (!poNumbers || poNumbers.length === 0) return false;
  try {
    cleanupExpiredDrafts();
    const key = buildKey(DRAFT_PREFIX_MANUAL, supplierCode, poNumbers);
    const draft: ManualPackingDraft = {
      ...data,
      supplierCode,
      poNumbers,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(draft));
    notifyDraftsUpdated();
    return true;
  } catch (err) {
    console.warn("Failed to save manual packing draft to localStorage:", err);
    return false;
  }
}

export function getManualDraft(
  supplierCode: string,
  poNumbers: string[]
): ManualPackingDraft | null {
  if (!poNumbers || poNumbers.length === 0) return null;
  try {
    const key = buildKey(DRAFT_PREFIX_MANUAL, supplierCode, poNumbers);
    let raw = localStorage.getItem(key);
    // Resilient fallback: search by PO numbers if exact supplier key not found
    if (!raw) {
      const sortedPos = [...poNumbers].sort().join("_");
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(DRAFT_PREFIX_MANUAL) && k.endsWith(`_${sortedPos}`)) {
          raw = localStorage.getItem(k);
          break;
        }
      }
    }
    if (!raw) return null;
    const parsed: ManualPackingDraft = JSON.parse(raw);

    // Expire if older than 48 hours
    if (Date.now() - parsed.updatedAt > MAX_DRAFT_AGE_MS) {
      localStorage.removeItem(key);
      notifyDraftsUpdated();
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn("Failed to retrieve manual packing draft:", err);
    return null;
  }
}

export function clearManualDraft(supplierCode: string, poNumbers: string[]): void {
  if (!poNumbers || poNumbers.length === 0) return;
  try {
    const key = buildKey(DRAFT_PREFIX_MANUAL, supplierCode, poNumbers);
    localStorage.removeItem(key);
    // Also clear any other keys matching these POs
    const sortedPos = [...poNumbers].sort().join("_");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX_MANUAL) && k.endsWith(`_${sortedPos}`)) {
        localStorage.removeItem(k);
      }
    }
    notifyDraftsUpdated();
  } catch (err) {
    console.warn("Failed to clear manual packing draft:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel Workflow Draft Methods
// ─────────────────────────────────────────────────────────────────────────────

export function saveExcelDraft(
  supplierCode: string,
  poNumbers: string[],
  data: Omit<ExcelPackingDraft, "poNumbers" | "supplierCode" | "updatedAt">
): boolean {
  if (!poNumbers || poNumbers.length === 0) return false;
  try {
    cleanupExpiredDrafts();
    const key = buildKey(DRAFT_PREFIX_EXCEL, supplierCode, poNumbers);
    const draft: ExcelPackingDraft = {
      ...data,
      supplierCode,
      poNumbers,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(draft));
    notifyDraftsUpdated();
    return true;
  } catch (err) {
    console.warn("Failed to save excel draft to localStorage:", err);
    return false;
  }
}

export function getExcelDraft(
  supplierCode: string,
  poNumbers: string[]
): ExcelPackingDraft | null {
  if (!poNumbers || poNumbers.length === 0) return null;
  try {
    const key = buildKey(DRAFT_PREFIX_EXCEL, supplierCode, poNumbers);
    let raw = localStorage.getItem(key);
    // Resilient fallback: search by PO numbers if exact supplier key not found
    if (!raw) {
      const sortedPos = [...poNumbers].sort().join("_");
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(DRAFT_PREFIX_EXCEL) && !k.includes("blob_") && k.endsWith(`_${sortedPos}`)) {
          raw = localStorage.getItem(k);
          break;
        }
      }
    }
    if (!raw) return null;
    const parsed: ExcelPackingDraft = JSON.parse(raw);

    if (Date.now() - parsed.updatedAt > MAX_DRAFT_AGE_MS) {
      localStorage.removeItem(key);
      notifyDraftsUpdated();
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn("Failed to retrieve excel draft:", err);
    return null;
  }
}

export function clearExcelDraft(supplierCode: string, poNumbers: string[]): void {
  if (!poNumbers || poNumbers.length === 0) return;
  try {
    const key = buildKey(DRAFT_PREFIX_EXCEL, supplierCode, poNumbers);
    localStorage.removeItem(key);
    const sortedPos = [...poNumbers].sort().join("_");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX_EXCEL) && k.endsWith(`_${sortedPos}`)) {
        localStorage.removeItem(k);
      }
    }
    clearExcelFileBlob(supplierCode, poNumbers).catch(() => {});
    notifyDraftsUpdated();
  } catch (err) {
    console.warn("Failed to clear excel draft:", err);
  }
}

/**
 * Retrieve all active drafts. Optionally filtered by supplierCode.
 */
export function getAllDrafts(filterSupplierCode?: string): {
  manualDrafts: ManualPackingDraft[];
  excelDrafts: ExcelPackingDraft[];
} {
  const manualDrafts: ManualPackingDraft[] = [];
  const excelDrafts: ExcelPackingDraft[] = [];
  const targetCode = filterSupplierCode ? filterSupplierCode.trim().toLowerCase() : null;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith(DRAFT_PREFIX_MANUAL)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed: ManualPackingDraft = JSON.parse(raw);
            if (Date.now() - parsed.updatedAt <= MAX_DRAFT_AGE_MS) {
              if (
                !targetCode ||
                (parsed.supplierCode && parsed.supplierCode.trim().toLowerCase() === targetCode)
              ) {
                manualDrafts.push(parsed);
              }
            }
          } catch {}
        }
      } else if (key.startsWith(DRAFT_PREFIX_EXCEL) && !key.includes("blob_")) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed: ExcelPackingDraft = JSON.parse(raw);
            if (Date.now() - parsed.updatedAt <= MAX_DRAFT_AGE_MS) {
              if (
                !targetCode ||
                (parsed.supplierCode && parsed.supplierCode.trim().toLowerCase() === targetCode)
              ) {
                excelDrafts.push(parsed);
              }
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn("Could not list drafts from localStorage:", err);
  }

  manualDrafts.sort((a, b) => b.updatedAt - a.updatedAt);
  excelDrafts.sort((a, b) => b.updatedAt - a.updatedAt);

  return { manualDrafts, excelDrafts };
}

/**
 * Get total count of saved drafts.
 */
export function getDraftCount(filterSupplierCode?: string): number {
  const { manualDrafts, excelDrafts } = getAllDrafts(filterSupplierCode);
  return manualDrafts.length + excelDrafts.length;
}

/**
 * React hook to listen for real-time draft count changes.
 */
export function useDraftCount(supplierCode?: string): number {
  const [count, setCount] = useState(() => getDraftCount(supplierCode));

  useEffect(() => {
    const update = () => setCount(getDraftCount(supplierCode));
    window.addEventListener("asn_drafts_updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("asn_drafts_updated", update);
      window.removeEventListener("storage", update);
    };
  }, [supplierCode]);

  return count;
}

export async function saveExcelFileBlob(
  supplierCode: string,
  poNumbers: string[],
  file: File
): Promise<boolean> {
  if (!poNumbers || poNumbers.length === 0 || typeof indexedDB === "undefined") return false;
  try {
    const key = buildKey(DRAFT_PREFIX_EXCEL + "blob_", supplierCode, poNumbers);
    const db = await openIndexedDb();
    return new Promise((resolve) => {
      const tx = db.transaction("draft_files", "readwrite");
      const store = tx.objectStore("draft_files");
      const record = {
        key,
        name: file.name,
        type: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        lastModified: file.lastModified,
        data: file,
        savedAt: Date.now(),
      };
      const req = store.put(record, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn("Could not save Excel file blob to IndexedDB:", err);
    return false;
  }
}

export async function getExcelFileBlob(
  supplierCode: string,
  poNumbers: string[]
): Promise<File | null> {
  if (!poNumbers || poNumbers.length === 0 || typeof indexedDB === "undefined") return null;
  try {
    const key = buildKey(DRAFT_PREFIX_EXCEL + "blob_", supplierCode, poNumbers);
    const db = await openIndexedDb();
    return new Promise((resolve) => {
      const tx = db.transaction("draft_files", "readonly");
      const store = tx.objectStore("draft_files");
      const req = store.get(key);
      req.onsuccess = () => {
        const res = req.result;
        if (res && res.data) {
          const restoredFile = new File([res.data], res.name || "Packing_List.xlsx", {
            type: res.type,
            lastModified: res.lastModified || Date.now(),
          });
          resolve(restoredFile);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn("Could not retrieve Excel file blob from IndexedDB:", err);
    return null;
  }
}

export async function clearExcelFileBlob(
  supplierCode: string,
  poNumbers: string[]
): Promise<void> {
  if (!poNumbers || poNumbers.length === 0 || typeof indexedDB === "undefined") return;
  try {
    const key = buildKey(DRAFT_PREFIX_EXCEL + "blob_", supplierCode, poNumbers);
    const db = await openIndexedDb();
    const tx = db.transaction("draft_files", "readwrite");
    tx.objectStore("draft_files").delete(key);
  } catch (err) {
    console.warn("Could not delete Excel file blob from IndexedDB:", err);
  }
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB not supported in this browser"));
    }
    const req = indexedDB.open("ASNDraftStorage", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("draft_files")) {
        db.createObjectStore("draft_files");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Human-readable relative time formatter for drafts
 */
export function formatDraftTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Estimate storage used by drafts in localStorage and total draft count.
 */
export function getDraftStorageEstimate(filterSupplierCode?: string): {
  draftCount: number;
  approxSizeKb: number;
} {
  const { manualDrafts, excelDrafts } = getAllDrafts(filterSupplierCode);
  const targetCode = filterSupplierCode ? filterSupplierCode.trim().toLowerCase() : null;
  let totalBytes = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(DRAFT_PREFIX_MANUAL) || key.startsWith(DRAFT_PREFIX_EXCEL)) {
        if (
          !targetCode ||
          key.toLowerCase().includes(`_${targetCode}_`) ||
          key.toLowerCase().startsWith(`${DRAFT_PREFIX_MANUAL}${targetCode}_`) ||
          key.toLowerCase().startsWith(`${DRAFT_PREFIX_EXCEL}${targetCode}_`)
        ) {
          const val = localStorage.getItem(key);
          if (val) {
            totalBytes += key.length + val.length;
          }
        }
      }
    }
  } catch {}

  const count = manualDrafts.length + excelDrafts.length;
  return {
    draftCount: count,
    approxSizeKb: count > 0 ? Math.max(1, Math.round(totalBytes / 1024)) : 0,
  };
}

/**
 * Clear all drafts and IndexedDB cached files for a supplier (or all if omitted).
 */
export async function clearAllSupplierDrafts(filterSupplierCode?: string): Promise<{
  clearedDrafts: number;
  clearedFiles: number;
}> {
  const targetCode = filterSupplierCode ? filterSupplierCode.trim().toLowerCase() : null;
  let clearedDrafts = 0;
  let clearedFiles = 0;

  // 1. Clear LocalStorage drafts
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(DRAFT_PREFIX_MANUAL) || key.startsWith(DRAFT_PREFIX_EXCEL)) {
        if (!targetCode) {
          keysToRemove.push(key);
        } else {
          const raw = localStorage.getItem(key);
          let belongs =
            key.toLowerCase().includes(`_${targetCode}_`) ||
            key.toLowerCase().startsWith(`${DRAFT_PREFIX_MANUAL}${targetCode}_`) ||
            key.toLowerCase().startsWith(`${DRAFT_PREFIX_EXCEL}${targetCode}_`);
          if (!belongs && raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed.supplierCode && parsed.supplierCode.trim().toLowerCase() === targetCode) {
                belongs = true;
              }
            } catch {}
          }
          if (belongs) {
            keysToRemove.push(key);
          }
        }
      }
    }

    for (const k of keysToRemove) {
      localStorage.removeItem(k);
      clearedDrafts++;
    }
  } catch (err) {
    console.warn("Error clearing drafts from localStorage:", err);
  }

  // 2. Clear IndexedDB blobs
  if (typeof indexedDB !== "undefined") {
    try {
      const db = await openIndexedDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction("draft_files", "readwrite");
        const store = tx.objectStore("draft_files");
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const keyStr = String(cursor.key);
            if (
              !targetCode ||
              keyStr.toLowerCase().includes(`_${targetCode}_`) ||
              keyStr.toLowerCase().includes(targetCode)
            ) {
              cursor.delete();
              clearedFiles++;
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      });
    } catch (err) {
      console.warn("Error clearing drafts from IndexedDB:", err);
    }
  }

  notifyDraftsUpdated();
  return { clearedDrafts, clearedFiles };
}

