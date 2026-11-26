/**
 * Shipment helpers shared by the Shipments workbench and the shipment detail page.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import i18n from "@/i18n";
import { cn } from "@/utils/cn";
import { shipmentService } from "@/services/shipmentService";

export const statusColor: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  PACKING: "bg-amber-50 text-amber-700 border-amber-200",
  PACKED: "bg-blue-50 text-blue-700 border-blue-200",
  XML_SENT: "bg-blue-50 text-blue-700 border-blue-200",
  RECEIVED: "bg-blue-50 text-blue-700 border-blue-200",
  ACCEPTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  DISPATCHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const SHIPMENT_STATUSES = Object.keys(statusColor);
type ShipmentStatus = "DRAFT" | "PACKING" | "PACKED" | "XML_SENT" | "RECEIVED" | "ACCEPTED" | "REJECTED" | "DISPATCHED" | "DELIVERED";

/** Display label for a shipment status code; unknown codes are shown as before. */
export const shipmentStatusLabel = (status: string): string =>
  SHIPMENT_STATUSES.includes(status)
    ? i18n.t(`shipments:status.${status as ShipmentStatus}`)
    : status.replace(/_/g, " ");

export const PLANT_NAMES: Record<string, string> = {
  PPA1: "Omega Line Ltd (PPA1)",
  "PPA1-0198": "Omega Line Ltd (PPA1-0198)",
  "PPA1-0101": "Omega Line Ltd (PPA1-0101)",
  PPA2: "Vavuniya Apparels Ltd (PPA2)",
  "PPA2-0198": "Vavuniya Apparels Ltd (PPA2-0198)",
  "PPA2-0101": "Vavuniya Apparels Ltd (PPA2-0101)",
  PPB1: "Alpha Apparels Ltd (PPB1)",
  "PPB1-0101": "Alpha Apparels Ltd (PPB1-0101)",
  PPC1: "Benji Ltd (PPC1)",
  "PPC1-0101": "Benji Ltd (PPC1-0101)",
  PPD1: "Sirio Ltd (PPD1)",
  "PPD1-0101": "Sirio Ltd (PPD1-0101)",
  PPE1: "Vavuniya Apparels Ltd (PPA2)",
  "1001": "Omega Line Ltd (1001)",
};

export const formatPlantName = (plantCode?: string | null): string => {
  if (!plantCode) return "Omega Line Ltd (PPA1)";
  if (PLANT_NAMES[plantCode]) return PLANT_NAMES[plantCode];
  const s = plantCode.toUpperCase();
  if (s.startsWith("PPA2") || s.startsWith("PPE")) return `Vavuniya Apparels Ltd (${plantCode})`;
  if (s.startsWith("PPA")) return `Omega Line Ltd (${plantCode})`;
  if (s.startsWith("PPB")) return `Alpha Apparels Ltd (${plantCode})`;
  if (s.startsWith("PPC")) return `Benji Ltd (${plantCode})`;
  if (s.startsWith("PPD")) return `Sirio Ltd (${plantCode})`;
  return plantCode;
};

// Helper to accurately match plant code from client_code or destination automatically (preserving codes like PPA1-0198)
export const matchPlant = (clientOrDest?: string | null): string => {
  if (!clientOrDest) return "PPA1";
  const s = clientOrDest.trim();
  const codeMatch = s.match(/\b(PP[A-E]\d(?:-[0-9A-Z]+)?)\b/i);
  if (codeMatch) {
    const matched = codeMatch[1].toUpperCase();
    if (matched.startsWith("PPE")) return matched.replace("PPE", "PPA2");
    return matched;
  }

  const lower = s.toLowerCase();
  if (lower.includes("vavuniya") || lower.includes("ppa2") || lower.includes("ppe1") || lower.includes("ppa4")) return "PPA2";
  if (lower.includes("omega") || lower.includes("ppa1") || lower.includes("ppa")) return "PPA1";
  if (lower.includes("alpha") || lower.includes("ppb1")) return "PPB1";
  if (lower.includes("benji") || lower.includes("ppc1")) return "PPC1";
  if (lower.includes("sirio") || lower.includes("ppd1")) return "PPD1";
  return s || "PPA1";
};

