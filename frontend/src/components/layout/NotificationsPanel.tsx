/**
 * Notifications panel.
 *
 * Rendered in a portal on document.body so the sidebar's overflow can't cut it off.
 * - ≥ 768 px: popover anchored to the bell, opening to the right of the sidebar
 *   (expanded or collapsed), bottom aligned to the bell, kept 8 px inside the window.
 *   Repositions on window resize, scroll and sidebar resize.
 * - < 768 px: bottom sheet (full width, max 80vh) with a backdrop; tap outside or
 *   swipe down to close.
 * Closes on Esc, click outside and navigation. Focus moves into the panel on open
 * and back to the bell on close.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isToday, isYesterday } from "date-fns";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Bell,
  CheckCheck,
  FileText,
  Loader2,
  MailWarning,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  useUnreadNotificationCount,
  type NotificationTab,
} from "@/hooks/useNotifications";
import type { AppNotification } from "@/services/notificationApi";
import { formatRelative } from "@/i18n/format";
import { cn } from "@/utils/cn";

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
  /** The bell button the popover is anchored to. */
  anchor: HTMLElement | null;
  isAdmin: boolean;
}

const MARGIN = 8;
const GAP = 8;

const TYPE_STYLE: Record<string, { icon: ComponentType<{ className?: string }>; tone: string }> = {
  PO_RECEIVED: { icon: FileText, tone: "bg-blue-50 text-blue-700" },
  PO_UPDATED: { icon: RefreshCw, tone: "bg-amber-50 text-amber-700" },
  SHIPMENT_CREATED: { icon: PackagePlus, tone: "bg-green-50 text-green-700" },
  ASN_DISPATCHED: { icon: Send, tone: "bg-green-50 text-green-700" },
  ASN_DISPATCH_FAILED: { icon: AlertTriangle, tone: "bg-red-50 text-red-700" },
  SUPPLIER_ONBOARDED: { icon: UserPlus, tone: "bg-blue-50 text-blue-700" },
  SUPPLIER_AUTO_DETECTED: { icon: Sparkles, tone: "bg-amber-50 text-amber-700" },
  SUPPLIER_ARCHIVED: { icon: Archive, tone: "bg-slate-100 text-slate-600" },
  SUPPLIER_RESTORED: { icon: RotateCcw, tone: "bg-green-50 text-green-700" },
  EMAIL_PARSE_ERROR: { icon: MailWarning, tone: "bg-red-50 text-red-700" },
};

/** PO and shipment detail links open in a new tab, as elsewhere in the app. */
const opensInNewTab = (link: string) => /^\/(purchase-orders|shipments)\/[^/]/.test(link);

