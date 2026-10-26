/**
 * Sidebar — role-aware navigation.
 * ADMIN and SUPPLIER see different menu items.
 * Includes user profile, notifications popover, and sign-out controls in the sidebar footer.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/utils/cn";
import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supplierApi } from "@/services/supplierApi";
import { poApi } from "@/services/poApi";
import {
  getAllSupplierFieldChanges,
  FIELD_ICONS,
  FIELD_COLORS,
} from "@/utils/supplierFieldUpdates";
import {
  LayoutDashboard,
  Mail,
  FileText,
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
  Check,
  CheckCheck,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { useDraftCount } from "@/utils/draftStorage";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavSubItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children?: NavSubItem[];
}

export interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  to: string;
  icon: typeof Sparkles;
  color: string;
}

// Admin portal navigation
const adminMainNav: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/emails", icon: Mail, label: "Email Inbox" },
  {
    icon: FileText,
    label: "Purchase Orders",
    to: "/purchase-orders/manual",
    children: [
      { to: "/purchase-orders/manual", icon: Layers, label: "Manual Process" },
      { to: "/purchase-orders/excel", icon: FileSpreadsheet, label: "Excel Drop" },
    ],
  },
  { to: "/drafts", icon: FileEdit, label: "Drafts" },
  { to: "/shipments", icon: PackagePlus, label: "Shipments" },
  { to: "/suppliers", icon: Truck, label: "Suppliers" },
];

const adminSettingsNav: NavItem[] = [
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/settings/users", icon: Users, label: "Users" },
];

// Supplier portal navigation
const supplierMainNav: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/emails", icon: Mail, label: "My Emails" },
  {
    icon: FileText,
    label: "Purchase Orders",
    to: "/purchase-orders/manual",
    children: [
      { to: "/purchase-orders/manual", icon: Layers, label: "Manual Process" },
      { to: "/purchase-orders/excel", icon: FileSpreadsheet, label: "Excel Drop" },
    ],
  },
  { to: "/drafts", icon: FileEdit, label: "Drafts" },
  { to: "/shipments", icon: PackagePlus, label: "Shipments" },
];

const supplierSettingsNav: NavItem[] = [
  { to: "/profile", icon: UserCircle, label: "Profile" },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
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
  const notifRef = useRef<HTMLDivElement>(null);
  const [fieldChangeTick, setFieldChangeTick] = useState(0);

  // Listen for real-time field change broadcast events
  useEffect(() => {
    const handleFieldUpdate = () => {
      setFieldChangeTick((t) => t + 1);
    };
    window.addEventListener("supplier-field-updated", handleFieldUpdate);
    return () => window.removeEventListener("supplier-field-updated", handleFieldUpdate);
  }, []);

  // Dynamic live supplier accounts from database
  const { data: dbSuppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => supplierApi.list(),
    staleTime: 5000,
    refetchInterval: 10000,
  });

  // Dynamic assigned POs strictly for logged-in supplier account
  const { data: poData } = useQuery({
    queryKey: ["supplierNotificationsPOs", user?.supplier_code, user?.supplier_id],
    queryFn: () =>
      poApi.list({
        supplier_id: user?.supplier_id || user?.supplier_code || undefined,
        per_page: 5,
      }),
    enabled: !isAdmin && Boolean(user?.supplier_code || user?.supplier_id),
    staleTime: 10000,
  });

  // Track read notification IDs in localStorage
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("read_notif_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Notifications for Admin
  const adminNotifications: NotificationItem[] = useMemo(() => {
    const notifs: NotificationItem[] = [];

    const recentFieldEdits = getAllSupplierFieldChanges().slice(0, 20);
    recentFieldEdits.forEach((chg) => {
      let timeFormatted = "Recently";
      try {
        const d = new Date(chg.updated_at);
        if (!isNaN(d.getTime())) {
          timeFormatted = formatDistanceToNow(d, { addSuffix: true });
        }
      } catch {}

      const IconComponent = FIELD_ICONS[chg.field_key] || Sparkles;
      const colorStyle =
        FIELD_COLORS[chg.field_key] ||
        "bg-amber-600 text-white border border-amber-700 shadow-xs";

      let notifTitle = `${chg.field_label} Updated`;
      let notifDesc = `${chg.field_label} set to "${chg.new_value}" for ${chg.supplier_name} (${chg.supplier_code})`;

      if (chg.field_key === "delete") {
        notifTitle = "Supplier Profile Deleted";
        notifDesc = `${chg.supplier_name} (${chg.supplier_code}) was deleted from the platform`;
      } else if (chg.field_key === "create") {
        notifTitle = chg.field_label || "Supplier Onboarded & Credentials Sent";
        notifDesc = `${chg.supplier_name} (${chg.supplier_code}) onboarded. ${
          chg.new_value.includes("credentials emailed to")
            ? "Login credentials sent to " + chg.new_value.split("credentials emailed to ")[1]?.replace(")", "")
            : "Added to active partner directory"
        }`;
      } else if (chg.field_key === "is_active") {
        notifTitle = "Account Status Changed";
        notifDesc = `${chg.supplier_name} (${chg.supplier_code}) is now ${chg.new_value}`;
      } else if (chg.new_value === "Removed / Cleared") {
        notifTitle = `${chg.field_label} Cleared`;
        notifDesc = `${chg.field_label} was removed for ${chg.supplier_name} (${chg.supplier_code})`;
      }

      notifs.push({
        id: chg.id,
        title: notifTitle,
        desc: notifDesc,
        time: timeFormatted,
        unread: !readNotifIds.includes(chg.id),
        to: "/suppliers",
        icon: IconComponent,
        color: colorStyle,
      });
    });

    if (dbSuppliers && dbSuppliers.length > 0) {
      const autoDetected = dbSuppliers.filter((s) => Boolean(s.detected_via || s.is_pending_approval));
      autoDetected.forEach((s) => {
        let timeFormatted = "Recently";
        try {
          const d = new Date(s.onboarded_at || "");
          if (!isNaN(d.getTime())) {
            timeFormatted = formatDistanceToNow(d, { addSuffix: true });
          }
        } catch {}

        const notifId = `sup-autodetect-${s.id || s.supplier_code}`;
        notifs.push({
          id: notifId,
          title: "New Supplier Auto-Detected",
          desc: `${s.name} (${s.supplier_code}) auto-discovered from inbound PO email`,
          time: timeFormatted,
          unread: !readNotifIds.includes(notifId),
          to: "/suppliers",
          icon: Sparkles,
          color: "bg-emerald-700 text-white border border-emerald-800 shadow-xs",
        });
      });
    }

    return notifs;
  }, [dbSuppliers, readNotifIds, fieldChangeTick]);

  // Notifications for Supplier
  const supplierNotifications: NotificationItem[] = useMemo(() => {
    const notifs: NotificationItem[] = [];

    const pos = poData?.items || [];
    pos.forEach((po) => {
      const notifId = `po-${po.id}`;
      let timeFormatted = "Recently";
      try {
        const d = new Date(po.created_at || po.delivery_date || "");
        if (!isNaN(d.getTime())) {
          timeFormatted = formatDistanceToNow(d, { addSuffix: true });
        }
      } catch {}

      notifs.push({
        id: notifId,
        title: "New Purchase Order Assigned",
        desc: `PO ${po.po_number || "Order"} assigned to your account (${(po.quantity ?? 0).toLocaleString()} units)`,
        time: timeFormatted,
        unread: !readNotifIds.includes(notifId),
        to: "/purchase-orders",
        icon: FileText,
        color: "bg-emerald-700 text-white border border-emerald-800 shadow-xs",
      });
    });

    return notifs;
  }, [poData, readNotifIds]);

  const notifications: NotificationItem[] = isAdmin ? adminNotifications : supplierNotifications;

  // Close notification dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeNotifications = useMemo(() => {
    return notifications.filter((n) => !readNotifIds.includes(n.id));
  }, [notifications, readNotifIds]);

  const unreadCount = activeNotifications.length;

  const handleMarkAllRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadNotifIds((prev) => {
      const merged = Array.from(new Set([...prev, ...allIds]));
      localStorage.setItem("read_notif_ids", JSON.stringify(merged));
      return merged;
    });
  };

  const handleDismissNotif = (id: string) => {
    setReadNotifIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      localStorage.setItem("read_notif_ids", JSON.stringify(next));
      return next;
    });
  };

  const handleNotifClick = (item: NotificationItem) => {
    handleDismissNotif(item.id);
    setNotifOpen(false);
    navigate(item.to);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    navigate("/login");
  };

  const searchParams = new URLSearchParams(location.search);
  const poParam = searchParams.get("pos") || searchParams.get("po");
  const isCreatingDelivery = location.pathname === "/shipments" && Boolean(poParam);
  const deliveryCreationMode = searchParams.get("mode") === "excel" ? "excel" : "manual";

  const isPoSectionActive = location.pathname.startsWith("/purchase-orders") || isCreatingDelivery;

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    if (path === "/shipments") {
      if (isCreatingDelivery) return false;
      return location.pathname.startsWith("/shipments");
    }
    return location.pathname.startsWith(path);
  };

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => ({
    "Purchase Orders": isPoSectionActive,
  }));

  useEffect(() => {
    if (isPoSectionActive) {
      setOpenMenus((prev) => ({ ...prev, "Purchase Orders": true }));
    }
  }, [isPoSectionActive]);

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-slate-200 bg-white transition-all duration-300 relative z-30",
        collapsed ? "w-16" : "w-64"
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
              {isAdmin ? "Admin Portal" : "Supplier Portal"}
            </span>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4 custom-scrollbar">
        <div className={cn("mb-2", !collapsed && "px-2")}>
          {!collapsed && (
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Main
            </span>
          )}
        </div>
        {mainNav.map((item) => {
          if (item.children && item.children.length > 0) {
            const isMenuOpen = Boolean(openMenus[item.label]);
            const isParentActive = isPoSectionActive;

            return (
              <div key={item.label} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (collapsed) {
                      onToggle();
                      setOpenMenus((prev) => ({ ...prev, [item.label]: true }));
                      navigate(item.to);
                    } else {
                      if (!location.pathname.startsWith("/purchase-orders")) {
                        navigate(item.to);
                        setOpenMenus((prev) => ({ ...prev, [item.label]: true }));
                      } else {
                        toggleMenu(item.label);
                      }
                    }
                  }}
                  className={cn(
                    "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    isParentActive
                      ? isAdmin
                        ? "bg-brand-50 text-brand-700 font-semibold"
                        : "bg-emerald-50 text-emerald-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                  {!collapsed && (
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-slate-400 transition-transform duration-200",
                        isMenuOpen && "rotate-180 text-slate-600"
                      )}
                    />
                  )}
                </button>

                {!collapsed && isMenuOpen && (
                  <div className="space-y-0.5 pl-3 pt-0.5">
                    {item.children.map((sub) => {
                      const isSubActive = isCreatingDelivery
                        ? (deliveryCreationMode === "manual" && sub.to === "/purchase-orders/manual") ||
                          (deliveryCreationMode === "excel" && sub.to === "/purchase-orders/excel")
                        : location.pathname === sub.to;
                      return (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg pl-6 pr-3 py-1.5 text-xs font-medium transition-colors",
                            isSubActive
                              ? isAdmin
                                ? "bg-brand-50 text-brand-700 font-semibold"
                                : "bg-emerald-50 text-emerald-700 font-semibold"
                              : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                          )}
                        >
                          <sub.icon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{sub.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isDraftItem = item.to === "/drafts";
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.to)
                  ? isAdmin
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
              title={collapsed ? item.label : undefined}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </div>
              {!collapsed && isDraftItem && draftCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                  {draftCount}
                </span>
              )}
            </NavLink>
          );
        })}

        {/* Settings / Profile Section */}
        <div className={cn("mb-2 mt-6", !collapsed && "px-2")}>
          {!collapsed && (
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {isAdmin ? "Settings" : "Account"}
            </span>
          )}
        </div>
        {settingsNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(item.to)
                ? isAdmin
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "bg-emerald-50 text-emerald-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User Profile & Actions Footer (Replaces Company/Tenant and Top Header Bar) */}
      <div className="border-t border-slate-200 bg-slate-50/70 relative shrink-0" ref={notifRef}>
        {/* Floating Notification Popover (Upward or Sideways) */}
        {notifOpen && (
          <div
            className={cn(
              "absolute mb-2 rounded-2xl border border-slate-200 bg-white shadow-2xl z-50 animate-in fade-in flex flex-col overflow-hidden",
              collapsed
                ? "left-full bottom-2 ml-2 w-80 sm:w-96 slide-in-from-left-2"
                : "left-2 bottom-full w-[calc(100%-16px)] sm:w-80 slide-in-from-bottom-2"
            )}
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900">
                  {isAdmin ? "Notifications" : "Alerts"}
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full border border-blue-200">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                )}
                <button
                  onClick={() => setNotifOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Notification Items List */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
              {activeNotifications.length === 0 ? (
                <div className="py-7 px-4 text-center">
                  <div className="w-8 h-8 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-1.5">
                    <CheckCheck className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-medium text-slate-600">No unread notifications</p>
                </div>
              ) : (
                activeNotifications.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleNotifClick(item)}
                      className="group flex items-start gap-2.5 p-2.5 text-left transition-colors cursor-pointer hover:bg-slate-50 border-l-2 border-blue-600 relative"
                    >
                      <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-white", item.color)}>
                        <Icon className="w-3 h-3" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-semibold text-slate-900 truncate">{item.title}</p>
                          <span className="text-[10px] text-slate-400 shrink-0 font-mono flex items-center gap-0.5">
                            <Clock className="w-3 h-3" /> {item.time}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-normal mt-0.5 line-clamp-2 leading-tight">
                          {item.desc}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismissNotif(item.id);
                        }}
                        title="Mark as read"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0 rounded"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Popover Footer Link */}
            <div className="p-2 border-t border-slate-100 bg-slate-50/40 text-center">
              <button
                onClick={() => {
                  setNotifOpen(false);
                  navigate(isAdmin ? "/suppliers" : "/purchase-orders");
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
              >
                {isAdmin ? "Manage All Suppliers" : "View My Orders"} <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* User Card Content */}
        {!collapsed ? (
          <div className="p-3">
            <div className="flex items-center justify-between gap-2">
              {/* User Avatar + Code (top) + Name (bottom) */}
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
                      <p className="text-[11px] text-slate-500 truncate">
                        {user?.role === "SUPER_ADMIN" ? "Super Admin (HQ)" : "Central HQ"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-bold font-mono text-slate-900 truncate">
                        {user?.supplier_code || "Supplier"}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate" title={user?.supplier_name || user?.name || undefined}>
                        {user?.supplier_name || user?.name || "Supplier Partner"}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Action Icons: Notification Bell + Sign Out */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="relative p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
                  title="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span
                      className={cn(
                        "absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow-2xs",
                        isAdmin ? "bg-blue-600" : "bg-emerald-600"
                      )}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  title="Sign Out"
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
              title={user?.name || user?.supplier_name || "Profile"}
            >
              {(user?.supplier_name || user?.name || (isAdmin ? "Admin" : "Supplier")).charAt(0).toUpperCase()}
            </div>

            <button
              type="button"
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span
                  className={cn(
                    "absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow-2xs",
                    isAdmin ? "bg-blue-600" : "bg-emerald-600"
                  )}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="Sign Out"
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
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
                Sign Out
              </h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                Are you sure you want to end your current session?
              </p>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLogout}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 active:bg-red-800 transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}