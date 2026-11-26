import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Download, FileCode, Mail, Send } from "lucide-react";
import { shipmentService } from "@/services/shipmentService";
import { getErrorMessage } from "@/services/apiError";
import { useAuthStore } from "@/store/authStore";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatOfficialXmlFilename } from "./shared";
import { broadcastInvalidate } from "@/lib/crossTab";

interface XmlPanelProps {
  title: string;
  xmlContent: string;
  asnId?: string;
}

/**
 * ASN XML preview with copy / download / send to IUNGO.
 * Shown inline on the shipment detail page (previously a modal).
 * Sending is irreversible, so it keeps a small confirmation dialog.
 */
export default function XmlPanel({ title, xmlContent, asnId }: XmlPanelProps) {
  const { t } = useTranslation(["shipments", "common"]);
  const user = useAuthStore((s) => s.user);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recipient, setRecipient] = useState<string>(() => {
    try {
      return localStorage.getItem("asn_iungo_dispatch_recipient") || "edi@orders.buyer.org";
    } catch {
      return "edi@orders.buyer.org";
    }
  });

  useEffect(() => {
    shipmentService
      .getDispatchSettings()
      .then((s) => {
        if (s?.recipient_email) {
          setRecipient(s.recipient_email);
          try {
            localStorage.setItem("asn_iungo_dispatch_recipient", s.recipient_email);
          } catch {
            /* storage unavailable */
          }
        }
      })
      .catch(() => {});
  }, []);

  const recipientValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());

  const handleCopy = () => {
    navigator.clipboard.writeText(xmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = formatOfficialXmlFilename(undefined, undefined, xmlContent);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSend = async () => {
    if (!asnId || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await shipmentService.sendASN(asnId, recipient.trim() || undefined);
      setSent(true);
      setConfirmOpen(false);
      broadcastInvalidate(["shipments", "kpi", "purchaseOrders"]);
    } catch (e) {
      setSendError(getErrorMessage(e, t("shipments:xml.unknownError")));
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="xml" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="xml-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCode className="h-5 w-5 text-slate-500" aria-hidden="true" />
          <h2 id="xml-title" className="text-base font-semibold text-slate-900">
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleCopy} className="btn btn-secondary btn-sm">
            {copied && <Check className="h-4 w-4 text-green-600" aria-hidden="true" />}
            {copied ? t("shipments:xml.copied") : t("shipments:xml.copy")}
          </button>
          <button type="button" onClick={handleDownload} className="btn btn-secondary btn-sm">
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("shipments:xml.download")}
          </button>
          {sent ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green-50 px-3 text-sm font-medium text-green-700 ring-1 ring-inset ring-green-200">
              <Check className="h-4 w-4" aria-hidden="true" />
              {t("shipments:xml.sent")}
            </span>
          ) : (
            asnId && (
              <button type="button" onClick={() => setConfirmOpen(true)} className="btn btn-primary btn-sm">
                <Send className="h-4 w-4" aria-hidden="true" />
                {t("shipments:xml.sendButton")}
              </button>
            )
          )}
        </div>
      </div>

      {sendError && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {sendError}
        </p>
      )}

      <div className="max-h-[60vh] overflow-auto rounded-md bg-slate-950 p-4 font-mono text-sm text-slate-100">
        <pre className="whitespace-pre">{xmlContent}</pre>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("shipments:xml.confirm.title")}
        confirmLabel={sending ? t("shipments:xml.confirm.sending") : t("shipments:xml.confirm.send")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={() => {
          if (recipientValid) void handleSend();
        }}
        onCancel={() => setConfirmOpen(false)}
        busy={sending}
      >
        <p>{t("shipments:xml.confirm.message")}</p>
        <label htmlFor="xml-recipient" className="mt-3 block text-sm font-medium text-slate-700">
          {t("shipments:xml.confirm.recipient")}
        </label>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            id="xml-recipient"
            type="email"
            required
            maxLength={254}
            value={recipient}
            readOnly={user?.role === "SUPPLIER"}
            onChange={(e) => setRecipient(e.target.value)}
            aria-invalid={!recipientValid}
            className="w-full bg-transparent font-mono text-sm text-slate-800 focus:outline-none"
          />
        </div>
        {!recipientValid && (
          <p className="mt-1 text-sm text-red-600">{t("common:validation.email")}</p>
        )}
      </ConfirmDialog>
    </section>
  );
}