export default function NotificationsPanel({ open, onClose, anchor, isAdmin }: NotificationsPanelProps) {
  const { t } = useTranslation(["layout", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const isSheet = !useMediaQuery("(min-width: 768px)");
  const [tab, setTab] = useState<NotificationTab>("unread");
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const { data: unread = 0 } = useUnreadNotificationCount();
  const list = useNotificationList(tab, open);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const items: AppNotification[] = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  // ─── Positioning (popover) ────────────────────────────────────────────
  const reposition = useCallback(() => {
    if (isSheet || !anchor || !panelRef.current) return;
    const bell = anchor.getBoundingClientRect();
    const sidebar = anchor.closest("aside")?.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // To the right of the sidebar (or of the bell when there's no sidebar).
    let left = (sidebar ? sidebar.right : bell.right) + GAP;
    if (left + panel.width > vw - MARGIN) left = Math.max(MARGIN, vw - MARGIN - panel.width);
    // Bottom aligned to the bell, shifted to stay inside the window.
    let top = bell.bottom - panel.height;
    top = Math.min(Math.max(MARGIN, top), vh - MARGIN - panel.height);
    setPos({ left, top: Math.max(MARGIN, top) });
  }, [anchor, isSheet]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    reposition();
  }, [open, reposition, items.length, tab, list.isLoading]);

  useEffect(() => {
    if (!open || isSheet) return;
    const onMove = () => reposition();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const aside = anchor?.closest("aside");
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onMove) : null;
    if (aside) ro?.observe(aside);
    if (panelRef.current) ro?.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      ro?.disconnect();
    };
  }, [open, isSheet, anchor, reposition]);

  // ─── Closing + focus ──────────────────────────────────────────────────
  const close = useCallback(() => {
    onClose();
    anchor?.focus();
  }, [onClose, anchor]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, close, onClose, anchor]);

  const firstPath = useRef(location.pathname);
  useEffect(() => {
    if (!open) {
      firstPath.current = location.pathname;
      return;
    }
    if (location.pathname !== firstPath.current) onClose();
  }, [location.pathname, open, onClose]);

  // Swipe down to close (bottom sheet).
  const touchStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  // ─── Actions ──────────────────────────────────────────────────────────
  const openItem = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (!n.link) return;
    if (opensInNewTab(n.link)) {
      window.open(n.link, "_blank", "noopener");
    } else {
      onClose();
      navigate(n.link);
    }
  };

  const groups = useMemo(() => {
    const today: AppNotification[] = [];
    const yesterday: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    items.forEach((n) => {
      const d = new Date(n.created_at);
      if (isToday(d)) today.push(n);
      else if (isYesterday(d)) yesterday.push(n);
      else earlier.push(n);
    });
    return [
      { key: "today", label: t("layout:notifications.today"), items: today },
      { key: "yesterday", label: t("layout:notifications.yesterday"), items: yesterday },
      { key: "earlier", label: t("layout:notifications.earlier"), items: earlier },
    ].filter((g) => g.items.length > 0);
  }, [items, t]);

  if (!open) return null;

  const title = (n: AppNotification) =>
    t(`layout:${n.title_key}.title` as "layout:notifications.title", { ...n.params, defaultValue: n.type });
  const desc = (n: AppNotification) =>
    t(`layout:${n.title_key}.desc` as "layout:notifications.title", { ...n.params, defaultValue: "" });

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={isSheet ? true : undefined}
      aria-label={t("layout:notifications.title")}
      tabIndex={-1}
      onTouchStart={isSheet ? (e) => (touchStartY.current = e.touches[0].clientY) : undefined}
      onTouchMove={
        isSheet
          ? (e) => {
              if (touchStartY.current === null) return;
              const list = panelRef.current?.querySelector("[data-scroll]");
              if (list && list.scrollTop > 0) return; // scrolling the list, not the sheet
              setDragY(Math.max(0, e.touches[0].clientY - touchStartY.current));
            }
          : undefined
      }
      onTouchEnd={
        isSheet
          ? () => {
              if (dragY > 80) close();
              setDragY(0);
              touchStartY.current = null;
            }
          : undefined
      }
      style={
        isSheet
          ? { transform: dragY ? `translateY(${dragY}px)` : undefined }
          : { left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: "min(380px, calc(100vw - 16px))" }
      }
      className={cn(
        "fixed z-[60] flex flex-col overflow-hidden border border-slate-200 bg-white shadow-lg outline-none",
        isSheet
          ? "inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
          : "max-h-[min(70vh,520px)] rounded-xl animate-page-fade"
      )}
    >
      {isSheet && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />}

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900">{t("layout:notifications.title")}</h2>
          {unread > 0 && (
            <span className="rounded-full bg-brand-900 px-2 py-0.5 text-xs font-medium tabular-nums text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-slate-50"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t("layout:notifications.markAllRead")}
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("layout:notifications.close")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label={t("layout:notifications.title")} className="flex shrink-0 gap-1 border-b border-slate-100 px-3 pt-2">
        {(["unread", "all"] as NotificationTab[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
              tab === k ? "border-brand-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {k === "unread" ? t("layout:notifications.tabUnread") : t("layout:notifications.tabAll")}
          </button>
        ))}
      </div>

      {/* List */}
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
        {list.isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          </div>
        ) : list.isError ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t("layout:notifications.loadFailed")}</p>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              {tab === "unread" ? t("layout:notifications.noUnread") : t("layout:notifications.empty")}
            </p>
          </div>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <h3 className="sticky top-0 z-[1] bg-white/95 px-4 pb-1 pt-3 text-xs font-medium uppercase text-slate-400">
                  {g.label}
                </h3>
                <ul className="divide-y divide-slate-100">
                  {g.items.map((n) => {
                    const style = TYPE_STYLE[n.type] ?? { icon: Bell, tone: "bg-slate-100 text-slate-600" };
                    const Icon = style.icon;
                    const description = desc(n);
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openItem(n)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50",
                            !n.read && "bg-blue-50/40"
                          )}
                        >
                          <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", style.tone)}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className={cn("text-sm text-slate-900", !n.read ? "font-semibold" : "font-medium")}>
                                {title(n)}
                              </span>
                              {!n.read && (
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-900" aria-label={t("layout:notifications.unread")} />
                              )}
                            </span>
                            {description && <span className="mt-0.5 line-clamp-2 block text-sm text-slate-500">{description}</span>}
                            <span className="mt-1 block text-xs text-slate-400">{formatRelative(n.created_at)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {list.hasNextPage && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                  className="btn btn-secondary btn-sm"
                >
                  {list.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {t("layout:notifications.loadMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 p-2 text-center">
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate(isAdmin ? "/suppliers" : "/purchase-orders");
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary hover:underline"
        >
          {isAdmin ? "Manage all suppliers" : t("layout:notifications.viewAllPos")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  return createPortal(
    <>
      {isSheet && <div className="fixed inset-0 z-[59] bg-slate-900/40 animate-page-fade" onClick={close} aria-hidden="true" />}
      {panel}
    </>,
    document.body
  );
}

/** Bell badge text: "9+" above 9. */
export function bellBadge(count: number): string {
  return count > 9 ? "9+" : String(count);
}
