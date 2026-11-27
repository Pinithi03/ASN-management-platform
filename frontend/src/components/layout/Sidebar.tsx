/**
 * Sidebar — role-aware navigation.
 * ADMIN and SUPPLIER see different menu items.
 * Includes user profile, notifications popover, and sign-out controls in the sidebar footer.
 */

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";
import type { LayoutResources } from "@/i18n/resources";
import LanguageSwitcher from "./LanguageSwitcher";
import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";
import { supplierApi } from "@/services/supplierApi";
import { useNavCounts, formatNavCount, type NavCount } from "@/hooks/useNavCounts";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";
import NotificationsPanel, { bellBadge } from "./NotificationsPanel";
import {
  clearSharedPlantState,
  getSavedSharedPlant,
  normalizePlantKey,
} from "@/utils/plantResolver";
import {
  LayoutDashboard,
  Mail,
  FileText,
  ListOrdered,
  History,
  Truck,
  Settings,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Package,
  PackagePlus,
  UserCircle,
  FileSpreadsheet,
  Layers,
  FileEdit,
  Bell,
  LogOut,
  X,
} from "lucide-react";
import { useDraftCount } from "@/utils/draftStorage";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Expanded width in px (desktop resize handle). Defaults to 256. */
  width?: number;
  /** True while the user drags the resize handle: width changes follow the pointer with no transition. */
  resizing?: boolean;
}

/** Count shown at the right of a nav row (Gmail style). */
function NavCountBadge({ count, collapsed }: { count: NavCount | null; collapsed: boolean }) {
  if (!count) return null;
  if (collapsed) return null; // the collapsed rail shows a dot on the icon instead
  if (count.fresh > 0) {
    return (
      <span className="ml-2 shrink-0 rounded-full bg-brand-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
        {formatNavCount(count.fresh)}
      </span>
    );
  }
  if (count.total <= 0) return null;
  return <span className="ml-2 shrink-0 text-xs tabular-nums text-slate-500">{formatNavCount(count.total)}</span>;
}

/** Small dot on the icon in the collapsed rail when there is something new. */
function NewDot({ count, collapsed }: { count: NavCount | null; collapsed: boolean }) {
  if (!collapsed || !count || count.fresh <= 0) return null;
  return <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-900 ring-2 ring-white" aria-hidden="true" />;
}

type NavLabelKey = keyof LayoutResources["nav"];

interface NavSubItem {
  to: string;
  mode: "manual" | "excel";
  icon: React.ComponentType<{ className?: string }>;
  /** English label; also the item's stable id. Shown as-is when there is no labelKey (admin-only items). */
  label: string;
  labelKey?: NavLabelKey;
}

interface NavItem {
  to: string;
  basePath?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** English label; also the item's stable id. Shown as-is when there is no labelKey (admin-only items). */
  label: string;
  labelKey?: NavLabelKey;
  children?: NavSubItem[];
}

// Admin portal navigation
const adminMainNav: NavItem[] = [
  { to: "/overview", icon: LayoutDashboard, label: "Overview", labelKey: "overview" },
  {
    icon: FileText,
    label: "Purchase Orders",
    labelKey: "purchaseOrders",
    basePath: "/purchase-orders",
    to: "/purchase-orders/manual",
    children: [
      { to: "/purchase-orders/manual", mode: "manual", icon: Layers, label: "Manual Process", labelKey: "manualProcess" },
      { to: "/purchase-orders/excel", mode: "excel", icon: FileSpreadsheet, label: "Excel Drop", labelKey: "excelDrop" },
    ],
  },
  {
    icon: ListOrdered,
    label: "Purchase Order Lines",
    labelKey: "purchaseOrderLines",
    basePath: "/purchase-order-lines",
    to: "/purchase-order-lines/manual",
    children: [
      { to: "/purchase-order-lines/manual", mode: "manual", icon: Layers, label: "Manual Process", labelKey: "manualProcess" },
      { to: "/purchase-order-lines/excel", mode: "excel", icon: FileSpreadsheet, label: "Excel Drop", labelKey: "excelDrop" },
    ],
  },
  { to: "/drafts", icon: FileEdit, label: "Drafts", labelKey: "drafts" },
  { to: "/shipments", icon: PackagePlus, label: "Shipments", labelKey: "shipments" },
  { to: "/order-history", icon: History, label: "Order History", labelKey: "orderHistory" },
  { to: "/emails", icon: Mail, label: "Email Inbox" },
  { to: "/suppliers", icon: Truck, label: "Suppliers" },
];

