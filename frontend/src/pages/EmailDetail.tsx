// ─── Email Full View Page ───────────────────────────────────────
// frontend/src/pages/EmailDetail.tsx

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Download,
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
import { emailApi } from "@/services/emailApi";
import type { EmailAttachment, ParsedData } from "@/types/email";

const PO_FIELDS: { key: string; label: string }[] = [
  { key: "po_number", label: "PO Number" },
  { key: "supplier_code", label: "Supplier Code" },
  { key: "supplier_name", label: "Supplier" },
  { key: "buyer_name", label: "Buyer" },
  { key: "order_date", label: "Order Date" },
  { key: "delivery_date", label: "Delivery Date" },
  { key: "destination", label: "Destination" },
  { key: "currency", label: "Currency" },
  { key: "total_quantity", label: "Total Qty" },
  { key: "total_value", label: "Total Value" },
  { key: "source_filename", label: "Source File" },
];

const LINE_ITEM_COLUMNS: { key: string; label: string; numeric?: boolean }[] = [
  { key: "line_number", label: "#" },
  { key: "style", label: "Style" },
  { key: "description", label: "Description" },
  { key: "color", label: "Color" },
  { key: "size", label: "Size" },
  { key: "quantity", label: "Qty", numeric: true },
  { key: "unit_price", label: "Unit Price", numeric: true },
];

const PRE_CLASS =
  "p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-800 whitespace-pre-wrap break-words max-h-[70vh] overflow-auto";

const SECTION_TITLE_CLASS =
  "flex items-center gap-2 text-sm font-medium text-gray-500 uppercase tracking-wide";