export function formatOfficialXmlFilename(
  packingSlipNumber?: string,
  supplierCode?: string,
  xmlContent?: string
): string {
  let ps = (packingSlipNumber || "").trim();
  let supp = (supplierCode || "").trim();
  if (xmlContent) {
    if (!ps) {
      const mPs = xmlContent.match(/<PackingSlipNumber>([^<]+)<\/PackingSlipNumber>/);
      if (mPs?.[1]) ps = mPs[1].trim();
    }
    if (!supp) {
      const mSupp = xmlContent.match(/<PartnerId>([^<]+)<\/PartnerId>/);
      if (mSupp?.[1]) supp = mSupp[1].trim();
    }
  }
  const psClean = (ps || "01000000").padStart(8, "0");
  const suppClean = (supp || "0000018194").replace(/^0+/, "").padStart(10, "0");
  return `PL_${psClean}_[${suppClean}].xml`;
}
// ───────────────────────────────────────────────────────────────────
// SUBCOMPONENT E: Label Print & Size Customization Modal
// ───────────────────────────────────────────────────────────────────
export function LabelPrintModal({
  data,
  onClose,
  onDownload,
  isLoading,
}: {
  data: {
    open: boolean;
    shipmentId: string;
    shipmentNumber: string;
    totalBoxes?: number;
  };
  onClose: () => void;
  onDownload: (size: string, autoPrint: boolean) => void;
  isLoading?: boolean;
}) {
  const { t } = useTranslation(["shipments", "common"]);
  const [selectedSize, setSelectedSize] = useState<string>(() => {
    return localStorage.getItem("asn_preferred_label_size") || "6x4";
  });

  const handleSelectSize = (size: string) => {
    setSelectedSize(size);
    localStorage.setItem("asn_preferred_label_size", size);
  };

  const SIZES = [
    { id: "6x4", title: t("shipments:labels.sizes.landscape") },
    { id: "4x6", title: t("shipments:labels.sizes.portrait") },
    { id: "4x3", title: t("shipments:labels.sizes.compact") },
    { id: "a4", title: t("shipments:labels.sizes.a4") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{t("shipments:labels.title")}</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {data.shipmentNumber} • {t("shipments:cartons", { count: data.totalBoxes ?? 1 })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            {t("shipments:labels.selectSize")}
          </label>
          <div className="space-y-2">
            {SIZES.map((s) => {
              const isSelected = selectedSize === s.id;
              return (
                <label
                  key={s.id}
                  onClick={() => handleSelectSize(s.id)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all cursor-pointer select-none",
                    isSelected
                      ? "border-blue-600 bg-blue-50/50 text-blue-950 font-medium shadow-2xs"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50/60"
                  )}
                >
                  <input
                    type="radio"
                    name="labelSize"
                    checked={isSelected}
                    onChange={() => handleSelectSize(s.id)}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>{s.title}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 bg-gray-50/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {t("common:actions.cancel")}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onDownload(selectedSize, true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              title={t("shipments:labels.printDirectlyTitle")}
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t("shipments:labels.printDirectly")}
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => onDownload(selectedSize, false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t("shipments:labels.downloadPdf")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Download (or open for printing) the carton labels PDF of a shipment. */
export async function downloadShipmentLabels(
  shipmentId: string,
  shipmentNumber: string,
  size: string = "6x4",
  autoPrint = false
): Promise<void> {
  const blob = await shipmentService.downloadLabelsPdf(shipmentId, size);
  const url = window.URL.createObjectURL(blob);
  if (autoPrint) {
    window.open(url, "_blank")?.focus();
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = `Labels_${shipmentNumber}_${size}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}

/** Route for a shipment's detail page (opened in a new tab). */
export function shipmentDetailPath(shipmentId: string, section?: "xml"): string {
  return `/shipments/${encodeURIComponent(shipmentId)}${section ? `#${section}` : ""}`;
}