const adminSettingsNav: NavItem[] = [
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/settings/users", icon: Users, label: "Users" },
];

// Supplier / standard user portal navigation (exact top-to-bottom sequence 1..8)
const supplierMainNav: NavItem[] = [
  {
    icon: FileText,
    label: "Purchase Orders",
    labelKey: "purchaseOrders",
    basePath: "/purchase-orders",
    to: "/purchase-orders/manual",
    children: [
      { to: "/purchase-orders/manual", mode: "manual", icon: Layers, label: "Manual Process", labelKey: "manualProcess" },
      { to: "/purchase-orders/excel", mode: "excel", icon: FileSpreadsheet, label: "Excel Drop", labelKey: "excelDrop" },
    ],
  },
  {
    icon: ListOrdered,
    label: "Purchase Order Lines",
    labelKey: "purchaseOrderLines",
    basePath: "/purchase-order-lines",
    to: "/purchase-order-lines/manual",
    children: [
      { to: "/purchase-order-lines/manual", mode: "manual", icon: Layers, label: "Manual Process", labelKey: "manualProcess" },
      { to: "/purchase-order-lines/excel", mode: "excel", icon: FileSpreadsheet, label: "Excel Drop", labelKey: "excelDrop" },
    ],
  },
  { to: "/drafts", icon: FileEdit, label: "Drafts", labelKey: "drafts" },
  { to: "/shipments", icon: PackagePlus, label: "Shipments", labelKey: "shipments" },
  { to: "/order-history", icon: History, label: "Order History", labelKey: "orderHistory" },
  { to: "/overview", icon: LayoutDashboard, label: "Overview", labelKey: "overview" },
];

const supplierSettingsNav: NavItem[] = [
  { to: "/profile", icon: UserCircle, label: "Profile", labelKey: "profile" },
  { to: "/emails", icon: Mail, label: "My Emails", labelKey: "myEmails" },
];

