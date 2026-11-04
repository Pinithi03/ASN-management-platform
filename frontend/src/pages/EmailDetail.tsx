// ─── Email Full View Page ───────────────────────────────────────
// frontend/src/pages/EmailDetail.tsx

import { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode,
  FileText,
  Mail,
  Paperclip,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { emailApi } from "@/services/emailApi";
import type { EmailAttachment, ParsedData } from "@/types/email";
import type { EmailsResources } from "@/i18n/resources";

type ParsedLabelKey = keyof EmailsResources["parsed"];

// `label` is the English label (and the IUNGO/XML tag name where it is CamelCase).
// Only labels with a `labelKey` are translated; tag names stay as-is.
const PO_FIELDS: { key: string; label: string; labelKey?: ParsedLabelKey; fallbackKey?: string }[] = [
  { key: "po_number", label: "PO Number", labelKey: "poNumber" },
  { key: "partner_id", label: "PartnerId", fallbackKey: "supplier_code" },
  { key: "supplier_name", label: "Supplier", labelKey: "supplier" },
  { key: "buyer_name", label: "Buyer", labelKey: "buyer" },
  { key: "contact_person", label: "ContactPerson" },
  { key: "order_date", label: "Order Date", labelKey: "orderDate" },
  { key: "delivery_date", label: "Delivery Date", labelKey: "deliveryDate" },
  { key: "destination", label: "Destination", labelKey: "destination" },
  { key: "delivery_address", label: "DeliveryAddress" },
  { key: "payment", label: "Payment", labelKey: "payment" },
  { key: "address", label: "Address", labelKey: "address", fallbackKey: "supplier_address" },
  { key: "zipcode", label: "ZIPCode", fallbackKey: "supplier_zipcode" },
  { key: "city", label: "City", labelKey: "city", fallbackKey: "supplier_city" },
  { key: "town", label: "Town", labelKey: "town", fallbackKey: "supplier_town" },
  { key: "country", label: "Country", labelKey: "country", fallbackKey: "supplier_country" },
  { key: "currency", label: "Currency", labelKey: "currency" },
  { key: "total_quantity", label: "Total Qty", labelKey: "totalQty" },
  { key: "total_value", label: "Total Value", labelKey: "totalValue" },
  { key: "source_filename", label: "Source File", labelKey: "sourceFile" },
  { key: "order_url", label: "IUNGO Order Link", labelKey: "orderLink" },
];

const LINE_ITEM_COLUMNS: {
  key: string;
  label: string;
  labelKey?: ParsedLabelKey;
  numeric?: boolean;
  fallbackKey?: string;
}[] = [
  { key: "order_line_number", label: "OrderLineNumber", fallbackKey: "line_number" },
  { key: "item_code", label: "ItemCode" },
  { key: "partner_item_code", label: "PartnerItemCode", fallbackKey: "partner_code" },
  { key: "item_description", label: "ItemDescription", fallbackKey: "description" },
  { key: "color", label: "Color", labelKey: "color" },
  { key: "qty_unit", label: "QtyUnit", fallbackKey: "size" },
  { key: "quantity", label: "Qty", labelKey: "qty", numeric: true },
  { key: "unit_price", label: "Unit Price", labelKey: "unitPrice", numeric: true },
];

const PRE_CLASS =
  "p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-800 whitespace-pre-wrap break-words max-h-[70vh] overflow-auto";

const SECTION_TITLE_CLASS =
  "flex items-center gap-2 text-sm font-medium text-gray-500 uppercase tracking-wide";

type BodyTab = "html" | "text" | "source";
type PreviewKind = "html" | "xml" | "text" | "image" | "pdf" | "none";

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(value: string | null): string {
  return value ? format(new Date(value), "MMM d yyyy, HH:mm:ss") : " ";
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return " ";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return " ";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatMoney(value: unknown, currency?: string): string {
  if (value === null || value === undefined || value === "") return " ";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return String(value);

  const formattedNum = num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

  const curr = (currency || "").toUpperCase();
  if (curr === "USD" || curr === "$") return `$${formattedNum}`;
  if (curr === "EUR" || curr === "€") return `€${formattedNum}`;
  if (curr === "GBP" || curr === "£") return `£${formattedNum}`;
  return curr ? `${formattedNum} ${curr}` : formattedNum;
}

function previewKind(attachment: EmailAttachment): PreviewKind {
  const name = (attachment.filename ?? "").toLowerCase();
  const type = (attachment.content_type ?? "").toLowerCase();
  if (type === "text/html" || name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (type.includes("xml") || name.endsWith(".xml")) return "xml";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    type.startsWith("text/") ||
    type === "message/rfc822" ||
    type === "application/json" ||
    /\.(eml|txt|csv|json)$/.test(name)
  ) {
    return "text";
  }
  return "none";
}

/** Indent XML for reading. Downloads always keep the original bytes. */
function prettyXml(xml: string): string {
  let depth = 0;
  return xml
    .replace(/>\s+</g, "><")
    .replace(/></g, ">\n<")
    .split("\n")
    .map((line) => {
      if (/^<\/\w/.test(line)) depth = Math.max(depth - 1, 0);
      const indented = "  ".repeat(depth) + line;
      // Opening tag on its own line (not self-closing, no inline closing tag)
      if (/^<\w>$/.test(line) || /^<\w[^>]*[^/]>$/.test(line)) depth += 1;
      return indented;
    })
    .join("\n");
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const attachmentQuery = (emailId: string, attachmentId: string) => ({
  queryKey: ["emailAttachment", emailId, attachmentId],
  queryFn: () => emailApi.getAttachment(emailId, attachmentId),
  staleTime: Infinity,
});

// ─── Components ─────────────────────────────────────────────────

/**
 * Sanitizes and prepares email HTML content for safe iframe rendering:
 * 1. Injects <base target="_blank" /> into <head> (creating <head> if absent).
 * 2. Enforces target="_blank" and rel="noopener noreferrer" on every <a> tag so that
 *    external links (such as IUNGO "Apri / Open" buttons, archive.iungomail.com, and *.iungoapps.com)
 *    open seamlessly in a new tab without inheriting iframe sandbox restrictions.
 * 3. Preserves all original href URLs and query parameters (such as AWS CloudFront Expires,
 *    Signature, Key-Pair-Id, IUNGO md5r, and atk) exactly as sent without escaping or truncating.
 */
function prepareEmailHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");

    // Ensure <head> exists
    let head = doc.head;
    if (!head) {
      head = doc.createElement("head");
      doc.documentElement.insertBefore(head, doc.documentElement.firstChild);
    }

    // 1. Ensure <base target="_blank" /> exists in <head>
    let base = head.querySelector("base");
    if (!base) {
      base = doc.createElement("base");
      base.setAttribute("target", "_blank");
      head.insertBefore(base, head.firstChild);
    } else {
      base.setAttribute("target", "_blank");
    }

    // Ensure utf-8 charset meta tag is present
    if (!head.querySelector("meta[charset]")) {
      const meta = doc.createElement("meta");
      meta.setAttribute("charset", "utf-8");
      head.insertBefore(meta, base);
    }

    // 2. Enforce target="_blank" and rel="noopener noreferrer" on all <a> tags
    const anchors = doc.querySelectorAll("a");
    anchors.forEach((a) => {
      a.setAttribute("target", "_blank");

      const existingRel = a.getAttribute("rel") || "";
      const relSet = new Set(existingRel.split(/\s+/).filter(Boolean));
      relSet.add("noopener");
      relSet.add("noreferrer");
      a.setAttribute("rel", Array.from(relSet).join(" "));

      // Preserve raw href attribute completely untouched
      const href = a.getAttribute("href");
      if (href && !href.startsWith("javascript:")) {
        a.setAttribute("href", href);
      }
    });

    return doc.documentElement.outerHTML;
  } catch {
    // Regex fallback
    let html = rawHtml;

    // Inject <base target="_blank" /> into <head>
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, '$1<base target="_blank" />');
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/(<html[^>]*>)/i, '$1<head><base target="_blank" /></head>');
    } else {
      html = `<head><base target="_blank" /></head>${html}`;
    }

    // Enforce target="_blank" and rel="noopener noreferrer" on <a> tags
    html = html.replace(/<a\b([^>]*)>/gi, (_match, attrs) => {
      let updated = attrs;
      if (/\btarget\s*=\s*['"][^'"]*['"]/i.test(updated)) {
        updated = updated.replace(/\btarget\s*=\s*['"][^'"]*['"]/i, 'target="_blank"');
      } else {
        updated += ' target="_blank"';
      }

      if (/\brel\s*=\s*['"][^'"]*['"]/i.test(updated)) {
        updated = updated.replace(/\brel\s*=\s*['"]([^'"]*)['"]/i, (_: string, relVal: string) => {
          const parts = new Set(relVal.split(/\s+/).filter(Boolean));
          parts.add("noopener");
          parts.add("noreferrer");
          return `rel="${Array.from(parts).join(" ")}"`;
        });
      } else {
        updated += ' rel="noopener noreferrer"';
      }

      return `<a${updated}>`;
    });

    return html;
  }
}

