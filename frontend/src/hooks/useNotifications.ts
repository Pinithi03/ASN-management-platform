/**
 * Notification queries and mutations (bell + panel).
 * - unread count: every 30 s, on window focus, and on cross-tab invalidation
 * - list: loaded when the panel opens (infinite, newest first)
 * - mark read / mark all read: applied straight away, rolled back if the request fails
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { notificationApi, type NotificationPage } from "@/services/notificationApi";
import { useAuthStore } from "@/store/authStore";

export type NotificationTab = "unread" | "all";

const UNREAD_KEY = ["notificationsUnread"] as const;
const listKey = (tab: NotificationTab) => ["notificationsList", tab] as const;
const PAGE_SIZE = 30;

export function useUnreadNotificationCount() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: notificationApi.unreadCount,
    enabled: Boolean(user),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useNotificationList(tab: NotificationTab, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: listKey(tab),
    queryFn: ({ pageParam }) =>
      notificationApi.list({ unread_only: tab === "unread", limit: PAGE_SIZE, before: pageParam || undefined }),
    initialPageParam: "" as string,
    getNextPageParam: (last: NotificationPage) => last.next_before || undefined,
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

type ListData = InfiniteData<NotificationPage, string>;

function markInCache(data: ListData | undefined, ids: Set<string> | "all"): ListData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      items: p.items.map((n) => (ids === "all" || ids.has(n.id) ? { ...n, read: true } : n)),
    })),
  };
}

/** Optimistic helpers shared by both mutations. */
function useOptimistic() {
  const qc = useQueryClient();
  const snapshot = () => ({
    unread: qc.getQueryData<number>(UNREAD_KEY),
    unreadList: qc.getQueryData<ListData>(listKey("unread")),
    allList: qc.getQueryData<ListData>(listKey("all")),
  });
  const restore = (s: ReturnType<typeof snapshot>) => {
    qc.setQueryData(UNREAD_KEY, s.unread);
    qc.setQueryData(listKey("unread"), s.unreadList);
    qc.setQueryData(listKey("all"), s.allList);
  };
  const cancel = async () => {
    await Promise.all([
      qc.cancelQueries({ queryKey: UNREAD_KEY }),
      qc.cancelQueries({ queryKey: ["notificationsList"] }),
    ]);
  };
  const settle = () => {
    void qc.invalidateQueries({ queryKey: UNREAD_KEY });
    void qc.invalidateQueries({ queryKey: ["notificationsList"] });
  };
  return { qc, snapshot, restore, cancel, settle };
}

export function useMarkNotificationRead() {
  const { qc, snapshot, restore, cancel, settle } = useOptimistic();
  return useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onMutate: async (id: string) => {
      await cancel();
      const prev = snapshot();
      const wasUnread = [prev.unreadList, prev.allList].some((d) =>
        d?.pages.some((p) => p.items.some((n) => n.id === id && !n.read))
      );
      qc.setQueryData(listKey("unread"), markInCache(prev.unreadList, new Set([id])));
      qc.setQueryData(listKey("all"), markInCache(prev.allList, new Set([id])));
      if (wasUnread && typeof prev.unread === "number") qc.setQueryData(UNREAD_KEY, Math.max(0, prev.unread - 1));
      return prev;
    },
    onError: (_e, _id, prev) => prev && restore(prev),
    onSettled: settle,
  });
}

export function useMarkAllNotificationsRead() {
  const { qc, snapshot, restore, cancel, settle } = useOptimistic();
  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onMutate: async () => {
      await cancel();
      const prev = snapshot();
      qc.setQueryData(listKey("unread"), markInCache(prev.unreadList, "all"));
      qc.setQueryData(listKey("all"), markInCache(prev.allList, "all"));
      qc.setQueryData(UNREAD_KEY, 0);
      return prev;
    },
    onError: (_e, _v, prev) => prev && restore(prev),
    onSettled: settle,
  });
}
