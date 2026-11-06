/**
 * Display label for a PO status code from the API (ACTIVE, PARTIAL, …).
 * The code itself is never changed; unknown codes are shown as-is.
 */

import i18n from "./index";

const PO_STATUSES = ["ACTIVE", "CANCELLED", "COMPLETED", "PARTIAL", "SHIPPED", "UPDATED"] as const;
type PoStatus = (typeof PO_STATUSES)[number];

export function poStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return (PO_STATUSES as readonly string[]).includes(status)
    ? i18n.t(`common:poStatus.${status as PoStatus}`)
    : status;
}