/** Email HTML is untrusted: rendered with scripts disabled and safe sandbox permissions. */
function SafeHtmlFrame({ html, title }: { html: string; title: string }) {
  const preparedHtml = useMemo(() => prepareEmailHtml(html), [html]);

  return (
    <iframe
      title={title}
      srcDoc={preparedHtml}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className="w-full h-[70vh] bg-white border border-gray-200 rounded-lg"
    />
  );
}

function AttachmentPreview({
  emailId,
  attachment,
}: {
  emailId: string;
  attachment: EmailAttachment;
}) {
  const { t } = useTranslation("emails");
  const kind = previewKind(attachment);
  const { data: blob, isLoading, isError } = useQuery({
    ...attachmentQuery(emailId, attachment.id),
    enabled: kind !== "none",
  });
  const [text, setText] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    if (kind === "image" || kind === "pdf") {
      // Force the PDF type so a mislabeled file is never rendered as a page
      const typed = kind === "pdf" ? new Blob([blob], { type: "application/pdf" }) : blob;
      const url = URL.createObjectURL(typed);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    let cancelled = false;
    blob.text().then((value) => {
      if (!cancelled) setText(value);
    });
    return () => {
      cancelled = true;
    };
  }, [blob, kind]);

  if (kind === "none") {
    return (
      <p className="text-sm text-gray-500">
        {t("preview.unavailable")}
      </p>
    );
  }

  if (isError) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        <AlertCircle className="w-4 h-4 inline mr-1 -mt-0.5" />
        {t("preview.couldNotLoad")}
      </div>
    );
  }

  const ready = kind === "image" || kind === "pdf" ? objectUrl : text;
  if (isLoading || ready === null) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        {t("preview.loading")}
      </div>
    );
  }

  const title = attachment.filename || t("detail.attachmentFallback");
  if (kind === "html") return <SafeHtmlFrame html={ready} title={title} />;
  if (kind === "image") {
    return <img src={ready} alt={title} className="max-w-full rounded-lg border border-gray-200" />;
  }
  if (kind === "pdf") {
    return (
      <iframe title={title} src={ready} className="w-full h-[70vh] border border-gray-200 rounded-lg" />
    );
  }
  return <pre className={PRE_CLASS}>{kind === "xml" ? prettyXml(ready) : ready}</pre>;
}

