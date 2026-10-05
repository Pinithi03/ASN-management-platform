import { useState, useRef, useEffect, useMemo } from "react";
import {
  Bell,
  Menu,
  LogOut,
  ChevronDown,
  Check,
  Building2,
  ShieldCheck,
  FileText,
  Clock,
  Sparkles,
  CheckCheck,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { supplierApi } from "@/services/supplierApi";
import { poApi } from "@/services/poApi";
import {
  getAllSupplierFieldChanges,
  FIELD_ICONS,
  FIELD_COLORS,
} from "@/utils/supplierFieldUpdates";
import { cn } from "@/utils/cn";

interface HeaderProps {
  onMenuToggle: () => void;
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

export default function Header({ onMenuToggle }: HeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const switchSupplier = useAuthStore((s) => s.switchSupplier);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [fieldChangeTick, setFieldChangeTick] = useState(0);

  const isAdmin = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";

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

  // Dynamic assigned POs for logged-in supplier
  const { data: poData } = useQuery({
    queryKey: ["supplierNotificationsPOs", user?.supplier_code],
    queryFn: () => poApi.list({ per_page: 5 }),
    enabled: !isAdmin && Boolean(user?.supplier_code),
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

  // Dynamic notifications for Admin (all CRUD operations: Create, Read, Update, Delete & Active status changes)
  const adminNotifications: NotificationItem[] = useMemo(() => {
    const notifs: NotificationItem[] = [];

    // 1. Granular CRUD & Field Edit Notifications
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
      let notifDesc = `${chg.field_label} set to "${chg.new_value}" for ${chg.supplier_name} (#${chg.supplier_code})`;

      if (chg.field_key === "delete") {
        notifTitle = "Supplier Profile Deleted";
        notifDesc = `${chg.supplier_name} (#${chg.supplier_code}) was deleted from the platform`;
      } else if (chg.field_key === "create") {
        notifTitle = "New Supplier Onboarded";
        notifDesc = `${chg.supplier_name} (#${chg.supplier_code}) added to active partner directory`;
      } else if (chg.field_key === "is_active") {
        notifTitle = "Account Status Changed";
        notifDesc = `${chg.supplier_name} (#${chg.supplier_code}) is now ${chg.new_value}`;
      } else if (chg.new_value === "Removed / Cleared") {
        notifTitle = `${chg.field_label} Cleared`;
        notifDesc = `${chg.field_label} was removed for ${chg.supplier_name} (#${chg.supplier_code})`;
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

    // 2. Inbound Email Auto-Detection Announcements (deduped if already logged)
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
          desc: `${s.name} (#${s.supplier_code}) auto-discovered from inbound Iungo PO email`,
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

  // Dynamic notifications for Supplier Portal (Clean: strictly Purchase Orders & Operational alerts only)
  const supplierNotifications: NotificationItem[] = useMemo(() => {
    const notifs: NotificationItem[] = [];

    // Purchase Order Assignments
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
        desc: `PO #${po.po_number || "Order"} assigned to your account (${(po.quantity ?? 0).toLocaleString()} units)`,
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

  const dynamicAccounts = [
    {
      type: "admin",
      code: "admin",
      title: "Sirio Central Admin",
      sub: "Plant Management",
      role: "COMPANY_ADMIN",
      icon: ShieldCheck,
    },
    ...(dbSuppliers && dbSuppliers.length > 0
      ? dbSuppliers.map((s) => ({
          type: "supplier",
          code: s.supplier_code,
          title: s.name,
          sub: `Partner #${s.supplier_code}${s.total_pos !== undefined && s.total_pos > 0 ? ` • ${s.total_pos} POs` : ""}`,
          role: "SUPPLIER",
          icon: Building2,
        }))
      : []),
  ];

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter out read notifications so only active/unread notifications appear in drawer
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

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleSwitchAccount = async (code: string) => {
    try {
      setSwitching(true);
      await switchSupplier(code);
      setSwitcherOpen(false);
      // Invalidate queries so that POs and Shipments refresh under the new role
      await queryClient.invalidateQueries();
    } catch (err) {
      console.error("Account switch error:", err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Left side — mobile menu toggle */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Account Switcher Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setSwitcherOpen(!switcherOpen)}
            disabled={switching}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all shadow-sm",
              isAdmin
                ? "border-brand-200 bg-brand-50/60 text-brand-900 hover:bg-brand-100/70"
                : "border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-100/70"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isAdmin ? "bg-brand-600 animate-pulse" : "bg-emerald-600 animate-pulse"
              )}
            />
            <div className="text-left">
              <span className="font-semibold block leading-tight">
                {isAdmin ? "Admin Portal" : `Partner #${user?.supplier_code || ""}`}
              </span>
              <span className="text-[10px] text-gray-500 block leading-tight">Switch Account</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-1" />
          </button>

          {switcherOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-gray-200 bg-white py-2 shadow-xl z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-900">Switch Portal Account</p>
                <p className="text-[11px] text-gray-500">Test RBAC isolation per supplier</p>
              </div>

              <div className="py-1 max-h-80 overflow-y-auto">
                {dynamicAccounts.map((acc) => {
                  const isCurrent =
                    (acc.code === "admin" && isAdmin) ||
                    (user?.supplier_code === acc.code);
                  const Icon = acc.icon;

                  return (
                    <button
                      key={acc.code}
                      onClick={() => handleSwitchAccount(acc.code)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-gray-50",
                        isCurrent && "bg-gray-50/80 font-semibold"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg text-xs",
                            acc.role === "COMPANY_ADMIN"
                              ? "bg-brand-100 text-brand-700"
                              : "bg-emerald-100 text-emerald-700"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-gray-900 leading-tight">{acc.title}</p>
                          <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{acc.sub}</p>
                        </div>
                      </div>
                      {isCurrent && <Check className="h-4 w-4 text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Notification Bell + Dropdown Drawer */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-gray-200 bg-white py-3 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-4 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-brand-600" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    {isAdmin ? "Admin Notifications" : "Supplier Alerts"}
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-red-50 text-red-600 rounded-full border border-red-100">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                )}
              </div>

              {/* Notification List (Only active/unread items, auto-removed when read) */}
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {activeNotifications.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <div className="w-10 h-10 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 border border-emerald-100">
                      <CheckCheck className="w-5 h-5 text-emerald-600" />
                    </div>
                    <p className="text-xs font-semibold text-gray-800">You're All Caught Up!</p>
                    <p className="text-[11px] text-gray-400 mt-1 max-w-[220px] mx-auto leading-normal">
                      No unread alerts. New supplier activities and order updates will appear here automatically.
                    </p>
                  </div>
                ) : (
                  activeNotifications.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleNotifClick(item)}
                        className="group flex items-start gap-3 p-3 text-left transition-colors cursor-pointer hover:bg-gray-50/80 bg-blue-50/70 border-l-4 border-blue-600 font-semibold relative"
                      >
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", item.color)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold text-gray-900 truncate">{item.title}</p>
                            <span className="text-[10px] text-gray-400 shrink-0 flex items-center gap-0.5 font-mono">
                              <Clock className="w-3 h-3" /> {item.time}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 font-normal mt-0.5 line-clamp-2 leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismissNotif(item.id);
                          }}
                          title="Mark as read & remove"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/70 transition-all shrink-0 self-center"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Drawer Footer Link */}
              <div className="px-4 pt-2.5 mt-1 border-t border-gray-100 text-center">
                <button
                  onClick={() => {
                    setNotifOpen(false);
                    navigate(isAdmin ? "/suppliers" : "/purchase-orders");
                  }}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                >
                  {isAdmin ? "Manage All Suppliers" : "View My Orders"} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User info + role badge */}
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1">
          {/* Avatar */}
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm",
              isAdmin ? "bg-brand-600" : "bg-emerald-600"
            )}
          >
            {user?.full_name?.charAt(0) ?? (isAdmin ? "A" : "S")}
          </div>

          {/* Name + role */}
          <div className="hidden text-left sm:block max-w-[180px]">
            <p className="text-xs font-bold text-gray-900 truncate">
              {isAdmin ? user?.full_name || "Admin" : user?.supplier_name || user?.full_name}
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none",
                  isAdmin
                    ? "bg-brand-100 text-brand-700"
                    : "bg-emerald-100 text-emerald-700"
                )}
              >
                {isAdmin ? "Admin" : "Supplier"}
              </span>
              <span className="text-[10px] font-mono text-gray-400 truncate">
                {isAdmin ? "HQ" : `#${user?.supplier_code}`}
              </span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Logout"
          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}