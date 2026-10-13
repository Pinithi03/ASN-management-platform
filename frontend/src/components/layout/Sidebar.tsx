/**
 * Sidebar — role-aware navigation.
 * ADMIN and SUPPLIER see different menu items.
 */

import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
  ChevronDown,
  Package,
  PackagePlus,
  UserCircle,
  FileSpreadsheet,
  Layers,
} from "lucide-react";

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
  { to: "/shipments", icon: PackagePlus, label: "Shipments" },
];

const supplierSettingsNav: NavItem[] = [
  { to: "/profile", icon: UserCircle, label: "Profile" },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const mainNav = isAdmin ? adminMainNav : supplierMainNav;
  const settingsNav = isAdmin ? adminSettingsNav : supplierSettingsNav;

  const searchParams = new URLSearchParams(location.search);
  const poParam = searchParams.get("pos") || searchParams.get("po");
  const isCreatingDelivery = location.pathname === "/shipments" && Boolean(poParam);
  const deliveryCreationMode = searchParams.get("mode") === "excel" ? "excel" : "manual";

  const isPoSectionActive = location.pathname.startsWith("/purchase-orders") || isCreatingDelivery;

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    if (path === "/shipments") {
      // While creating delivery from POs (Manual or Excel), do NOT highlight Shipments
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
              ASN Platform
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
                        ? "bg-brand-50/80 text-brand-700"
                        : "bg-emerald-50/80 text-emerald-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
                        "h-4 w-4 text-gray-400 transition-transform duration-200",
                        isMenuOpen && "rotate-180 text-gray-600"
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
                                ? "bg-brand-100/80 text-brand-900 font-semibold"
                                : "bg-emerald-100/80 text-emerald-900 font-semibold"
                              : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
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

          return (
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
          );
        })}

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

      {/* Organization info at bottom */}
      {!collapsed && user && (
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs font-medium text-gray-400">
            {isAdmin ? "Company / Tenant" : "Supplier Partner"}
          </p>
          <p className="truncate text-sm font-medium text-gray-700">
            {user.supplier_name || "ASN Portal"}
          </p>
          <p className="text-xs text-gray-400 font-mono">{user.supplier_code || user.role}</p>
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