function ParsedDataSection({ data }: { data: ParsedData }) {
  const { t } = useTranslation("emails");
  const raw = data.raw_extracted ?? {};
  const lineItems = Array.isArray(raw.line_items)
    ? raw.line_items
        .filter(
          (item): item is Record<string, unknown> => typeof item === "object" && item !== null
        )
        .filter((item) => Number(item.quantity ?? item.qty ?? 0) > 0)
    : [];
  const fields = PO_FIELDS.map(({ key, label, labelKey, fallbackKey }) => {
    const val = raw[key] ?? (fallbackKey ? raw[fallbackKey] : undefined);
    return { key, label, displayLabel: labelKey ? t(`parsed.${labelKey}`) : label, value: val };
  }).filter(
    ({ value }) => value !== undefined && value !== null && value !== ""
  );
  const validationErrors = data.validation_errors ?? [];

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
          {data.parser_used || " "}
        </span>
        {data.po_number_extracted && (
          <span className="text-sm font-medium text-gray-900">PO {data.po_number_extracted}</span>
        )}
        <span className="text-xs text-gray-500">{t("parsed.parsedAt", { date: formatDate(data.created_at) })}</span>
      </div>

      {fields.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          {fields.map(({ key, label, displayLabel, value }) => {
            const isMoney = key === "total_value";
            const isLink =
              (key === "order_url" || String(label).toLowerCase().includes("link")) &&
              typeof value === "string" &&
              value.startsWith("http");
            const currency = String(raw.currency || "USD");
            return (
              <div key={key} className="min-w-0">
                <dt className="text-gray-500">{displayLabel}</dt>
                <dd className={`break-words ${isMoney ? "text-gray-950 font-bold" : "text-gray-900"}`}>
                  {isMoney ? (
                    formatMoney(value, currency)
                  ) : isLink ? (
                    <a
                      href={value as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-1 text-xs"
                    >
                      <span>{t("parsed.openInIungo")}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    displayValue(value)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {validationErrors.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 space-y-1">
          {validationErrors.map((err, i) => (
            <p key={i}>{displayValue(err)}</p>
          ))}
        </div>
      )}

      {lineItems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">{t("parsed.lineItems", { count: lineItems.length })}</h4>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {LINE_ITEM_COLUMNS.map((col) => {
                    const label =
                      col.key === "unit_price" && raw.currency
                        ? t("parsed.unitPriceCurrency", { currency: String(raw.currency) })
                        : col.labelKey
                        ? t(`parsed.${col.labelKey}`)
                        : col.label;
                    return (
                      <th
                        key={col.key}
                        className={`px-3 py-2 font-medium text-gray-500 ${col.numeric ? "text-right" : "text-left"}`}
                      >
                        {label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineItems.map((item, i) => (
                  <tr key={i}>
                    {LINE_ITEM_COLUMNS.map((col) => {
                      const isMoney = col.key === "unit_price";
                      const currency = String(raw.currency || "USD");
                      const val = item[col.key] ?? (col.fallbackKey ? item[col.fallbackKey] : undefined);
                      return (
                        <td
                          key={col.key}
                          className={`px-3 py-2 text-gray-700 ${col.numeric ? "text-right tabular-nums" : ""} ${
                            isMoney ? "font-semibold text-gray-900" : ""
                          }`}
                        >
                          {isMoney ? formatMoney(val, currency) : displayValue(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-700">{t("parsed.rawJson")}</summary>
        <pre className={`${PRE_CLASS} mt-2`}>{JSON.stringify(data.raw_extracted, null, 2)}</pre>
      </details>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────

export default function EmailDetailPage() {
  const { t } = useTranslation("emails");
  const { emailId = "" } = useParams<{ emailId: string }>();
  const queryClient = useQueryClient();
  const [bodyTab, setBodyTab] = useState<BodyTab | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data: email, isLoading, isError } = useQuery({
    queryKey: ["emailDetail", emailId],
    queryFn: () => emailApi.getById(emailId),
    enabled: !!emailId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["emailStats"] });
    queryClient.invalidateQueries({ queryKey: ["emailDetail", emailId] });
  };

  const reprocessMutation = useMutation({
    mutationFn: () => emailApi.reprocess(emailId),
    onSuccess: invalidate,
  });

  const handleDownload = async (attachment: EmailAttachment) => {
    setDownloadError(null);
    try {
      const blob = await queryClient.fetchQuery(attachmentQuery(emailId, attachment.id));
      saveBlob(blob, attachment.filename || "attachment");
    } catch {
      setDownloadError(t("detail.downloadError", { file: attachment.filename || t("detail.fileFallback") }));
    }
  };

  const backBar = (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 px-6 py-2.5 flex items-center justify-between shadow-xs">
      <Link
        to="/emails"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-blue-700 active:scale-95 rounded-lg border border-gray-200 transition-all shadow-xs"
        title={t("detail.backTitle")}
      >
        <ArrowLeft className="w-4 h-4" />
        {t("detail.back")}
      </Link>
      {email && (
        <span className="text-xs font-medium text-gray-500 truncate max-w-md hidden sm:inline-block">
          {email.subject}
        </span>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-full">
        {backBar}
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          {t("detail.loading")}
        </div>
      </div>
    );
  }

  if (isError || !email) {
    return (
      <div className="min-h-full">
        {backBar}
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Mail className="w-12 h-12 mb-3" />
          <p className="text-lg">{t("detail.notFound")}</p>
        </div>
      </div>
    );
  }

  const original = email.attachments.find((a) => a.is_original) ?? null;
  const files = email.attachments.filter((a) => !a.is_original);

  const tabs: { key: BodyTab; label: string }[] = [];
  if (email.body_html) tabs.push({ key: "html", label: "HTML" });
  if (email.body_text) tabs.push({ key: "text", label: t("tabs.text") });
  if (original) tabs.push({ key: "source", label: t("tabs.original") });
  const activeBodyTab = tabs.some((tab) => tab.key === bodyTab) ? bodyTab : tabs[0]?.key;

  const details: { label: string; value: unknown }[] = [
    { label: t("fields.from"), value: email.from_address },
    { label: t("fields.to"), value: email.to_address },
    { label: t("fields.received"), value: formatDate(email.received_at) },
    { label: t("fields.fetched"), value: formatDate(email.fetched_at) },
    { label: "LegalName", value: email.xml_legal_name },
    { label: "EDIEmailAddress", value: email.xml_iungo_email_address },
    { label: "TransmissionDate", value: email.xml_transmission_date },
  ];

  return (
    <div className="min-h-full">
      {backBar}

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900 break-words">
              {email.subject || t("detail.noSubject")}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {email.email_type && (
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded">
                  {email.email_type}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {original && (
              <button
                onClick={() => handleDownload(original)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                {t("detail.downloadEml")}
              </button>
            )}
            {email.status === "ERROR" && (
              <button
                onClick={() => reprocessMutation.mutate()}
                disabled={reprocessMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                {t("detail.reprocess")}
              </button>
            )}
          </div>
        </div>
      </div>

      {email.error_message && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 inline mr-1 -mt-0.5" />
          {email.error_message}
        </div>
      )}

      {downloadError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <span>
            <AlertCircle className="w-4 h-4 inline mr-1 -mt-0.5" />
            {downloadError}
          </span>
          <button
            onClick={() => setDownloadError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Details */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className={`${SECTION_TITLE_CLASS} mb-3`}>{t("detail.details")}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          {details.map((d) => (
            <div key={d.label} className="min-w-0">
              <dt className="text-gray-500">{d.label}</dt>
              <dd className="text-gray-900 break-words font-medium">{displayValue(d.value)}</dd>
            </div>
          ))}
          <div className="sm:col-span-2 lg:col-span-4 min-w-0">
            <dt className="text-gray-500">Message-ID</dt>
            <dd className="text-gray-900 font-mono text-xs break-all">
              {displayValue(email.message_id)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Message body */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-4 border-b border-gray-200">
          <h2 className={`${SECTION_TITLE_CLASS} pb-3`}>
            <Mail className="w-4 h-4" />
            {t("detail.message")}
          </h2>
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setBodyTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeBodyTab === tab.key
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="p-5">
          {activeBodyTab === "html" && email.body_html && (
            <SafeHtmlFrame html={email.body_html} title={t("detail.bodyFrameTitle")} />
          )}
          {activeBodyTab === "text" && email.body_text && (
            <pre className={PRE_CLASS}>{email.body_text}</pre>
          )}
          {activeBodyTab === "source" && original && (
            <AttachmentPreview emailId={emailId} attachment={original} />
          )}
          {!activeBodyTab && (
            <p className="text-sm text-gray-500">{t("detail.noBody")}</p>
          )}
        </div>
      </div>

      {/* Attachments */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <h2 className={`${SECTION_TITLE_CLASS} px-5 py-4 border-b border-gray-200`}>
          <Paperclip className="w-4 h-4" />
          {t("detail.attachments", { count: files.length })}
        </h2>
        {files.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">{t("detail.noAttachments")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {files.map((attachment) => {
              const kind = previewKind(attachment);
              // HTML order pages open by default; everything else on demand
              const isOpen = expanded[attachment.id] ?? kind === "html";
              const Icon = kind === "html" || kind === "xml" ? FileCode : FileText;
              return (
                <li key={attachment.id} className="px-5 py-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="w-5 h-5 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 break-all">
                          {attachment.filename || t("detail.unnamed")}
                        </p>
                        <p className="text-xs text-gray-500">
                          {attachment.content_type || t("detail.unknownType")} · {formatBytes(attachment.file_size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {kind !== "none" && (
                        <button
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [attachment.id]: !isOpen }))
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          {isOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          {isOpen ? t("detail.hide") : t("detail.view")}
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(attachment)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        <Download className="w-4 h-4" />
                        {t("detail.download")}
                      </button>
                    </div>
                  </div>
                  {isOpen && kind !== "none" && (
                    <AttachmentPreview emailId={emailId} attachment={attachment} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!original && (
          <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-100 bg-gray-50">
            {t("detail.noOriginal")}
          </p>
        )}
      </div>

      {/* Parsed data */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <h2 className={`${SECTION_TITLE_CLASS} px-5 py-4 border-b border-gray-200`}>
          <FileText className="w-4 h-4" />
          {t("detail.parsedData", { count: email.parsed_data.length })}
        </h2>
        {email.parsed_data.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">
            {t("detail.noParsed")}
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {email.parsed_data.map((pd) => (
              <ParsedDataSection key={pd.id} data={pd} />
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
  );
}
