/**
 * In-app notifications — /api/v1/notifications
 * The server scopes everything to the signed-in user (admin or own supplier).
 */

import { api } from "./api";

export interface AppNotification {
  id: string;
  type: string;
  /** i18n key, e.g. "notif.PO_RECEIVED" → layout:notif.PO_RECEIVED.title / .desc */
  title_key: string;
  params: Record<string, string>;
  link?: string | null;
  created_at: string;
  read: boolean;
}

export interface NotificationPage {
  items: AppNotification[];
  next_before?: string | null;
}

export const notificationApi = {
  list: async (params: { unread_only?: boolean; limit?: number; before?: string } = {}): Promise<NotificationPage> => {
    const { data } = await api.get("/notifications", { params });
    return data;
  },
  unreadCount: async (): Promise<number> => {
    const { data } = await api.get("/notifications/unread-count");
    return Number(data?.count ?? 0);
  },
  markRead: async (id: string): Promise<void> => {
    await api.post(`/notifications/${encodeURIComponent(id)}/read`);
  },
  markAllRead: async (): Promise<number> => {
    const { data } = await api.post("/notifications/read-all");
    return Number(data?.marked ?? 0);
  },
};