function matchesBasePath(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export default function Sidebar({ collapsed, onToggle, width = 256, resizing = false }: SidebarProps) {
  const { t } = useTranslation(["layout", "common"]);
  const navLabel = (item: { label: string; labelKey?: NavLabelKey }) =>
    item.labelKey ? t(`layout:nav.${item.labelKey}`) : item.label;
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const mainNav = isAdmin ? adminMainNav : supplierMainNav;
  const settingsNav = isAdmin ? adminSettingsNav : supplierSettingsNav;

  const draftCount = useDraftCount(user?.role === "SUPPLIER" ? (user.supplier_code || undefined) : undefined);

  const [notifOpen, setNotifOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Live supplier list (admin): active-supplier count in the nav
  const { data: dbSuppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => supplierApi.list(),
    enabled: isAdmin,
    staleTime: 5000,
    refetchInterval: 60_000,
  });

  // Notifications come from the backend (shared across browsers and devices)
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  // Gmail-style counts next to nav items
  const { emails: emailCount, shipments: shipmentCount, purchaseOrders: poCount } = useNavCounts();
  const activeSupplierCount: NavCount | null =
    isAdmin && Array.isArray(dbSuppliers)
      ? { total: dbSuppliers.filter((s) => !s.is_deleted && s.is_active).length, fresh: 0 }
      : null;
  const countFor = (item: { to: string; label: string }): NavCount | null => {
    if (item.to === "/emails") return emailCount;
    if (item.to === "/shipments") return shipmentCount;
    if (item.label === "Purchase Orders") return poCount;
    if (item.to === "/suppliers") return activeSupplierCount;
    if (item.to === "/drafts") return draftCount > 0 ? { total: draftCount, fresh: 0 } : null;
    return null;
  };
  /** "Email Inbox, 76 total, 3 new" — for screen readers and the tooltip. */
  const countLabel = (label: string, c: NavCount | null) =>
    !c
      ? label
      : c.fresh > 0
      ? t("layout:navCounts.ariaWithNew", { label, total: formatNavCount(c.total), fresh: formatNavCount(c.fresh) })
      : t("layout:navCounts.aria", { label, total: formatNavCount(c.total) });
  const countTitle = (c: NavCount | null) =>
    c && c.fresh > 0
      ? t("layout:navCounts.tooltip", { fresh: formatNavCount(c.fresh), total: formatNavCount(c.total) })
      : undefined;

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    clearSharedPlantState();
    logout();
    navigate("/login");
  };

  const searchParams = new URLSearchParams(location.search);
  const poParam = searchParams.get("pos") || searchParams.get("po");
  const isCreatingDelivery = location.pathname === "/shipments" && Boolean(poParam);
  const deliveryFromLines =
    isCreatingDelivery &&
    (searchParams.get("source") === "lines" || Boolean(searchParams.get("lines")));
  const deliveryCreationMode: "manual" | "excel" =
    searchParams.get("mode") === "excel" ? "excel" : "manual";

  // Build shared ?plant=...&loc=... query string when navigating between PO and PO Lines tabs
  const buildPlantAwareUrl = (targetPath: string) => {
    const currentPlant =
      normalizePlantKey(searchParams.get("plant")) || getSavedSharedPlant().plant;
    const currentLoc = searchParams.get("loc") || getSavedSharedPlant().loc;
    if (!currentPlant) return targetPath;
    const params = new URLSearchParams();
    params.set("plant", currentPlant);
    if (currentLoc) params.set("loc", currentLoc);
    return `${targetPath}?${params.toString()}`;
  };

  const isSectionActive = (basePath?: string) => {
    if (!basePath) return false;
    if (basePath === "/purchase-orders") {
      return matchesBasePath(location.pathname, "/purchase-orders") || (isCreatingDelivery && !deliveryFromLines);
    }
    if (basePath === "/purchase-order-lines") {
      return matchesBasePath(location.pathname, "/purchase-order-lines") || (isCreatingDelivery && deliveryFromLines);
    }
    return matchesBasePath(location.pathname, basePath);
  };

  const isActive = (path: string) => {
    if (path === "/overview") {
      return location.pathname === "/overview" || location.pathname === "/dashboard";
    }
    if (path === "/shipments") {
      if (isCreatingDelivery) return false;
      return matchesBasePath(location.pathname, "/shipments");
    }
    return matchesBasePath(location.pathname, path);
  };

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => ({
    "Purchase Orders": isSectionActive("/purchase-orders"),
    "Purchase Order Lines": isSectionActive("/purchase-order-lines"),
  }));

  useEffect(() => {
    if (isSectionActive("/purchase-orders")) {
      setOpenMenus((prev) => ({ ...prev, "Purchase Orders": true }));
    }
    if (isSectionActive("/purchase-order-lines")) {
      setOpenMenus((prev) => ({ ...prev, "Purchase Order Lines": true }));
    }
  }, [location.pathname, isCreatingDelivery, deliveryFromLines]);

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // Measure the active nav item so the indicator bar can slide to it.
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const items = nav.querySelectorAll<HTMLElement>('[data-active="true"]');
      const el = items[items.length - 1]; // deepest active item (sub-item wins over its parent)
      if (!el) {
        setIndicator(null);
        return;
      }
      const navBox = nav.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      setIndicator({ top: box.top - navBox.top + nav.scrollTop + 4, height: Math.max(0, box.height - 8) });
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(nav);
    return () => ro?.disconnect();
  }, [location.pathname, location.search, openMenus, collapsed, isCreatingDelivery]);

  return (
    <aside
      style={{ width: collapsed ? 64 : width }}
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-slate-200 bg-white relative z-30 overflow-hidden",
        // While dragging the resize handle the width follows the pointer directly.
        !resizing && "transition-[width] duration-200 ease-out-soft motion-reduce:transition-none"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-4 shrink-0">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-xs shrink-0",
            isAdmin ? "bg-blue-600" : "bg-emerald-600"
          )}
        >
          <Package className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-slate-900 truncate">
              ASN Platform
            </span>
            <span className="text-xs text-slate-500 truncate">
              {isAdmin ? "Admin Portal" : t("layout:sidebar.supplierPortal")}
            </span>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav ref={navRef} className="relative flex-1 space-y-1 overflow-y-auto px-2 py-4 custom-scrollbar" aria-label={t("layout:nav.main")}>
        {/* Active-item indicator: one bar that slides to the active item (~200 ms ease-out) */}
        {indicator && (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-0 top-0 w-[3px] rounded-r-full transition-[transform,height,opacity] duration-200 ease-out-soft",
              isAdmin ? "bg-brand-700" : "bg-emerald-600"
            )}
            style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height }}
          />
        )}
        <div className={cn("mb-2", !collapsed && "px-2")}>
          {!collapsed && (
            <span className="font-heading text-xs font-bold uppercase tracking-[0.06em] text-slate-400">
              {t("layout:nav.main")}
            </span>
          )}
        </div>
        {mainNav.map((item) => {
          if (item.children && item.children.length > 0) {
            const isMenuOpen = Boolean(openMenus[item.label]);
            const isParentActive = isSectionActive(item.basePath);
            const inThisBase = item.basePath ? matchesBasePath(location.pathname, item.basePath) : false;

            return (
              <div key={item.label} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const targetUrl = buildPlantAwareUrl(item.to);
                    if (collapsed) {
                      onToggle();
                      setOpenMenus((prev) => ({ ...prev, [item.label]: true }));
                      navigate(targetUrl);
                    } else {
                      if (!inThisBase) {
                        navigate(targetUrl);
                        setOpenMenus((prev) => ({ ...prev, [item.label]: true }));
                      } else {
                        toggleMenu(item.label);
                      }
                    }
                  }}
                  data-active={isParentActive && (collapsed || !isMenuOpen) ? "true" : undefined}
                  aria-expanded={collapsed ? undefined : isMenuOpen}
                  aria-label={countLabel(navLabel(item), countFor(item))}
                  className={cn(
                    "group w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer",
                    isParentActive
                      ? isAdmin
                        ? "bg-brand-50 text-brand-700 font-semibold"
                        : "bg-emerald-50 text-emerald-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                  title={collapsed ? navLabel(item) : countTitle(countFor(item))}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="relative shrink-0">
                      <item.icon className="h-5 w-5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                      <NewDot count={countFor(item)} collapsed={collapsed} />
                    </span>
                    {!collapsed && <span className="truncate">{navLabel(item)}</span>}
                  </div>
                  {!collapsed && (
                    <span className="flex shrink-0 items-center">
                      <NavCountBadge count={countFor(item)} collapsed={collapsed} />
                      <ChevronDown
                        className={cn(
                          "ml-1.5 h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0",
                          isMenuOpen && "rotate-180 text-slate-600"
                        )}
                      />
                    </span>
                  )}
                </button>

                {!collapsed && isMenuOpen && (
                  <div className="space-y-0.5 pl-3 pt-0.5">
                    {item.children.map((sub) => {
                      const isSubActive = isCreatingDelivery
                        ? isParentActive && deliveryCreationMode === sub.mode
                        : location.pathname === sub.to;
                      return (
                        <NavLink
                          key={sub.to}
                          to={buildPlantAwareUrl(sub.to)}
                          data-active={isSubActive ? "true" : undefined}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-lg pl-6 pr-3 py-1.5 text-sm font-medium transition-colors duration-150",
                            isSubActive
                              ? isAdmin
                                ? "bg-brand-50 text-brand-700 font-semibold"
                                : "bg-emerald-50 text-emerald-700 font-semibold"
                              : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                          )}
                        >
                          <sub.icon className="h-4 w-4 flex-shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                          <span className="truncate">{navLabel(sub)}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const count = countFor(item);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              data-active={isActive(item.to) ? "true" : undefined}
              aria-label={countLabel(navLabel(item), count)}
              className={cn(
                "group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                isActive(item.to)
                  ? isAdmin
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                count && count.fresh > 0 && "font-semibold text-slate-900"
              )}
              title={collapsed ? navLabel(item) : countTitle(count)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative shrink-0">
                  <item.icon className="h-5 w-5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                  <NewDot count={count} collapsed={collapsed} />
                </span>
                {!collapsed && <span className="truncate">{navLabel(item)}</span>}
              </div>
              <NavCountBadge count={count} collapsed={collapsed} />
            </NavLink>
          );
        })}

        {/* Settings / Profile Section */}
        <div className={cn("mb-2 mt-6", !collapsed && "px-2")}>
          {!collapsed && (
            <span className="font-heading text-xs font-bold uppercase tracking-[0.06em] text-slate-400">
              {isAdmin ? "Settings" : t("layout:nav.account")}
            </span>
          )}
        </div>
        {settingsNav.map((item) => {
          const count = countFor(item);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              data-active={isActive(item.to) ? "true" : undefined}
              aria-label={countLabel(navLabel(item), count)}
              className={cn(
                "group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                isActive(item.to)
                  ? isAdmin
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                count && count.fresh > 0 && "font-semibold text-slate-900"
              )}
              title={collapsed ? navLabel(item) : countTitle(count)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative shrink-0">
                  <item.icon className="h-5 w-5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                  <NewDot count={count} collapsed={collapsed} />
                </span>
                {!collapsed && <span className="truncate">{navLabel(item)}</span>}
              </div>
              <NavCountBadge count={count} collapsed={collapsed} />
            </NavLink>
          );
        })}
      </nav>

      {/* User Profile & Actions Footer */}
      <div className="border-t border-slate-200 bg-slate-50/70 relative shrink-0">
        {/* Notifications: rendered in a portal so the sidebar can never cut it off */}
        <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} anchor={bellRef.current} isAdmin={isAdmin} />

        {/* User Card Content */}
        {!collapsed ? (
          <div className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs shrink-0",
                    isAdmin ? "bg-blue-600" : "bg-emerald-600"
                  )}
                >
                  {(user?.supplier_code || user?.supplier_name || user?.name || (isAdmin ? "A" : "S")).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  {isAdmin ? (
                    <>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {user?.name || "Admin"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {user?.role === "SUPER_ADMIN" ? "Super Admin (HQ)" : "Central HQ"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-bold font-mono text-slate-900 truncate">
                        {user?.supplier_code || t("layout:user.supplier")}
                      </p>
                      <p className="text-xs text-slate-500 truncate" title={user?.supplier_name || user?.name || undefined}>
                        {user?.supplier_name || user?.name || t("layout:user.supplierPartner")}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Action Icons: Language (suppliers only) + Notification Bell + Sign Out */}
              <div className="flex items-center gap-1 shrink-0">
                {!isAdmin && <LanguageSwitcher />}

                <button
                  type="button"
                  ref={bellRef}
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-expanded={notifOpen}
                  aria-haspopup="dialog"
                  aria-label={unreadCount > 0 ? t("layout:notifications.bellWithUnread", { count: unreadCount }) : t("layout:notifications.title")}
                  className="relative p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
                  title={t("layout:notifications.title")}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span
                      className={cn(
                        "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-bold leading-none tabular-nums text-white shadow-2xs",
                        isAdmin ? "bg-blue-600" : "bg-emerald-600"
                      )}
                    >
                      {bellBadge(unreadCount)}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  title={t("common:actions.signOut")}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Collapsed View */
          <div className="py-3 flex flex-col items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs cursor-pointer",
                isAdmin ? "bg-blue-600" : "bg-emerald-600"
              )}
              title={user?.name || user?.supplier_name || t("layout:nav.profile")}
            >
              {(user?.supplier_name || user?.name || (isAdmin ? "Admin" : "Supplier")).charAt(0).toUpperCase()}
            </div>

            {!isAdmin && <LanguageSwitcher collapsed />}

            <button
              type="button"
              ref={bellRef}
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-expanded={notifOpen}
                  aria-haspopup="dialog"
                  aria-label={unreadCount > 0 ? t("layout:notifications.bellWithUnread", { count: unreadCount }) : t("layout:notifications.title")}
              className="relative p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title={t("layout:notifications.title")}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span
                  className={cn(
                    "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-bold leading-none tabular-nums text-white shadow-2xs",
                    isAdmin ? "bg-blue-600" : "bg-emerald-600"
                  )}
                >
                  {bellBadge(unreadCount)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title={t("common:actions.signOut")}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="flex h-10 items-center justify-center border-t border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors shrink-0 cursor-pointer"
        title={collapsed ? t("layout:sidebar.expand") : t("layout:sidebar.collapse")}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {/* Sign Out Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {t("layout:signOut.title")}
              </h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                {t("layout:signOut.confirmMessage")}
              </p>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  {t("common:actions.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLogout}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 active:bg-red-800 transition-colors cursor-pointer"
                >
                  {t("common:actions.signOut")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
