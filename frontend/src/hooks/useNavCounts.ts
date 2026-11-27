/**
 * Counts next to sidebar items (Gmail style).
 *
 * Uses the existing list endpoints only (no new backend endpoints):
 *   emails     → emailApi.list({ per_page: 50 }).total, "new" = newest page items after "last seen"
 *   shipments  → shipmentService.getShipments() length, "new" = created after "last seen"
 *   open POs   → poApi.list({ exclude_completed: true, per_page: 1 }).total
 *
 * "Last seen" is stored per user and per item in localStorage
 * (ans_nav_seen_<userId>_<item>) and set when that page is opened.
 * Counts refresh every 60 s, on window focus, and on cross-tab invalidation
 * (query keys start with "navCount", matched by lib/crossTab.ts topics).
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { emailApi } from "@/services/emailApi";
import { shipmentService } from "@/services/shipmentService";
import { poApi } from "@/services/poApi";
import { useAuthStore } from "@/store/authStore";
import { formatNumber } from "@/i18n/format";

export type SeenKey = "emails" | "shipments";

export interface NavCount {
  total: number;
  /** Items created after the user last opened that page (0 when not tracked). */
  fresh: number;
}

const QUERY_OPTS = {
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  staleTime: 20_000,
  retry: false,
} as const;

const SEEN_EVENT = "ans-nav-seen";

function seenStorageKey(userId: string, key: SeenKey) {
  return `ans_nav_seen_${userId}_${key}`;
}

function readSeen(userId: string, key: SeenKey): number {
  try {
    const v = Number(localStorage.getItem(seenStorageKey(userId, key)));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function writeSeen(userId: string, key: SeenKey, at: number) {
  try {
    localStorage.setItem(seenStorageKey(userId, key), String(at));
  } catch {
    /* storage unavailable — "new" just won't persist */
  }
  window.dispatchEvent(new CustomEvent(SEEN_EVENT));
}

const toTime = (v: unknown): number => {
  if (!v || typeof v !== "string") return 0;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** 3,660 → "3,660"; above 9,999 → "9.9k+". */
export function formatNavCount(n: number): string {
  return n > 9999 ? "9.9k+" : formatNumber(n);
}

export function useNavCounts() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const userId = user?.keycloak_id || "anon";
  const supplierScope = !isAdmin ? user?.supplier_id || user?.supplier_code || undefined : undefined;

  // Re-render when "last seen" changes (this tab or another tab).
  const [seenTick, setSeenTick] = useState(0);
  useEffect(() => {
    const bump = () => setSeenTick((n) => n + 1);
    window.addEventListener(SEEN_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(SEEN_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const markSeen = useCallback((key: SeenKey) => writeSeen(userId, key, Date.now()), [userId]);

  // Opening the page clears its "new" state.
  useEffect(() => {
    if (!user) return;
    const path = location.pathname;
    if (path === "/emails" || path.startsWith("/emails/")) markSeen("emails");
    if (path === "/shipments" && !location.search.includes("pos=")) markSeen("shipments");
  }, [location.pathname, location.search, user, markSeen]);

  // First visit: treat everything as already seen so we don't flag the whole history as "new".
  useEffect(() => {
    if (!user) return;
    (["emails", "shipments"] as SeenKey[]).forEach((k) => {
      if (!readSeen(userId, k)) writeSeen(userId, k, Date.now());
    });
  }, [user, userId]);

  const emailsQ = useQuery({
    queryKey: ["navCountEmails", userId, isAdmin ? "all" : user?.supplier_code],
    queryFn: () =>
      emailApi.list({ per_page: 50, vendor_code: !isAdmin ? user?.supplier_code || undefined : undefined }),
    enabled: Boolean(user),
    ...QUERY_OPTS,
  });

  const shipmentsQ = useQuery({
    queryKey: ["navCountShipments", userId, supplierScope],
    queryFn: () => shipmentService.getShipments(undefined, undefined, !isAdmin ? user?.supplier_id || undefined : undefined),
    enabled: Boolean(user),
    ...QUERY_OPTS,
  });

  const posQ = useQuery({
    queryKey: ["navCountPurchaseOrders", userId, supplierScope],
    queryFn: () => poApi.list({ exclude_completed: true, per_page: 1, supplier_id: supplierScope }),
    enabled: Boolean(user),
    ...QUERY_OPTS,
  });

  void seenTick; // dependency for recomputing "fresh" below

  let emails: NavCount | null = null;
  if (emailsQ.data && typeof emailsQ.data.total === "number") {
    const seen = readSeen(userId, "emails");
    const fresh = (emailsQ.data.items || []).filter(
      (e) => toTime((e as { received_at?: string }).received_at || (e as { created_at?: string }).created_at) > seen
    ).length;
    emails = { total: emailsQ.data.total, fresh };
  }

  let shipments: NavCount | null = null;
  if (Array.isArray(shipmentsQ.data)) {
    const seen = readSeen(userId, "shipments");
    const list = shipmentsQ.data as Array<{ created_at?: string }>;
    shipments = { total: list.length, fresh: list.filter((s) => toTime(s.created_at) > seen).length };
  }

  const purchaseOrders: NavCount | null =
    posQ.data && typeof posQ.data.total === "number" ? { total: posQ.data.total, fresh: 0 } : null;

  return { emails, shipments, purchaseOrders, markSeen };
}
