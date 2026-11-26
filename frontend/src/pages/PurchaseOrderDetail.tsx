/**
 * Purchase order detail page — /purchase-orders/:poId
 *
 * Opened in a new browser tab from the PO lists, so everything is loaded
 * from the URL (PO id) through TanStack Query; nothing is shared with the
 * list page's in-memory state.
 */

import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  AlertCircle,
  ArrowRight,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  History,
  Mail,
  RefreshCw,
} from "lucide-react";
import { poApi } from "@/services/poApi";
import { formatDate, formatNumber } from "@/i18n/format";
import { resolvePlantAndLocation } from "@/utils/plantResolver";
import { extractLineItems } from "@/utils/poLineItems";
import { statusBorderClass } from "@/utils/statusStyles";
import StatusBadge from "@/components/ui/StatusBadge";
import { cn } from "@/utils/cn";

/* eslint-disable @typescript-eslint/no-explicit-any */

const formatDateDisplay = (dateStr?: string | null) => {
  if (!dateStr) return "—";
  const s = dateStr.trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split("-");
    return formatDate(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : formatDate(d);
};

const money = (currency: string | null | undefined, value: number) =>
  `${currency || "USD"} ${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PurchaseOrderDetail() {
  const { t } = useTranslation(["purchaseOrders", "common"]);
  const { poId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const mode: "web" | "excel" = searchParams.get("mode") === "excel" ? "excel" : "web";
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const { data: po, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["purchaseOrderDetail", poId],
    queryFn: () => poApi.getById(poId),
    enabled: Boolean(poId),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl space-y-4 p-4 sm:p-6" aria-busy="true">
        <div className="h-28 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
        <div className="h-72 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
      </div>
    );
  }

  if (isError || !po) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl p-4 sm:p-6">
        <div className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
            {t("purchaseOrders:detail.loadError")}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-red-100"
          >
            {t("purchaseOrders:detail.retry")}
          </button>
        </div>
      </div>
    );
  }

  const extra = (po.extra_data as any) || {};
  const lineItems = extractLineItems(po, t("purchaseOrders:modal.primaryLineFallback"));
  const totalQty = lineItems.reduce((a, li) => a + (li.quantity || 0), 0);
  const totalShipped = po.shipped_quantity != null ? Number(po.shipped_quantity) : lineItems.reduce((a, li) => a + li.shipped_quantity, 0);
  const totalRemaining = po.remaining_quantity != null ? Number(po.remaining_quantity) : Math.max(0, totalQty - totalShipped);
  const lineValue = lineItems.reduce((a, li) => a + (li.unit_price && li.quantity ? li.quantity * li.unit_price : 0), 0);
  const hasDistinctPartner = lineItems.some((li) => li.partner_item_code?.trim() && li.partner_item_code !== li.item_code);
  const hasPricing = lineItems.some((li) => (li.unit_price ?? 0) > 0) || Boolean(po.total_value && po.total_value > 0);
  const totalValue = po.total_value && po.total_value > 0 ? po.total_value : lineValue;
  const plant = resolvePlantAndLocation(po.destination || po.delivery_address || extra.delivery_address || po.client_code, po.client_code);
  const contactPerson = po.contact_person || extra.contact_person;
  const contactEmail = po.contact_email || extra.contact_email;
  const notation = po.notations || extra.notations || extra.aux_head8;
  const colSpanBeforeQty = hasDistinctPartner ? 6 : 5;
  const isClosed = po.status === "COMPLETED" || po.status === "CANCELLED";

  const copyPo = () => {
    if (!po.po_number) return;
    navigator.clipboard.writeText(po.po_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const createShipment = () => {
    navigate(`/shipments?pos=${encodeURIComponent(po.po_number || "")}&mode=${mode}`);
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-4 p-4 sm:p-6">
      {/* ── PO header ─────────────────────────────────────────── */}
      <section
        className={cn("rounded-lg border border-slate-200 bg-white p-5 shadow-xs", statusBorderClass(po.status))}
        aria-labelledby="po-title"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="po-title" className="font-mono text-2xl font-semibold text-slate-900">
                PO {po.po_number || " "}
              </h1>
              <StatusBadge status={po.status} />
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {po.version && po.version > 1
                  ? t("purchaseOrders:modal.revision", { version: po.version })
                  : t("purchaseOrders:modal.original")}
              </span>
              {po.po_number && (
                <button
                  type="button"
                  onClick={copyPo}
                  className="inline-flex items-center gap-1 rounded-md p-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title={t("purchaseOrders:modal.copyPo")}
                  aria-label={t("purchaseOrders:modal.copyPo")}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                      <span className="text-green-700">{t("purchaseOrders:modal.copied")}</span>
                    </>
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>

            <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-slate-600">
              <div className="flex items-center gap-1.5">
                <Building className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <dt className="sr-only">{t("purchaseOrders:modal.plant")}</dt>
                <dd>
                  <span className="font-mono font-medium text-slate-900">{plant.plantCode}</span> ({plant.plantName})
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <dt>{t("purchaseOrders:table.orderDate")}:</dt>
                <dd className="text-slate-900">{formatDateDisplay(po.order_date || extra.order_date)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <dt>{t("purchaseOrders:table.deliveryDate")}:</dt>
                <dd className="font-medium text-slate-900">{formatDateDisplay(po.delivery_date)}</dd>
              </div>
              {contactPerson && (
                <div>
                  <Trans
                    t={t}
                    i18nKey="purchaseOrders:modal.contact"
                    values={{ name: contactPerson }}
                    components={{ strong: <strong className="font-medium text-slate-900" /> }}
                  />
                  {contactEmail && (
                    <a href={`mailto:${contactEmail}`} className="ml-1 text-primary hover:underline">
                      {contactEmail}
                    </a>
                  )}
                </div>
              )}
              {notation && (
                <div>
                  <Trans
                    t={t}
                    i18nKey="purchaseOrders:modal.notation"
                    values={{ notation }}
                    components={{ value: <span className="font-medium text-slate-900" /> }}
                  />
                </div>
              )}
            </dl>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {po.status === "COMPLETED" ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800 ring-1 ring-inset ring-green-200">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t("purchaseOrders:modal.fullyFulfilled")}
              </span>
            ) : po.status === "CANCELLED" ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800 ring-1 ring-inset ring-red-200">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {t("purchaseOrders:modal.cancelledPo")}
              </span>
            ) : (
              <button
                type="button"
                onClick={createShipment}
                disabled={isClosed}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                title={mode === "excel" ? t("purchaseOrders:modal.excelTitle") : undefined}
              >
                {mode === "excel" && <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
                {mode === "excel" ? t("purchaseOrders:modal.proceedExcel") : t("purchaseOrders:modal.proceedManual")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {po.source_email_subject && (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="shrink-0 text-slate-500">{t("purchaseOrders:modal.sourceEmail")}</span>
            {po.source_email_id ? (
              <a
                href={`/emails/${po.source_email_id}`}
                target="_blank"
                rel="noopener"
                className="truncate font-mono text-primary hover:underline"
              >
                {po.source_email_subject}
              </a>
            ) : (
              <span className="truncate font-mono">{po.source_email_subject}</span>
            )}
          </div>
        )}
      </section>

      {/* ── Line items (indented, lightly tinted area under the header) ── */}
      <section className="ml-0 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:ml-4 sm:p-4" aria-labelledby="po-lines-title">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 id="po-lines-title" className="text-base font-semibold text-slate-900">
              {t("purchaseOrders:modal.lineItems")}
            </h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
              {lineItems.length}
            </span>
          </div>
          {isFetching && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t("purchaseOrders:modal.refreshing")}
            </span>
          )}
        </div>

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-12 text-center">{t("purchaseOrders:modalTable.no")}</th>
                <th className="min-w-[140px]">{t("purchaseOrders:modalTable.item")}</th>
                {hasDistinctPartner && <th className="min-w-[110px]">{t("purchaseOrders:modalTable.partner")}</th>}
                <th className="min-w-[200px]">{t("purchaseOrders:modalTable.description")}</th>
                <th className="min-w-[80px]">{t("purchaseOrders:modalTable.color")}</th>
                <th className="w-16 text-center">{t("purchaseOrders:modalTable.uom")}</th>
                <th className="min-w-[90px] text-right">{t("purchaseOrders:modalTable.ordered")}</th>
                <th className="min-w-[90px] text-right">{t("purchaseOrders:modalTable.shipped")}</th>
                <th className="min-w-[100px] text-right">{t("purchaseOrders:modalTable.openBalance")}</th>
                <th className="min-w-[100px] text-center">{t("purchaseOrders:modalTable.status")}</th>
                {hasPricing && <th className="min-w-[110px] text-right">{t("purchaseOrders:modalTable.unitPrice")}</th>}
                {hasPricing && <th className="min-w-[120px] text-right">{t("purchaseOrders:modalTable.subtotal")}</th>}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => {
                const lineStatus = item.remaining_quantity <= 0 ? "FULFILLED" : item.shipped_quantity > 0 ? "PARTIAL" : "PENDING";
                const lineStatusLabel =
                  lineStatus === "FULFILLED"
                    ? t("purchaseOrders:lineStatus.fulfilled")
                    : lineStatus === "PARTIAL"
                    ? t("purchaseOrders:lineStatus.partial")
                    : t("purchaseOrders:lineStatus.pending");
                return (
                  <tr key={`${item.line_number}-${idx}`}>
                    <td className="text-center font-mono text-slate-500">{item.line_number}</td>
                    <td className="font-mono font-medium text-slate-900">
                      {item.item_code}
                      {!hasDistinctPartner && item.partner_item_code && item.partner_item_code !== item.item_code && (
                        <span className="ml-1.5 rounded bg-slate-100 px-1 text-xs text-slate-600">{item.partner_item_code}</span>
                      )}
                    </td>
                    {hasDistinctPartner && <td className="font-mono">{item.partner_item_code || " "}</td>}
                    <td className="max-w-xs truncate" title={item.description}>
                      {item.description}
                    </td>
                    <td>{item.color || " "}</td>
                    <td className="text-center font-mono">{item.size || "M"}</td>
                    <td className="text-right tabular-nums">{formatNumber(item.quantity)}</td>
                    <td className="text-right tabular-nums text-green-700">{formatNumber(item.shipped_quantity)}</td>
                    <td className="text-right font-semibold tabular-nums text-slate-900">{formatNumber(item.remaining_quantity)}</td>
                    <td className="text-center">
                      <StatusBadge status={lineStatus} label={lineStatusLabel} />
                    </td>
                    {hasPricing && (
                      <td className="text-right tabular-nums">{item.unit_price !== undefined ? money(po.currency, item.unit_price) : " "}</td>
                    )}
                    {hasPricing && (
                      <td className="text-right font-medium tabular-nums">
                        {item.unit_price ? money(po.currency, item.quantity * item.unit_price) : " "}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={colSpanBeforeQty} className="text-right text-slate-600">
                  {t("purchaseOrders:modal.totals", { count: lineItems.length })}
                </td>
                <td className="text-right tabular-nums">{formatNumber(totalQty)}</td>
                <td className="text-right tabular-nums text-green-700">{formatNumber(totalShipped)}</td>
                <td className="text-right font-semibold tabular-nums text-slate-900">{formatNumber(totalRemaining)}</td>
                <td />
                {hasPricing && <td />}
                {hasPricing && <td className="text-right font-semibold tabular-nums">{money(po.currency, totalValue)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ── Revision history ───────────────────────────────────── */}
      {po.history && po.history.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="po-history-title">
          <h2 id="po-history-title" className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <History className="h-4 w-4 text-slate-500" aria-hidden="true" />
            {t("purchaseOrders:history.title")}
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {po.history.map((h: any, idx: number) => (
              <li key={idx} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <span className="font-medium text-slate-900">{t("purchaseOrders:history.version", { version: h.version })}</span>
                  <span className="ml-2 text-slate-500">{t("purchaseOrders:history.source", { source: h.change_source })}</span>
                  {h.changed_fields?.quantity && (
                    <span className="ml-2 font-mono text-slate-700">
                      {t("purchaseOrders:history.qty", { old: h.changed_fields.quantity.old, new: h.changed_fields.quantity.new })}
                    </span>
                  )}
                </div>
                <span className="shrink-0 font-mono text-slate-500">
                  {h.created_at ? format(new Date(h.created_at), "yyyy-MM-dd HH:mm") : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