type BodyTab = "html" | "text" | "source";
type PreviewKind = "html" | "xml" | "text" | "image" | "pdf" | "none";

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(value: string | null): string {
  return value ? format(new Date(value), "MMM d yyyy, HH:mm:ss") : "—";
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatMoney(value: unknown, currency?: string): string {
  if (value === null || value === undefined || value === "") return "—";
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

/** Email HTML is untrusted: rendered with scripts disabled and no access to the app. */
function SafeHtmlFrame({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      title={title}
      srcDoc={`<base target="_blank">${html}`}
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
        Preview isn't available for this file type. Use Download to open it.
      </p>
    );
  }

  if (isError) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        <AlertCircle className="w-4 h-4 inline mr-1 -mt-0.5" />
        Could not load this file from storage.
      </div>
    );
  }

  const ready = kind === "image" || kind === "pdf" ? objectUrl : text;
  if (isLoading || ready === null) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Loading file...
      </div>
    );
  }

  const title = attachment.filename || "Attachment";
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
  const raw = data.raw_extracted ?? {};
  const lineItems = Array.isArray(raw.line_items)
    ? raw.line_items.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null
      )
    : [];
  const fields = PO_FIELDS.filter(
    ({ key }) => raw[key] !== undefined && raw[key] !== null && raw[key] !== ""
  );
  const validationErrors = data.validation_errors ?? [];

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
          {data.parser_used || "—"}
        </span>
        {data.po_number_extracted && (
          <span className="text-sm font-medium text-gray-900">PO# {data.po_number_extracted}</span>
        )}
        <span className="text-xs text-gray-500">Parsed {formatDate(data.created_at)}</span>
      </div>

      {fields.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          {fields.map(({ key, label }) => {
            const isMoney = key === "total_value";
            const currency = String(raw.currency || "USD");
            return (
              <div key={key} className="min-w-0">
                <dt className="text-gray-500">{label}</dt>
                <dd className={`break-words ${isMoney ? "text-gray-950 font-bold" : "text-gray-900"}`}>
                  {isMoney ? formatMoney(raw[key], currency) : displayValue(raw[key])}
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
          <h4 className="text-sm font-medium text-gray-500 mb-2">Line Items ({lineItems.length})</h4>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {LINE_ITEM_COLUMNS.map((col) => {
                    const label =
                      col.key === "unit_price" && raw.currency
                        ? `Unit Price (${raw.currency})`
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
                      return (
                        <td
                          key={col.key}
                          className={`px-3 py-2 text-gray-700 ${col.numeric ? "text-right tabular-nums" : ""} ${
                            isMoney ? "font-semibold text-gray-900" : ""
                          }`}
                        >
                          {isMoney ? formatMoney(item[col.key], currency) : displayValue(item[col.key])}
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
        <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Raw extracted JSON</summary>
        <pre className={`${PRE_CLASS} mt-2`}>{JSON.stringify(data.raw_extracted, null, 2)}</pre>
      </details>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────

export default function EmailDetailPage() {
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
      setDownloadError(`Could not download ${attachment.filename || "the file"} from storage.`);
    }
  };

  const backBar = (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 px-6 py-2.5 flex items-center justify-between shadow-xs">
      <Link
        to="/emails"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-blue-700 active:scale-95 rounded-lg border border-gray-200 transition-all shadow-xs"
        title="Return to Email Processing Queue"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to emails
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
          Loading email...
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
          <p className="text-lg">Email not found</p>
        </div>
      </div>
    );
  }

  const original = email.attachments.find((a) => a.is_original) ?? null;
  const files = email.attachments.filter((a) => !a.is_original);

  const tabs: { key: BodyTab; label: string }[] = [];
  if (email.body_html) tabs.push({ key: "html", label: "HTML" });
  if (email.body_text) tabs.push({ key: "text", label: "Plain Text" });
  if (original) tabs.push({ key: "source", label: "Original Source" });
  const activeBodyTab = tabs.some((t) => t.key === bodyTab) ? bodyTab : tabs[0]?.key;

  const details: { label: string; value: unknown }[] = [
    { label: "From", value: email.from_address },
    { label: "To", value: email.to_address },
    { label: "Received", value: formatDate(email.received_at) },
    { label: "Fetched", value: formatDate(email.fetched_at) },
    { label: "Processed", value: formatDate(email.processed_at) },
    { label: "Direction", value: email.direction },
    { label: "Type", value: email.email_type },
    { label: "Retries", value: email.retry_count },
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
              {email.subject || "No subject"}
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
                Download .eml
              </button>
            )}
            {email.status === "ERROR" && (
              <button
                onClick={() => reprocessMutation.mutate()}
                disabled={reprocessMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Reprocess
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
        <h2 className={`${SECTION_TITLE_CLASS} mb-3`}>Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          {details.map((d) => (
            <div key={d.label} className="min-w-0">
              <dt className="text-gray-500">{d.label}</dt>
              <dd className="text-gray-900 break-words">{displayValue(d.value)}</dd>
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
            Message
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
            <SafeHtmlFrame html={email.body_html} title="Email body" />
          )}
          {activeBodyTab === "text" && email.body_text && (
            <pre className={PRE_CLASS}>{email.body_text}</pre>
          )}
          {activeBodyTab === "source" && original && (
            <AttachmentPreview emailId={emailId} attachment={original} />
          )}
          {!activeBodyTab && (
            <p className="text-sm text-gray-500">No message body was stored for this email.</p>
          )}
        </div>
      </div>

      {/* Attachments */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <h2 className={`${SECTION_TITLE_CLASS} px-5 py-4 border-b border-gray-200`}>
          <Paperclip className="w-4 h-4" />
          Attachments ({files.length})
        </h2>
        {files.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">No attachments were stored for this email.</p>
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
                          {attachment.filename || "unnamed"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {attachment.content_type || "unknown type"} · {formatBytes(attachment.file_size)}
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
                          {isOpen ? "Hide" : "View"}
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(attachment)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        <Download className="w-4 h-4" />
                        Download
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
            The original message isn't stored for this email. Emails received from now on keep a
            full copy you can view and download.
          </p>
        )}
      </div>

      {/* Parsed data */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <h2 className={`${SECTION_TITLE_CLASS} px-5 py-4 border-b border-gray-200`}>
          <FileText className="w-4 h-4" />
          Parsed Data ({email.parsed_data.length})
        </h2>
        {email.parsed_data.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">
            No purchase order data was extracted from this email.
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
