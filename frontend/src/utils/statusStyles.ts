/**
 * One place for status colours (PO, shipment and ASN statuses).
 *
 *   blue  — open / new
 *   amber — partially shipped / in progress
 *   green — shipped / completed
 *   red   — cancelled / rejected / failed
 *   grey  — draft / on hold / unknown
 *
 * Status codes mean the same thing across PO, shipment and ASN enums
 * (backend app/models/enums.py), so a single map covers all of them.
 * Colour is never the only signal: badges always show the status text.
 */

export type StatusTone = "blue" | "amber" | "green" | "red" | "grey";

const STATUS_TONES: Record<string, StatusTone> = {
  // PurchaseOrder
  ACTIVE: "blue",
  UPDATED: "blue",
  PARTIAL: "amber",
  XML_SENT: "amber",
  SHIPMENT_RECEIVED: "green",
  SHIPPED: "green",
  COMPLETED: "green",
  CANCELLED: "red",
  // Shipment
  DRAFT: "grey",
  PACKING: "amber",
  PACKED: "amber",
  RECEIVED: "green",
  ACCEPTED: "green",
  DISPATCHED: "green",
  DELIVERED: "green",
  REJECTED: "red",
  // ASN
  VALIDATED: "blue",
  SUBMITTED: "amber",
  FAILED: "red",
  // PO line status (derived on the client)
  PENDING: "blue",
  FULFILLED: "green",
};

const TONE_CLASSES: Record<StatusTone, { badge: string; border: string; dot: string }> = {
  blue: { badge: "bg-blue-50 text-blue-700 ring-blue-200", border: "border-l-blue-500", dot: "bg-blue-500" },
  amber: { badge: "bg-amber-50 text-amber-800 ring-amber-200", border: "border-l-amber-500", dot: "bg-amber-500" },
  green: { badge: "bg-green-50 text-green-700 ring-green-200", border: "border-l-green-600", dot: "bg-green-600" },
  red: { badge: "bg-red-50 text-red-700 ring-red-200", border: "border-l-red-500", dot: "bg-red-500" },
  grey: { badge: "bg-slate-100 text-slate-700 ring-slate-200", border: "border-l-slate-400", dot: "bg-slate-400" },
};

export function statusTone(status: string | null | undefined): StatusTone {
  return (status && STATUS_TONES[status.toUpperCase()]) || "grey";
}

/** Pill classes: tinted background, darker text, 1px ring. */
export function statusBadgeClass(status: string | null | undefined): string {
  return `ring-1 ring-inset ${TONE_CLASSES[statusTone(status)].badge}`;
}

/** 3px coloured left border for a header row / card. */
export function statusBorderClass(status: string | null | undefined): string {
  return `border-l-[3px] ${TONE_CLASSES[statusTone(status)].border}`;
}

export function statusDotClass(status: string | null | undefined): string {
  return TONE_CLASSES[statusTone(status)].dot;
}
