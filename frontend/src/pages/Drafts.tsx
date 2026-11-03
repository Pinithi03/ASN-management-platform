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

  const [filterTab, setFilterTab] = useState<"manual" | "excel">("manual");
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
  const currentCount = filterTab === "manual" ? manualDrafts.length : excelDrafts.length;

  const handleResumeManual = (draft: ManualPackingDraft) => {
    const poStr = draft.poNumbers.join(",");
    navigate(`/shipments?pos=${encodeURIComponent(poStr)}&mode=web&resume=true`);
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
    <div className="h-full flex flex-col overflow-hidden px-4 pt-4 pb-0 sm:px-6 sm:pt-5 sm:pb-0 gap-3">
      {/* ─── HEADER ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">Saved Drafts</h1>
            {totalCount > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {totalCount} Active
              </span>
            )}
          </div>
        </div>

        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 rounded-lg border border-slate-200 hover:border-red-200 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Discard All
            </button>
          </div>
        )}
      </div>

      {/* ─── TABS FILTER ───────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setFilterTab("manual")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer -mb-px",
            filterTab === "manual"
              ? isSupplier
                ? "border-emerald-600 text-emerald-700"
                : "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Manual Packing
          <span
            className={cn(
              "px-2 py-0.5 text-[11px] rounded-full font-bold",
              filterTab === "manual"
                ? isSupplier
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-brand-50 text-brand-700 border border-brand-200"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {manualDrafts.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFilterTab("excel")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer -mb-px",
            filterTab === "excel"
              ? isSupplier
                ? "border-emerald-600 text-emerald-700"
                : "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          )}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Excel Drops
          <span
            className={cn(
              "px-2 py-0.5 text-[11px] rounded-full font-bold",
              filterTab === "excel"
                ? isSupplier
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-brand-50 text-brand-700 border border-brand-200"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {excelDrafts.length}
          </span>
        </button>
      </div>

      {/* ─── DRAFTS LIST (Compact Zebra-Striped Table) ─────────── */}
      {currentCount === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <FolderArchive className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700 text-base">
            No saved {filterTab === "manual" ? "manual packing" : "Excel drop"} drafts
          </p>
          <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
            {filterTab === "manual"
              ? "When you enter carton quantities in the Manual Process, your progress is saved safely here to resume at any time."
              : "When you upload a packing list in Excel Drop, your progress is saved safely here to resume at any time."}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-t-xl border-x border-t border-slate-200 shadow-2xs overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-zinc-700 shadow-xs">
                <tr className="bg-zinc-700 text-white text-xs font-semibold uppercase tracking-wider border-b border-zinc-800">
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">Step / Status</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">PO Number</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">Supplier / File & Delivery Note</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">Cartons / Rolls</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">Shipping Units</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">Next SSCC / Plant & ETA</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">Updated</th>
                  <th className="py-1.5 px-2 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* MANUAL PACKING DRAFTS */}
                {filterTab === "manual" &&
                  manualDrafts.map((draft, idx) => {
                    const totalCartons =
                      draft.packedItems?.reduce((acc, curr) => acc + (curr.boxes?.length || 0), 0) || 0;
                    const totalQty =
                      draft.packedItems?.reduce((acc, curr) => acc + (curr.shipping_now || 0), 0) ||
                      draft.items?.reduce((acc, curr) => acc + (curr.shipping_now || 0), 0) ||
                      0;
                    const uom = draft.packedItems?.[0]?.uom || draft.items?.[0]?.uom || "M";

                    return (
                      <tr
                        key={`manual-${draft.supplierCode}-${draft.poNumbers.join("_")}-${idx}`}
                        className="bg-white even:bg-gray-100 hover:bg-blue-50/70 border-b border-gray-300 text-xs transition-colors"
                      >
                        <td className="py-1 px-2 whitespace-nowrap border-r border-gray-200">
                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            Step {draft.step}: {draft.step === 1 ? "Item Quantities" : draft.step === 2 ? "Cartons & HUs" : "Review & Transmit"}
                          </span>
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-gray-900 border-r border-gray-200">
                          PO {draft.poNumbers.join(", ")}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap text-gray-600 border-r border-gray-200">
                          Supplier Code: <span className="font-mono text-gray-800 font-semibold">{draft.supplierCode}</span>
                          {draft.packingSlipNumber && (
                            <> · Delivery Note: <span className="font-mono font-bold text-gray-900">{draft.packingSlipNumber}</span></>
                          )}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-gray-900 border-r border-gray-200">
                          {totalCartons} Cartons
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-gray-900 border-r border-gray-200">
                          {totalQty.toLocaleString()} {uom}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-gray-700 border-r border-gray-200">
                          Seq #{draft.startingSeq || 1}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap text-gray-500 border-r border-gray-200">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-400" /> {formatDraftTime(draft.updatedAt)}
                          </span>
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteManual(draft)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded border border-slate-200 bg-white transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Discard
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResumeManual(draft)}
                              className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-0.5 text-white rounded text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer",
                                isSupplier ? "bg-emerald-600 hover:bg-emerald-700" : "bg-brand-600 hover:bg-brand-700"
                              )}
                            >
                              Resume Packing <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                {/* EXCEL DROP DRAFTS */}
                {filterTab === "excel" &&
                  excelDrafts.map((draft, idx) => {
                    const res = draft.validationResult;
                    const isValid = Boolean(res?.is_valid);
                    const totalCartons = res?.total_cartons || 0;
                    const totalQuantity = res?.total_quantity || 0;

                    return (
                      <tr
                        key={`excel-${draft.supplierCode}-${draft.poNumbers.join("_")}-${idx}`}
                        className="bg-white even:bg-gray-100 hover:bg-blue-50/70 border-b border-gray-300 text-xs transition-colors"
                      >
                        <td className="py-1 px-2 whitespace-nowrap border-r border-gray-200">
                          {isValid ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" /> Validated
                            </span>
                          ) : res ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              <AlertCircle className="w-3 h-3" /> Needs Attention
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                              <FileSpreadsheet className="w-3 h-3" /> Template Downloaded
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-gray-900 border-r border-gray-200">
                          PO {draft.poNumbers.join(", ")}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap text-gray-600 border-r border-gray-200">
                          File: <span className="font-mono text-gray-800 font-medium">{draft.fileName || "Packing_List.xlsx"}</span>
                          {draft.packingSlipNumber && (
                            <> · Delivery Note: <span className="font-mono font-bold text-gray-900">{draft.packingSlipNumber}</span></>
                          )}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-gray-900 border-r border-gray-200">
                          {totalCartons > 0 ? `${totalCartons} Units` : "Awaiting Upload"}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-gray-900 border-r border-gray-200">
                          {totalQuantity > 0 ? `${totalQuantity.toLocaleString()} units` : "Factory Measuring"}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-gray-700 border-r border-gray-200">
                          {draft.plantCode || "PPA1"} · {draft.estimatedArrival || "N/A"}
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap text-gray-500 border-r border-gray-200">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-400" /> {formatDraftTime(draft.updatedAt)}
                          </span>
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteExcel(draft)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded border border-slate-200 bg-white transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Discard
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResumeExcel(draft)}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
                            >
                              {res ? "Resume Excel Drop" : "Upload Filled Sheet"} <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
