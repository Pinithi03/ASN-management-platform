import { useState, useRef, useEffect, useMemo } from "react";
import {
  Bell,
  Menu,
  LogOut,
  Check,
  FileText,
  Clock,
  Sparkles,
  CheckCheck,
  ArrowRight,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  // switchSupplier removed — role switching is no longer available.

  const [notifOpen, setNotifOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [fieldChangeTick, setFieldChangeTick] = useState(0);

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

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
        notifTitle = chg.field_label || "Supplier Onboarded & Credentials Sent";
        notifDesc = `${chg.supplier_name} (#${chg.supplier_code}) onboarded. ${
          chg.new_value.includes("credentials emailed to")
            ? "Login credentials sent to " + chg.new_value.split("credentials emailed to ")[1]?.replace(")", "")
            : "Added to active partner directory"
        }`;
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
          desc: `${s.name} (#${s.supplier_code}) auto-discovered from inbound PO email`,
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
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    navigate("/login");
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shrink-0">
      {/* Left side — mobile menu toggle */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2.5">
        {/* Notification Bell + Dropdown Drawer */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span
                className={cn(
                  "absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
                  isAdmin ? "bg-blue-600" : "bg-emerald-600"
                )}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white py-3 shadow-xl z-50">
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-4 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-semibold text-slate-900">
                    {isAdmin ? "Notifications" : "Alerts"}
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 rounded-full border border-blue-200">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                )}
              </div>

              {/* Notification List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {activeNotifications.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <div className="w-9 h-9 mx-auto rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-2">
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
                        className="group flex items-start gap-3 p-3 text-left transition-colors cursor-pointer hover:bg-slate-50 border-l-2 border-blue-600 relative"
                      >
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", item.color)}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-semibold text-slate-900 truncate">{item.title}</p>
                            <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-0.5 font-mono">
                              <Clock className="w-3 h-3" /> {item.time}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-normal mt-0.5 line-clamp-2 leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismissNotif(item.id);
                          }}
                          title="Mark as read & remove"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0 self-center"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Drawer Footer Link */}
              <div className="px-4 pt-2.5 mt-1 border-t border-slate-100 text-center">
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
        </div>

        {/* User info + role badge (Only for Admin) */}
        {isAdmin && (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1">
            {/* Avatar */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs bg-blue-600">
              {user?.name?.charAt(0) ?? "A"}
            </div>

            {/* Name + role */}
            <div className="hidden text-left sm:block max-w-[180px]">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {user?.name || "Admin"}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none bg-slate-100 text-slate-700">
                  {user?.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
                </span>
                <span className="text-[10px] font-mono text-slate-400 truncate">
                  HQ
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Sign Out"
          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      {/* Sign Out Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
            {/* Close button */}
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Sign Out
              </h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                Are you sure you want to end your current session?
              </p>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLogout}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 active:bg-red-800 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}