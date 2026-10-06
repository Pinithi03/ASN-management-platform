/**
 * Shipments & Advanced Shipping Notices (ASN) Page.
 * Offers two seamless workflows for suppliers:
 * 1. Smart Web Packing Wizard (Interactive Online Packing, Auto-split cartons & 20-digit HU generation)
 * 2. Calzedonia 12-Column Excel Drop (Tailored template generation, drag & drop ingestion, weight rule verification)
 */

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search,
  PackagePlus,
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Printer,
  FileCode,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Box,
  FileText,
  Eye,


} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/utils/cn";
import {
  shipmentService,
  ExcelValidationResult,
  CreateShipmentResponse,
} from "@/services/shipmentService";
import { poApi } from "@/services/poApi";

const statusColor: Record<string, string> = {
  DRAFT: "bg-gray-50 text-gray-700 border-gray-200",
  PACKING: "bg-amber-50 text-amber-700 border-amber-200",
  PACKED: "bg-blue-50 text-blue-700 border-blue-200",
  XML_SENT: "bg-purple-50 text-purple-700 border-purple-200",
  RECEIVED: "bg-blue-50 text-blue-700 border-blue-200",
  ACCEPTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  DISPATCHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export const PLANT_NAMES: Record<string, string> = {
  PPA1: "Omega Line Ltd (PPA1)",
  PPB1: "Alpha Apparels Ltd (PPB1)",
  PPC1: "Benji Ltd (PPC1)",
  PPD1: "Sirio Ltd (PPD1)",
  PPE1: "Vavuniya Apparels Ltd (PPE1)",
  "1001": "Omega Line Ltd (1001)",
};

// Helper to accurately match plant code from client_code or destination automatically
export const matchPlant = (clientOrDest?: string | null): string => {
  if (!clientOrDest) return "PPA1";
  const s = clientOrDest.toLowerCase();
  if (s.includes("alpha") || s.includes("ppb1")) return "PPB1";
  if (s.includes("benji") || s.includes("ppc1")) return "PPC1";
  if (s.includes("sirio") || s.includes("ppd1")) return "PPD1";
  if (s.includes("vavuniya") || s.includes("ppe1") || s.includes("ppa4")) return "PPE1";
  if (s.includes("omega") || s.includes("ppa1") || s.includes("ppa2")) return "PPA1";
  return "PPA1";
};

interface ShipmentDisplayItem {
  id: string;
  shipment_number: string;
  plant_code?: string;
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
  batch_code: string;
  gross_weight: number;
  net_weight: number;
  qty: number;
  lot_number?: string;
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
  const initialMode = (searchParams.get("mode") as "web" | "excel") || "web";

  // Navigation mode: 'list' (dashboard) vs 'create' (creation wizard/excel)
  const [isCreating, setIsCreating] = useState<boolean>(Boolean(poQuery));
  const [creationMethod, setCreationMethod] = useState<"web" | "excel">(initialMode);

  // Sync state if URL changes
  useEffect(() => {
    if (poQuery) {
      setIsCreating(true);
      if (searchParams.get("mode") === "excel") {
        setCreationMethod("excel");
      }
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
      const supplierId = user?.role === "SUPPLIER" ? user.supplier_id : undefined;
      const data = await shipmentService.getShipments(undefined, undefined, supplierId);
      if (Array.isArray(data) && data.length > 0) {
        setShipments(
          data.map((d: any) => ({
            id: d.id,
            shipment_number: d.shipment_number,
            plant_code: d.plant_code,
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

  // Download blank template
  const handleDownloadBlankTemplate = async () => {
    try {
      const blob = await shipmentService.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Standard_Packing_List_Template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download template. Please try again.");
    }
  };

  // Download Labels PDF
  const handleDownloadLabels = async (shipmentId: string, shipmentNumber: string) => {
    setActionLoadingId(`labels-${shipmentId}`);
    try {
      const blob = await shipmentService.downloadLabelsPdf(shipmentId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Labels_${shipmentNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Failed to download labels: ${e?.response?.data?.detail || e.message || e}`);
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
        alert("This shipment does not have a generated ASN XML yet. Finalize packing to generate the Calzedonia ASN.");
      }
    } catch (err: any) {
      alert(`Failed to load ASN XML: ${err?.response?.data?.detail || err?.message || "Unknown error"}`);
    } finally {
      setActionLoadingId(null);
    }
  };



  const filteredShipments = shipments.filter((s) => {
    const q = search.toLowerCase();
    const plantName = (s.plant_code ? PLANT_NAMES[s.plant_code] || s.plant_code : "").toLowerCase();
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
            <h1 className="text-2xl font-semibold text-gray-900">Shipments & Outbound Deliveries</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage past deliveries or prepare new Calzedonia ASNs via Outbound Delivery Workbench or Excel upload.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">

            <button
              onClick={handleDownloadBlankTemplate}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4 text-gray-500" />
              Template (.xlsx)
            </button>
            <button
              onClick={() => {
                setCreationMethod("excel");
                setIsCreating(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Excel Drop
            </button>
            <button
              onClick={() => {
                setCreationMethod("web");
                setIsCreating(true);
              }}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-xs transition-colors cursor-pointer",
                isSupplier ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              <PackagePlus className="h-4 w-4" />
              + Create Delivery
            </button>
          </div>
        </div>
      ) : creationMethod === "excel" ? (
        <div className="flex items-center justify-between pb-3 border-b border-gray-200">
          <button
            onClick={() => {
              if (poQuery) {
                navigate("/purchase-orders");
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
              onClick={() => setCreationMethod("web")}
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

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Google-Style Top Pagination Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200/90 bg-white select-none">
              <div className="text-xs text-gray-500 font-medium">
                <span className="font-semibold text-gray-700">{totalShipments.toLocaleString()}</span> shipments
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <span className="px-2 font-normal tracking-tight text-gray-600">
                  {paginationText}
                </span>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  title="Previous page"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  title="Next page"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-5 py-3.5">Shipment #</th>
                    <th className="px-5 py-3.5">PO #</th>
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
                    const plantLabel = s.plant_code ? (PLANT_NAMES[s.plant_code] || s.plant_code) : "—";
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
                          {s.asn_id && (
                            <span className="text-[10px] font-mono text-emerald-600 block mt-0.5 font-medium">
                              ASN Linked
                            </span>
                          )}
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
                            <span className="text-gray-400 text-xs">—</span>
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
                          {s.ship_date ? new Date(s.ship_date).toLocaleDateString("en-GB") : "—"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setInspectShipmentId(s.id)}
                              title="Inspect Cartons & Shipment Details"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 shadow-2xs transition-colors cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5 text-blue-600" />
                              Inspect
                            </button>

                            <button
                              onClick={() => handleDownloadLabels(s.id, s.shipment_number)}
                              disabled={actionLoadingId === `labels-${s.id}`}
                              title="Download 6x4 Code 39 Barcode PDF Labels"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {actionLoadingId === `labels-${s.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                              ) : (
                                <Printer className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                              Labels
                            </button>

                            <button
                              onClick={() => handlePreviewXml(s)}
                              disabled={actionLoadingId === `xml-${s.id}`}
                              title="View SdDataSlice EDI XML"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {actionLoadingId === `xml-${s.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
                              ) : (
                                <FileCode className="h-3.5 w-3.5 text-purple-600" />
                              )}
                              ASN XML
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

            {/* Google-Style Bottom Pagination Footer */}
            {totalShipments > 0 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50/70 select-none text-xs text-gray-600">
                <div className="font-medium text-gray-500">
                  <span className="font-semibold text-gray-700">{totalShipments.toLocaleString()} total shipments</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span className="px-2 font-normal tracking-tight text-gray-600">
                    {paginationText}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    title="Previous page"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/70 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
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
          onSwitchToExcel={() => setCreationMethod("excel")}
        />
      ) : (
        /* OPTION 2: CALZEDONIA 12-COLUMN EXCEL WORKFLOW */
        <ExcelPackingWorkflow
          targetPo={poQuery.split(",")[0] || undefined}
          targetPos={poQuery.split(",").filter(Boolean)}
          onSuccess={() => {
            setIsCreating(false);
            setSearchParams({});
            loadShipments();
          }}
        />
      )}

      {/* SHIPMENT DETAIL & CARTON INSPECTION MODAL */}
      {inspectShipmentId && (
        <ShipmentDetailModal
          shipmentId={inspectShipmentId}
          onClose={() => setInspectShipmentId(null)}
          onDownloadLabels={handleDownloadLabels}
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
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SUBCOMPONENT A: Interactive Web Packing Wizard (3-Step Online)
// ───────────────────────────────────────────────────────────────────
function WebPackingWizard({
  poQuery,
  onSuccess,
  onSwitchToExcel,
}: {
  poQuery: string;
  onSuccess: () => void;
  onSwitchToExcel?: () => void;
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
    let isMounted = true;
    const fetchSeq = async () => {
      try {
        const suppCode = user?.supplier_code || "0000018194";
        const suppId = user?.supplier_id;
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
  }, [user?.supplier_code, user?.supplier_id]);

  const handleDispatchASN = async () => {
    setIsSubmitting(true);
    try {
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
          lot_number: box.batch_code || box.lot_number || "LOT-01",
          quantity: Number(box.qty),
          uom: item.uom || "M",
          net_weight: Number(box.net_weight),
          gross_weight: Number(box.gross_weight),
          supplier_carton_ref: `CTN-${bIdx + 1}`,
          packaging_type: item.packaging_type || "BOX",
          hu_number: box.hu_number,
        }))
      );

      const res = await shipmentService.createDirect({
        plant_code: targetPlant,
        supplier_code: activeSupplierCode,
        supplier_name: activeSupplierName,
        supplier_id: user?.supplier_id,
        carrier: "EXPRESS FREIGHT",
        note: `Online Web Packing Wizard dispatch for PO ${poNumbers.join(", ")}`,
        cartons: cartonsPayload,
      });

      setSubmitSuccessResult(res);
    } catch (err: any) {
      alert("Submission error: " + (err?.response?.data?.detail || err?.message || "Failed to create shipment"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fetch open PO lines
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

  useEffect(() => {
    if (openLinesData) {
      const shouldAutoFill = poNumbers.length > 0;
      setItems(
        openLinesData.map((line) => ({
          ...line,
          packaging_type: line.packaging_type || "BOX",
          shipping_now: shouldAutoFill ? line.remaining_qty : (line.shipping_now || 0),
        }))
      );
    }
  }, [openLinesData]);

  const handleSetGlobalPackagingType = (type: "BOX" | "ROLL") => {
    setItems((prev) => prev.map((item) => ({ ...item, packaging_type: type })));
  };

  const allBoxes = items.length > 0 && items.every((i) => (i.packaging_type || "BOX") === "BOX");
  const allRolls = items.length > 0 && items.every((i) => i.packaging_type === "ROLL");

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

    let runningSeq = startingSeq;
    const prefix = getHuPrefix();
    const initialPacked: PackedItem[] = toPack.map((item) => {
      const q = item.shipping_now || 0;
      const nw = Math.max(0.1, Math.round(q * 0.12 * 100) / 100);
      const gw = Math.max(nw + 0.1, Math.round(q * 0.15 * 100) / 100);
      const packType = item.packaging_type || "BOX";
      return {
        ...item,
        packaging_type: packType,
        lot_number: "LOT-01",
        boxes: [
          {
            id: `box-${Date.now()}-${Math.random()}`,
            hu_number: `${prefix}${String(runningSeq++).padStart(10, "0")}`,
            batch_code: "LOT-01",
            qty: q,
            gross_weight: gw,
            net_weight: nw,
          },
        ],
      };
    });

    setPackedItems(initialPacked);
    setStep(2);
  };

  const handleSplitBox = (itemId: string, boxQty: number) => {
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
          const nw = Math.max(0.1, Math.round(qtyThisBox * 0.12 * 100) / 100);
          const gw = Math.max(nw + 0.1, Math.round(qtyThisBox * 0.15 * 100) / 100);
          newBoxes.push({
            id: `box-${Date.now()}-${i}-${Math.random()}`,
            hu_number: "", // Allocated sequentially below
            batch_code: item.boxes[0]?.batch_code || "LOT-01",
            qty: qtyThisBox,
            gross_weight: gw,
            net_weight: nw,
          });
        }
        return { ...item, boxes: newBoxes };
      });
      return resequenceAllCartons(updated, startingSeq);
    });
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
        const lastBox = item.boxes[item.boxes.length - 1];
        const newBox: PackingBox = {
          id: `box-${Date.now()}-${Math.random()}`,
          hu_number: "",
          batch_code: lastBox?.batch_code || "LOT-01",
          qty: 0,
          gross_weight: 1.0,
          net_weight: 0.8,
        };
        return { ...item, boxes: [...item.boxes, newBox] };
      });
      return resequenceAllCartons(updated, startingSeq);
    });
  };

  const removeBox = (itemId: string, boxIndex: number) => {
    setPackedItems((prev) => {
      const updated = prev.map((item) => {
        if (item.id !== itemId || item.boxes.length <= 1) return item;
        return { ...item, boxes: item.boxes.filter((_, idx) => idx !== boxIndex) };
      });
      return resequenceAllCartons(updated, startingSeq);
    });
  };

  const handleProceedToReview = () => {
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
        if (!box.net_weight || box.net_weight <= 0) {
          alert(`Carton ${bIdx + 1} for item ${item.item_code} Net Weight must be > 0.`);
          return;
        }
        if (!box.gross_weight || box.gross_weight <= box.net_weight) {
          alert(
            `Carton ${bIdx + 1} for item ${item.item_code}: Gross Weight (${box.gross_weight}kg) must be strictly greater than Net Weight (${box.net_weight}kg).`
          );
          return;
        }
      }
    }
    setStep(3);
  };

  return (
    <div className="space-y-4 font-sans text-gray-800">
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
                  navigate("/purchase-orders");
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

            {onSwitchToExcel && (
              <button
                type="button"
                onClick={onSwitchToExcel}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-lg border border-gray-300 shadow-xs transition-colors cursor-pointer"
                title="Switch to Excel packing list upload for selected POs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Excel Drop
              </button>
            )}

            <div className="border-l border-gray-200 pl-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-900">
                  Outbound Delivery Workbench
                </span>
                <span className="text-[11px] font-mono text-gray-500">
                  {poNumbers.length > 0 ? `PO #${poNumbers.join(", ")}` : "All Line Items"}
                </span>
              </div>
              <span className="text-[11px] text-gray-500 block">
                Partner: <span className="font-mono text-gray-900 font-semibold">{user?.supplier_code || "0000018194"}</span> • {user?.supplier_name || "COATS THREAD EXPORTS"}
              </span>
            </div>
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

            {step === 3 && !submitSuccessResult && (
              <button
                type="button"
                onClick={handleDispatchASN}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Transmitting XML...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> Dispatch to IUNGO EDI
                  </>
                )}
              </button>
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
                  allRolls
                    ? isSupplier
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-blue-50 text-blue-800 border-blue-200"
                    : isSupplier
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-blue-50 text-blue-800 border-blue-200"
                )}
              >
                {allRolls ? "📜 All Line Items are Rolls" : "📦 All Line Items are Boxes"}
              </span>
            </div>
          </div>

          {/* Order & Delivery Details Card (Mirroring XL Drop Step 1 format with Global Pack Type) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs">
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                {poNumbers.length > 1 ? "Selected Orders (Batch)" : "Purchase Order"}
              </span>
              <p className="font-mono font-bold text-gray-900 mt-1 truncate" title={poNumbers.join(", ")}>
                {poNumbers.length > 0 ? poNumbers.map((p) => `#${p}`).join(", ") : "All Active Lines"}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Delivering Plant (Auto-Detected)
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-bold text-gray-800">
                  {PLANT_NAMES[matchPlant(items[0]?.destination)] || "Omega Line Ltd (PPA1)"}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                  Auto
                </span>
              </div>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Est. Delivery Schedule
              </span>
              <p className="font-semibold text-gray-800 mt-1">
                {items[0]?.delivery_date ? format(new Date(items[0].delivery_date), "MMM d, yyyy") : "Standard Shipping Schedule"}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Packaging Format (All Line Items)
              </span>
              <div className="flex items-center gap-1.5 mt-1 bg-white p-0.5 rounded-lg border border-gray-200 w-fit">
                <button
                  type="button"
                  onClick={() => handleSetGlobalPackagingType("BOX")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                    allBoxes
                      ? isSupplier
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-blue-600 text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100"
                  )}
                  title="Apply Box packaging format to all line items"
                >
                  📦 All Boxes
                </button>
                <button
                  type="button"
                  onClick={() => handleSetGlobalPackagingType("ROLL")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                    allRolls
                      ? isSupplier
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-blue-600 text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100"
                  )}
                  title="Apply Roll packaging format to all line items"
                >
                  📜 All Rolls
                </button>
              </div>
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
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-gray-50/80 text-gray-500 border-b border-gray-200 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="px-3.5 py-2.5">PO Number</th>
                    <th className="px-3.5 py-2.5">Item</th>
                    <th className="px-3.5 py-2.5">Material Code</th>
                    <th className="px-3.5 py-2.5">Description</th>
                    <th className="px-3.5 py-2.5 text-right">Ordered</th>
                    <th className="px-3.5 py-2.5 text-right">Open Balance</th>
                    <th className="px-3.5 py-2.5 text-right w-44">Shipping Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-3.5 py-2 font-mono font-semibold text-gray-900">{item.po_number}</td>
                      <td className="px-3.5 py-2 font-mono text-gray-500">{item.po_item}</td>
                      <td className="px-3.5 py-2 font-mono font-semibold text-gray-800">{item.item_code}</td>
                      <td className="px-3.5 py-2 text-gray-600 max-w-xs truncate">{item.description}</td>
                      <td className="px-3.5 py-2 text-right font-mono text-gray-500">{item.ordered_qty}</td>
                      <td className="px-3.5 py-2 text-right font-mono font-bold text-gray-900">
                        {item.remaining_qty}
                      </td>
                      <td className="px-3.5 py-2 text-right">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 2: CARTON PACKING & HU ASSIGNMENT ─────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
              Carton Packaging & Handling Unit (SSCC) Assignment
            </h2>
            <span className="text-[11px] font-mono text-gray-500">
              Seq Start: #{String(startingSeq).padStart(10, "0")}
            </span>
          </div>

          <div className="space-y-4">
            {packedItems.map((item) => {
              const packedQtySum = item.boxes.reduce((a, b) => a + (Number(b.qty) || 0), 0);
              const isBalanced = packedQtySum === item.shipping_now;

              const isRoll = item.packaging_type === "ROLL";
              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
                  {/* Line item header toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100 bg-gray-50/60 -mx-4 -mt-4 p-4 rounded-t-xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-xs font-mono">PO #{item.po_number}</span>
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
                        {isRoll ? "📜 Roll Packing" : "📦 Box Packing"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200 font-mono">
                        Shipping: {item.shipping_now} {item.uom || "M"}
                      </span>

                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-[11px] text-gray-500 font-medium">Split/{isRoll ? "roll" : "box"}:</span>
                        {[100, 200, 500].map((size) => (
                          <button
                            key={size}
                            onClick={() => handleSplitBox(item.id, size)}
                            className="px-2 py-0.5 bg-white hover:bg-gray-100 border border-gray-300 rounded-md text-gray-700 text-xs font-mono transition-colors cursor-pointer"
                            title={`Split into ${size} units per ${isRoll ? "roll" : "carton"}`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => addBox(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-gray-700 text-xs font-medium shadow-xs transition-colors cursor-pointer"
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
                          <th className="px-3 py-2 w-24">{isRoll ? "Roll" : "Carton"}</th>
                          <th className="px-3 py-2">20-digit HU Number (SSCC)</th>
                          <th className="px-3 py-2 w-28">Batch / Lot</th>
                          <th className="px-3 py-2 text-right w-24">Qty ({item.uom || "M"})</th>
                          <th className="px-3 py-2 text-right w-28">Gross Wt (kg)</th>
                          <th className="px-3 py-2 text-right w-28">Net Wt (kg)</th>
                          <th className="px-3 py-2 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {item.boxes.map((box, idx) => (
                          <tr key={box.id} className="hover:bg-gray-50/80 transition-colors">
                            <td className="px-3 py-1.5 font-bold text-gray-700 font-mono text-[11px]">
                              {isRoll ? "Roll" : "Carton"} {idx + 1}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px] font-semibold text-gray-900 tracking-wider select-all">
                              {box.hu_number}
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={box.batch_code}
                                onChange={(e) => updateBox(item.id, idx, { batch_code: e.target.value })}
                                className="w-24 h-7 px-2 text-xs border border-gray-300 rounded-md font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                placeholder="LOT-01"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                min="1"
                                value={box.qty}
                                onChange={(e) => updateBox(item.id, idx, { qty: Number(e.target.value) || 0 })}
                                className="w-20 h-7 px-2 text-xs text-right border border-gray-300 rounded-md font-mono font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={box.gross_weight}
                                onChange={(e) => updateBox(item.id, idx, { gross_weight: parseFloat(e.target.value) || 0 })}
                                className={`w-24 h-7 px-2 text-xs text-right border rounded-md font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${
                                  box.gross_weight <= box.net_weight ? "border-red-400 bg-red-50 text-red-700" : "border-gray-300"
                                }`}
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={box.net_weight}
                                onChange={(e) => updateBox(item.id, idx, { net_weight: parseFloat(e.target.value) || 0 })}
                                className="w-24 h-7 px-2 text-xs text-right border border-gray-300 rounded-md font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                              {box.gross_weight <= box.net_weight && (
                                <span className="text-[10px] text-red-600 font-bold block mt-0.5">GW &le; NW!</span>
                              )}
                            </td>
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          {submitSuccessResult ? (
            <div className="space-y-4">
              {/* Confirmation Header */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                      Shipment #{submitSuccessResult.shipment?.shipment_number} Created Successfully
                    </h2>
                    <p className="text-xs text-gray-600 mt-0.5 font-mono">
                      Calzedonia ASN #{submitSuccessResult.asn?.asn_number} registered and validated.
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-gray-500 font-semibold block uppercase">Total Cartons</span>
                  <span className="text-lg font-bold text-gray-900 font-mono">{submitSuccessResult.shipment?.total_boxes} Units</span>
                </div>
              </div>

              {/* Handling Units Grid */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Allocated 20-digit Handling Units (SSCC)
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">
                    Prefix: {submitSuccessResult.handling_units?.[0]?.substring(0, 10) || "1000018194"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                  {(submitSuccessResult.handling_units || []).map((hu: string, idx: number) => (
                    <div key={idx} className="bg-white px-3 py-2 rounded-lg border border-gray-200 text-xs flex items-center justify-between font-mono shadow-2xs">
                      <span className="text-gray-500 text-[10px] font-sans font-bold">Ctn #{idx + 1}</span>
                      <span className="font-bold text-gray-800 tracking-wider">{hu}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (submitSuccessResult.shipment?.id) {
                        try {
                          const blob = await shipmentService.downloadLabelsPdf(submitSuccessResult.shipment.id);
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `Labels_${submitSuccessResult.shipment.shipment_number}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          window.URL.revokeObjectURL(url);
                        } catch (e: any) {
                          alert("Failed to download labels: " + (e?.message || "Unknown error"));
                        }
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" /> Download 6x4 PDF Labels
                  </button>

                  <button
                    onClick={() => {
                      const xml = submitSuccessResult.asn?.xml_content;
                      if (!xml) {
                        alert("XML content not available in response.");
                        return;
                      }
                      const blob = new Blob([xml], { type: "application/xml" });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = submitSuccessResult.asn?.xml_filename || "Calzedonia_ASN.xml";
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                    }}
                    className="px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Calzedonia XML
                  </button>

                  {submitSuccessResult.asn?.xml_content && (
                    <button
                      onClick={() => setPreviewXmlModal(submitSuccessResult.asn.xml_content)}
                      className="px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview XML
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {poNumbers.length > 0 && (
                    <button
                      onClick={() => navigate("/purchase-orders")}
                      className={cn(
                        "px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-xs transition-all cursor-pointer",
                        isSupplier ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                      )}
                    >
                      ← Return to Purchase Orders
                    </button>
                  )}
                  <button
                    onClick={onSuccess}
                    className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                  >
                    View All Shipments →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Step 3 Pre-dispatch Review */}
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                  Dispatch Verification & Summary
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Review consignment metrics before final EDI transmission. Transmit using the top toolbar.
                </p>
              </div>

              {/* 4 Neutral KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                  <span className="text-[11px] text-gray-500 uppercase font-semibold block">Total Cartons</span>
                  <p className="text-lg font-bold text-gray-900 font-mono mt-1">
                    {packedItems.reduce((acc, curr) => acc + curr.boxes.length, 0)} Cartons
                  </p>
                </div>
                <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                  <span className="text-[11px] text-gray-500 uppercase font-semibold block">Shipping Units</span>
                  <p className="text-lg font-bold text-gray-900 font-mono mt-1">
                    {packedItems.reduce((acc, curr) => acc + (curr.shipping_now || 0), 0).toLocaleString()} {packedItems[0]?.uom || "M"}
                  </p>
                </div>
                <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                  <span className="text-[11px] text-gray-500 uppercase font-semibold block">Supplier Partner</span>
                  <p className="text-sm font-bold text-gray-900 font-mono mt-1 truncate">
                    {user?.supplier_code || "0000018194"}
                  </p>
                  <span className="text-[10px] text-gray-500 truncate block">
                    {user?.supplier_name || "COATS THREAD EXPORTS"}
                  </span>
                </div>
                <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                  <span className="text-[11px] text-gray-500 uppercase font-semibold block">Destination Plant</span>
                  <p className="text-sm font-bold text-gray-900 mt-1 truncate">
                    {PLANT_NAMES[matchPlant(packedItems[0]?.destination)] || "Omega Line Ltd"}
                  </p>
                  <span className="text-[10px] text-gray-500 font-mono block">
                    Code: {matchPlant(packedItems[0]?.destination)}
                  </span>
                </div>
              </div>

              {/* Validation Checkbox Card */}
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs flex items-center gap-2 text-emerald-900">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>EDI Compliance:</strong> Calzedonia DTD rules verified (GW &gt; NW &gt; 0, contiguous 20-digit SSCC sequence). Ready for transmission.
                </span>
              </div>
            </>
          )}

          {/* XML Preview Modal inside Web Packing Wizard */}
          {previewXmlModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50/80">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-gray-900 text-sm">Official Calzedonia SdDataSlice XML</span>
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
// SUBCOMPONENT B: Complete Calzedonia 12-Column Excel Drop Workflow
// ─────────────────────────────────────────────────────────────────────────────
function ExcelPackingWorkflow({
  targetPo,
  targetPos,
  onSuccess,
}: {
  targetPo?: string;
  targetPos?: string[];
  onSuccess: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ExcelValidationResult | null>(null);
  const [showCartonDetails, setShowCartonDetails] = useState(false);

  // Metadata
  const activePos = (targetPos && targetPos.length > 0) ? targetPos : targetPo ? [targetPo] : [];
  const [plantCode, setPlantCode] = useState("PPA1");
  const [estimatedArrival, setEstimatedArrival] = useState("");
  
  // PO specific configurations
  const [poLines, setPoLines] = useState<any[]>([]);
  const [poConfigs, setPoConfigs] = useState<Record<string, "BOX" | "ROLL">>({});
  const [selectedLines, setSelectedLines] = useState<Record<string, boolean>>({});
  const [downloadingTailored, setDownloadingTailored] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [createdResponse, setCreatedResponse] = useState<CreateShipmentResponse | null>(null);

  // Success actions
  const [downloadingLabels, setDownloadingLabels] = useState(false);
  const [downloadingXml, setDownloadingXml] = useState(false);
  const [dispatchingAsn, setDispatchingAsn] = useState(false);
  const [dispatchedSuccess, setDispatchedSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activePos.length === 0) return;

    let minDate = "";
    let pCode = "PPA1";

    const fetchAll = async () => {
      let fetchedLines: any[] = [];
      const newConfigs: Record<string, "BOX" | "ROLL"> = {};
      const newSelected: Record<string, boolean> = {};

      for (const po of activePos) {
        newConfigs[po] = "BOX";
        try {
          const res = await poApi.list({ search: po });
          const found = res.items?.find((p) => p.po_number === po) || res.items?.[0];
          if (found) {
             if (!minDate || (found.delivery_date && found.delivery_date < minDate)) {
                 minDate = found.delivery_date || "";
                 pCode = matchPlant(found.client_code || found.destination);
             }
             
             const fullPo = await poApi.getById(found.id);
             if (fullPo && (fullPo as any).extra_data && Array.isArray((fullPo as any).extra_data.items)) {
                (fullPo as any).extra_data.items.forEach((it: any) => {
                   if (Number(it.quantity || 0) > 0) {
                      const poItem = String(it.order_line_number || it.line_number || 1).trim();
                      fetchedLines.push({
                         po_number: po,
                         po_item: poItem,
                         material_code: it.material_code || "",
                         description: it.description || "",
                         ordered_qty: Number(it.quantity || 0),
                         uom: it.size || it.uom || "M",
                      });
                      newSelected[`${po}|${poItem}`] = true;
                   }
                });
             } else {
                 const poItem = "00100";
                 fetchedLines.push({
                     po_number: po,
                     po_item: poItem,
                     material_code: found.style_number || "ELST1K 000615",
                     description: found.description || "Elastic Tape",
                     ordered_qty: found.quantity || 500,
                     uom: "M",
                 });
                 newSelected[`${po}|${poItem}`] = true;
             }
          }
        } catch(e) {
           console.warn("Could not fetch PO details:", e);
        }
      }

      setPlantCode(pCode);
      if (minDate) {
         setEstimatedArrival(minDate.split("T")[0]);
      } else {
         setEstimatedArrival(new Date(Date.now() + 86400000).toISOString().split("T")[0]);
      }
      
      setPoLines(fetchedLines);
      setPoConfigs(newConfigs);
      setSelectedLines(newSelected);
    };

    fetchAll();
  }, [activePos.join(",")]);

  const toggleLine = (po: string, line: string) => {
    setSelectedLines(prev => ({
       ...prev,
       [`${po}|${line}`]: !prev[`${po}|${line}`]
    }));
  };

  const togglePo = (po: string) => {
    const linesForPo = poLines.filter(l => l.po_number === po);
    const allSelected = linesForPo.every(l => selectedLines[`${po}|${l.po_item}`]);
    const newState = { ...selectedLines };
    linesForPo.forEach(l => {
       newState[`${po}|${l.po_item}`] = !allSelected;
    });
    setSelectedLines(newState);
  };

  const handleDownloadTailoredTemplate = async () => {
    if (activePos.length === 0) return;
    setDownloadingTailored(true);
    try {
      const payload = {
        configs: activePos.map((po) => ({
          po_number: po,
          pack_type: poConfigs[po] || "BOX",
          selected_lines: poLines
              .filter(l => l.po_number === po && selectedLines[`${po}|${l.po_item}`])
              .map(l => l.po_item),
        })).filter(cfg => cfg.selected_lines.length > 0),
      };
      
      if (payload.configs.length === 0) {
        alert("Please select at least one line item to generate the template.");
        setDownloadingTailored(false);
        return;
      }
      
      const blob = await shipmentService.downloadConfiguredTemplate(payload);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Packing_List_Tailored.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
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

    try {
      const supplierId = user?.role === "SUPPLIER" ? user.supplier_id : undefined;
      const res = await shipmentService.validateExcel(file, supplierId);
      setValidationResult(res);
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
    if (!selectedFile) return;
    setSubmitting(true);
    try {
      const res = await shipmentService.createFromExcel({
        file: selectedFile,
        plant_code: plantCode,
        supplier_code: user?.supplier_code || undefined,
        supplier_name: user?.supplier_name || undefined,
        supplier_id: user?.supplier_id || undefined,
        estimated_arrival: estimatedArrival || undefined,
      });
      setCreatedResponse(res);
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
      const blob = await shipmentService.downloadASNXml(createdResponse.asn.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = createdResponse.asn.xml_filename || `PL_${createdResponse.shipment.shipment_number}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to download ASN XML: ${err?.response?.data?.detail || err.message || err}`);
    } finally {
      setDownloadingXml(false);
    }
  };

  const handleDispatchAsn = async () => {
    if (!createdResponse) return;
    setDispatchingAsn(true);
    try {
      await shipmentService.sendASN(createdResponse.asn.id);
      setDispatchedSuccess(true);
    } catch (err: any) {
      alert(`Failed to dispatch ASN: ${err?.response?.data?.detail || err.message || err}`);
    } finally {
      setDispatchingAsn(false);
    }
  };

  return (
    <div
      onDragEnter={!createdResponse && !validationResult ? handleDrag : undefined}
      onDragLeave={!createdResponse && !validationResult ? handleDrag : undefined}
      onDragOver={!createdResponse && !validationResult ? handleDrag : undefined}
      onDrop={!createdResponse && !validationResult ? handleDrop : undefined}
      className={cn("bg-white rounded-2xl shadow-sm border flex flex-col h-full min-h-[600px] transition-all", dragActive ? "border-emerald-500 bg-emerald-50/10" : "border-gray-100")}
    >
      {!createdResponse ? (
        <>
           {/* Header / Actions Bar */}
           <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-t-2xl bg-gray-50 border-b border-gray-200">
              <div className="flex flex-wrap items-center gap-4">
                 {/* 1. Upload Button */}
                 <div>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { if(e.target.files?.[0]) { processFile(e.target.files[0]); } e.target.value = ''; }} />
                    <button onClick={() => fileInputRef.current?.click()} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg font-bold shadow-sm transition-all text-sm cursor-pointer", selectedFile ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-emerald-600 text-white hover:bg-emerald-700")}>
                       <UploadCloud className="w-4 h-4"/>
                       {selectedFile ? selectedFile.name : "Upload Excel List"}
                    </button>
                 </div>
                 
                 <div className="w-px h-8 bg-gray-300 hidden sm:block"></div>

                 {/* 2. Delivery Date */}
                 <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-700">Delivery Date:</label>
                    <input type="date" value={estimatedArrival} onChange={(e) => setEstimatedArrival(e.target.value)} className="h-9 px-2 text-xs border border-gray-300 bg-white rounded-md focus:border-emerald-500 outline-none font-medium" />
                 </div>
              </div>

              <div className="flex items-center gap-2">
                 <button onClick={handleDownloadTailoredTemplate} disabled={downloadingTailored || activePos.length === 0} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-2 rounded-lg transition-colors border border-emerald-200 flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50">
                    {downloadingTailored ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>} Tailored Sheet
                 </button>
                 {validationResult?.is_valid && !validating && (
                   <button
                     disabled={submitting}
                     onClick={handleCreateShipment}
                     className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                   >
                     {submitting ? <><Loader2 className="w-4 h-4 animate-spin"/> Processing...</> : <><PackagePlus className="w-4 h-4"/> Create Shipment & Generate HUs</>}
                   </button>
                 )}
              </div>
           </div>

           {/* Content Area */}
           <div className="flex-1 flex flex-col p-4 bg-gray-50/30 overflow-hidden">
              {validating ? (
                 <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500 shadow-xs">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
                    <p className="font-semibold text-gray-700">Verifying Excel lines...</p>
                    <p className="text-xs mt-1">Checking quantities and weight rules (GW ≥ NW &gt; 0)</p>
                 </div>
              ) : validationResult ? (
                 <div className="flex-1 space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-xs overflow-y-auto">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          {validationResult.is_valid ? (
                             <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-4 w-4" /> Validation Passed
                             </span>
                          ) : (
                             <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700 border border-red-200">
                                <AlertTriangle className="h-4 w-4" /> Validation Failed
                             </span>
                          )}
                          <span className="text-sm font-medium text-gray-500">
                             {validationResult.total_cartons} Cartons/Rolls • {validationResult.total_quantity.toLocaleString()} units
                          </span>
                       </div>

                       <div className="flex items-center gap-4 text-sm text-gray-700 bg-gray-50 px-4 py-1.5 rounded-lg border border-gray-100">
                          <span>GW: <strong className="font-mono">{validationResult.total_gross_weight.toFixed(2)} kg</strong></span>
                          <span className="text-gray-300">|</span>
                          <span>NW: <strong className="font-mono">{validationResult.total_net_weight.toFixed(2)} kg</strong></span>
                       </div>
                    </div>

                    {/* Summary Table */}
                    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-xs">
                       <table className="w-full text-left text-xs">
                          <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider">
                             <tr>
                                <th className="px-4 py-3 border-b border-gray-200">PO #</th>
                                <th className="px-4 py-3 border-b border-gray-200">Line</th>
                                <th className="px-4 py-3 border-b border-gray-200">Product</th>
                                <th className="px-4 py-3 border-b border-gray-200">Cartons/Rolls</th>
                                <th className="px-4 py-3 border-b border-gray-200">Qty</th>
                                <th className="px-4 py-3 border-b border-gray-200">GW (kg)</th>
                                <th className="px-4 py-3 border-b border-gray-200">NW (kg)</th>
                                <th className="px-4 py-3 border-b border-gray-200">Status</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                             {validationResult.line_summaries.map((s, idx) => (
                                <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                                   <td className="px-4 py-2.5 font-mono font-bold text-gray-800">{s.po_number}</td>
                                   <td className="px-4 py-2.5 font-mono text-gray-600">{s.po_item}</td>
                                   <td className="px-4 py-2.5 font-mono font-medium text-gray-700">{s.product_code}</td>
                                   <td className="px-4 py-2.5 font-semibold text-gray-700">{s.carton_count}</td>
                                   <td className="px-4 py-2.5 font-bold text-emerald-700 bg-emerald-50/50">{s.total_qty}</td>
                                   <td className="px-4 py-2.5 text-gray-600 font-mono">{s.total_gw}</td>
                                   <td className="px-4 py-2.5 text-gray-600 font-mono">{s.total_nw}</td>
                                   <td className="px-4 py-2.5">
                                      {s.is_valid ? (
                                         <span className="text-emerald-600 font-semibold flex items-center gap-1"><Check className="w-3.5 h-3.5"/> Ready</span>
                                      ) : (
                                         <span className="text-red-600 font-medium text-[11px] leading-tight flex items-start gap-1"><X className="w-3.5 h-3.5 shrink-0 mt-0.5"/> {s.errors.join(", ")}</span>
                                      )}
                                   </td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>

                    {/* Collapsible Carton preview */}
                    <div>
                       <button
                          type="button"
                          onClick={() => setShowCartonDetails(!showCartonDetails)}
                          className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 cursor-pointer bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
                       >
                          {showCartonDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {showCartonDetails
                             ? "Hide breakdown"
                             : `View ${validationResult.rows.length} cartons/rolls breakdown`}
                       </button>

                       {showCartonDetails && (
                          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-0 text-[11px] shadow-inner">
                             <table className="w-full text-left">
                                <thead className="sticky top-0 bg-gray-200 text-gray-700 font-bold uppercase tracking-wider">
                                   <tr>
                                      <th className="px-3 py-2 border-b border-gray-300">Unit #</th>
                                      <th className="px-3 py-2 border-b border-gray-300">Ref</th>
                                      <th className="px-3 py-2 border-b border-gray-300">Lot No.</th>
                                      <th className="px-3 py-2 border-b border-gray-300">GW</th>
                                      <th className="px-3 py-2 border-b border-gray-300">NW</th>
                                      <th className="px-3 py-2 border-b border-gray-300">Qty</th>
                                   </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                   {validationResult.rows.map((r, i) => (
                                      <tr key={i} className="text-gray-600 hover:bg-gray-50">
                                         <td className="px-3 py-1.5 font-mono font-semibold">#{r.carton_number}</td>
                                         <td className="px-3 py-1.5">{r.supplier_carton_ref || "—"}</td>
                                         <td className="px-3 py-1.5 font-mono">{r.lot_number || "—"}</td>
                                         <td className="px-3 py-1.5 font-mono">{r.gross_weight}</td>
                                         <td className="px-3 py-1.5 font-mono">{r.net_weight}</td>
                                         <td className="px-3 py-1.5 font-mono font-bold text-gray-900 bg-gray-50">{r.quantity}</td>
                                      </tr>
                                   ))}
                                </tbody>
                             </table>
                          </div>
                       )}
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
                             const lines = poLines.filter(l => l.po_number === po);
                             const isAllSelected = lines.length > 0 && lines.every(l => selectedLines[`${po}|${l.po_item}`]);
                             const isIndeterminate = !isAllSelected && lines.some(l => selectedLines[`${po}|${l.po_item}`]);
                             
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
                                      <span className="font-mono font-bold text-sm text-gray-800">PO #{po}</span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                      <label className="text-[10px] font-bold text-gray-500 uppercase">Pack Type</label>
                                      <select
                                         value={poConfigs[po] || "BOX"}
                                         onChange={(e) => setPoConfigs(prev => ({ ...prev, [po]: e.target.value as "BOX"|"ROLL" }))}
                                         className="text-xs font-bold bg-white border border-gray-300 rounded-md px-2 py-1 outline-none focus:border-emerald-500 shadow-sm cursor-pointer"
                                      >
                                         <option value="BOX">📦 Box</option>
                                         <option value="ROLL">📜 Roll</option>
                                      </select>
                                   </div>
                                </div>
                                
                                <div className="divide-y divide-gray-100 bg-white">
                                   {lines.map((line) => (
                                      <label key={line.po_item} className="flex items-center gap-4 px-4 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
                                         <input 
                                            type="checkbox" 
                                            checked={selectedLines[`${po}|${line.po_item}`] || false}
                                            onChange={() => toggleLine(po, line.po_item)}
                                            className="w-4 h-4 text-emerald-600 rounded border-gray-300 cursor-pointer"
                                         />
                                         <div className="flex-1 min-w-0 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                               <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border border-gray-200">#{line.po_item}</span>
                                               <span className="text-xs font-bold text-gray-800 font-mono">{line.material_code}</span>
                                               <span className="text-xs text-gray-500 truncate max-w-sm">{line.description}</span>
                                            </div>
                                            <div className="text-xs font-mono font-bold text-gray-600 bg-gray-50 border border-gray-100 px-2 py-1 rounded shadow-inner">
                                               {line.ordered_qty} {line.uom}
                                            </div>
                                         </div>
                                      </label>
                                   ))}
                                   {lines.length === 0 && (
                                      <div className="px-4 py-3 text-xs text-gray-400 italic">No line items found.</div>
                                   )}
                                </div>
                             </div>
                          )})}
                          
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
           

        </>
      ) : (
        /* SUCCESS VIEW */
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
            <Check className="h-10 w-10 stroke-[3]" />
          </div>

          <div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">Shipment Created Successfully!</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
              Shipment <strong className="font-mono text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">{createdResponse.shipment.shipment_number}</strong>{" "}
              registered with {createdResponse.shipment.total_boxes} Cartons/Rolls &{" "}
              {createdResponse.shipment.total_pieces.toLocaleString()} units.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-900 p-5 text-left w-full max-w-2xl shadow-xl">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Allocated 20-digit Handling Units ({createdResponse.handling_units.length})
            </p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {createdResponse.handling_units.map((hu, i) => (
                <span key={i} className="rounded-lg bg-gray-800 px-3 py-1.5 font-mono text-sm font-bold text-emerald-400 border border-gray-700 shadow-inner">
                  {hu}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4 w-full max-w-3xl">
            <button
              type="button"
              disabled={downloadingLabels}
              onClick={handleDownloadLabelsPdf}
              className="flex-1 min-w-[200px] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-700 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all cursor-pointer"
            >
              {downloadingLabels ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
              6x4 Labels PDF
            </button>

            <button
              type="button"
              disabled={downloadingXml}
              onClick={handleDownloadAsnXml}
              className="flex-1 min-w-[200px] flex items-center justify-center gap-2 rounded-xl border-2 border-purple-200 bg-purple-50 px-5 py-3 text-sm font-bold text-purple-700 shadow-sm hover:bg-purple-100 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {downloadingXml ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              ASN XML (.xml)
            </button>

            {dispatchedSuccess ? (
              <span className="flex-1 min-w-[200px] flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-5 py-3.5 text-sm font-black text-emerald-700 border-2 border-emerald-200 shadow-sm">
                <Check className="h-5 w-5 stroke-[3]" /> Dispatched to EDI
              </span>
            ) : (
              <button
                type="button"
                disabled={dispatchingAsn}
                onClick={handleDispatchAsn}
                className="flex-1 min-w-[200px] flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-purple-700 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all cursor-pointer"
              >
                {dispatchingAsn ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                Dispatch to EDI
              </button>
            )}
          </div>
          
          <div className="pt-2">
             <button
                type="button"
                onClick={onSuccess}
                className="text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors underline cursor-pointer"
             >
                Close & View in List
             </button>
          </div>
        </div>
      )}
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
                <Check className="h-4 w-4" /> Dispatched to iungo@calzedonia.com
              </span>
            ) : (
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Dispatch to IUNGO EDI
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
  onDownloadLabels: (id: string, num: string) => void;
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

  const plantName = data?.plant_code ? (PLANT_NAMES[data.plant_code] || data.plant_code) : "N/A";

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
                  Shipment #{data?.shipment_number || "..."}
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
                    {data.gross_weight != null ? data.gross_weight : "—"} <span className="text-xs font-semibold text-gray-600">kg</span>
                  </span>
                </div>
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Net Weight</span>
                  <span className="text-lg font-black text-gray-900 font-mono mt-0.5 block">
                    {data.net_weight != null ? data.net_weight : "—"} <span className="text-xs font-semibold text-gray-600">kg</span>
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
                    <span className="font-bold text-blue-900">Calzedonia ASN:</span>
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
                    Carton & Handling Unit (SSCC) Breakdown ({data.cartons?.length || 0})
                  </h3>
                  <span className="text-xs text-gray-400">
                    Click HU to copy
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-3.5 py-2.5">Box #</th>
                        <th className="px-3.5 py-2.5">Handling Unit (20-digit SSCC)</th>
                        <th className="px-3.5 py-2.5">PO # / Line</th>
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
                            <td className="px-3.5 py-2.5 font-bold text-gray-700">#{c.box_number || idx + 1}</td>
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
                              {meta.po_number || "—"}{meta.po_line ? ` / ${meta.po_line}` : ""}
                            </td>
                            <td className="px-3.5 py-2.5 font-semibold text-gray-800">
                              {meta.product_code || "—"}
                            </td>
                            <td className="px-3.5 py-2.5 text-gray-500">
                              {meta.lot_number || "—"}
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
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 bg-gray-50/70">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer shadow-xs"
          >
            Close
          </button>

          {data && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDownloadLabels(data.id, data.shipment_number)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Download 6x4 Labels PDF
              </button>

              <button
                onClick={() => {
                  onPreviewXml(data);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <FileCode className="w-3.5 h-3.5" />
                View ASN XML
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
