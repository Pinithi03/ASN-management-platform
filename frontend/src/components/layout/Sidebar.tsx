/**
 * Sidebar — role-aware navigation.
 * COMPANY_ADMIN and SUPPLIER see different menu items.
 */

import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/utils/cn";
import { useAuthStore } from "@/store/authStore";
import {
  LayoutDashboard,
  Mail,
  FileText,
  Truck,
  Settings,
  Users,
  ChevronLeft,
  ChevronRight,
  Package,
  PackagePlus,
  UserCircle,
  ScrollText,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

// Admin portal navigation
const adminMainNav: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/emails", icon: Mail, label: "Email Inbox" },
  { to: "/purchase-orders", icon: FileText, label: "Purchase Orders" },
  { to: "/shipments", icon: PackagePlus, label: "Shipments" },
  { to: "/suppliers", icon: Truck, label: "Suppliers" },
];

const adminSettingsNav: NavItem[] = [
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/settings/users", icon: Users, label: "Users" },
  { to: "/audit-logs", icon: ScrollText, label: "Audit Trail" },
];

// Supplier portal navigation
const supplierMainNav: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/emails", icon: Mail, label: "My Emails" },
  { to: "/purchase-orders", icon: FileText, label: "Purchase Orders" },
  { to: "/shipments", icon: PackagePlus, label: "Shipments" },
];

const supplierSettingsNav: NavItem[] = [
  { to: "/profile", icon: UserCircle, label: "Profile" },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  const isAdmin = user?.role === "COMPANY_ADMIN";
  const mainNav = isAdmin ? adminMainNav : supplierMainNav;
  const settingsNav = isAdmin ? adminSettingsNav : supplierSettingsNav;

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-4">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-white",
            isAdmin ? "bg-brand-600" : "bg-emerald-600"
          )}
        >
          <Package className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gray-900">
              ANS Platform
            </span>
            <span className="text-xs text-gray-500">
              {isAdmin ? "Admin Portal" : "Supplier Portal"}
            </span>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        <div className={cn("mb-2", !collapsed && "px-2")}>
          {!collapsed && (
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Main
            </span>
          )}
        </div>
        {mainNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(item.to)
                ? isAdmin
                  ? "bg-brand-50 text-brand-700"
                  : "bg-emerald-50 text-emerald-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}

        {/* Settings / Profile Section */}
        <div className={cn("mb-2 mt-6", !collapsed && "px-2")}>
          {!collapsed && (
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
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
                  ? "bg-brand-50 text-brand-700"
                  : "bg-emerald-50 text-emerald-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Plant info at bottom */}
      {!collapsed && user && (
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs font-medium text-gray-400">
            {isAdmin ? "Your Plant" : "Primary Plant"}
          </p>
          <p className="truncate text-sm font-medium text-gray-700">
            {user.company_name}
          </p>
          <p className="text-xs text-gray-400">{user.company_code}</p>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="flex h-12 items-center justify-center border-t border-gray-200 text-gray-400 hover:text-gray-600"
      >
        {collapsed ? (
          <ChevronRight className="h-5 w-5" />
        ) : (
          <ChevronLeft className="h-5 w-5" />
        )}
      </button>
    </aside>
  );
}