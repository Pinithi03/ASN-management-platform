/**
 * Locale-aware date and number formatting for the UI.
 *
 * English keeps the exact formats the screens used before (date-fns patterns),
 * so English users see no change. Chinese and Italian use Intl with their locale.
 *
 * Do NOT use these for XML, file names, labels or Excel — those need fixed formats.
 */

import { format as formatWithPattern, formatDistanceToNow } from "date-fns";
import { enUS, it as itLocale, zhCN } from "date-fns/locale";
import i18n, { currentLanguage, type AppLanguage } from "./index";

const INTL_LOCALE: Record<AppLanguage, string> = {
  en: "en-US",
  "zh-CN": "zh-CN",
  it: "it-IT",
};

const DATE_FNS_LOCALE = { en: enUS, "zh-CN": zhCN, it: itLocale } as const;

type DateStyle = "medium" | "numeric" | "dateTime" | "shortDateTime" | "dayTime";

const DATE_STYLES: Record<DateStyle, { en: string; intl: Intl.DateTimeFormatOptions }> = {
  // Nov 4, 2026  ·  4 nov 2026  ·  2026年11月4日
  medium: { en: "MMM d, yyyy", intl: { year: "numeric", month: "short", day: "numeric" } },
  // 04/11/2026  ·  04/11/2026  ·  2026/11/04
  numeric: { en: "dd/MM/yyyy", intl: { year: "numeric", month: "2-digit", day: "2-digit" } },
  // Nov 4 2026, 14:05:09
  dateTime: {
    en: "MMM d yyyy, HH:mm:ss",
    intl: { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" },
  },
  // Nov 4, 14:05
  shortDateTime: {
    en: "MMM d, HH:mm",
    intl: { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  },
  // Nov 4, 02:05 PM (draft timestamps)
  dayTime: {
    en: "MMM d, hh:mm a",
    intl: { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
  },
};

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Format a date for display; returns "" for missing/invalid values. */
export function formatDate(value: Date | string | number | null | undefined, style: DateStyle = "medium"): string {
  const d = toDate(value);
  if (!d) return "";
  const lang = currentLanguage();
  const spec = DATE_STYLES[style];
  if (lang === "en") return formatWithPattern(d, spec.en);
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], spec.intl).format(d);
}

/** Short month name for chart axes (Nov · nov · 11月). */
export function formatMonthShort(value: Date): string {
  const lang = currentLanguage();
  if (lang === "en") return formatWithPattern(value, "MMM");
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], { month: "short" }).format(value);
}

/** Number with locale separators: 1,234.5 · 1.234,5 · 1,234.5 */
export function formatNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions): string {
  if (value === null || value === undefined || isNaN(Number(value))) return "";
  // "always": Italian CLDR data otherwise skips the separator for 4-digit numbers (1234,5).
  // The ES2020 lib types only allow a boolean here, although all supported browsers accept "always".
  const grouping = { useGrouping: "always" } as unknown as Intl.NumberFormatOptions;
  return new Intl.NumberFormat(INTL_LOCALE[currentLanguage()], { ...grouping, ...options }).format(Number(value));
}

/** "3 hours ago" in the current language. */
export function formatRelative(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return formatDistanceToNow(d, { addSuffix: true, locale: DATE_FNS_LOCALE[currentLanguage()] });
}

/** Age of a saved draft: "just now", "5 minutes ago", "2 hours ago", then the date. */
export function formatDraftAge(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return i18n.t("common:time.justNow");
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[currentLanguage()], { numeric: "always" });
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return rtf.format(-diffHours, "hour");
  return formatDate(timestamp, "dayTime");
}
