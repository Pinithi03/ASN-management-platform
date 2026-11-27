/**
 * Cross-tab data sync.
 *
 * Detail pages open in new tabs, so a change made in one tab (e.g. a
 * shipment created from a PO tab) must refresh the others. Each change
 * posts the affected "topics" on BroadcastChannel('ans-portal'); every tab
 * (including the sender) invalidates the matching TanStack Query keys.
 * Tabs also refetch on focus (queryClient default), as a fallback for
 * browsers without BroadcastChannel.
 */

import { queryClient } from "@/lib/queryClient";

export type SyncTopic =
  | "purchaseOrders"
  | "shipments"
  | "kpi"
  | "drafts"
  | "suppliers"
  | "users"
  | "emails"
  | "notifications";

/** Which query keys (first element) belong to each topic. */
const TOPIC_MATCHERS: Record<SyncTopic, RegExp> = {
  purchaseOrders:
    /^(purchaseOrder|purchaseOrders|purchaseOrdersOverviewAll|purchaseOrderDetail|purchaseOrderLines|poLine|po|completedOrderHistory|navCountPurchaseOrders|dashboardOverview)/i,
  shipments: /shipment|asns|^dashboardOverview/i, // also matches navCountShipments
  kpi: /stats|kpi|^dashboardOverview/i,
  drafts: /draft/i,
  suppliers: /supplier/i,
  users: /^users/i,
  emails: /^email|^navCountEmails/i,
  notifications: /^notifications/i,
};

/** The server creates notifications on these changes, so the bell refreshes with them. */
const ALSO_REFRESHES_NOTIFICATIONS: SyncTopic[] = ["shipments", "purchaseOrders", "suppliers", "emails"];

const CHANNEL_NAME = "ans-portal";
let channel: BroadcastChannel | null = null;

function invalidateLocal(topics: SyncTopic[]) {
  const all = new Set<SyncTopic>(topics);
  if (topics.some((t) => ALSO_REFRESHES_NOTIFICATIONS.includes(t))) all.add("notifications");
  const matchers = Array.from(all).map((t) => TOPIC_MATCHERS[t]).filter(Boolean);
  if (matchers.length === 0) return;
  void queryClient.invalidateQueries({
    predicate: (q) => {
      const head = q.queryKey[0];
      return typeof head === "string" && matchers.some((re) => re.test(head));
    },
  });
}

/** Start listening for changes made in other tabs. Call once at startup. */
export function initCrossTabSync(): void {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; topics?: SyncTopic[] } | null;
    if (data?.type === "invalidate" && Array.isArray(data.topics)) invalidateLocal(data.topics);
  };
}

/** Invalidate the given topics in this tab and in every other open tab. */
export function broadcastInvalidate(topics: SyncTopic[]): void {
  invalidateLocal(topics);
  try {
    channel?.postMessage({ type: "invalidate", topics });
  } catch {
    /* channel closed — other tabs will refetch on focus */
  }
}
