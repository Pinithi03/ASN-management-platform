/**
 * Shipment detail page — /shipments/:shipmentId
 *
 * Replaces the shipment-detail and XML-preview modals. Opened in a new tab
 * from the Shipments list, so it loads everything from the URL.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { AlertTriangle, Box, Check, Printer } from "lucide-react";
import { shipmentService } from "@/services/shipmentService";
import { getErrorMessage } from "@/services/apiError";
import { formatDate, formatNumber } from "@/i18n/format";
import { cn } from "@/utils/cn";
import { statusBorderClass } from "@/utils/statusStyles";
import StatusBadge from "@/components/ui/StatusBadge";
import XmlPanel from "@/components/shipments/XmlPanel";
import {
  LabelPrintModal,
  downloadShipmentLabels,
  formatPlantName,
  shipmentStatusLabel,
} from "@/components/shipments/shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ShipmentDetail() {
  const { t } = useTranslation(["shipments", "common"]);
  const { shipmentId = "" } = useParams();
  const [copiedHu, setCopiedHu] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelsBusy, setLabelsBusy] = useState(false);
  const [labelsError, setLabelsError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["shipmentDetail", shipmentId],
    queryFn: () => shipmentService.getShipmentDetail(shipmentId),
    enabled: Boolean(shipmentId),
    refetchInterval: 30_000,
  });

  const asnId: string | undefined = data?.asn_id || data?.asn?.id;
  const inlineXml: string | undefined = data?.asn?.xml_content;
  const { data: xmlPreview } = useQuery<any>({
    queryKey: ["shipmentAsnXml", asnId],
    queryFn: () => shipmentService.getASNXmlPreview(asnId!),
    enabled: Boolean(asnId) && !inlineXml,
    refetchInterval: false,
  });
  const xmlContent: string | undefined = inlineXml || xmlPreview?.xml_content;

  // Deep link to the XML section (#xml) once it has rendered.
  useEffect(() => {
    if (xmlContent && window.location.hash === "#xml") {
      document.getElementById("xml")?.scrollIntoView();
    }
  }, [xmlContent]);

  useEffect(() => {
    if (data?.shipment_number) document.title = `${data.shipment_number} · ANS Portal`;
  }, [data?.shipment_number]);

  const copyHu = (hu: string) => {
    navigator.clipboard.writeText(hu);
    setCopiedHu(hu);
    setTimeout(() => setCopiedHu(null), 2000);
  };

  const handleLabels = async (size: string, autoPrint: boolean) => {
    if (!data) return;
    setLabelsBusy(true);
    setLabelsError(null);
    try {
      await downloadShipmentLabels(data.id, data.shipment_number, size, autoPrint);
      setLabelsOpen(false);
    } catch (e) {
      setLabelsError(t("shipments:labels.downloadFailed", { error: getErrorMessage(e, String(e)) }));
    } finally {
      setLabelsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl space-y-4 p-4 sm:p-6" aria-busy="true">
        <div className="h-24 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
        <div className="h-80 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl p-4 sm:p-6">
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          {getErrorMessage(error, t("shipments:detail.loadFailed"))}
        </div>
      </div>
    );
  }

  const plantName = data.destination_plant || (data.plant_code ? formatPlantName(data.plant_code) : "—");
  const cartons: any[] = data.cartons || [];

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-4 p-4 sm:p-6">
      <section className={cn("rounded-lg border border-slate-200 bg-white p-5", statusBorderClass(data.status))}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Box className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <h1 className="text-2xl font-semibold text-slate-900">
                {t("shipments:detail.title", { number: data.shipment_number })}
              </h1>
              <StatusBadge status={data.status} label={shipmentStatusLabel(data.status)} />
            </div>
            <p className="text-sm text-slate-600">
              <Trans
                t={t}
                i18nKey="shipments:detail.destination"
                values={{ plant: plantName }}
                components={{ strong: <strong className="font-medium text-slate-900" /> }}
              />
              {data.ship_date && (
                <>
                  {" · "}
                  <Trans
                    t={t}
                    i18nKey="shipments:detail.shipDate"
                    values={{ date: formatDate(data.ship_date, "numeric") }}
                    components={{ strong: <strong className="font-medium text-slate-900" /> }}
                  />
                </>
              )}
            </p>
          </div>
          <button type="button" onClick={() => setLabelsOpen(true)} className="btn btn-primary">
            <Printer className="h-4 w-4" aria-hidden="true" />
            {t("shipments:detail.printLabels")}
          </button>
        </div>
        {labelsError && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {labelsError}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:ml-4 sm:p-4" aria-labelledby="cartons-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="cartons-title" className="text-base font-semibold text-slate-900">
            {t("shipments:detail.breakdown", { count: cartons.length })}
          </h2>
          <span className="text-sm text-slate-500">{t("shipments:detail.clickToCopy")}</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("shipments:detail.table.box")}</th>
                <th>{t("shipments:detail.table.hu")}</th>
                <th>{t("shipments:detail.table.poLine")}</th>
                <th>{t("shipments:detail.table.productCode")}</th>
                <th>{t("shipments:detail.table.lot")}</th>
                <th className="text-right">{t("shipments:detail.table.quantity")}</th>
                <th className="text-right">{t("shipments:detail.table.gw")}</th>
                <th className="text-right">{t("shipments:detail.table.nw")}</th>
              </tr>
            </thead>
            <tbody>
              {cartons.map((c, idx) => {
                const meta = c.details || {};
                return (
                  <tr key={c.hu_number || idx}>
                    <td className="font-medium">{c.box_number || idx + 1}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => copyHu(c.hu_number)}
                        title={t("shipments:detail.copyHuTitle")}
                        className="inline-flex items-center gap-1.5 rounded-sm font-mono text-slate-900 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {c.hu_number}
                        {copiedHu === c.hu_number && <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />}
                      </button>
                    </td>
                    <td className="font-mono">
                      {meta.po_number || " "}
                      {meta.po_line ? ` / ${meta.po_line}` : ""}
                    </td>
                    <td>{meta.product_code || " "}</td>
                    <td>{meta.lot_number || " "}</td>
                    <td className="text-right font-medium">
                      {meta.quantity != null ? formatNumber(meta.quantity) : 0} {meta.uom || data.uom || "M"}
                    </td>
                    <td className="text-right">{c.gross_weight != null ? formatNumber(c.gross_weight, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                    <td className="text-right">{c.net_weight != null ? formatNumber(c.net_weight, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {xmlContent ? (
        <XmlPanel title={t("shipments:xml.title", { number: data.shipment_number })} xmlContent={xmlContent} asnId={asnId} />
      ) : (
        !asnId && <p className="text-sm text-slate-500">{t("shipments:xml.noXml")}</p>
      )}

      {labelsOpen && (
        <LabelPrintModal
          data={{ open: true, shipmentId: data.id, shipmentNumber: data.shipment_number, totalBoxes: data.total_boxes }}
          onClose={() => setLabelsOpen(false)}
          onDownload={(size, autoPrint) => void handleLabels(size, autoPrint)}
          isLoading={labelsBusy}
        />
      )}
    </div>
  );
}
