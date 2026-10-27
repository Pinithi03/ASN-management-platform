/**
 * Shipments & Advanced Shipping Notices (ASN) Page.
 * Offers two seamless workflows for suppliers:
 * 1. Smart Web Packing Wizard (Interactive Online Packing, Auto-split cartons & 20-digit HU generation)
 * 2. 12-Column Excel Drop (Tailored template generation, drag & drop ingestion, weight rule verification)
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Printer,
  FileCode,
  Send,
  X,
  Loader2,
  Check,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Box,
  FileText,
  Eye,
  SlidersHorizontal,
  Clock,
  FileEdit,
  RotateCcw,
  Layers,
  Copy,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/utils/cn";
import {
  shipmentService,
  ExcelValidationResult,
  CreateShipmentResponse,
} from "@/services/shipmentService";
import { poApi } from "@/services/poApi";
import { ensureFreshToken } from "@/lib/keycloak";
import {
  useNetworkStatus,
  saveManualDraft,
  getManualDraft,
  clearManualDraft,
  saveExcelDraft,
  getExcelDraft,
  clearExcelDraft,
  saveExcelFileBlob,
  getExcelFileBlob,
} from "@/utils/draftStorage";

const statusColor: Record<string, string> = {
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

interface ShipmentDisplayItem {
  id: string;
  shipment_number: string;
  plant_code?: string;
  destination_plant?: string;
  total_boxes: number;
  total_pieces: number;
  uom?: string;
  po_numbers?: string[];
  gross_weight?: number;
  net_weight?: number;
  carrier?: string;
  status: string;
  ship_date?: string;
  created_at?: string;
  asn_id?: string;
}

// --- Web Wizard Types ---
type POLineItem = {
  id: string;
  po_number: string;
  po_item: string;
  item_code: string;
  partner_product_code?: string;
  description: string;
  ordered_qty: number;
  shipped_qty: number;
  remaining_qty: number;
  shipping_now?: number;
  packaging_type?: "BOX" | "ROLL";
  uom?: string;
  destination?: string;
  delivery_date?: string;
  order_date?: string;
  supplier_id?: string;
};

type PackingBox = {
  id: string;
  hu_number: string;
  qty: number | null;
  batch_code: string;
  gross_weight?: number | null;
  net_weight?: number | null;
  lot_number?: string;
  supplier_carton_ref?: string;
  pack_number?: string;
  width?: number | null;
};

type PackedItem = POLineItem & {
  packaging_type?: "BOX" | "ROLL";
  lot_number?: string;
  boxes: PackingBox[];
};

export default function Shipments() {
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const poQuery = searchParams.get("pos") || searchParams.get("po") || "";
  const modeParam = searchParams.get("mode");
  const initialMode: "web" | "excel" = modeParam === "excel" ? "excel" : "web";

  // Navigation mode: 'list' (dashboard) vs 'create' (creation wizard/excel)
  const [isCreating, setIsCreating] = useState<boolean>(Boolean(poQuery));
  const [creationMethod, setCreationMethod] = useState<"web" | "excel">(initialMode);

  // Sync state if URL changes
  useEffect(() => {
    if (poQuery) {
      setIsCreating(true);
      const m = searchParams.get("mode");
      setCreationMethod(m === "excel" ? "excel" : "web");
    }
  }, [poQuery, searchParams]);

  // Dashboard state
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [shipments, setShipments] = useState<ShipmentDisplayItem[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [inspectShipmentId, setInspectShipmentId] = useState<string | null>(null);

  // Reset page when search or status filter changes
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  // XML Modal
  const [xmlModalData, setXmlModalData] = useState<{
    open: boolean;
    title: string;
    xmlContent: string;
    asnId?: string;
    validated: boolean;
  }>({
    open: false,
    title: "",
    xmlContent: "",
    validated: false,
  });

  // Load shipments for list view
  const loadShipments = async () => {
    setLoadingShipments(true);
    try {
      const supplierId = user?.role === "SUPPLIER" ? (user.supplier_id || undefined) : undefined;
      const data = await shipmentService.getShipments(undefined, undefined, supplierId);
      if (Array.isArray(data) && data.length > 0) {
        setShipments(
          data.map((d: any) => ({
            id: d.id,
            shipment_number: d.shipment_number,
            plant_code: d.plant_code,
            destination_plant: d.destination_plant,
            total_boxes: d.total_boxes,
            total_pieces: d.total_pieces,
            uom: d.uom || "M",
            po_numbers: d.po_numbers || [],
            gross_weight: d.gross_weight,
            net_weight: d.net_weight,
            carrier: d.carrier,
            status: d.status,
            ship_date: d.ship_date,
            created_at: d.created_at,
            asn_id: d.asn_id,
          }))
        );
      } else {
        setShipments([]);
      }
    } catch (err) {
      console.error("Failed to load shipments:", err);
      setShipments([]);
    } finally {
      setLoadingShipments(false);
    }
  };

  useEffect(() => {
    loadShipments();
  }, [user]);


  const [labelModalData, setLabelModalData] = useState<{
    open: boolean;
    shipmentId: string;
    shipmentNumber: string;
    totalBoxes?: number;
  } | null>(null);

  // Download / Print Labels PDF with customizable size
  const handleDownloadLabels = async (
    shipmentId: string,
    shipmentNumber: string,
    size: string = "6x4",
    autoPrint = false
  ) => {
    setActionLoadingId(`labels-${shipmentId}`);
    try {
      const blob = await shipmentService.downloadLabelsPdf(shipmentId, size);
      const url = window.URL.createObjectURL(blob);
      if (autoPrint) {
        const printWindow = window.open(url, "_blank");
        if (printWindow) {
          printWindow.focus();
        }
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `Labels_${shipmentNumber}_${size}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      alert(`Failed to download labels: ${e?.response?.data?.detail || e.message || e}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete / Revert Shipment and restore PO balances
  const handleDeleteShipment = async (s: any) => {
    const confirmMsg = `Are you sure you want to revert Shipment #${s.shipment_number}?\n\nThis will delete this delivery record and restore all carton line quantities back to the Purchase Order(s).`;
    if (!window.confirm(confirmMsg)) return;

    setActionLoadingId(`delete-${s.id}`);
    try {
      const res = await shipmentService.deleteShipment(s.id);
      alert(res.message || `Shipment #${s.shipment_number} reverted successfully!`);
      await loadShipments();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Failed to revert shipment. Please try again.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Preview ASN XML
  const handlePreviewXml = async (shipment: any) => {
    setActionLoadingId(`xml-${shipment.id}`);
    try {
      if (shipment.asn?.xml_content) {
        setXmlModalData({
          open: true,
          title: `ASN XML — Shipment ${shipment.shipment_number}`,
          xmlContent: shipment.asn.xml_content,
          asnId: shipment.asn?.id,
          validated: shipment.asn.xml_validated ?? true,
        });
        return;
      }
      const asnId = shipment.asn_id || shipment.asn?.id;
      if (asnId) {
        const data = await shipmentService.getASNXmlPreview(asnId);
        setXmlModalData({
          open: true,
          title: `ASN XML — Shipment ${shipment.shipment_number}`,
          xmlContent: data.xml_content,
          asnId: asnId,
          validated: data.xml_validated,
        });
      } else {
        alert("This shipment does not have a generated ASN XML yet. Finalize packing to generate the ASN.");
      }
    } catch (err: any) {
      alert(`Failed to load ASN XML: ${err?.response?.data?.detail || err?.message || "Unknown error"}`);
    } finally {
      setActionLoadingId(null);
    }
  };



  const filteredShipments = shipments.filter((s) => {
    const q = search.toLowerCase();
    const plantName = (s.plant_code ? formatPlantName(s.plant_code) : "").toLowerCase();
    const matchesSearch = !search || (
      s.shipment_number.toLowerCase().includes(q) ||
      plantName.includes(q) ||
      (s.po_numbers && s.po_numbers.some((p) => p.toLowerCase().includes(q))) ||
      (s.carrier && s.carrier.toLowerCase().includes(q))
    );
    const matchesStatus = statusFilter === "ALL" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalShipments = filteredShipments.length;
  const totalPages = Math.max(1, Math.ceil(totalShipments / PAGE_SIZE));
  const paginatedShipments = filteredShipments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const startItem = totalShipments === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalShipments);
  const paginationText =
    totalShipments === 0
      ? "0 of 0"
      : `${startItem.toLocaleString()}–${endItem.toLocaleString()} of ${totalShipments.toLocaleString()}`;

  return (
    <div className="p-6 space-y-6">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER / TITLE                                         */}
      {/* ───────────────────────────────────────────────────────────── */}
      {!isCreating ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Shipments</h1>
          </div>
        </div>
      ) : creationMethod === "excel" ? (
        <div className="flex items-center justify-between pb-3 border-b border-gray-200">
          <button
            onClick={() => {
              if (poQuery) {
                navigate("/purchase-orders/excel");
              } else {
                setIsCreating(false);
                setSearchParams({});
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> {poQuery ? "Back to Purchase Orders" : "Back to Shipments"}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
              Excel Packing List Dispatch
            </span>
            <button
              onClick={() => {
                setCreationMethod("web");
                if (poQuery) setSearchParams({ pos: poQuery, mode: "web" });
              }}
              className={cn(
                "text-xs hover:underline font-semibold cursor-pointer",
                isSupplier ? "text-emerald-600 hover:text-emerald-700" : "text-blue-600 hover:text-blue-700"
              )}
            >
              Switch to Web Workbench →
            </button>
          </div>
        </div>
      ) : null}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. BODY CONTENT (LIST vs WEB WIZARD vs EXCEL DROP)            */}
      {/* ───────────────────────────────────────────────────────────── */}
      {!isCreating ? (
        /* SHIPMENTS TABLE VIEW */
        <div className="space-y-6">


          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search shipment #, plant..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-xs"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-xs cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PACKING">Packing</option>
              <option value="PACKED">Packed</option>
              <option value="XML_SENT">XML Sent</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="DELIVERED">Delivered</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-5 py-3.5">Packing Slip No</th>
                    <th className="px-5 py-3.5">PO Number</th>
                    <th className="px-5 py-3.5">Destination Plant</th>
                    <th className="px-5 py-3.5">Cartons / Rolls</th>
                    <th className="px-5 py-3.5">Total Quantity</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Ship Date</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedShipments.map((s) => {
                    const plantLabel = s.destination_plant || (s.plant_code ? formatPlantName(s.plant_code) : " ");
                    const uomLabel = s.uom || "M";
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setInspectShipmentId(s.id)}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                      >
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <div className="font-mono text-xs font-bold text-gray-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                            {s.shipment_number}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          {s.po_numbers && s.po_numbers.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[160px]">
                              {s.po_numbers.slice(0, 2).map((po) => (
                                <span
                                  key={po}
                                  className="inline-flex items-center rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-mono font-semibold text-blue-700"
                                >
                                  {po}
                                </span>
                              ))}
                              {s.po_numbers.length > 2 && (
                                <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                                  +{s.po_numbers.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs"> </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800">
                            {plantLabel}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-gray-800 font-mono text-xs">
                            {s.total_boxes} {s.total_boxes === 1 ? "Carton" : "Cartons"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="text-gray-900 font-bold font-mono text-xs">
                            {s.total_pieces?.toLocaleString()}
                          </span>{" "}
                          <span className="text-gray-500 text-xs font-medium">{uomLabel}</span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border",
                              statusColor[s.status] || "bg-gray-50 text-gray-700 border-gray-200"
                            )}
                          >
                            {s.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-gray-500 text-xs">
                          {s.ship_date ? new Date(s.ship_date).toLocaleDateString("en-GB") : " "}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">

                            <button
                              onClick={() =>
                                setLabelModalData({
                                  open: true,
                                  shipmentId: s.id,
                                  shipmentNumber: s.shipment_number,
                                  totalBoxes: s.total_boxes,
                                })
                              }
                              disabled={actionLoadingId === `labels-${s.id}`}
                              title="Print or Download Barcode Labels"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {actionLoadingId === `labels-${s.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                              ) : (
                                <Printer className="h-3.5 w-3.5 text-slate-500" />
                              )}
                              Labels
                            </button>

                            <button
                              onClick={() => handlePreviewXml(s)}
                              disabled={actionLoadingId === `xml-${s.id}`}
                              title="View SdDataSlice EDI XML"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {actionLoadingId === `xml-${s.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                              ) : (
                                <FileCode className="h-3.5 w-3.5 text-slate-500" />
                              )}
                              ASN XML
                            </button>

                            <button
                              onClick={() => handleDeleteShipment(s)}
                              disabled={actionLoadingId === `delete-${s.id}`}
                              title="Revert shipment"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {actionLoadingId === `delete-${s.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5 text-red-600" />
                              )}
                              Revert
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {loadingShipments ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center text-gray-400">
                        <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-500 mb-3" />
                        <p className="font-medium text-gray-600">Loading shipments…</p>
                      </td>
                    </tr>
                  ) : filteredShipments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center text-gray-400">
                        <Box className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                        <p className="font-semibold text-gray-700 text-base">No shipments found</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Create a shipment using the Web Wizard or upload an Excel Packing List.
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Bottom Pagination Footer */}
            {totalShipments > 0 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50/70 select-none text-xs text-slate-500">
                <div className="font-medium text-slate-500">
                  <span className="font-semibold text-slate-700">{totalShipments.toLocaleString()} total shipments</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <span className="px-2 font-normal tracking-tight text-slate-600">
                    {paginationText}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    title="Previous page"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    title="Next page"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : creationMethod === "web" ? (
        /* OPTION 1: SMART WEB PACKING WIZARD */
        <WebPackingWizard
          poQuery={poQuery}
          onSuccess={() => {
            setIsCreating(false);
            setSearchParams({});
            loadShipments();
          }}
          onOpenLabelModal={(id, num, count) =>
            setLabelModalData({ open: true, shipmentId: id, shipmentNumber: num, totalBoxes: count })
          }
        />
      ) : (
        /* OPTION 2: 12-COLUMN EXCEL WORKFLOW */
        <ExcelPackingWorkflow
          targetPo={poQuery.split(",")[0] || undefined}
          targetPos={poQuery.split(",").filter(Boolean)}
          onSuccess={() => {
            setIsCreating(false);
            setSearchParams({});
            loadShipments();
          }}
          onOpenLabelModal={(id, num, count) =>
            setLabelModalData({ open: true, shipmentId: id, shipmentNumber: num, totalBoxes: count })
          }
        />
      )}

      {/* SHIPMENT DETAIL & CARTON INSPECTION MODAL */}
      {inspectShipmentId && (
        <ShipmentDetailModal
          shipmentId={inspectShipmentId}
          onClose={() => setInspectShipmentId(null)}
          onDownloadLabels={(id, num, count) =>
            setLabelModalData({ open: true, shipmentId: id, shipmentNumber: num, totalBoxes: count })
          }
          onPreviewXml={handlePreviewXml}
        />
      )}

      {/* XML PREVIEW MODAL */}
      {xmlModalData.open && (
        <XmlPreviewModal
          data={xmlModalData}
          onClose={() => setXmlModalData((prev) => ({ ...prev, open: false }))}
        />
      )}

      {/* LABEL PRINT & SIZE SELECTION MODAL */}
      {labelModalData?.open && (
        <LabelPrintModal
          data={labelModalData}
          onClose={() => setLabelModalData(null)}
          onDownload={(size, autoPrint) => {
            handleDownloadLabels(labelModalData.shipmentId, labelModalData.shipmentNumber, size, autoPrint);
          }}
          isLoading={actionLoadingId === `labels-${labelModalData.shipmentId}`}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SUBCOMPONENT A: Interactive Web Packing Wizard (3-Step Online)
// ───────────────────────────────────────────────────────────────────
function WebPackingWizard({
  poQuery,
  onSuccess,
  onOpenLabelModal,
}: {
  poQuery: string;
  onSuccess: () => void;
  onOpenLabelModal?: (id: string, num: string, count?: number) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const navigate = useNavigate();
  const poNumbers = poQuery.split(",").filter(Boolean);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [items, setItems] = useState<POLineItem[]>([]);
  const [packedItems, setPackedItems] = useState<PackedItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessResult, setSubmitSuccessResult] = useState<any>(null);
  const [previewXmlModal, setPreviewXmlModal] = useState<string | null>(null);
  const [startingSeq, setStartingSeq] = useState<number>(1);
  const [packingSlipNumber, setPackingSlipNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [copiedHu, setCopiedHu] = useState<string | null>(null);

  const [splitConfigs, setSplitConfigs] = useState<Record<string, { mode: "qty" | "count"; value: string }>>({});
  const [searchParams] = useSearchParams();
  const shouldResume = searchParams.get("resume") === "true";
  const [draftSavedToast, setDraftSavedToast] = useState(false);
  const [unresumedDraft, setUnresumedDraft] = useState<any>(null);
  const isOnline = useNetworkStatus();

  // Fetch open PO lines from live PostgreSQL database
  const { data: openLinesData, isLoading } = useQuery({
    queryKey: ["open_lines_wizard", poNumbers, user?.supplier_id],
    queryFn: async () => {
      try {
        const supplierId = user?.role === "SUPPLIER" ? user.supplier_id : undefined;
        const lines = await poApi.getOpenLines(supplierId ? { supplier_id: supplierId } : undefined);
        if (Array.isArray(lines) && lines.length > 0) {
          const matched = lines.filter((l) => !poNumbers.length || poNumbers.includes(l.po_number));
          if (matched.length > 0) {
            return matched.map((m: any, idx: number) => ({
              id: `${m.po_number}-${m.po_item || idx}`,
              po_number: m.po_number,
              po_item: m.po_item ? String(m.po_item).trim() : String(idx + 1),
              item_code: m.material_code || "ITEM-" + idx,
              partner_product_code: m.partner_code || m.partner_product_code || "",
              description: m.material_description || "PO Line Item",
              ordered_qty: Number(m.ordered_qty || 1000),
              shipped_qty: Number(m.shipped_qty || 0),
              remaining_qty: m.remaining_qty !== undefined ? Number(m.remaining_qty) : Number(m.ordered_qty || 1000),
              shipping_now: 0,
              packaging_type: (m.pack_type || m.packaging_type || "BOX") as "BOX" | "ROLL",
              uom: m.uom || "M",
              destination: m.destination || "",
              delivery_date: m.delivery_date || "",
              order_date: m.order_date || "",
              supplier_id: m.supplier_id || "",
            }));
          }
        }
      } catch (err) {
        console.warn("Could not fetch real open lines, falling back to PO numbers:", err);
      }

      // Default mock for selected PO numbers
      const fallback: POLineItem[] = [];
      const list = poNumbers.length > 0 ? poNumbers : ["2001297727"];
      list.forEach((po) => {
        fallback.push({
          id: `${po}-line-1`,
          po_number: po,
          po_item: "00100",
          item_code: "ELST1K 000615",
          partner_product_code: "SK104546-015.0-61851",
          description: "Elastic tape 15mm black - Sirio Spec",
          ordered_qty: 2450,
          shipped_qty: 0,
          remaining_qty: 2450,
          shipping_now: 0,
          uom: "M",
          destination: "Omega Line Ltd (PPA1)",
        });
        fallback.push({
          id: `${po}-line-2`,
          po_number: po,
          po_item: "00200",
          item_code: "RECT0724DKK0000000",
          partner_product_code: "TH002500-120.0-SETA",
          description: "RE-Thread-EP-2500m, 120tkt, SETA",
          ordered_qty: 1200,
          shipped_qty: 0,
          remaining_qty: 1200,
          shipping_now: 0,
          uom: "M",
          destination: "Omega Line Ltd (PPA1)",
        });
      });
      return fallback;
    },
  });

  // Check for existing saved draft on load (auto-resume if navigated from Drafts page)
  useEffect(() => {
    const suppCode = user?.supplier_code || "0000018194";
    const draft = getManualDraft(suppCode, poNumbers);
    if (draft && shouldResume) {
      if (draft.items && draft.items.length > 0) {
        if (openLinesData && openLinesData.length > 0) {
          const merged = openLinesData.map((liveLine) => {
            const match = draft.items.find(
              (p: any) =>
                p.id === liveLine.id ||
                (p.po_number === liveLine.po_number &&
                  String(p.po_item).replace(/^0+/, "") === String(liveLine.po_item).replace(/^0+/, ""))
            );
            if (match) {
              return {
                ...liveLine,
                shipping_now: match.shipping_now ?? 0,
                packaging_type: match.packaging_type || liveLine.packaging_type || "BOX",
              };
            }
            return {
              ...liveLine,
              packaging_type: liveLine.packaging_type || "BOX",
              shipping_now: 0,
            };
          });
          setItems(merged);
        } else {
          setItems(draft.items);
        }
      }
      if (draft.packedItems && draft.packedItems.length > 0) setPackedItems(draft.packedItems);
      if (draft.step) setStep(draft.step);
      if (draft.startingSeq) setStartingSeq(draft.startingSeq);
      if (draft.packingSlipNumber) setPackingSlipNumber(draft.packingSlipNumber);
      if (draft.deliveryDate) setDeliveryDate(draft.deliveryDate);
    } else if (draft && !shouldResume) {
      setUnresumedDraft(draft);
    }
  }, [user?.supplier_code, poNumbers.join(","), shouldResume, openLinesData]);

  const restoreDraft = () => {
    if (unresumedDraft) {
      if (unresumedDraft.items && unresumedDraft.items.length > 0) setItems(unresumedDraft.items);
      if (unresumedDraft.packedItems && unresumedDraft.packedItems.length > 0) setPackedItems(unresumedDraft.packedItems);
      if (unresumedDraft.step) setStep(unresumedDraft.step);
      if (unresumedDraft.startingSeq) setStartingSeq(unresumedDraft.startingSeq);
      if (unresumedDraft.packingSlipNumber) setPackingSlipNumber(unresumedDraft.packingSlipNumber);
      if (unresumedDraft.deliveryDate) setDeliveryDate(unresumedDraft.deliveryDate);
      setUnresumedDraft(null);
    }
  };

  const discardDraft = () => {
    const suppCode = user?.supplier_code || "0000018194";
    clearManualDraft(suppCode, poNumbers);
    setUnresumedDraft(null);
  };

  const handleManualSaveDraft = () => {
    const suppCode = user?.supplier_code || "0000018194";
    saveManualDraft(suppCode, poNumbers, {
      step,
      items,
      packedItems,
      startingSeq,
      packingSlipNumber,
      deliveryDate,
    });
    setDraftSavedToast(true);
    setTimeout(() => setDraftSavedToast(false), 2500);
  };

  // Debounced auto-save to localStorage
  useEffect(() => {
    if (submitSuccessResult) return;
    const suppCode = user?.supplier_code || "0000018194";
    const hasData =
      packedItems.length > 0 ||
      items.some((i) => (i.shipping_now || 0) > 0) ||
      Boolean(packingSlipNumber.trim()) ||
      Boolean(deliveryDate.trim());

    if (!hasData) return;

    const timer = setTimeout(() => {
      saveManualDraft(suppCode, poNumbers, {
        step,
        items,
        packedItems,
        startingSeq,
        packingSlipNumber,
        deliveryDate,
      });
    }, 600);

    return () => clearTimeout(timer);
  }, [
    items,
    packedItems,
    step,
    startingSeq,
    packingSlipNumber,
    deliveryDate,
    submitSuccessResult,
    user?.supplier_code,
    poNumbers.join(","),
  ]);

  // Optional columns configuration for Step 2 Web Workbench (Supplier Ref, Width, Packing Slip No)
  type OptionalColumnKey = "supplier_ref" | "width" | "pack_no";
  const [visibleColumns, setVisibleColumns] = useState<Record<OptionalColumnKey, boolean>>({
    supplier_ref: false,
    width: false,
    pack_no: false,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const getHuPrefix = () => {
    const suppCodeClean = (user?.supplier_code || "0000018194").replace(/^0+/, "");
    return "1" + suppCodeClean.padStart(9, "0");
  };

  const formatHu = (seq: number) => {
    const prefix = getHuPrefix();
    return `${prefix}${String(seq).padStart(10, "0")}`;
  };

  const resequenceAllCartons = (itemsToResequence: PackedItem[], startNum = startingSeq): PackedItem[] => {
    let currentSeq = startNum;
    return itemsToResequence.map((item) => ({
      ...item,
      boxes: item.boxes.map((box) => ({
        ...box,
        hu_number: formatHu(currentSeq++),
      })),
    }));
  };

  // Synchronize next sequential HU from database sequence
  useEffect(() => {
    if (shouldResume) return;
    let isMounted = true;
    const fetchSeq = async () => {
      try {
        const suppCode = user?.supplier_code || "0000018194";
        const suppId = user?.supplier_id || undefined;
        const res = await shipmentService.getNextHuSequence(suppCode, suppId);
        if (isMounted && res && typeof res.next_number === "number") {
          setStartingSeq(res.next_number);
          setPackedItems((prev) => {
            if (prev.length > 0) {
              return resequenceAllCartons(prev, res.next_number);
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn("Could not fetch next HU sequence, defaulting to 1:", err);
      }
    };
    fetchSeq();
    return () => {
      isMounted = false;
    };
  }, [user?.supplier_code, user?.supplier_id, shouldResume]);

  const allCartonsList = useMemo(() => {
    let globalIndex = 1;
    return packedItems.flatMap((item) =>
      item.boxes.map((box, bIdx) => {
        const cIndex = globalIndex++;
        const huNum =
          (submitSuccessResult?.handling_units?.[cIndex - 1]) ||
          box.hu_number ||
          formatHu(startingSeq + cIndex - 1);
        return {
          index: cIndex,
          boxIndexInItem: bIdx + 1,
          hu_number: huNum,
          po_number: item.po_number,
          po_item: item.po_item,
          item_code: item.item_code,
          description: item.description,
          uom: item.uom || "M",
          qty: box.qty,
          gross_weight: box.gross_weight,
          net_weight: box.net_weight,
          lot_number: (box.batch_code || box.lot_number || "").trim() || "—",
          supplier_carton_ref: (box.supplier_carton_ref || "").trim() || `CTN-${cIndex}`,
        };
      })
    );
  }, [packedItems, submitSuccessResult, startingSeq]);

  const totalShippedUnits = useMemo(
    () => allCartonsList.reduce((acc, c) => acc + (Number(c.qty) || 0), 0),
    [allCartonsList]
  );
  const totalGw = useMemo(
    () => allCartonsList.reduce((acc, c) => acc + (Number(c.gross_weight) || 0), 0),
    [allCartonsList]
  );
  const totalNw = useMemo(
    () => allCartonsList.reduce((acc, c) => acc + (Number(c.net_weight) || 0), 0),
    [allCartonsList]
  );

  const buildLiveXmlPreview = () => {
    if (submitSuccessResult?.asn?.xml_content) {
      return submitSuccessResult.asn.xml_content;
    }
    const psNum = (packingSlipNumber.trim() || "01000000").padStart(8, "0");
    const dDate = deliveryDate.trim()
      ? deliveryDate.split("-").reverse().join("-")
      : new Date().toLocaleDateString("en-GB").replace(/\//g, "-");
    const todayStr = new Date().toLocaleDateString("en-GB").replace(/\//g, "-");
    const suppCode = (user?.supplier_code || "0000018194").padStart(10, "0");
    const firstItem = packedItems[0];
    const targetPlant = matchPlant(firstItem?.destination);
    const plantName = formatPlantName(targetPlant);

    let linesXml = "";
    packedItems.forEach((item, itemIdx) => {
      item.boxes.forEach((box, bIdx) => {
        const hu = box.hu_number || formatHu(startingSeq + bIdx);
        const qty = box.qty || item.shipping_now || 0;
        const gw = box.gross_weight != null && Number(box.gross_weight) > 0 ? Number(box.gross_weight) : (Number(qty) * 0.15).toFixed(2);
        const nw = box.net_weight != null && Number(box.net_weight) > 0 ? Number(box.net_weight) : (Number(qty) * 0.12).toFixed(2);
        linesXml += `
    <SdPackingSlipLine>
      <PackingSlipLineNumber>${itemIdx + 1}-${bIdx + 1}</PackingSlipLineNumber>
      <OrderTypeName>ZA6A</OrderTypeName>
      <OrderNumber>${item.po_number}</OrderNumber>
      <OrderDate>${todayStr}</OrderDate>
      <OrderLineNumber>${item.po_item || "00100"}</OrderLineNumber>
      <Qty>${qty}</Qty>
      <BackOrder></BackOrder>
      <AcceptanceDate></AcceptanceDate>
      <AcceptanceQty></AcceptanceQty>
      <MaterialCode>${item.item_code}</MaterialCode>
      <MaterialDescription>${item.description || item.item_code}</MaterialDescription>
      <PartnerProductCode>${item.partner_product_code || item.item_code}</PartnerProductCode>
      <LotNumber>${(box.batch_code || box.lot_number || "").trim() || "DEFAULT"}</LotNumber>
      <PackNumber>${box.pack_number || ""}</PackNumber>
      <SupplierCartonReference>${box.supplier_carton_ref || `CTN-${bIdx + 1}`}</SupplierCartonReference>
      <BoxType>${item.packaging_type || "BOX"}</BoxType>
      <HuNumber>${hu}</HuNumber>
      <UnitOfMeasure>${item.uom || "M"}</UnitOfMeasure>
      <GrossWeight>${gw}</GrossWeight>
      <NetWeight>${nw}</NetWeight>
      <AuxRow1>${itemIdx + 1}</AuxRow1>
      <AuxRowNum1>${bIdx + 1}</AuxRowNum1>
    </SdPackingSlipLine>`;
      });
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE SdDataSlice SYSTEM "m2Data_Partner.dtd">
<SdDataSlice>
  <SdCompanyHeader>
    <LegalName>${plantName}</LegalName>
    <Group>${targetPlant}</Group>
    <TransmissionDate>${todayStr} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</TransmissionDate>
  </SdCompanyHeader>
  <SdPackingSlip>
    <PartnerId>${suppCode}</PartnerId>
    <PackingSlipNumber>${psNum}</PackingSlipNumber>
    <FgOutbound>false</FgOutbound>
    <PackingSlipDate>${todayStr}</PackingSlipDate>
    <DeliveryDate>${dDate}</DeliveryDate>
    <Note>Dispatch for PO ${poNumbers.join(", ")}</Note>${linesXml}
  </SdPackingSlip>
</SdDataSlice>`;
  };

  const handlePrintLabels = () => {
    const sId = submitSuccessResult?.shipment?.id;
    const sNum = submitSuccessResult?.shipment?.shipment_number || packingSlipNumber;
    const bCount = allCartonsList.length;
    if (onOpenLabelModal && sId) {
      onOpenLabelModal(sId, sNum, bCount);
    } else if (sId) {
      shipmentService.downloadLabelsPdf(sId, "6x4").then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Labels_${sNum}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      });
    }
  };

  const handleDownloadXml = () => {
    const xml = submitSuccessResult?.asn?.xml_content || buildLiveXmlPreview();
    const blob = new Blob([xml], { type: "application/xml" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = submitSuccessResult?.asn?.xml_filename || `Dispatch_ASN_${packingSlipNumber || "PL"}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleDispatchASN = async () => {
    if (!isOnline) {
      alert("You are currently offline. Please reconnect to the internet before sending the ASN to IUNGO.");
      return;
    }
    const trimmedPs = packingSlipNumber.trim();
    if (!trimmedPs) {
      alert("Please enter Packing Slip / Delivery Note Number before dispatching.");
      return;
    }
    const trimmedDate = deliveryDate.trim();
    if (!trimmedDate) {
      alert("Please enter or select Delivery Date before dispatching.");
      return;
    }
    setIsSubmitting(true);
    try {
      // Proactively refresh JWT before making network call to avoid mid-dispatch 401
      await ensureFreshToken(60);

      const firstItem = packedItems[0];
      const targetPlant = matchPlant(firstItem?.destination);
      const activeSupplierCode = user?.supplier_code || "0000018194";
      const activeSupplierName = user?.supplier_name || "COATS THREAD EXPORTS (PRIVATE) LIMITED";

      const cartonsPayload = packedItems.flatMap((item) =>
        item.boxes.map((box, bIdx) => ({
          po_number: item.po_number,
          po_line: item.po_item || "00100",
          product_code: item.item_code,
          partner_product_code: item.partner_product_code || item.item_code,
          description: item.description,
          lot_number: (box.batch_code || box.lot_number || "").trim() || "DEFAULT",
          quantity: Number(box.qty),
          uom: item.uom || "M",
          net_weight: box.net_weight != null && !isNaN(Number(box.net_weight)) && Number(box.net_weight) > 0 ? Number(box.net_weight) : undefined,
          gross_weight: box.gross_weight != null && !isNaN(Number(box.gross_weight)) && Number(box.gross_weight) > 0 ? Number(box.gross_weight) : undefined,
          supplier_carton_ref: (box.supplier_carton_ref || "").trim() || `CTN-${bIdx + 1}`,
          pack_number: (box.pack_number || "").trim() || undefined,
          width: box.width != null && !isNaN(Number(box.width)) ? Number(box.width) : undefined,
          packaging_type: item.packaging_type || "BOX",
          hu_number: box.hu_number,
        }))
      );

      // 1. Create shipment and generate validated ASN XML
      const res = await shipmentService.createDirect({
        packing_slip_number: trimmedPs,
        plant_code: targetPlant,
        supplier_code: activeSupplierCode,
        supplier_name: activeSupplierName,
        supplier_id: user?.supplier_id || undefined,
        carrier: "EXPRESS FREIGHT",
        estimated_arrival: trimmedDate || undefined,
        note: `Online Web Packing Wizard dispatch for PO ${poNumbers.join(", ")}`,
        cartons: cartonsPayload as any,
      });

      // 2. Dispatch the generated ASN to EDI
      if (res?.asn?.id) {
        try {
          await shipmentService.sendASN(res.asn.id);
        } catch (sendErr) {
          console.warn("ASN created, but EDI send error:", sendErr);
        }
      }

      setSubmitSuccessResult(res);
      clearManualDraft(activeSupplierCode, poNumbers);
      clearExcelDraft(activeSupplierCode, poNumbers);
    } catch (err: any) {
      alert("Submission error: " + (err?.response?.data?.detail || err?.message || "Failed to create shipment"));
    } finally {
      setIsSubmitting(false);
    }
  };


  useEffect(() => {
    if (openLinesData && openLinesData.length > 0) {
      setItems((prev) => {
        // If user already has items (either from a restored draft or active editing),
        // intelligently merge: keep the LIVE database remaining_qty/shipped_qty
        // while 100% preserving user's edited shipping_now and packaging_type!
        if (prev.length > 0) {
          return openLinesData.map((liveLine) => {
            const match = prev.find(
              (p) =>
                p.id === liveLine.id ||
                (p.po_number === liveLine.po_number &&
                  String(p.po_item).replace(/^0+/, "") === String(liveLine.po_item).replace(/^0+/, ""))
            );
            if (match) {
              return {
                ...liveLine, // Live stock & open balance from PostgreSQL
                shipping_now: match.shipping_now ?? 0, // Preserves user's edited input
                packaging_type: match.packaging_type || liveLine.packaging_type || "BOX",
              };
            }
            return {
              ...liveLine,
              packaging_type: liveLine.packaging_type || "BOX",
              shipping_now: 0,
            };
          });
        }
        return openLinesData.map((line) => ({
          ...line,
          packaging_type: line.packaging_type || "BOX",
          shipping_now: 0,
        }));
      });

      // Default Delivery Date from PO XML delivery_date if not set from draft
      setDeliveryDate((prev) => {
        if (prev) return prev;
        const rawDate = openLinesData.find((l) => l.delivery_date)?.delivery_date;
        if (rawDate) {
          const formatted = rawDate.includes("T") ? rawDate.split("T")[0] : rawDate;
          if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
        }
        return new Date(Date.now() + 86400000).toISOString().split("T")[0];
      });
    }
  }, [openLinesData]);

  const distinctPoNumbers = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.po_number).filter(Boolean)));
  }, [items]);

  const handleSetPoPackagingType = (poNo: string, type: "BOX" | "ROLL") => {
    setItems((prev) =>
      prev.map((item) => ((item.po_number || "Default") === poNo ? { ...item, packaging_type: type } : item))
    );
  };

  const formatSummary = useMemo(() => {
    if (items.length === 0) return "All Boxes";
    const hasRolls = items.some((i) => i.packaging_type === "ROLL");
    const hasBoxes = items.some((i) => (i.packaging_type || "BOX") === "BOX");
    if (hasRolls && hasBoxes) return "Mixed (Box & Roll)";
    if (hasRolls) return "All Rolls";
    return "All Boxes";
  }, [items]);

  const handleShippingNowChange = (id: string, val: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, shipping_now: Math.min(Math.max(0, val), item.remaining_qty) } : item
      )
    );
  };


  const handleProceedToPacking = () => {
    const toPack = items.filter((i) => (i.shipping_now || 0) > 0);
    if (toPack.length === 0) {
      alert("Please enter a shipping quantity for at least one item.");
      return;
    }

    const overBalanceItems = toPack.filter((i) => (i.shipping_now || 0) > (i.remaining_qty || 0));
    if (overBalanceItems.length > 0) {
      alert(
        `Shipping quantity exceeds current open balance for:\n\n` +
          overBalanceItems
            .map(
              (it) =>
                `• PO ${it.po_number} Item ${it.po_item}: Requested ${it.shipping_now} ${it.uom}, but current open balance is only ${it.remaining_qty} ${it.uom}`
            )
            .join("\n") +
          `\n\nPlease adjust the shipping quantity to not exceed the current available balance.`
      );
      return;
    }

    let runningSeq = startingSeq;
    const prefix = getHuPrefix();
    const initialPacked: PackedItem[] = toPack.map((item) => {
      const packType = item.packaging_type || "BOX";
      return {
        ...item,
        packaging_type: packType,
        lot_number: "",
        boxes: [
          {
            id: `box-${Date.now()}-${Math.random()}`,
            hu_number: `${prefix}${String(runningSeq++).padStart(10, "0")}`,
            batch_code: "",
            qty: null,
            gross_weight: null,
            net_weight: null,
            supplier_carton_ref: "",
            pack_number: packingSlipNumber || "",
            width: null,
          },
        ],
      };
    });

    setPackedItems(initialPacked);
    setStep(2);
  };

  const handleSplitBox = (itemId: string, boxQty: number) => {
    if (boxQty <= 0) return;
    setPackedItems((prev) => {
      const updated = prev.map((item) => {
        if (item.id !== itemId) return item;

        const totalQty = item.shipping_now || 0;
        const numBoxes = Math.ceil(totalQty / boxQty);
        const newBoxes: PackingBox[] = [];

        let remaining = totalQty;
        for (let i = 0; i < numBoxes; i++) {
          const qtyThisBox = Math.min(boxQty, remaining);
          remaining -= qtyThisBox;
          const existing = item.boxes[i];
          newBoxes.push({
            id: existing ? existing.id : `box-${Date.now()}-${i}-${Math.random()}`,
            hu_number: "", // Allocated sequentially below
            batch_code: existing?.batch_code || item.boxes[0]?.batch_code || "",
            qty: qtyThisBox,
            gross_weight: existing?.gross_weight ?? null,
            net_weight: existing?.net_weight ?? null,
            supplier_carton_ref: existing?.supplier_carton_ref ?? "",
            pack_number: existing?.pack_number || packingSlipNumber || "",
            width: existing?.width ?? null,
          });
        }
        return { ...item, boxes: newBoxes };
      });
      return resequenceAllCartons(updated, startingSeq);
    });
  };

  const handleSplitByCount = (itemId: string, count: number) => {
    if (count <= 0) return;
    setPackedItems((prev) => {
      const updated = prev.map((item) => {
        if (item.id !== itemId) return item;

        const newBoxes: PackingBox[] = [];

        for (let i = 0; i < count; i++) {
          const existing = item.boxes[i];
          newBoxes.push({
            id: existing ? existing.id : `box-${Date.now()}-${i}-${Math.random()}`,
            hu_number: "",
            batch_code: existing?.batch_code || item.boxes[0]?.batch_code || "",
            qty: null,
            gross_weight: existing?.gross_weight ?? null,
            net_weight: existing?.net_weight ?? null,
            supplier_carton_ref: existing?.supplier_carton_ref ?? "",
            pack_number: existing?.pack_number || packingSlipNumber || "",
            width: existing?.width ?? null,
          });
        }
        return { ...item, boxes: newBoxes };
      });
      return resequenceAllCartons(updated, startingSeq);
    });
  };

  const handleApplySplit = (item: PackedItem) => {
    const config = splitConfigs[item.id] || { mode: "qty", value: "" };
    const rawVal = parseFloat(config.value);

    if (isNaN(rawVal) || rawVal <= 0) {
      alert("Please enter a valid positive number greater than 0 to split.");
      return;
    }

    const totalQty = item.shipping_now || 0;
    if (totalQty <= 0) {
      alert("Shipping quantity is 0. Please set shipping quantity first.");
      return;
    }

    if (config.mode === "qty") {
      handleSplitBox(item.id, rawVal);
    } else {
      const count = Math.round(rawVal);
      if (count < 1) {
        alert("Please enter at least 1 carton.");
        return;
      }
      handleSplitByCount(item.id, count);
    }
  };


  const updateBox = (itemId: string, boxIndex: number, patch: Partial<PackingBox>) => {
    setPackedItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const newBoxes = item.boxes.map((b, idx) => (idx === boxIndex ? { ...b, ...patch } : b));
        return { ...item, boxes: newBoxes };
      })
    );
  };

  const addBox = (itemId: string) => {
    setPackedItems((prev) => {
      const updated = prev.map((item) => {
        if (item.id !== itemId) return item;
        const newBoxes: PackingBox[] = [
          ...item.boxes,
          {
            id: `box-${Date.now()}-${Math.random()}`,
            hu_number: "",
            batch_code: item.boxes[0]?.batch_code || "",
            qty: null,
            gross_weight: null,
            net_weight: null,
            supplier_carton_ref: "",
            pack_number: "",
            width: null,
          },
        ];
        return { ...item, boxes: newBoxes };
      });
      return resequenceAllCartons(updated, startingSeq);
    });
  };

  const removeBox = (itemId: string, boxIndex: number) => {
    setPackedItems((prev) => {
      const updated = prev.map((item) => {
        if (item.id !== itemId || item.boxes.length <= 1) return item;
        const remaining = item.boxes.filter((_, idx) => idx !== boxIndex);
        return { ...item, boxes: remaining };
      });
      return resequenceAllCartons(updated, startingSeq);
    });
  };

  const copyBatchToAllCartons = (itemId: string, batchValue: string) => {
    if (!batchValue?.trim()) return;
    setPackedItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          boxes: item.boxes.map((b) => ({ ...b, batch_code: batchValue.trim() })),
        };
      })
    );
  };

  const handleProceedToReview = () => {
    // If packingSlipNumber is empty, look for the first carton pack_number entered in table
    if (!packingSlipNumber.trim()) {
      const foundPs = packedItems.flatMap((i) => i.boxes).find((b) => b.pack_number?.trim())?.pack_number?.trim();
      if (foundPs) {
        setPackingSlipNumber(foundPs);
      }
    }

    for (const item of packedItems) {
      const boxTotal = item.boxes.reduce((acc, b) => acc + (Number(b.qty) || 0), 0);
      if (boxTotal !== item.shipping_now) {
        alert(
          `Item ${item.item_code} carton quantities total (${boxTotal}) does not match shipping quantity (${item.shipping_now}). Please balance carton quantities.`
        );
        return;
      }
      for (let bIdx = 0; bIdx < item.boxes.length; bIdx++) {
        const box = item.boxes[bIdx];
        if (!box.qty || box.qty <= 0) {
          alert(`Carton ${bIdx + 1} for item ${item.item_code} has 0 or invalid quantity.`);
          return;
        }
        if (!box.batch_code || !box.batch_code.trim()) {
          alert(`Carton ${bIdx + 1} for item ${item.item_code}: Batch / Lot number is mandatory.`);
          return;
        }
        const gw = box.gross_weight != null && !isNaN(Number(box.gross_weight)) ? Number(box.gross_weight) : null;
        const nw = box.net_weight != null && !isNaN(Number(box.net_weight)) ? Number(box.net_weight) : null;

        if (nw === null || nw <= 0) {
          alert(`Carton ${bIdx + 1} for item ${item.item_code}: Net Weight (kg) is mandatory and must be greater than 0.`);
          return;
        }
        if (gw === null || gw <= 0) {
          alert(`Carton ${bIdx + 1} for item ${item.item_code}: Gross Weight (kg) is mandatory and must be greater than 0.`);
          return;
        }
        if (gw <= nw) {
          alert(
            `Carton ${bIdx + 1} for item ${item.item_code}: Gross Weight (${gw} kg) must be strictly greater than Net Weight (${nw} kg).`
          );
          return;
        }
      }
    }
    setStep(3);
  };

  return (
    <div className="space-y-4 font-sans text-gray-800">
      {unresumedDraft && (
        <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 shadow-sm animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold">
              Unsaved draft recovered: Packing Slip{" "}
              <strong className="font-mono text-amber-800">
                {unresumedDraft.packingSlipNumber || "(In Progress)"}
              </strong>{" "}
              ({unresumedDraft.packedItems?.length || 0} items)
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={restoreDraft}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer transition-colors"
            >
              Restore Draft
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="px-2.5 py-1 text-gray-500 hover:text-gray-800 text-xs font-medium cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ─── STICKY ACTION HEADER TOOLBAR ──────────────────────── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-sm px-4 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Left: Exit/Back & ERP Context */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (step === 3) setStep(2);
                else if (step === 2) setStep(1);
                else if (poNumbers.length > 0 || poQuery) {
                  navigate("/purchase-orders/manual");
                } else {
                  onSuccess();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 rounded-lg border border-gray-300 shadow-xs transition-colors cursor-pointer"
              title={step === 1 ? (poNumbers.length > 0 ? "Return to Purchase Orders" : "Return to previous screen") : "Return to previous step"}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {step === 1 ? (poNumbers.length > 0 ? "Back to Purchase Orders" : "Exit Workbench") : "Back"}
            </button>

            <button
              type="button"
              onClick={handleManualSaveDraft}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 rounded-lg border border-gray-300 shadow-2xs transition-colors cursor-pointer"
              title="Save current progress to Drafts in the sidebar"
            >
              <FileEdit className="w-3.5 h-3.5 text-blue-600" />
              {draftSavedToast ? "Saved to Drafts!" : "Save Draft"}
            </button>
          </div>

          {/* Center: Stepper */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200 text-xs">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={cn(
                "px-3 py-1 rounded-md text-xs transition-colors cursor-pointer",
                step === 1
                  ? isSupplier
                    ? "bg-white text-emerald-900 font-bold shadow-xs border border-emerald-200"
                    : "bg-white text-blue-900 font-bold shadow-xs border border-blue-200"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              1. Item Quantities
            </button>
            <span className="text-gray-400 px-1">›</span>
            <button
              type="button"
              onClick={() => {
                if (packedItems.length > 0) setStep(2);
              }}
              disabled={packedItems.length === 0}
              className={cn(
                "px-3 py-1 rounded-md text-xs transition-colors cursor-pointer",
                step === 2
                  ? isSupplier
                    ? "bg-white text-emerald-900 font-bold shadow-xs border border-emerald-200"
                    : "bg-white text-blue-900 font-bold shadow-xs border border-blue-200"
                  : "text-gray-600 hover:text-gray-900 disabled:opacity-40"
              )}
            >
              2. Carton Packing & HUs
            </button>
            <span className="text-gray-400 px-1">›</span>
            <button
              type="button"
              onClick={() => {
                if (packedItems.length > 0) handleProceedToReview();
              }}
              disabled={packedItems.length === 0}
              className={cn(
                "px-3 py-1 rounded-md text-xs transition-colors cursor-pointer",
                step === 3
                  ? isSupplier
                    ? "bg-white text-emerald-900 font-bold shadow-xs border border-emerald-200"
                    : "bg-white text-blue-900 font-bold shadow-xs border border-blue-200"
                  : "text-gray-600 hover:text-gray-900 disabled:opacity-40"
              )}
            >
              3. Review & Transmit
            </button>
          </div>

          {/* Right: Primary Action Button AT TOP */}
          <div className="flex items-center gap-2">
            {step === 1 && (
              <button
                type="button"
                onClick={handleProceedToPacking}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                  isSupplier ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                Proceed to Packing <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 2 && (
              <div className="flex items-center gap-2">
                <span className="hidden lg:inline-flex items-center px-2.5 py-1 text-[11px] font-mono text-gray-700 bg-gray-100 rounded-lg border border-gray-200">
                  Cartons: {packedItems.reduce((acc, curr) => acc + curr.boxes.length, 0)} | Qty: {packedItems.reduce((acc, curr) => acc + (curr.shipping_now || 0), 0)} {packedItems[0]?.uom || "M"}
                </span>
                <button
                  type="button"
                  onClick={handleProceedToReview}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                    isSupplier ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  Review Shipment <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {step === 3 && (
              submitSuccessResult ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewXmlModal(buildLiveXmlPreview())}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
                    title="Preview official SdDataSlice XML"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" /> Preview XML
                  </button>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Sent to IUNGO
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewXmlModal(buildLiveXmlPreview())}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
                    title="Preview official SdDataSlice XML before sending"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" /> Preview XML
                  </button>
                  <button
                    type="button"
                    onClick={handleDispatchASN}
                    disabled={isSubmitting || !packingSlipNumber.trim() || !deliveryDate.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                    title={
                      !packingSlipNumber.trim()
                        ? "Please enter Packing Slip Number before sending"
                        : !deliveryDate.trim()
                        ? "Please select Delivery Date before sending"
                        : "Send to IUNGO"
                    }
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending to IUNGO...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" /> Send to IUNGO
                      </>
                    )}
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ─── STEP 1: QUANTITIES TO SHIP ─────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="border-b border-gray-100 pb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Purchase Order Line Item Allocation
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Format:</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold shadow-xs border",
                  formatSummary.includes("Roll") && !formatSummary.includes("Mixed")
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : formatSummary.includes("Mixed")
                    ? "bg-purple-50 text-purple-800 border-purple-200"
                    : isSupplier
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-blue-50 text-blue-800 border-blue-200"
                )}
              >
                {formatSummary.includes("Mixed")
                  ? "Mixed (Box & Roll)"
                  : formatSummary === "All Rolls"
                  ? "All Rolls"
                  : "All Boxes"}
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 flex justify-center text-gray-400">
              <Loader2 className={cn("w-6 h-6 animate-spin", isSupplier ? "text-emerald-600" : "text-blue-600")} />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="text-xs">No line items found for the selected orders.</p>
              <button
                onClick={() => navigate("/purchase-orders")}
                className={cn(
                  "mt-2 text-xs font-semibold hover:underline cursor-pointer",
                  isSupplier ? "text-emerald-600" : "text-blue-600"
                )}
              >
                Select orders from Purchase Orders page
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {distinctPoNumbers.map((poNo) => {
                const poItems = items.filter((l) => (l.po_number || "Default") === poNo);
                const poPackType = poItems.length > 0 && poItems.every((i) => i.packaging_type === "ROLL") ? "ROLL" : "BOX";

                return (
                  <div key={poNo} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    {/* PO Card Header (Matching Excel Drop layout) */}
                    <div className="flex items-center justify-between bg-gray-50/80 px-4 py-3 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-gray-800">PO {poNo}</span>
                        <span className="text-xs text-gray-400 font-medium font-mono">({poItems.length} {poItems.length === 1 ? "line" : "lines"})</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pack Type</label>
                        <select
                          value={poPackType}
                          onChange={(e) => handleSetPoPackagingType(poNo, e.target.value as "BOX" | "ROLL")}
                          className="text-xs font-bold bg-white border border-gray-300 rounded-md px-2.5 py-1 outline-none focus:border-emerald-500 shadow-sm cursor-pointer"
                        >
                          <option value="BOX">Box</option>
                          <option value="ROLL">Roll</option>
                        </select>
                      </div>
                    </div>

                    {/* Lines Table for this PO */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-gray-50/40 text-gray-500 border-b border-gray-100 font-semibold uppercase tracking-wider text-[11px]">
                            <th className="px-4 py-2.5 min-w-[130px] whitespace-nowrap">Item</th>
                            <th className="px-4 py-2.5">Material Code</th>
                            <th className="px-4 py-2.5">Description</th>
                            <th className="px-4 py-2.5 text-right">Ordered</th>
                            <th className="px-4 py-2.5 text-right">Shipped</th>
                            <th className="px-4 py-2.5 text-right">Open Balance</th>
                            <th className="px-4 py-2.5 text-right w-44">Shipping Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {poItems.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="px-4 py-2 font-mono text-gray-600 whitespace-nowrap">
                                <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-mono font-bold border border-gray-200 whitespace-nowrap inline-block">
                                  {item.po_item}
                                </span>
                              </td>
                              <td className="px-4 py-2 font-mono font-bold text-gray-800">{item.item_code}</td>
                              <td className="px-4 py-2 text-gray-600 max-w-xs truncate">{item.description}</td>
                              <td className="px-4 py-2 text-right font-mono text-gray-500">
                                {item.ordered_qty} {item.uom || "M"}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-emerald-700 font-semibold">
                                {item.shipped_qty || 0} {item.uom || "M"}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-gray-900">
                                {item.remaining_qty} {item.uom || "M"}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {item.remaining_qty <= 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    Fulfilled
                                  </span>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <input
                                      type="number"
                                      min="0"
                                      max={item.remaining_qty}
                                      value={item.shipping_now || 0}
                                      onChange={(e) => handleShippingNowChange(item.id, parseInt(e.target.value) || 0)}
                                      className={cn(
                                        "w-24 h-7 px-2 border border-gray-300 rounded-lg text-right font-mono text-xs font-bold outline-none",
                                        isSupplier
                                          ? "focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                          : "focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                      )}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleShippingNowChange(item.id, item.remaining_qty)}
                                      className={cn(
                                        "text-[11px] font-semibold px-2 py-1 rounded-md border transition-colors cursor-pointer",
                                        isSupplier
                                          ? "text-emerald-700 bg-emerald-50/80 border-emerald-300 hover:bg-emerald-100"
                                          : "text-blue-700 bg-blue-50/80 border-blue-300 hover:bg-blue-100"
                                      )}
                                    >
                                      Max
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 2: CARTON PACKING & HU ASSIGNMENT ─────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                Carton Packaging & Handling Unit Assignment
              </h2>

              {/* Optional Columns Dropdown */}
              <div className="relative inline-block text-left">
                <button
                  type="button"
                  onClick={() => setShowColumnMenu((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 shadow-xs transition-colors cursor-pointer"
                  title="Toggle optional packing columns from Excel (Batch/Lot, Supplier Ref, Width, Pack No)"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
                  <span>Optional Columns</span>
                  <span className="px-1.5 py-0.2 bg-gray-100 text-gray-700 text-[10px] rounded-full font-mono font-bold">
                    {Object.values(visibleColumns).filter(Boolean).length}/3
                  </span>
                </button>

                {showColumnMenu && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2.5 text-xs space-y-1">
                    <div className="px-2 py-1 font-bold text-gray-500 text-[10px] uppercase tracking-wider border-b border-gray-100 flex items-center justify-between">
                      <span>Toggle Optional Columns</span>
                      <button
                        type="button"
                        onClick={() => setShowColumnMenu(false)}
                        className="text-gray-400 hover:text-gray-600 text-xs cursor-pointer font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    {[
                      { key: "supplier_ref", label: "Supplier Carton Ref", desc: "Supplier internal ref / barcode" },
                      { key: "width", label: "Width", desc: "Material / roll width" },
                      { key: "pack_no", label: "Packing Slip No.", desc: "Per-carton custom delivery note override" },
                    ].map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-gray-800">{col.label}</div>
                          <div className="text-[10px] text-gray-400">{col.desc}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={(visibleColumns as any)[col.key]}
                          onChange={() =>
                            setVisibleColumns((prev) => ({
                              ...prev,
                              [col.key]: !(prev as any)[col.key],
                            }))
                          }
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>



          <div className="space-y-4">
            {packedItems.map((item, itemIdx) => {
              const packedQtySum = item.boxes.reduce((a, b) => a + (Number(b.qty) || 0), 0);
              const isBalanced = packedQtySum === item.shipping_now;

              const isRoll = item.packaging_type === "ROLL";
              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
                  {/* Line item header toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100 bg-gray-50/60 -mx-4 -mt-4 p-4 rounded-t-xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-xs font-mono">PO {item.po_number}</span>
                      <span className="text-gray-300">•</span>
                      <span className="font-mono text-xs font-semibold text-gray-800">{item.item_code}</span>
                      <span className="text-gray-300">•</span>
                      <span className="text-xs text-gray-600 truncate max-w-sm">{item.description}</span>
                      <span className={cn(
                        "ml-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                        isRoll
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-blue-50 text-blue-800 border-blue-200"
                      )}>
                        {isRoll ? "Roll Packing" : "Box Packing"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      {/* Manual Split Control with Mode Toggle */}
                      {(() => {
                        const cfg = splitConfigs[item.id] || { mode: "qty", value: "" };
                        const valNum = parseFloat(cfg.value || "0");
                        let previewInfo = "";
                        if (valNum > 0 && item.shipping_now) {
                          if (cfg.mode === "qty") {
                            const c = Math.ceil(item.shipping_now / valNum);
                            previewInfo = `→ ${c} ${c === 1 ? (isRoll ? "roll" : "box") : (isRoll ? "rolls" : "boxes")}`;
                          } else {
                            const c = Math.round(valNum);
                            previewInfo = `→ ${c} ${c === 1 ? (isRoll ? "roll" : "box") : (isRoll ? "rolls" : "boxes")}`;
                          }
                        }

                        return (
                          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg p-1 shadow-2xs">
                            <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider pl-1">
                              Split:
                            </span>

                            {/* Mode Segmented Switch */}
                            <div className="flex items-center bg-gray-200/70 p-0.5 rounded-md text-xs font-medium">
                              <button
                                type="button"
                                onClick={() =>
                                  setSplitConfigs((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      mode: "qty",
                                      value: prev[item.id]?.value || "",
                                    },
                                  }))
                                }
                                className={cn(
                                  "px-2 py-0.5 rounded text-[11px] transition-all cursor-pointer font-medium",
                                  cfg.mode === "qty"
                                    ? "bg-white text-blue-700 font-bold shadow-2xs"
                                    : "text-gray-600 hover:text-gray-900"
                                )}
                                title={`Split by quantity per ${isRoll ? "roll" : "carton"}`}
                              >
                                Qty / {isRoll ? "Roll" : "Box"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSplitConfigs((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      mode: "count",
                                      value: prev[item.id]?.value || "",
                                    },
                                  }))
                                }
                                className={cn(
                                  "px-2 py-0.5 rounded text-[11px] transition-all cursor-pointer font-medium",
                                  cfg.mode === "count"
                                    ? "bg-white text-blue-700 font-bold shadow-2xs"
                                    : "text-gray-600 hover:text-gray-900"
                                )}
                                title={`Split into total number of ${isRoll ? "rolls" : "cartons"}`}
                              >
                                # of {isRoll ? "Rolls" : "Boxes"}
                              </button>
                            </div>

                            {/* Manual Value Input */}
                            <input
                              type="number"
                              min="1"
                              step={cfg.mode === "count" ? "1" : "any"}
                              value={cfg.value}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSplitConfigs((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    mode: prev[item.id]?.mode || "qty",
                                    value: val,
                                  },
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleApplySplit(item);
                                }
                              }}
                              placeholder={
                                cfg.mode === "count"
                                  ? "Count"
                                  : `Per ${isRoll ? "roll" : "box"}`
                              }
                              className="w-20 px-2 py-0.5 text-xs font-mono bg-white border border-gray-300 rounded-md text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              title={
                                cfg.mode === "count"
                                  ? `Enter number of ${isRoll ? "rolls" : "cartons"} to divide into`
                                  : `Enter quantity packed per ${isRoll ? "roll" : "carton"}`
                              }
                            />

                            {/* Live calculation preview indicator */}
                            {previewInfo && (
                              <span className="text-[11px] font-mono font-medium text-blue-600 px-1 hidden sm:inline">
                                {previewInfo}
                              </span>
                            )}

                            {/* Action Split Button */}
                            <button
                              type="button"
                              onClick={() => handleApplySplit(item)}
                              className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md text-xs font-medium transition-colors cursor-pointer shadow-2xs"
                              title="Click or press Enter to split cartons"
                            >
                              Split
                            </button>
                          </div>
                        );
                      })()}

                      <button
                        type="button"
                        onClick={() => addBox(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-gray-700 text-xs font-medium shadow-xs transition-colors cursor-pointer shrink-0"
                      >
                        + Add {isRoll ? "Roll" : "Carton"}
                      </button>
                    </div>
                  </div>

                  {/* Data Grid */}
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-gray-50/80 text-gray-600 border-b border-gray-200 font-semibold text-[11px] uppercase tracking-wider">
                          <th className="px-3 py-2 text-center w-24" title="Carton sequence and EDI Line Reference">{isRoll ? "Roll" : "Carton"}</th>
                          <th className="px-3 py-2 min-w-[180px]">20-digit HU Number</th>
                          <th className="px-3 py-2 text-right w-24">Qty ({item.uom || "M"})</th>
                          <th className="px-3 py-2 text-left w-36">
                            Batch / Lot <span className="text-red-500">*</span>
                          </th>
                          <th className="px-3 py-2 text-right w-28">Gross Wt (kg)</th>
                          <th className="px-3 py-2 text-right w-28">Net Wt (kg)</th>
                          {visibleColumns.supplier_ref && <th className="px-3 py-2 w-32">Supplier Carton Ref</th>}
                          {visibleColumns.width && <th className="px-3 py-2 text-right w-24">Width</th>}
                          {visibleColumns.pack_no && <th className="px-3 py-2 w-28">Packing Slip No.</th>}
                          <th className="px-3 py-2 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {item.boxes.map((box, idx) => (
                          <tr key={box.id} className="hover:bg-gray-50/80 transition-colors">
                            {/* 1. Carton # and Line Reference: e.g. 1 (1-1) */}
                            <td className="px-3 py-1.5 font-mono text-center text-xs whitespace-nowrap">
                              <span className="font-bold text-gray-800">{idx + 1}</span>
                              <span className="text-[11px] text-gray-500 font-medium ml-1.5" title="EDI Line Reference (Item-Carton)">
                                ({itemIdx + 1}-{idx + 1})
                              </span>
                            </td>

                            {/* 2. 20-digit HU Number */}
                            <td className="px-3 py-1.5">
                              <span className="inline-block font-mono text-xs font-bold text-gray-800 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md tracking-wider select-all shadow-2xs">
                                {box.hu_number || formatHu(startingSeq + idx)}
                              </span>
                            </td>

                            {/* 3. Qty (empty by default for supplier input) */}
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={box.qty !== null && box.qty !== undefined && box.qty !== 0 ? box.qty : ""}
                                onChange={(e) =>
                                  updateBox(item.id, idx, {
                                    qty: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder=""
                                className="w-20 h-7 px-2 text-xs text-right border border-gray-300 rounded-md font-mono font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                            </td>

                            {/* 4. Batch / Lot (Mandatory) */}
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={box.batch_code || ""}
                                  onChange={(e) => updateBox(item.id, idx, { batch_code: e.target.value })}
                                  placeholder=""
                                  className="w-28 h-7 px-2 text-xs border border-gray-300 rounded-md font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                {item.boxes.length > 1 && idx === 0 && Boolean(box.batch_code?.trim()) && (
                                  <button
                                    type="button"
                                    onClick={() => copyBatchToAllCartons(item.id, box.batch_code)}
                                    className="px-1.5 py-0.5 text-[10px] bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded border border-gray-200 transition-colors cursor-pointer shrink-0 font-medium"
                                    title="Copy this batch to all cartons of this line item"
                                  >
                                    All ↓
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* 5. Gross Weight (Mandatory) */}
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={box.gross_weight !== null && box.gross_weight !== undefined ? box.gross_weight : ""}
                                onChange={(e) =>
                                  updateBox(item.id, idx, {
                                    gross_weight: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="0.00"
                                className={`w-24 h-7 px-2 text-xs text-right border rounded-md font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${
                                  typeof box.gross_weight === "number" && typeof box.net_weight === "number" && box.gross_weight <= box.net_weight
                                    ? "border-red-400 bg-red-50 text-red-700"
                                    : "border-gray-300"
                                }`}
                              />
                            </td>

                            {/* 6. Net Weight (Mandatory) */}
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={box.net_weight !== null && box.net_weight !== undefined ? box.net_weight : ""}
                                onChange={(e) =>
                                  updateBox(item.id, idx, {
                                    net_weight: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="0.00"
                                className="w-24 h-7 px-2 text-xs text-right border border-gray-300 rounded-md font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                              {typeof box.gross_weight === "number" && typeof box.net_weight === "number" && box.gross_weight <= box.net_weight && (
                                <span className="text-[10px] text-red-600 font-bold block mt-0.5">GW &le; NW!</span>
                              )}
                            </td>

                            {/* 7. Supplier Carton Ref (Optional) */}
                            {visibleColumns.supplier_ref && (
                              <td className="px-3 py-1.5">
                                <input
                                  type="text"
                                  value={box.supplier_carton_ref || ""}
                                  onChange={(e) => updateBox(item.id, idx, { supplier_carton_ref: e.target.value })}
                                  className="w-28 h-7 px-2 text-xs border border-gray-300 rounded-md font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                  placeholder="Optional"
                                />
                              </td>
                            )}

                            {/* 8. Width (Optional) */}
                            {visibleColumns.width && (
                              <td className="px-3 py-1.5 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={box.width !== null && box.width !== undefined ? box.width : ""}
                                  onChange={(e) =>
                                    updateBox(item.id, idx, {
                                      width: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  className="w-20 h-7 px-2 text-xs text-right border border-gray-300 rounded-md font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                  placeholder="Optional"
                                />
                              </td>
                            )}

                            {/* 9. Packing Slip No. (Custom override if toggled) */}
                            {visibleColumns.pack_no && (
                              <td className="px-3 py-1.5">
                                <input
                                  type="text"
                                  value={box.pack_number || packingSlipNumber || ""}
                                  onChange={(e) => updateBox(item.id, idx, { pack_number: e.target.value })}
                                  className="w-24 h-7 px-2 text-xs border border-gray-300 rounded-md font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                  placeholder={packingSlipNumber || "Required *"}
                                />
                              </td>
                            )}

                            {/* 10. Action */}
                            <td className="px-3 py-1.5 text-center">
                              {item.boxes.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeBox(item.id, idx)}
                                  className="text-gray-400 hover:text-red-600 p-1 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
                                  title="Remove carton"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary row */}
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-gray-500 font-medium">
                      Cartons in line: <strong className="text-gray-900 font-mono">{item.boxes.length}</strong>
                    </span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-gray-700">Total Packed: <strong>{packedQtySum}</strong> / {item.shipping_now} {item.uom || "M"}</span>
                      {isBalanced ? (
                        <span className="text-emerald-700 font-semibold font-sans bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          Balanced
                        </span>
                      ) : (
                        <span className="text-red-700 font-semibold font-sans bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
                          Discrepancy: {packedQtySum - (item.shipping_now || 0)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── STEP 3: REVIEW & EXPORT ────────────────────────────────────── */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          {/* A. Inline Confirmation Banner (Shown when ASN is Sent to IUNGO) */}
          {submitSuccessResult && (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Check className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-950">
                      Shipment {submitSuccessResult.shipment?.shipment_number || packingSlipNumber} Created & Sent to IUNGO
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">
                      Transmitted
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 mt-0.5 font-mono">
                    ASN {submitSuccessResult.asn?.asn_number || `ASN-${packingSlipNumber}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintLabels}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Labels
                </button>
                <button
                  type="button"
                  onClick={handleDownloadXml}
                  className="px-3 py-1.5 border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download XML
                </button>
                {poNumbers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate("/purchase-orders/manual")}
                    className="px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    Return to POs
                  </button>
                )}
              </div>
            </div>
          )}

          {/* B. Parameters Bar (Clean & Essential Inputs Only) */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="wizard-ps-number" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                Packing Slip No <span className="text-red-500">*</span>:
              </label>
              <input
                id="wizard-ps-number"
                type="text"
                required
                disabled={Boolean(submitSuccessResult)}
                placeholder="e.g. 01007907"
                value={packingSlipNumber}
                onChange={(e) => setPackingSlipNumber(e.target.value)}
                className="h-8 px-2.5 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none shadow-2xs w-40"
              />
            </div>

            <div className="w-px h-5 bg-slate-300 hidden sm:block"></div>

            <div className="flex items-center gap-2">
              <label htmlFor="wizard-delivery-date" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                Delivery Date <span className="text-red-500">*</span>:
              </label>
              <input
                id="wizard-delivery-date"
                type="date"
                required
                disabled={Boolean(submitSuccessResult)}
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="h-8 px-2.5 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none shadow-2xs cursor-pointer"
              />
            </div>
          </div>

          {/* C. Handling Units & Packing List (Clean List View Table) */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
            <div className="p-3 bg-gray-50/80 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  Handling Units & Packing Breakdown
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded-full">
                  {allCartonsList.length} Cartons/Rolls
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span>Total Qty: <strong className="font-mono text-gray-900">{totalShippedUnits.toLocaleString()} {packedItems[0]?.uom || "M"}</strong></span>
                <span className="text-gray-300">|</span>
                <span>GW: <strong className="font-mono text-gray-900">{totalGw.toFixed(2)} kg</strong></span>
                <span className="text-gray-300">|</span>
                <span>NW: <strong className="font-mono text-gray-900">{totalNw.toFixed(2)} kg</strong></span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[440px] custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2.5">Ctn</th>
                    <th className="px-3 py-2.5">Handling Unit (SSCC-20)</th>
                    <th className="px-3 py-2.5">PO & Line</th>
                    <th className="px-3 py-2.5">Product Code</th>
                    <th className="px-3 py-2.5">Quantity</th>
                    <th className="px-3 py-2.5">Gross Wt (kg)</th>
                    <th className="px-3 py-2.5">Net Wt (kg)</th>
                    <th className="px-3 py-2.5">Lot / Batch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {allCartonsList.map((c) => (
                    <tr key={c.index} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-gray-700">{c.index}</td>
                      <td className="px-3 py-2">
                        <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded font-mono font-bold text-xs text-slate-800">
                          <span>{c.hu_number}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(c.hu_number);
                              setCopiedHu(c.hu_number);
                              setTimeout(() => setCopiedHu(null), 1500);
                            }}
                            className="text-slate-400 hover:text-emerald-600 transition-colors p-0.5 cursor-pointer"
                            title="Copy HU"
                          >
                            {copiedHu === c.hu_number ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono font-medium text-gray-700 whitespace-nowrap">
                        {c.po_number} <span className="text-gray-400">/</span> {c.po_item}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-gray-900 whitespace-nowrap">{c.item_code}</td>
                      <td className="px-3 py-2 font-bold text-emerald-700 bg-emerald-50/40 whitespace-nowrap">
                        {c.qty} {c.uom}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-700">{c.gross_weight != null ? Number(c.gross_weight).toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 font-mono text-gray-700">{c.net_weight != null ? Number(c.net_weight).toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{c.lot_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* XML Preview Modal inside Web Packing Wizard */}
          {previewXmlModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50/80">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-gray-900 text-sm">Official SdDataSlice XML</span>
                  </div>
                  <button
                    onClick={() => setPreviewXmlModal(null)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 flex-1 overflow-auto bg-gray-950 text-emerald-400 font-mono text-xs leading-relaxed">
                  <pre>{previewXmlModal}</pre>
                </div>
                <div className="p-3 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(previewXmlModal);
                      alert("XML copied to clipboard!");
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-white text-gray-700 cursor-pointer"
                  >
                    Copy XML
                  </button>
                  <button
                    onClick={() => setPreviewXmlModal(null)}
                    className="px-4 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENT B: Complete 12-Column Excel Drop Workflow
// ─────────────────────────────────────────────────────────────────────────────
function ExcelPackingWorkflow({
  targetPo,
  targetPos,
  onSuccess,
  onOpenLabelModal,
}: {
  targetPo?: string;
  targetPos?: string[];
  onSuccess: () => void;
  onOpenLabelModal?: (id: string, num: string, count?: number) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ExcelValidationResult | null>(null);
  const [copiedHu, setCopiedHu] = useState<string | null>(null);

  const activePos = (targetPos && targetPos.length > 0) ? targetPos : targetPo ? [targetPo] : [];
  const [plantCode, setPlantCode] = useState("PPA1");
  const [estimatedArrival, setEstimatedArrival] = useState("");
  const [packingSlipNumber, setPackingSlipNumber] = useState("");
  const [packingSlipDates, setPackingSlipDates] = useState<Record<string, string>>({});
  const [startingSeq, setStartingSeq] = useState<number>(1);

  // Synchronize next sequential HU sequence for supplier
  useEffect(() => {
    let isMounted = true;
    const fetchSeq = async () => {
      try {
        const suppCode = user?.supplier_code || "0000018194";
        const suppId = user?.supplier_id || undefined;
        const res = await shipmentService.getNextHuSequence(suppCode, suppId);
        if (isMounted && res && typeof res.next_number === "number") {
          setStartingSeq(res.next_number);
        }
      } catch (err) {
        console.warn("Could not fetch next HU sequence for Excel:", err);
      }
    };
    fetchSeq();
    return () => {
      isMounted = false;
    };
  }, [user?.supplier_code, user?.supplier_id]);

  const formatHu = (seq: number) => {
    const suppCodeClean = (user?.supplier_code || "0000018194").replace(/^0+/, "");
    const prefix = "1" + suppCodeClean.padStart(9, "0");
    return `${prefix}${String(seq).padStart(10, "0")}`;
  };
  
  // PO specific configurations
  const [poLines, setPoLines] = useState<any[]>([]);
  const [poConfigs, setPoConfigs] = useState<Record<string, "BOX" | "ROLL">>({});
  const [selectedLines, setSelectedLines] = useState<Record<string, boolean>>({});
  const [lineCartonCounts, setLineCartonCounts] = useState<Record<string, number>>({});
  const [downloadingTailored, setDownloadingTailored] = useState(false);

  // Group cartons by Packing Slip ID from validated Excel rows
  const packingSlipGroups = useMemo(() => {
    if (!validationResult?.rows || validationResult.rows.length === 0) return [];
    const map = new Map<string, {
      slipNumber: string;
      cartons: number;
      totalQuantity: number;
      uom: string;
      pos: string[];
      totalGw: number;
      totalNw: number;
    }>();

    validationResult.rows.forEach((r) => {
      const ps = (r.pack_number || "").trim() || (packingSlipNumber.trim() || "DEFAULT");
      if (!map.has(ps)) {
        map.set(ps, {
          slipNumber: ps,
          cartons: 0,
          totalQuantity: 0,
          uom: r.uom || "M",
          pos: [],
          totalGw: 0,
          totalNw: 0,
        });
      }
      const entry = map.get(ps)!;
      entry.cartons += 1;
      entry.totalQuantity += Number(r.quantity) || 0;
      if (r.po_number && !entry.pos.includes(r.po_number)) {
        entry.pos.push(r.po_number);
      }
      entry.totalGw += Number(r.gross_weight) || 0;
      entry.totalNw += Number(r.net_weight) || 0;
    });

    return Array.from(map.values());
  }, [validationResult?.rows, packingSlipNumber]);

  const detectedPackingSlips = useMemo(() => {
    return packingSlipGroups.map((g) => g.slipNumber).filter((s) => s !== "DEFAULT");
  }, [packingSlipGroups]);

  // Map each packing slip to its first occurrence index in rows
  const firstIndexForSlip = useMemo(() => {
    const map: Record<string, number> = {};
    validationResult?.rows?.forEach((row, idx) => {
      const ps = (row.pack_number || "").trim() || packingSlipNumber.trim() || "DEFAULT";
      if (map[ps] === undefined) {
        map[ps] = idx;
      }
    });
    return map;
  }, [validationResult?.rows, packingSlipNumber]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [createdResponse, setCreatedResponse] = useState<CreateShipmentResponse | null>(null);

  // Success actions
  const [downloadingLabels, setDownloadingLabels] = useState(false);
  const [downloadingXml, setDownloadingXml] = useState(false);
  const [dispatchedSuccess, setDispatchedSuccess] = useState(false);

  const [searchParams] = useSearchParams();
  const shouldResume = searchParams.get("resume") === "true";
  const isOnline = useNetworkStatus();

  // Check for saved Excel draft on load (auto-resume if navigated with ?resume=true)
  useEffect(() => {
    if (activePos.length === 0) return;
    const suppCode = user?.supplier_code || "0000018194";
    const draft = getExcelDraft(suppCode, activePos);
    if (draft && shouldResume) {
      if (draft.validationResult) setValidationResult(draft.validationResult);
      if (draft.plantCode) setPlantCode(draft.plantCode);
      if (draft.estimatedArrival) setEstimatedArrival(draft.estimatedArrival);
      if (draft.packingSlipNumber) setPackingSlipNumber(draft.packingSlipNumber);
      if (draft.packingSlipDates) setPackingSlipDates(draft.packingSlipDates);
      getExcelFileBlob(suppCode, activePos)
        .then((storedFile) => {
          if (storedFile) setSelectedFile(storedFile);
        })
        .catch(() => {});
    }
  }, [user?.supplier_code, activePos.join(","), shouldResume]);

  // Reactive auto-save when packing slip, dates, or validation status updates
  useEffect(() => {
    if (createdResponse || dispatchedSuccess) return;
    const suppCode = user?.supplier_code || "0000018194";
    if (validationResult || packingSlipNumber.trim()) {
      saveExcelDraft(suppCode, activePos, {
        plantCode,
        estimatedArrival,
        packingSlipNumber,
        packingSlipDates,
        validationResult,
        fileName: selectedFile?.name,
      });
    }
  }, [
    plantCode,
    estimatedArrival,
    packingSlipNumber,
    packingSlipDates,
    validationResult,
    selectedFile?.name,
    createdResponse,
    dispatchedSuccess,
    user?.supplier_code,
    activePos.join(","),
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activePos.length === 0) return;

    let minDate = "";
    let pCode = "PPA1";

    const fetchAll = async () => {
      const fetchedLines: any[] = [];
      const newConfigs: Record<string, "BOX" | "ROLL"> = {};
      const newSelected: Record<string, boolean> = {};

      for (const po of activePos) {
        newConfigs[po] = "BOX";
        try {
          const res = await poApi.list({ search: po });
          const found = res.items?.find((p: any) => p.po_number === po) || res.items?.[0];
          if (found) {
            if (!minDate || (found.delivery_date && found.delivery_date < minDate)) {
              minDate = found.delivery_date || "";
              pCode = matchPlant(found.destination || found.delivery_address || (found as any).extra_data?.delivery_address || found.client_code);
            }

            const fullPo = await poApi.getById(found.id);
            if (fullPo && (fullPo as any).extra_data && Array.isArray((fullPo as any).extra_data.items)) {
              (fullPo as any).extra_data.items.forEach((it: any, idx: number) => {
                if (Number(it.quantity || 0) > 0) {
                  const poItem = String(it.order_line_number || it.line_number || idx + 1).trim();
                  const qty = Number(it.quantity || 0);
                  const shipped = Number(it.shipped_quantity ?? 0);
                  const remaining = it.remaining_quantity !== undefined
                    ? Number(it.remaining_quantity)
                    : Math.max(0, qty - shipped);

                  fetchedLines.push({
                    po_number: po,
                    po_item: poItem,
                    material_code: it.item_code || it.material_code || "",
                    description: it.description || "",
                    ordered_qty: qty,
                    shipped_qty: shipped,
                    remaining_qty: remaining,
                    uom: it.size || it.uom || "M",
                  });
                  newSelected[`${po}|${poItem}`] = remaining > 0;
                }
              });
            } else {
              const poItem = "00100";
              const fullOrdered = Number(found.quantity || 500);
              const shipped = Number(found.shipped_quantity ?? 0);
              const remaining = Math.max(0, fullOrdered - shipped);
              fetchedLines.push({
                po_number: po,
                po_item: poItem,
                material_code: found.style_number || found.description || "DEFAULT",
                description: found.description || "",
                ordered_qty: fullOrdered,
                shipped_qty: shipped,
                remaining_qty: remaining,
                uom: "M",
              });
              newSelected[`${po}|${poItem}`] = remaining > 0;
            }
          }
        } catch (e) {
          console.error("Error loading PO:", po, e);
        }
      }

      setPoLines(fetchedLines);
      setPoConfigs(newConfigs);
      setSelectedLines(newSelected);
      if (minDate && !estimatedArrival) setEstimatedArrival(minDate);
      if (pCode && !plantCode) setPlantCode(pCode);
    };

    fetchAll();
  }, [activePos.join(",")]);

  const togglePo = (po: string) => {
    const linesForPo = poLines.filter((l) => l.po_number === po);
    const allSelected = linesForPo.every((l) => selectedLines[`${po}|${l.po_item}`]);
    const newState = { ...selectedLines };
    linesForPo.forEach((l) => {
      newState[`${po}|${l.po_item}`] = !allSelected;
    });
    setSelectedLines(newState);
  };

  const handleDownloadTailoredTemplate = async () => {
    if (activePos.length === 0) return;
    setDownloadingTailored(true);
    try {
      const payload = {
        configs: activePos.map((po) => {
          const selected = poLines
            .filter((l) => l.po_number === po && selectedLines[`${po}|${l.po_item}`] && (l.remaining_qty === undefined || l.remaining_qty > 0))
            .map((l) => l.po_item);
          const counts: Record<string, number> = {};
          selected.forEach((lItem) => {
            counts[lItem] = lineCartonCounts[`${po}|${lItem}`] || 1;
          });
          return {
            po_number: po,
            pack_type: poConfigs[po] || "BOX",
            selected_lines: selected,
            line_carton_counts: counts,
          };
        }).filter((cfg) => cfg.selected_lines.length > 0),
      };

      if (payload.configs.length === 0) {
        alert("Please select at least one line item before downloading template.");
        setDownloadingTailored(false);
        return;
      }

      const blob = await shipmentService.downloadConfiguredTemplate(payload);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const downloadFilename = payload.configs.length === 1
        ? `Packing_List_${payload.configs[0].po_number}_Tailored.xlsx`
        : `Packing_List_Tailored.xlsx`;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const suppCode = user?.supplier_code || "0000018194";
      saveExcelDraft(suppCode, activePos, {
        plantCode,
        estimatedArrival,
        packingSlipNumber,
        validationResult: null,
        fileName: downloadFilename,
      });
    } catch (err: any) {
      alert("Failed to download tailored template: " + (err.message || err));
    } finally {
      setDownloadingTailored(false);
    }
  };

  const processFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      alert("Please upload an Excel spreadsheet (.xlsx or .xls)");
      return;
    }
    setSelectedFile(file);
    setValidating(true);
    setValidationResult(null);
    setCreatedResponse(null);
    setDispatchedSuccess(false);

    try {
      const supplierId = user?.role === "SUPPLIER" ? (user.supplier_id || undefined) : undefined;
      const res = await shipmentService.validateExcel(file, supplierId, user?.supplier_code || undefined);
      setValidationResult(res);
      const detectedPs = Array.from(new Set(res.rows?.map((r: any) => r.pack_number?.trim()).filter(Boolean))) as string[];
      let updatedDates = { ...packingSlipDates };

      // Pre-fill delivery dates parsed directly from Excel rows
      res.rows?.forEach((r: any) => {
        const ps = r.pack_number?.trim() || detectedPs[0] || "DEFAULT";
        if (r.delivery_date && !updatedDates[ps]) {
          updatedDates[ps] = r.delivery_date;
        }
      });

      if (detectedPs.length > 0) {
        setPackingSlipNumber(detectedPs[0]);
        detectedPs.forEach((ps) => {
          if (!updatedDates[ps]) {
            updatedDates[ps] = estimatedArrival || "";
          }
        });
        setPackingSlipDates(updatedDates);
      }
      const suppCode = user?.supplier_code || "0000018194";
      saveExcelFileBlob(suppCode, activePos, file).catch(() => {});
      saveExcelDraft(suppCode, activePos, {
        plantCode,
        estimatedArrival,
        packingSlipNumber: detectedPs[0] || packingSlipNumber,
        packingSlipDates: updatedDates,
        validationResult: res,
        fileName: file.name,
      });
    } catch (e: any) {
      console.error("Excel validation error:", e);
      const detail = e?.response?.data?.detail;
      let errorMsg = "Failed to validate Excel file.";
      let generalErrors: string[] = [];

      if (typeof detail === "string") {
        errorMsg = detail;
        generalErrors = [detail];
      } else if (detail && typeof detail === "object") {
        if (detail.message) errorMsg = detail.message;
        if (Array.isArray(detail.errors) && detail.errors.length > 0) {
          generalErrors = detail.errors;
        } else {
          generalErrors = [errorMsg];
        }
      } else if (e?.message) {
        errorMsg = e.message;
        generalErrors = [errorMsg];
      }

      setValidationResult({
        is_valid: false,
        total_rows: 0,
        total_cartons: 0,
        total_gross_weight: 0,
        total_net_weight: 0,
        total_quantity: 0,
        general_errors: generalErrors,
        line_summaries: [],
        rows: [],
      });
    } finally {
      setValidating(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleCreateShipment = async () => {
    if (!isOnline) {
      alert("You are currently offline. Please reconnect to the network before sending the ASN to IUNGO.");
      return;
    }
    if (!selectedFile) {
      alert("Please upload or select the validated Excel file before creating the shipment.");
      return;
    }

    const isMultiSlip = detectedPackingSlips.length > 1;
    if (isMultiSlip) {
      const missing = detectedPackingSlips.filter((ps) => !packingSlipDates[ps]?.trim());
      if (missing.length > 0) {
        alert(`Please select a Delivery Date for Packing Slip(s): ${missing.join(", ")}`);
        return;
      }
    } else {
      const singleDate = estimatedArrival?.trim() || (detectedPackingSlips[0] ? packingSlipDates[detectedPackingSlips[0]]?.trim() : "");
      if (!singleDate) {
        alert("Please select a Delivery Date before creating the shipment.");
        return;
      }
      if (!packingSlipNumber.trim() && detectedPackingSlips.length === 0) {
        alert("Please enter a Packing Slip Number before creating the shipment.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await ensureFreshToken(60);

      const datesPayload: Record<string, string> = {};
      if (detectedPackingSlips.length > 0) {
        detectedPackingSlips.forEach((ps) => {
          const d = packingSlipDates[ps]?.trim() || estimatedArrival?.trim();
          if (d) datesPayload[ps] = d;
        });
      }

      const res = await shipmentService.createFromExcel({
        file: selectedFile,
        packing_slip_number: packingSlipNumber.trim() || undefined,
        plant_code: plantCode,
        supplier_code: user?.supplier_code || undefined,
        supplier_name: user?.supplier_name || undefined,
        supplier_id: user?.supplier_id || undefined,
        estimated_arrival: estimatedArrival?.trim() || Object.values(datesPayload)[0] || undefined,
        packing_slip_dates: Object.keys(datesPayload).length > 0 ? datesPayload : undefined,
      });

      // Transmit ASN to IUNGO immediately (same as Manual process handleDispatchASN)
      const asnsToDispatch: string[] = res.shipments?.length
        ? res.shipments.map((s) => s.asn_record_id).filter((id): id is string => Boolean(id))
        : res.asn?.id
        ? [res.asn.id]
        : [];

      for (const asnId of asnsToDispatch) {
        try {
          await shipmentService.sendASN(asnId);
        } catch (sendErr) {
          console.warn("ASN created, but EDI send error:", sendErr);
        }
      }

      setCreatedResponse(res);
      setDispatchedSuccess(true);
      const suppCode = user?.supplier_code || "0000018194";
      clearExcelDraft(suppCode, activePos);
      clearManualDraft(suppCode, activePos);
    } catch (e: any) {
      console.error("Create shipment error:", e);
      const detail = e?.response?.data?.detail;
      let msg = "Failed to create shipment";
      if (typeof detail === "string") {
        msg = detail;
      } else if (detail && typeof detail === "object") {
        if (detail.message) {
          msg = detail.message;
          if (Array.isArray(detail.errors) && detail.errors.length > 0) {
            msg += ": " + detail.errors.join("; ");
          }
          if (Array.isArray(detail.lines) && detail.lines.length > 0) {
            const flatLines = detail.lines.flat().filter(Boolean);
            if (flatLines.length > 0) {
              msg += " (" + flatLines.join("; ") + ")";
            }
          }
        } else {
          msg = JSON.stringify(detail);
        }
      } else if (e?.message) {
        msg = e.message;
      }
      alert(`Error creating shipment: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadLabelsPdf = async () => {
    if (!createdResponse) return;
    setDownloadingLabels(true);
    try {
      const blob = await shipmentService.downloadLabelsPdf(createdResponse.shipment.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Labels_${createdResponse.shipment.shipment_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to download labels PDF: ${err?.response?.data?.detail || err.message || err}`);
    } finally {
      setDownloadingLabels(false);
    }
  };

  const handleDownloadAsnXml = async () => {
    if (!createdResponse) return;
    setDownloadingXml(true);
    try {
      const shipmentsToDownload = createdResponse.shipments?.length
        ? createdResponse.shipments
        : [
            {
              asn_record_id: createdResponse.asn.id,
              xml_filename: createdResponse.asn.xml_filename || `PL_${createdResponse.shipment.shipment_number}.xml`,
              shipment_number: createdResponse.shipment.shipment_number,
            },
          ];

      for (const s of shipmentsToDownload) {
        if (s.asn_record_id) {
          const blob = await shipmentService.downloadASNXml(s.asn_record_id);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = s.xml_filename || `PL_${s.shipment_number}.xml`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
          if (shipmentsToDownload.length > 1) {
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      }
    } catch (err: any) {
      alert(`Failed to download ASN XML: ${err?.response?.data?.detail || err.message || err}`);
    } finally {
      setDownloadingXml(false);
    }
  };

  const isDatesComplete = useMemo(() => {
    if (detectedPackingSlips.length > 1) {
      return detectedPackingSlips.every((ps) => Boolean(packingSlipDates[ps]?.trim()));
    }
    const singleDate = estimatedArrival?.trim() || (detectedPackingSlips[0] ? packingSlipDates[detectedPackingSlips[0]]?.trim() : "");
    const singlePs = packingSlipNumber.trim() || (detectedPackingSlips[0] ? detectedPackingSlips[0] : "");
    return Boolean(singleDate && singlePs);
  }, [detectedPackingSlips, packingSlipDates, estimatedArrival, packingSlipNumber]);

  return (
    <div
      onDragEnter={!createdResponse && !validationResult ? handleDrag : undefined}
      onDragLeave={!createdResponse && !validationResult ? handleDrag : undefined}
      onDragOver={!createdResponse && !validationResult ? handleDrag : undefined}
      onDrop={!createdResponse && !validationResult ? handleDrop : undefined}
      className={cn(
        "bg-white rounded-2xl shadow-sm border flex flex-col h-full min-h-[600px] transition-all",
        dragActive ? "border-emerald-500 bg-emerald-50/10" : "border-gray-200"
      )}
    >
      {/* ─── A. Header & Parameters Bar (Clean & Essential Inputs) ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-t-2xl bg-gray-50/90 border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3">
          {/* File Upload / Re-upload Button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  processFile(e.target.files[0]);
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs shadow-2xs transition-all cursor-pointer",
                selectedFile
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
              title={selectedFile ? "Click to re-upload / replace file" : "Upload Excel List"}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{selectedFile ? selectedFile.name : "Upload Excel List"}</span>
            </button>
          </div>

          {validationResult && (
            <>
              <div className="w-px h-6 bg-gray-300 hidden sm:block" />

              {/* Packing Slip Number Display / Input */}
              {detectedPackingSlips.length > 1 ? (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-md font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>{detectedPackingSlips.length} Packing Slips</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <label htmlFor="excel-ps-number" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                    Packing Slip No <span className="text-red-500">*</span>:
                  </label>
                  <input
                    id="excel-ps-number"
                    type="text"
                    value={packingSlipNumber}
                    disabled={Boolean(createdResponse)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPackingSlipNumber(val);
                      if (detectedPackingSlips.length <= 1) {
                        setPackingSlipDates((prev) => ({
                          ...prev,
                          [val || "DEFAULT"]: estimatedArrival || Object.values(prev)[0] || "",
                        }));
                      }
                    }}
                    placeholder="e.g. 01007907"
                    className="h-8 px-2.5 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none shadow-2xs w-36 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
              )}

              {detectedPackingSlips.length <= 1 && (
                <>
                  <div className="w-px h-6 bg-gray-300 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <label htmlFor="excel-delivery-date" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                      Delivery Date <span className="text-red-500">*</span>:
                    </label>
                    <input
                      id="excel-delivery-date"
                      type="date"
                      value={estimatedArrival || (detectedPackingSlips[0] ? packingSlipDates[detectedPackingSlips[0]] : "") || ""}
                      disabled={Boolean(createdResponse)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEstimatedArrival(val);
                        const targetKey = detectedPackingSlips[0] || packingSlipNumber.trim() || "DEFAULT";
                        setPackingSlipDates((prev) => ({
                          ...prev,
                          [targetKey]: val,
                        }));
                      }}
                      className="h-8 px-2.5 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none shadow-2xs cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Action Button: Send to IUNGO or Download Template before upload */}
        <div className="flex items-center gap-2">
          {!validationResult && activePos.length > 0 && (
            <button
              type="button"
              disabled={downloadingTailored}
              onClick={handleDownloadTailoredTemplate}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              title="Download Tailored Excel Template for selected POs"
            >
              {downloadingTailored ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing Template...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" /> Download Tailored Template
                </>
              )}
            </button>
          )}

          {validationResult && (
            createdResponse ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Sent to IUNGO
              </span>
            ) : (
              <button
                type="button"
                disabled={submitting || !validationResult.is_valid || !isDatesComplete}
                onClick={handleCreateShipment}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                title={
                  !validationResult.is_valid
                    ? "Please fix Excel validation errors before sending"
                    : detectedPackingSlips.length > 1 && !isDatesComplete
                    ? "Please select a Delivery Date for each Packing Slip"
                    : !packingSlipNumber.trim() && detectedPackingSlips.length === 0
                    ? "Please enter Packing Slip Number before sending"
                    : !estimatedArrival.trim()
                    ? "Please select Delivery Date before sending"
                    : "Send to IUNGO"
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending to IUNGO...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> Send to IUNGO
                  </>
                )}
              </button>
            )
          )}
        </div>
      </div>

      {/* ─── B. Main Content Area ─── */}
      <div className="flex-1 flex flex-col p-4 bg-gray-50/40 overflow-hidden space-y-4">
        {validating ? (
          <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-xs">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
            <p className="font-semibold text-gray-700">Verifying Excel lines...</p>
            <p className="text-xs mt-1 text-gray-400">Validating quantities and DTD weight rules (GW &ge; NW &gt; 0)</p>
          </div>
        ) : validationResult ? (
          <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
            {/* 1. Inline Confirmation Banner (Shown when ASN is Sent to IUNGO) */}
            {createdResponse && (
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-950">
                        {createdResponse.shipments && createdResponse.shipments.length > 1
                          ? `${createdResponse.shipments.length} Shipments Processed & Sent to IUNGO`
                          : `Shipment ${createdResponse.shipment?.shipment_number || packingSlipNumber} Created & Sent to IUNGO`}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">
                        Transmitted
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800 mt-0.5 font-mono">
                      ASN {createdResponse.asn?.asn_number || `ASN-${packingSlipNumber}`} • {createdResponse.shipment?.total_boxes || validationResult.rows.length} Cartons/Rolls
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={downloadingLabels}
                    onClick={() => {
                      const sId = createdResponse?.shipment?.id;
                      const sNum = createdResponse?.shipment?.shipment_number || packingSlipNumber;
                      const bCount = createdResponse?.shipment?.total_boxes;
                      if (onOpenLabelModal && sId) {
                        onOpenLabelModal(sId, sNum, bCount);
                      } else {
                        handleDownloadLabelsPdf();
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {downloadingLabels ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Printer className="w-3.5 h-3.5" />
                    )}
                    <span>Print Labels</span>
                  </button>
                  <button
                    type="button"
                    disabled={downloadingXml}
                    onClick={handleDownloadAsnXml}
                    className="px-3 py-1.5 border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {downloadingXml ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download XML</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setValidationResult(null);
                      setCreatedResponse(null);
                      setDispatchedSuccess(false);
                      const suppCode = user?.supplier_code || "0000018194";
                      clearExcelDraft(suppCode, activePos);
                    }}
                    className="px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Upload Another
                  </button>
                  <button
                    type="button"
                    onClick={onSuccess}
                    className="px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    Close & View in List
                  </button>
                </div>
              </div>
            )}



            {/* 3. Simple Validation Error Alert (Shown when Excel validation fails) */}
            {!validationResult.is_valid && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs shrink-0">
                <div className="flex items-center gap-2 text-red-800 font-bold">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Validation Errors Detected in Excel Sheet</span>
                  <span className="text-[10px] bg-red-200 text-red-900 px-1.5 py-0.5 rounded font-mono">
                    Action Required
                  </span>
                </div>
                
                {validationResult.general_errors && validationResult.general_errors.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-red-700 pl-1 font-medium">
                    {validationResult.general_errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}

                {(() => {
                  const errorRows = validationResult.rows.filter((r) => r.errors && r.errors.length > 0);
                  if (errorRows.length === 0) return null;
                  return (
                    <div className="mt-1 pt-2 border-t border-red-100">
                      <p className="font-semibold text-red-800 mb-1">
                        {errorRows.length} {errorRows.length === 1 ? "row has" : "rows have"} invalid data:
                      </p>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {errorRows.slice(0, 10).map((r, idx) => (
                          <div key={idx} className="bg-white/80 p-1.5 rounded border border-red-200 text-red-900 font-mono text-[11px] flex items-center justify-between gap-2">
                            <span>Row {r.row_index} (PO {r.po_number || "—"}, Line {r.po_item || "—"}, Ctn {String(r.carton_number).replace(/^#+/, "")})</span>
                            <span className="font-semibold text-red-600 truncate max-w-md">{r.errors.join(", ")}</span>
                          </div>
                        ))}
                        {errorRows.length > 10 && (
                          <p className="text-[10px] text-red-500 italic">...and {errorRows.length - 10} more rows with errors.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <p className="text-[11px] text-red-600 font-medium pt-0.5">
                  Please correct the values in your Excel file and upload again using the button above.
                </p>
              </div>
            )}

            {/* 4. Handling Units & Packing Breakdown (Clean Table View matching Manual Process) */}
            <div className="flex-1 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs flex flex-col min-h-0">
              <div className="p-3 bg-gray-50/80 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Handling Units & Packing Breakdown
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {validationResult.rows.length} Cartons/Rolls
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <span>
                    Total Qty: <strong className="font-mono text-gray-900">{validationResult.total_quantity.toLocaleString()} {validationResult.rows[0]?.uom || "M"}</strong>
                  </span>
                  <span className="text-gray-300">|</span>
                  <span>
                    GW: <strong className="font-mono text-gray-900">{validationResult.total_gross_weight.toFixed(2)} kg</strong>
                  </span>
                  <span className="text-gray-300">|</span>
                  <span>
                    NW: <strong className="font-mono text-gray-900">{validationResult.total_net_weight.toFixed(2)} kg</strong>
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2.5">Ctn</th>
                      <th className="px-3 py-2.5">Packing Slip No.</th>
                      <th className="px-3 py-2.5">Delivery Date</th>
                      <th className="px-3 py-2.5">Handling Unit (SSCC-20)</th>
                      <th className="px-3 py-2.5">PO & Line</th>
                      <th className="px-3 py-2.5">Product Code</th>
                      <th className="px-3 py-2.5 text-right">Quantity</th>
                      <th className="px-3 py-2.5 text-right">Gross Wt (kg)</th>
                      <th className="px-3 py-2.5 text-right">Net Wt (kg)</th>
                      <th className="px-3 py-2.5">Lot / Batch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {validationResult.rows.map((r, i) => {
                      const hasRowErrors = r.errors && r.errors.length > 0;
                      const generatedHu =
                        createdResponse?.handling_units?.[i] ||
                        r.hu_number ||
                        formatHu(startingSeq + i);

                      const rowPs = (r.pack_number || "").trim() || packingSlipNumber.trim() || "DEFAULT";
                      const rowDate = packingSlipDates[rowPs] || r.delivery_date || estimatedArrival || "";

                      const cleanCtn = (() => {
                        const cnStr = String(r.carton_number || "").trim();
                        const match = cnStr.match(/^(\d+)\s*(\(\d+-\d+\))$/);
                        if (match) {
                          return (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-bold text-gray-800">{match[1]}</span>
                              <span className="text-[11px] text-gray-500 font-medium">{match[2]}</span>
                            </span>
                          );
                        }
                        return cnStr.replace(/^#+/, "") || String(i + 1);
                      })();

                      const isFirstOccurrence = firstIndexForSlip[rowPs] === i;
                      const prevRowPs = i > 0 ? ((validationResult.rows[i - 1].pack_number || "").trim() || packingSlipNumber.trim() || "DEFAULT") : null;
                      const isSlipBoundary = i > 0 && rowPs !== prevRowPs;

                      return (
                        <tr
                          key={i}
                          className={cn(
                            "transition-colors",
                            hasRowErrors ? "bg-red-50/60 hover:bg-red-100/60" : "hover:bg-gray-50/80",
                            isSlipBoundary && "border-t-2 border-slate-200"
                          )}
                        >
                          {/* Ctn */}
                          <td className="px-3 py-2 font-mono font-bold text-gray-700 whitespace-nowrap">
                            {cleanCtn}
                          </td>

                          {/* Packing Slip No */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {isFirstOccurrence ? (
                              <span className="font-mono font-bold text-gray-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                                {r.pack_number || packingSlipNumber || "—"}
                              </span>
                            ) : (
                              <span className="font-mono text-[11px] text-slate-400 pl-1">
                                {r.pack_number || packingSlipNumber || "—"}
                              </span>
                            )}
                          </td>

                          {/* Delivery Date Picker Column (Shown only on first row of each packing slip, blank on rest) */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {isFirstOccurrence ? (
                              <input
                                type="date"
                                disabled={Boolean(createdResponse)}
                                value={rowDate}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPackingSlipDates((prev) => ({
                                    ...prev,
                                    [rowPs]: val,
                                  }));
                                }}
                                className={cn(
                                  "h-7 px-2 text-xs font-mono font-bold rounded border bg-white focus:outline-none focus:ring-1 cursor-pointer disabled:bg-slate-100 disabled:text-slate-500 w-32 shadow-2xs",
                                  !rowDate && !createdResponse
                                    ? "border-amber-400 bg-amber-50/60 text-amber-900 focus:border-amber-500 focus:ring-amber-400"
                                    : "border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-emerald-400"
                                )}
                                title={rowDate ? `Delivery date for ${rowPs}: ${rowDate}` : `Please select delivery date for ${rowPs}`}
                              />
                            ) : null}
                          </td>

                          {/* Handling Unit (SSCC-20) */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded font-mono font-bold text-xs text-slate-800 shadow-2xs">
                              <span>{generatedHu}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(generatedHu);
                                  setCopiedHu(generatedHu);
                                  setTimeout(() => setCopiedHu(null), 1500);
                                }}
                                className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                                title="Copy SSCC-20 HU"
                              >
                                {copiedHu === generatedHu ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* PO & Line (Clean values without 'PO' or 'Line' labels) */}
                          <td className="px-3 py-2 font-mono whitespace-nowrap">
                            <span className="font-semibold text-gray-800">{r.po_number || "—"}</span>
                            <span className="text-gray-400 mx-1.5">•</span>
                            <span className="text-gray-600">{r.po_item || "—"}</span>
                          </td>

                          {/* Product Code */}
                          <td className="px-3 py-2 font-mono font-medium text-gray-800">
                            {r.product_code || (r as any).material_code || "—"}
                          </td>

                          {/* Quantity */}
                          <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 bg-gray-50/50">
                            {Number(r.quantity).toLocaleString()} {r.uom || "M"}
                          </td>

                          {/* Gross Wt */}
                          <td className="px-3 py-2 text-right font-mono text-gray-700">
                            {Number(r.gross_weight).toFixed(2)}
                          </td>

                          {/* Net Wt */}
                          <td className="px-3 py-2 text-right font-mono text-gray-700">
                            {Number(r.net_weight).toFixed(2)}
                          </td>

                          {/* Lot / Batch */}
                          <td className="px-3 py-2 font-mono text-gray-700">
                            {r.lot_number || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col rounded-xl border border-dashed border-gray-300 bg-white shadow-xs p-6 overflow-hidden">
            <div className="w-full h-full flex flex-col">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center justify-between border-b pb-2 shrink-0">
                <span>Purchase Orders & Lines Selection</span>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-mono">{activePos.length} Selected</span>
              </h3>
              
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                {activePos.map(po => {
                  const lines = poLines.filter((l: any) => l.po_number === po);
                  const isAllSelected = lines.length > 0 && lines.every((l: any) => selectedLines[`${po}|${l.po_item}`]);
                  const isIndeterminate = !isAllSelected && lines.some((l: any) => selectedLines[`${po}|${l.po_item}`]);
                  
                  return (
                    <div key={po} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                      <div className="flex items-center justify-between bg-gray-50 p-3 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={isAllSelected}
                            ref={input => { if(input) input.indeterminate = isIndeterminate; }}
                            onChange={() => togglePo(po)}
                            className="w-4 h-4 text-emerald-600 rounded border-gray-300 cursor-pointer" 
                          />
                          <span className="font-mono font-bold text-sm text-gray-800">PO {po}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Pack Type</label>
                          <select
                            value={poConfigs[po] || "BOX"}
                            onChange={(e) => setPoConfigs(prev => ({ ...prev, [po]: e.target.value as "BOX"|"ROLL" }))}
                            className="text-xs bg-white border border-gray-300 rounded px-2 py-1 font-semibold text-gray-700 outline-none focus:border-emerald-500"
                          >
                            <option value="BOX">BOX</option>
                            <option value="ROLL">ROLL</option>
                          </select>
                        </div>
                      </div>

                      <div className="divide-y divide-gray-100">
                        {lines.map((l: any) => {
                          const isChecked = Boolean(selectedLines[`${po}|${l.po_item}`]);
                          const isClosed = l.remaining_qty !== undefined && l.remaining_qty <= 0;
                          return (
                            <label 
                              key={l.po_item} 
                              className={cn(
                                "flex items-center justify-between p-3 transition-colors cursor-pointer",
                                isClosed ? "opacity-50 bg-gray-50 cursor-not-allowed" : isChecked ? "bg-emerald-50/20 hover:bg-emerald-50/30" : "hover:bg-gray-50"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <input 
                                  type="checkbox" 
                                  disabled={isClosed}
                                  checked={isChecked}
                                  onChange={(e) => {
                                    setSelectedLines(prev => ({ ...prev, [`${po}|${l.po_item}`]: e.target.checked }));
                                  }}
                                  className="w-4 h-4 text-emerald-600 rounded border-gray-300 cursor-pointer" 
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-gray-700">Line {l.po_item}</span>
                                    <span className="font-mono text-xs font-semibold text-gray-900">{l.material_code || l.item_code}</span>
                                    {isClosed && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded font-bold">Fulfilled</span>}
                                  </div>
                                  <p className="text-[11px] text-gray-500 line-clamp-1">{l.description}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-xs font-bold text-gray-800 font-mono">{Number(l.remaining_qty ?? l.ordered_qty).toLocaleString()} {l.uom}</p>
                                  <p className="text-[10px] text-gray-400">Remaining Qty</p>
                                </div>

                                {!isClosed && isChecked && (
                                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Cartons:</label>
                                    <input 
                                      type="number"
                                      min={1}
                                      max={500}
                                      value={lineCartonCounts[`${po}|${l.po_item}`] || 1}
                                      onChange={(e) => {
                                        const val = Math.max(1, parseInt(e.target.value) || 1);
                                        setLineCartonCounts(prev => ({ ...prev, [`${po}|${l.po_item}`]: val }));
                                      }}
                                      className="w-12 px-1 py-0.5 text-xs text-center font-bold border border-gray-300 rounded bg-white focus:outline-emerald-500"
                                      title="Number of carton/roll rows to generate for this line item in Excel"
                                    />
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                        {lines.length === 0 && (
                          <div className="px-4 py-3 text-xs text-gray-400 italic">No line items found.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {activePos.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                    <p className="text-sm font-semibold">No Purchase Orders selected.</p>
                    <p className="text-xs">Please go back and select POs first.</p>
                  </div>
                )}
              </div>
              
              <div className="mt-4 pt-3 border-t border-gray-200 shrink-0">
                <p className="text-[11px] text-gray-500 text-center">
                  Uncheck the lines you do not wish to include in the Tailored Sheet.<br/> Configure the Pack Type for each PO, download the template, fill it locally, and upload it above.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ───────────────────────────────────────────────────────────────────
// SUBCOMPONENT C: XML Preview & Dispatch Modal
// ───────────────────────────────────────────────────────────────────
function XmlPreviewModal({
  data,
  onClose,
}: {
  data: {
    open: boolean;
    title: string;
    xmlContent: string;
    asnId?: string;
    validated: boolean;
  };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.xmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([data.xmlContent], { type: "application/xml" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ASN_SdDataSlice.xml";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSend = async () => {
    if (!data.asnId) return;
    setSending(true);
    try {
      await shipmentService.sendASN(data.asnId);
      setSentSuccess(true);
    } catch (e) {
      setSentSuccess(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-gray-900">{data.title}</h2>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-mono">DOCTYPE: SdDataSlice SYSTEM "m2Data_Partner.dtd"</span>
                <span>•</span>
                <span className="text-emerald-600 font-semibold">✓ EDI Validated</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <div className="relative max-h-[420px] overflow-auto rounded-xl bg-gray-950 p-4 font-mono text-xs text-gray-100">
            <pre className="whitespace-pre">{data.xmlContent}</pre>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-xs cursor-pointer transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : null}
              {copied ? "Copied to clipboard" : "Copy XML"}
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-xs cursor-pointer transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Download .xml File
            </button>
          </div>

          <div className="flex items-center gap-3">
            {sentSuccess ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                <Check className="h-4 w-4" /> Sent to IUNGO
              </span>
            ) : (
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to IUNGO
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SUBCOMPONENT D: Full Shipment & Carton Inspection Modal
// ───────────────────────────────────────────────────────────────────
function ShipmentDetailModal({
  shipmentId,
  onClose,
  onDownloadLabels,
  onPreviewXml,
}: {
  shipmentId: string;
  onClose: () => void;
  onDownloadLabels: (id: string, num: string, count?: number) => void;
  onPreviewXml: (shipment: any) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedHu, setCopiedHu] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    shipmentService
      .getShipmentDetail(shipmentId)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err?.response?.data?.detail || err?.message || "Failed to load shipment details");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shipmentId]);

  const handleCopyHu = (hu: string) => {
    navigator.clipboard.writeText(hu);
    setCopiedHu(hu);
    setTimeout(() => setCopiedHu(null), 2000);
  };

  const plantName = (data as any)?.destination_plant || (data?.plant_code ? formatPlantName(data.plant_code) : "N/A");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">
                  Shipment {data?.shipment_number || "..."}
                </h2>
                {data?.status && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                      statusColor[data.status] || "bg-gray-100 text-gray-700 border-gray-200"
                    )}
                  >
                    {data.status.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Destination: <strong className="text-gray-800">{plantName}</strong>
                {data?.ship_date && (
                  <> • Ship Date: <strong className="text-gray-800">{new Date(data.ship_date).toLocaleDateString("en-GB")}</strong></>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-20 text-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="font-semibold text-sm">Loading carton details...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-600 bg-red-50 rounded-xl border border-red-200">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
              <p className="font-semibold text-sm">{error}</p>
            </div>
          ) : data ? (
            <>
              {/* Stat Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Cartons</span>
                  <span className="text-lg font-black text-gray-900 font-mono mt-0.5 block">{data.total_boxes}</span>
                </div>
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Quantity</span>
                  <span className="text-lg font-black text-gray-900 font-mono mt-0.5 block">
                    {data.total_pieces?.toLocaleString()} <span className="text-xs font-semibold text-gray-600">{data.uom || "M"}</span>
                  </span>
                </div>
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Gross Weight</span>
                  <span className="text-lg font-black text-gray-900 font-mono mt-0.5 block">
                    {data.gross_weight != null ? data.gross_weight : " "} <span className="text-xs font-semibold text-gray-600">kg</span>
                  </span>
                </div>
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Net Weight</span>
                  <span className="text-lg font-black text-gray-900 font-mono mt-0.5 block">
                    {data.net_weight != null ? data.net_weight : " "} <span className="text-xs font-semibold text-gray-600">kg</span>
                  </span>
                </div>
              </div>

              {/* Associated POs & ASN Info */}
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-900">Purchase Orders:</span>
                  <div className="flex flex-wrap gap-1">
                    {data.po_numbers && data.po_numbers.length > 0 ? (
                      data.po_numbers.map((po: string) => (
                        <span key={po} className="px-2 py-0.5 bg-white border border-blue-200 rounded text-blue-800 font-mono font-bold">
                          {po}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500">None linked</span>
                    )}
                  </div>
                </div>

                {data.asn && (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-900">ASN:</span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-mono font-bold rounded border border-purple-200">
                      {data.asn.asn_number}
                    </span>
                    {data.asn.xml_validated && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded text-[11px] border border-emerald-200">
                        ✓ XML Validated
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Cartons Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Carton & Handling Unit Breakdown ({data.cartons?.length || 0})
                  </h3>
                  <span className="text-xs text-gray-400">
                    Click HU to copy
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-3.5 py-2.5">Box</th>
                        <th className="px-3.5 py-2.5">Handling Unit (20-digit HU)</th>
                        <th className="px-3.5 py-2.5">PO / Line Item</th>
                        <th className="px-3.5 py-2.5">Product Code</th>
                        <th className="px-3.5 py-2.5">Lot / Batch</th>
                        <th className="px-3.5 py-2.5 text-right">Quantity</th>
                        <th className="px-3.5 py-2.5 text-right">GW (kg)</th>
                        <th className="px-3.5 py-2.5 text-right">NW (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white font-mono">
                      {(data.cartons || []).map((c: any, idx: number) => {
                        const meta = c.details || {};
                        return (
                          <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                            <td className="px-3.5 py-2.5 font-bold text-gray-700">{c.box_number || idx + 1}</td>
                            <td className="px-3.5 py-2.5 font-bold text-gray-900">
                              <button
                                type="button"
                                onClick={() => handleCopyHu(c.hu_number)}
                                title="Click to copy 20-digit HU"
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 cursor-pointer font-bold transition-colors"
                              >
                                {c.hu_number}
                                {copiedHu === c.hu_number ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : null}
                              </button>
                            </td>
                            <td className="px-3.5 py-2.5 text-gray-700">
                              {meta.po_number || " "}{meta.po_line ? ` / ${meta.po_line}` : ""}
                            </td>
                            <td className="px-3.5 py-2.5 font-semibold text-gray-800">
                              {meta.product_code || " "}
                            </td>
                            <td className="px-3.5 py-2.5 text-gray-500">
                              {meta.lot_number || " "}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-bold text-blue-700">
                              {meta.quantity?.toLocaleString() || meta.quantity || 0} {meta.uom || data.uom || "M"}
                            </td>
                            <td className="px-3.5 py-2.5 text-right text-gray-800">
                              {c.gross_weight?.toFixed(2) || "0.00"}
                            </td>
                            <td className="px-3.5 py-2.5 text-right text-gray-600">
                              {c.net_weight?.toFixed(2) || "0.00"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50/70">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Close
          </button>

          {data && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onPreviewXml(data);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <FileCode className="w-3.5 h-3.5 text-slate-500" />
                View ASN XML
              </button>

              <button
                onClick={() => onDownloadLabels(data.id, data.shipment_number, data.total_boxes)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / Download Labels
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SUBCOMPONENT E: Label Print & Size Customization Modal
// ───────────────────────────────────────────────────────────────────
function LabelPrintModal({
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
  const [selectedSize, setSelectedSize] = useState<string>(() => {
    return localStorage.getItem("asn_preferred_label_size") || "6x4";
  });

  const handleSelectSize = (size: string) => {
    setSelectedSize(size);
    localStorage.setItem("asn_preferred_label_size", size);
  };

  const SIZES = [
    {
      id: "6x4",
      title: '6" × 4" Landscape',
      subtitle: "ASN Standard (152 × 102 mm)",
      desc: "Standard wide industrial shipping label. Best for thermal sticker rolls.",
      badge: "Standard",
      badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      id: "4x6",
      title: '4" × 6" Portrait',
      subtitle: "Logistics Standard Thermal (102 × 152 mm)",
      desc: "Standard vertical shipping label for Zebra & TSC thermal printers.",
      badge: "Thermal Roll",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    {
      id: "4x3",
      title: '4" × 3" Compact',
      subtitle: "Compact Box / Carton (102 × 76 mm)",
      desc: "Optimized for small packages, yarn boxes, and thread cartons.",
      badge: "Compact",
      badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    },
    {
      id: "a4",
      title: "A4 Sheet (4 Labels / Page)",
      subtitle: "Office Laser / Inkjet (210 × 297 mm)",
      desc: "2×2 grid layout with cut guides. Perfect for standard A4 paper or 4-up sticker sheets.",
      badge: "Office Printer",
      badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Print & Download Barcode Labels</h2>
              <p className="text-xs text-gray-500 font-mono">
                {data.shipmentNumber} • {data.totalBoxes ?? 1} {data.totalBoxes === 1 ? "Carton" : "Cartons"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
              Select Label Print Size:
            </label>
            <div className="space-y-2.5">
              {SIZES.map((s) => {
                const isSelected = selectedSize === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSize(s.id)}
                    className={cn(
                      "p-3 rounded-xl border-2 transition-all cursor-pointer flex items-start justify-between gap-3",
                      isSelected
                        ? "border-blue-600 bg-blue-50/40 shadow-xs"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <input
                          type="radio"
                          name="labelSize"
                          checked={isSelected}
                          onChange={() => handleSelectSize(s.id)}
                          className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">{s.title}</span>
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", s.badgeColor)}>
                            {s.badge}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-gray-600 mt-0.5">{s.subtitle}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onDownload(selectedSize, true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Open print preview directly in browser"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5 text-slate-500" />}
              Print Directly
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => onDownload(selectedSize, false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

