import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "@/i18n/format";
import {
  History,
  Search,
  RefreshCw,
  ChevronDown,
  Calendar,
  X,
  CheckCircle2,
  Factory,
  FileText,
  Copy,
  Check,
  Building,
  Mail,
} from "lucide-react";
import { poApi } from "@/services/poApi";
import { useAuthStore } from "@/store/authStore";
import type { PurchaseOrder } from "@/types/email";
import { KNOWN_PLANTS, resolvePlantAndLocation } from "@/utils/plantResolver";

const formatDateDisplay = (dateStr?: string | null) => {
  if (!dateStr) return "—";
  try {
    const s = dateStr.trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split("-");
      return formatDate(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return formatDate(d);
  } catch {
    return dateStr;
  }
};

export default function OrderHistory() {
  const { t } = useTranslation("orderHistory");
  const user = useAuthStore((s) => s.user);
  const isSupplier = user?.role === "SUPPLIER";
  const supplierId = isSupplier ? (user?.supplier_id || user?.supplier_code || undefined) : undefined;

  const [page, setPage] = useState(1);
  const PER_PAGE = 500;
  const [plantFilter, setPlantFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [poChips, setPoChips] = useState<string[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [copiedPO, setCopiedPO] = useState<string | null>(null);

  const normalizePO = (value: string) =>
    value.trim().replace(/^[A-Z0-9]{2,6}\s*[-–—_]\s*(?=\d{6,}$)/i, "");
  const isPOToken = (value: string) =>
    /^(?:[A-Z0-9]{2,6}\s*[-–—_]\s*)?\d{6,15}$/i.test(value.trim());

  const { data, isLoading } = useQuery({
    queryKey: ["completedOrderHistory", page, search, poChips, plantFilter, supplierId],
    queryFn: () =>
      poApi.list({
        page,
        per_page: PER_PAGE,
        status: "COMPLETED",
        search: poChips.length === 0 && search.trim() ? search.trim() : undefined,
        po_numbers: poChips.length > 0 ? poChips.join(",") : undefined,
        plant: plantFilter !== "ALL" ? plantFilter : undefined,
        supplier_id: supplierId,
      }),
    placeholderData: (prev) => prev,
    refetchInterval: 15000,
  });

  const { data: fullPODetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ["completedOrderDetail", selectedPO?.id],
    queryFn: () => poApi.getById(selectedPO!.id),
    enabled: Boolean(selectedPO?.id),
  });

  const activePO: PurchaseOrder | null = fullPODetail || selectedPO;
  const orders: PurchaseOrder[] = data?.items || [];
  const totalOrders = data?.total || 0;

  const handleSearchChange = (value: string) => {
    if (value.includes(",")) {
      const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
      const poParts = parts.filter(isPOToken).map(normalizePO);
      const leftover = parts.filter((p) => !isPOToken(p)).join(" ");
      if (poParts.length > 0) {
        setPoChips((prev) => Array.from(new Set([...prev, ...poParts])));
        setPage(1);
      }
      setSearch(leftover);
      return;
    }
    setSearch(value);
    setPage(1);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;
    const tokens = pasted.split(/[\s,;\r\n\t]+/).map((t) => t.trim()).filter(Boolean);
    const poTokens = tokens.filter(isPOToken).map(normalizePO);
    if (poTokens.length > 0) {
      e.preventDefault();
      setPoChips((prev) => Array.from(new Set([...prev, ...poTokens])));
      setSearch(tokens.filter((t) => !isPOToken(t)).join(" "));
      setPage(1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmed = search.trim();
      if (trimmed && isPOToken(trimmed)) {
        e.preventDefault();
        setPoChips((prev) => Array.from(new Set([...prev, normalizePO(trimmed)])));
        setSearch("");
        setPage(1);
      }
    } else if (e.key === "Backspace" && search === "" && poChips.length > 0) {
      setPoChips((prev) => prev.slice(0, -1));
      setPage(1);
    }
  };

  const clearSearch = () => {
    setPoChips([]);
    setSearch("");
    setPage(1);
  };

  const handleCopyPO = (poNum: string) => {
    navigator.clipboard.writeText(poNum);
    setCopiedPO(poNum);
    setTimeout(() => setCopiedPO(null), 1800);
  };

  const detailItems = useMemo(() => {
    if (!activePO) return [];
    const raw = (activePO.extra_data as any)?.items;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((it: any, idx: number) => ({
        line_number: String(it.order_line_number || it.line_number || idx + 1),
        item_code: it.item_code || it.material_code || activePO.style_number || "—",
        description: it.description || it.item_description || activePO.description || "—",
        ordered: Number(it.quantity || 0),
        shipped: Number(it.shipped_quantity ?? it.quantity ?? 0),
        uom: it.uom || it.qty_unit || it.size || "M",
      }));
    }
    return [
      {
        line_number: "00100",
        item_code: activePO.style_number || activePO.item_code || "—",
        description: activePO.description || t("detail.fulfilledLineFallback"),
        ordered: Number(activePO.quantity || 0),
        shipped: Number(activePO.shipped_quantity ?? activePO.quantity ?? 0),
        uom: "PCS",
      },
    ];
  }, [activePO, t]);

  return (
    <div className="h-full flex flex-col overflow-hidden px-4 pt-4 pb-0 sm:px-6 sm:pt-5 sm:pb-0 gap-3">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">{t("header.title")}</h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {t("header.archive", { total: formatNumber(totalOrders) })}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {t("header.subtitle")}
          </p>
        </div>

        {/* Plant Filter Dropdown */}
        <div className="relative self-start sm:self-auto">
          <select
            value={plantFilter}
            onChange={(e) => {
              setPlantFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 pl-9 pr-9 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-800 shadow-2xs hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none min-w-[200px]"
            title={t("filters.plantTitle")}
          >
            <option value="ALL">{t("filters.allPlants")}</option>
            {Object.entries(KNOWN_PLANTS).map(([plantId, p]) => (
              <option key={plantId} value={plantId}>
                {p.name} ({p.defaultCode})
              </option>
            ))}
          </select>
          <Factory className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Multi-PO Search Bar */}
      <div className="relative flex flex-wrap items-center gap-1.5 min-h-[42px] pl-10 pr-9 py-1.5 text-sm border border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-blue-500 bg-white shadow-2xs">
        <Search className="absolute left-3.5 top-[13px] w-4 h-4 text-gray-400 pointer-events-none" />
        {poChips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-mono font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
          >
            {chip}
            <button
              type="button"
              onClick={() => {
                setPoChips((prev) => prev.filter((c) => c !== chip));
                setPage(1);
              }}
              className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          placeholder={
            poChips.length > 0 ? t("search.addAnother") : t("search.placeholder")
          }
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="flex-1 min-w-[220px] py-0.5 bg-transparent focus:outline-none text-sm text-gray-900"
        />
        {(poChips.length > 0 || search) && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-2.5 top-[11px] p-0.5 text-gray-400 hover:text-gray-600 rounded cursor-pointer"
            title={t("search.clear")}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Completed Orders Table */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-t-xl border-x border-t border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2 text-emerald-600" />
            {t("loading")}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 px-4 text-center">
            <History className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">{t("empty.title")}</p>
            <p className="text-xs text-gray-400 mt-1 max-w-md">
              {t("empty.text")}
            </p>
            {(plantFilter !== "ALL" || poChips.length > 0 || search) && (
              <button
                type="button"
                onClick={() => {
                  setPlantFilter("ALL");
                  clearSearch();
                }}
                className="mt-4 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
              >
                {t("empty.resetFilters")}
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-zinc-700 shadow-xs">
                <tr className="bg-zinc-700 text-white text-xs font-semibold uppercase tracking-wider border-b border-zinc-800">
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("table.poNumber")}</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("table.plantStore")}</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("table.orderDate")}</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("table.deliveryDate")}</th>
                  <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("table.completedDate")}</th>
                  <th className="py-1.5 px-2 min-w-[200px] border-r border-zinc-600">{t("table.description")}</th>
                  <th className="py-1.5 px-2 text-right whitespace-nowrap border-r border-zinc-600">{t("table.fulfilledQty")}</th>
                  <th className="py-1.5 px-2 whitespace-nowrap">{t("table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => {
                  const plant = resolvePlantAndLocation(
                    po.delivery_address || po.destination || (po.extra_data as any)?.delivery_address,
                    po.client_code
                  );
                  const fulfilledQty = po.shipped_quantity || po.quantity || 0;

                  return (
                    <tr
                      key={po.id}
                      onClick={() => setSelectedPO(po)}
                      className="cursor-pointer transition-colors bg-white even:bg-gray-100 hover:bg-blue-50/70 border-b border-gray-300 text-xs group"
                    >
                      <td className="py-1 px-2 whitespace-nowrap border-r border-gray-200">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-emerald-700">
                            {po.po_number || "—"}
                          </span>
                          {po.version && po.version > 1 ? (
                            <span className="px-1 py-0 text-[10px] font-bold bg-amber-100 text-amber-800 rounded border border-amber-200">
                              V{po.version}
                            </span>
                          ) : null}
                          {po.po_number && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyPO(po.po_number!);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                              title={t("table.copyPo")}
                            >
                              {copiedPO === po.po_number ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-1 px-2 whitespace-nowrap border-r border-gray-200">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-900">{plant.plantName}</span>
                          <span className="px-1.5 py-0 text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200 rounded">
                            {plant.fullDeliveryAddress}
                          </span>
                        </div>
                      </td>

                      <td className="py-1 px-2 whitespace-nowrap text-xs text-slate-600 border-r border-gray-200">
                        {formatDateDisplay(po.order_date || (po.extra_data as any)?.order_date)}
                      </td>

                      <td className="py-1 px-2 whitespace-nowrap text-xs text-slate-600 border-r border-gray-200">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{formatDateDisplay(po.delivery_date)}</span>
                        </div>
                      </td>

                      <td className="py-1 px-2 whitespace-nowrap text-xs text-slate-600 border-r border-gray-200">
                        {formatDateDisplay(po.updated_at)}
                      </td>

                      <td className="py-1 px-2 max-w-[260px] whitespace-nowrap border-r border-gray-200">
                        <p className="text-xs text-slate-700 truncate">
                          {po.description || po.style_number || po.item_code || "—"}
                        </p>
                      </td>

                      <td className="py-1 px-2 text-right whitespace-nowrap font-mono text-xs font-bold text-slate-900 border-r border-gray-200">
                        {formatNumber(Math.round(Number(fulfilledQty)))}
                      </td>

                      <td className="py-1 px-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          {t("status.completed")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Completed Order Detail & Fulfillment History Drawer */}
      {selectedPO && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-2xs animate-in fade-in duration-200"
          onClick={() => setSelectedPO(null)}
        >
          <div
            className="w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-emerald-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold font-mono text-slate-900">
                      PO {activePO?.po_number}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {t("status.completed")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {t("detail.subtitle")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPO(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingDetail && !fullPODetail ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  {t("detail.loading")}
                </div>
              ) : (
                <>
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">{t("detail.destinationPlant")}</span>
                      <span className="text-xs font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        {activePO?.plant_name || activePO?.destination || "—"}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">{t("detail.completedOn")}</span>
                      <span className="text-xs font-semibold text-slate-900 mt-1 block">
                        {formatDateDisplay(activePO?.updated_at)}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 col-span-2 sm:col-span-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">{t("detail.totalShipped")}</span>
                      <span className="text-xs font-bold font-mono text-emerald-700 mt-1 block">
                        {t("detail.totalShippedValue", {
                          quantity: formatNumber(Math.round(Number(activePO?.shipped_quantity ?? activePO?.quantity ?? 0))),
                        })}
                      </span>
                    </div>
                  </div>

                  {activePO?.contact_email && (
                    <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        <Trans
                          t={t}
                          i18nKey="detail.buyerContact"
                          values={{ contact: activePO.contact_person || activePO.contact_email }}
                          components={{ strong: <strong className="text-slate-800" /> }}
                        />
                      </span>
                    </div>
                  )}

                  {/* Fulfilled Line Items */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("detail.lineItems", { count: detailItems.length })}
                    </h3>
                    <div className="rounded-xl border border-slate-200 overflow-auto max-h-[55vh]">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-zinc-700 shadow-xs">
                          <tr className="bg-zinc-700 text-white text-xs font-semibold uppercase tracking-wider border-b border-zinc-800">
                            <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("detailTable.poLine")}</th>
                            <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("detailTable.material")}</th>
                            <th className="py-1.5 px-2 whitespace-nowrap border-r border-zinc-600">{t("detailTable.description")}</th>
                            <th className="py-1.5 px-2 text-right whitespace-nowrap border-r border-zinc-600">{t("detailTable.ordered")}</th>
                            <th className="py-1.5 px-2 text-right whitespace-nowrap">{t("detailTable.shipped")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailItems.map((li) => (
                            <tr key={li.line_number} className="bg-white even:bg-gray-100 hover:bg-blue-50/70 border-b border-gray-300 text-xs">
                              <td className="py-1 px-2 font-mono font-semibold text-slate-900 whitespace-nowrap border-r border-gray-200">
                                {activePO?.po_number} {li.line_number}
                              </td>
                              <td className="py-1 px-2 font-mono text-slate-700 whitespace-nowrap border-r border-gray-200">
                                {li.item_code}
                              </td>
                              <td className="py-1 px-2 text-slate-600 max-w-[180px] truncate whitespace-nowrap border-r border-gray-200" title={li.description}>
                                {li.description}
                              </td>
                              <td className="py-1 px-2 text-right font-mono text-slate-600 whitespace-nowrap border-r border-gray-200">
                                {formatNumber(li.ordered)} {li.uom}
                              </td>
                              <td className="py-1 px-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                                {formatNumber(li.shipped)} {li.uom}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Lifecycle & Revision Audit Log */}
                  {activePO?.history && activePO.history.length > 0 && (
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5" />
                        {t("detail.revisionHistory")}
                      </h3>
                      <div className="space-y-2">
                        {activePO.history.map((h) => (
                          <div
                            key={h.id}
                            className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">v{h.version}</span>
                              <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-600">
                                {h.change_source || "SYSTEM"}
                              </span>
                            </div>
                            <span className="text-slate-500 text-[11px]">
                              {formatDateDisplay(h.created_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
