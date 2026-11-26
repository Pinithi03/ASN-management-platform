/**
 * Local-date helpers for delivery dates.
 *
 * Delivery dates are calendar dates (YYYY-MM-DD). Comparisons use the
 * browser's local date, not UTC, so "today" is correct for users in
 * Asia/Colombo (UTC+5:30) right after midnight.
 */

import { z } from "zod";

/** Today's local date as YYYY-MM-DD (the value format of <input type="date">). */
export function todayLocalISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local midnight today. */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Parse YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY as a local calendar date.
 * Returns null for anything else.
 */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = value.trim().slice(0, 10);
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** True when the date is before today (local). Unparseable input returns false. */
export function isPastLocalDate(value: string | null | undefined, now: Date = new Date()): boolean {
  const d = parseLocalDate(value);
  return d !== null && d < startOfToday(now);
}

/** Normalise to YYYY-MM-DD, or "" when unparseable. */
export function toISODate(value: string | null | undefined): string {
  const d = parseLocalDate(value);
  return d ? todayLocalISO(d) : "";
}

/**
 * Zod schema for a delivery date: required, valid, today or later.
 * Messages are i18n keys resolved by the caller.
 */
export const deliveryDateSchema = z
  .string()
  .trim()
  .min(1, "validation.required")
  .refine((v) => parseLocalDate(v) !== null, { message: "validation.invalidDate" })
  .refine((v) => {
    const d = parseLocalDate(v);
    return d !== null && d >= startOfToday();
  }, { message: "validation.deliveryDatePast" });

/** Returns the i18n key of the first problem, or null when the date is valid. */
export function deliveryDateError(value: string | null | undefined): string | null {
  const r = deliveryDateSchema.safeParse(value ?? "");
  return r.success ? null : r.error.issues[0]?.message ?? "validation.invalidDate";
}
