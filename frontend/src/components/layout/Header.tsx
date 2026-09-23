// ─── Header Component ────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import {
  Bell,
  Menu,
  LogOut,
  ChevronDown,
  Check,
  Building2,
  ShieldCheck,
  Mail,
  FileText,
  PackagePlus,
  Clock,
  Sparkles,
  CheckCheck,
  ScrollText,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/utils/cn";

interface HeaderProps {
  onMenuToggle: () => void;
}

const ACCOUNTS = [
  {
    type: "admin",
    code: "admin",
    title: "Sirio Central Admin",
    sub: "Plant Management",
    role: "COMPANY_ADMIN",
    icon: ShieldCheck,
  },
  {
    type: "supplier",
    code: "0000018194",
    title: "Coats Thread Exports",
    sub: "Partner #0000018194 • 8 POs",
    role: "SUPPLIER",
    icon: Building2,
  },
  {
    type: "supplier",
    code: "0000001122",
    title: "Hayleys Fabric PLC",
    sub: "Partner #0000001122 • 3 POs",
    role: "SUPPLIER",
    icon: Building2,
  },
  {
    type: "supplier",
    code: "0000080589",
    title: "South Asia Textiles",
    sub: "Partner #0000080589 • 1 PO",
    role: "SUPPLIER",
    icon: Building2,
  },
];

const ADMIN_NOTIFICATIONS = [
  {
    id: "n-1",
    title: "Supplier Profile Updated",
    desc: "Hayleys Fabric PLC updated contact person & phone details",
    time: "10 mins ago",
    unread: true,
    to: "/suppliers",
    icon: Sparkles,
    color: "bg-amber-600 text-white border border-amber-700 shadow-xs",
  },
  {
    id: "n-2",
    title: "Inbound Email Auto-Parsed",
    desc: "PO #2001609235 auto-committed from Coats Thread Exports",
    time: "25 mins ago",
    unread: true,
    to: "/emails",
    icon: Mail,
    color: "bg-blue-700 text-white border border-blue-800 shadow-xs",
  },
  {
    id: "n-3",
    title: "System Audit Event Recorded",
    desc: "SUPPLIER_ACTIVATED logged for Prym Intimates Lanka Ltd",
    time: "1 hour ago",
    unread: false,
    to: "/audit-logs",
    icon: ScrollText,
    color: "bg-indigo-700 text-white border border-indigo-800 shadow-xs",
  },
];

const SUPPLIER_NOTIFICATIONS = [
  {
    id: "sn-1",
    title: "New Purchase Order Assigned",
    desc: "PO #2001609235 assigned to your account by Sirio Ltd (12,500 Units)",
    time: "15 mins ago",
    unread: true,
    to: "/purchase-orders",
    icon: FileText,
    color: "bg-emerald-700 text-white border border-emerald-800 shadow-xs",
  },
  {
    id: "sn-2",
    title: "ASN Dispatch Confirmed",
    desc: "Calzedonia XML generated & sent to plant for Shipment #SHIP-991",
    time: "2 hours ago",
    unread: true,
    to: "/shipments",
    icon: PackagePlus,
    color: "bg-blue-700 text-white border border-blue-800 shadow-xs",
  },
  {
    id: "sn-3",
    title: "Partner Account Verified",
    desc: "Your supplier partner account is active & verified for Sirio Ltd",
    time: "1 day ago",
    unread: false,
    to: "/profile",
    icon: ShieldCheck,
    color: "bg-emerald-700 text-white border border-emerald-800 shadow-xs",
  },
];

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

  const isAdmin = user?.role === "COMPANY_ADMIN";

  const initialNotifs = isAdmin ? ADMIN_NOTIFICATIONS : SUPPLIER_NOTIFICATIONS;
  const [notifications, setNotifications] = useState(initialNotifs);

  // Sync notifications when user role switches
  useEffect(() => {
    setNotifications(isAdmin ? ADMIN_NOTIFICATIONS : SUPPLIER_NOTIFICATIONS);
  }, [isAdmin]);

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

  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleNotifClick = (item: (typeof ADMIN_NOTIFICATIONS)[0]) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, unread: false } : n))
    );
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

              <div className="py-1">
                {ACCOUNTS.map((acc) => {
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

              {/* Notification List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {notifications.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleNotifClick(item)}
                      className={cn(
                        "flex items-start gap-3 p-3 text-left transition-colors cursor-pointer hover:bg-gray-50/80",
                        item.unread ? "bg-blue-50/90 border-l-4 border-blue-600 font-semibold" : "opacity-75"
                      )}
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
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Drawer Footer Link */}
              <div className="px-4 pt-2.5 mt-1 border-t border-gray-100 text-center">
                <button
                  onClick={() => {
                    setNotifOpen(false);
                    navigate(isAdmin ? "/audit-logs" : "/emails");
                  }}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                >
                  {isAdmin ? "View System Audit Trail" : "View All Inbox Emails"} <ArrowRight className="w-3 h-3" />
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