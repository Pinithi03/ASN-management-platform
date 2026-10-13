/**
 * Drafts Management Page.
 * Centralized location to review, resume, and manage in-progress packing drafts
 * for both Manual Packing Wizard and 12-Column Excel Drops.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileSpreadsheet,
  Layers,
  Clock,
  Trash2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FolderArchive,
  RefreshCw,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/utils/cn";
import {
  getAllDrafts,
  clearManualDraft,
  clearExcelDraft,
  formatDraftTime,
  ManualPackingDraft,
  ExcelPackingDraft,
} from "@/utils/draftStorage";

export default function Drafts() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const supplierCode = isSupplier ? (user.supplier_code || undefined) : undefined;

  const [filterTab, setFilterTab] = useState<"all" | "manual" | "excel">("all");
  const [manualDrafts, setManualDrafts] = useState<ManualPackingDraft[]>([]);
  const [excelDrafts, setExcelDrafts] = useState<ExcelPackingDraft[]>([]);

  const loadDrafts = () => {
    const { manualDrafts: m, excelDrafts: e } = getAllDrafts(supplierCode);
    setManualDrafts(m);
    setExcelDrafts(e);
  };

  useEffect(() => {
    loadDrafts();
    const handleUpdate = () => loadDrafts();
    window.addEventListener("asn_drafts_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("asn_drafts_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [supplierCode]);

  const totalCount = manualDrafts.length + excelDrafts.length;

  const handleResumeManual = (draft: ManualPackingDraft) => {
    const poStr = draft.poNumbers.join(",");
    navigate(`/shipments?pos=${encodeURIComponent(poStr)}&mode=manual&resume=true`);
  };

  const handleResumeExcel = (draft: ExcelPackingDraft) => {
    const poStr = draft.poNumbers.join(",");
    navigate(`/shipments?pos=${encodeURIComponent(poStr)}&mode=excel&resume=true`);
  };

  const handleDeleteManual = (draft: ManualPackingDraft) => {
    if (confirm(`Discard saved draft for PO ${draft.poNumbers.join(", ")}?`)) {
      clearManualDraft(draft.supplierCode, draft.poNumbers);
      loadDrafts();
    }
  };

  const handleDeleteExcel = (draft: ExcelPackingDraft) => {
    if (confirm(`Discard saved Excel drop draft for PO ${draft.poNumbers.join(", ")}?`)) {
      clearExcelDraft(draft.supplierCode, draft.poNumbers);
      loadDrafts();
    }
  };

  const handleClearAll = () => {
    if (!confirm("Are you sure you want to discard all saved drafts? This action cannot be undone.")) return;
    manualDrafts.forEach((d) => clearManualDraft(d.supplierCode, d.poNumbers));
    excelDrafts.forEach((d) => clearExcelDraft(d.supplierCode, d.poNumbers));
    loadDrafts();
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Saved Drafts</h1>
            {totalCount > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                {totalCount} Active
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Centralized hub for in-progress packing sessions, carton allocations, and validated spreadsheet drops.
          </p>
        </div>

        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadDrafts}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 rounded-lg border border-gray-300 shadow-2xs transition-colors cursor-pointer"
              title="Refresh drafts"
            >
              <RefreshCw className="w-3.5 h-3.5 text-gray-500" /> Refresh
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 shadow-2xs transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Discard All
            </button>
          </div>
        )}
      </div>

      {/* ─── TABS FILTER ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setFilterTab("all")}
          className={cn(
            "px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
            filterTab === "all"
              ? "bg-gray-900 text-white shadow-2xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          )}
        >
          All Drafts ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab("manual")}
          className={cn(
            "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
            filterTab === "manual"
              ? "bg-blue-600 text-white shadow-2xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          )}
        >
          <Layers className="w-3.5 h-3.5" /> Manual Packing ({manualDrafts.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab("excel")}
          className={cn(
            "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
            filterTab === "excel"
              ? "bg-emerald-600 text-white shadow-2xs"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          )}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel Drops ({excelDrafts.length})
        </button>
      </div>

      {/* ─── DRAFTS LIST ───────────────────────────────────────── */}
      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-gray-200 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-4">
            <FolderArchive className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900">No saved drafts</h3>
          <p className="text-xs text-gray-500 max-w-md mt-1">
            When you enter carton quantities in the Manual Process or upload a packing list in Excel Drop,
            your progress can be saved safely here to resume at any time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* MANUAL PACKING DRAFTS */}
          {(filterTab === "all" || filterTab === "manual") &&
            manualDrafts.map((draft, idx) => {
              const totalCartons =
                draft.packedItems?.reduce((acc, curr) => acc + (curr.boxes?.length || 0), 0) || 0;
              const totalQty =
                draft.packedItems?.reduce((acc, curr) => acc + (curr.shipping_now || 0), 0) ||
                draft.items?.reduce((acc, curr) => acc + (curr.shipping_now || 0), 0) ||
                0;
              const uom = draft.packedItems?.[0]?.uom || draft.items?.[0]?.uom || "M";

              return (
                <div
                  key={`manual-${draft.supplierCode}-${draft.poNumbers.join("_")}-${idx}`}
                  className="bg-white rounded-xl border border-gray-200 hover:border-blue-300 shadow-2xs hover:shadow-xs transition-all p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          <Layers className="w-3 h-3" /> Manual Process
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700">
                          Step {draft.step}: {draft.step === 1 ? "Item Quantities" : draft.step === 2 ? "Cartons & HUs" : "Review & Transmit"}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" /> {formatDraftTime(draft.updatedAt)}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-gray-900 font-mono">
                        PO {draft.poNumbers.join(", ")}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Supplier Code: <span className="font-mono text-gray-700 font-semibold">{draft.supplierCode}</span>
                        {draft.packingSlipNumber && (
                          <> · Delivery Note: <span className="font-mono font-bold text-gray-800">{draft.packingSlipNumber}</span></>
                        )}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-gray-100 text-xs">
                      <div className="bg-gray-50/80 p-2 rounded-lg border border-gray-100">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold block">Cartons</span>
                        <span className="font-bold font-mono text-gray-900">{totalCartons} Cartons</span>
                      </div>
                      <div className="bg-gray-50/80 p-2 rounded-lg border border-gray-100">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold block">Shipping Units</span>
                        <span className="font-bold font-mono text-gray-900">{totalQty.toLocaleString()} {uom}</span>
                      </div>
                      <div className="bg-gray-50/80 p-2 rounded-lg border border-gray-100 col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold block">Next SSCC</span>
                        <span className="font-mono text-gray-700 text-[11px]">Seq #{draft.startingSeq || 1}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => handleDeleteManual(draft)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResumeManual(draft)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      Resume Packing <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

          {/* EXCEL DROP DRAFTS */}
          {(filterTab === "all" || filterTab === "excel") &&
            excelDrafts.map((draft, idx) => {
              const res = draft.validationResult;
              const isValid = Boolean(res?.is_valid);
              const totalCartons = res?.total_cartons || 0;
              const totalQuantity = res?.total_quantity || 0;

              return (
                <div
                  key={`excel-${draft.supplierCode}-${draft.poNumbers.join("_")}-${idx}`}
                  className="bg-white rounded-xl border border-gray-200 hover:border-emerald-300 shadow-2xs hover:shadow-xs transition-all p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <FileSpreadsheet className="w-3 h-3" /> Excel Drop
                        </span>
                        {isValid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Validated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800">
                            <AlertCircle className="w-3 h-3" /> Draft
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" /> {formatDraftTime(draft.updatedAt)}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-gray-900 font-mono">
                        PO {draft.poNumbers.join(", ")}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        File: <span className="font-mono text-gray-800 font-medium">{draft.fileName || "Packing_List.xlsx"}</span>
                        {draft.packingSlipNumber && (
                          <> · Delivery Note: <span className="font-mono font-bold text-gray-800">{draft.packingSlipNumber}</span></>
                        )}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-gray-100 text-xs">
                      <div className="bg-gray-50/80 p-2 rounded-lg border border-gray-100">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold block">Cartons / Rolls</span>
                        <span className="font-bold font-mono text-gray-900">{totalCartons} Units</span>
                      </div>
                      <div className="bg-gray-50/80 p-2 rounded-lg border border-gray-100">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold block">Quantity</span>
                        <span className="font-bold font-mono text-gray-900">{totalQuantity.toLocaleString()} units</span>
                      </div>
                      <div className="bg-gray-50/80 p-2 rounded-lg border border-gray-100 col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold block">Plant / ETA</span>
                        <span className="font-mono text-gray-700 text-[11px]">{draft.plantCode || "PPA1"} · {draft.estimatedArrival || "N/A"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => handleDeleteExcel(draft)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResumeExcel(draft)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      Resume Excel Drop <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
