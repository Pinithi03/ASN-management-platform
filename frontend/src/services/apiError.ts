/**
 * Turn an API error into a message in the user's language.
 *
 * The backend sends `{ detail, code, params }` for supplier-facing errors
 * (see backend app/core/exceptions.py: CodedHTTPException). Order:
 *   1. translated `code` (errors namespace), with `params`
 *   2. `detail` from the server (string, or `detail.message`)
 *   3. the JS error message
 *   4. the given fallback
 */

import i18n from "@/i18n";

export function getErrorMessage(err: unknown, fallback: string = i18n.t("errors:generic")): string {
  const e = err as { message?: unknown; response?: { data?: { code?: unknown; params?: unknown; detail?: unknown } } };
  const data = e?.response?.data;

  if (typeof data?.code === "string" && i18n.exists(`errors:${data.code}`)) {
    const params = data.params && typeof data.params === "object" ? (data.params as Record<string, unknown>) : {};
    return i18n.t(`errors:${data.code}` as "errors:generic", params);
  }

  const detail = data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && typeof (detail as { message?: unknown }).message === "string") {
    return (detail as { message: string }).message;
  }

  if (typeof e?.message === "string" && e.message) return e.message;
  return fallback;
}
