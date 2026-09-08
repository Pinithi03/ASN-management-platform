/**
 * Header — shows search, notifications, user info, and role badge.
 * Includes a dev-only role switcher to toggle between portals.
 */

import { Bell, Search, Menu, LogOut, ArrowLeftRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/utils/cn";

interface HeaderProps {
  onMenuToggle: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const switchRole = useAuthStore((s) => s.switchRole);

  const isAdmin = user?.role === "COMPANY_ADMIN";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Left side — mobile menu + search */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={
              isAdmin
                ? "Search POs, emails, ASNs..."
                : "Search POs, shipments..."
            }
            className={cn(
              "h-9 w-64 rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1",
              isAdmin
                ? "focus:border-brand-500 focus:ring-brand-500"
                : "focus:border-emerald-500 focus:ring-emerald-500"
            )}
          />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Dev role switcher */}
        <button
          onClick={switchRole}
          title="Switch role (dev only)"
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Switch Role</span>
        </button>

        {/* Notification bell */}
        <button className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* User info + role badge */}
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          {/* Avatar */}
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white",
              isAdmin ? "bg-brand-600" : "bg-emerald-600"
            )}
          >
            {user?.full_name?.charAt(0) ?? "U"}
          </div>

          {/* Name + role */}
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium text-gray-900">
              {user?.full_name ?? "User"}
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none",
                  isAdmin
                    ? "bg-brand-100 text-brand-700"
                    : "bg-emerald-100 text-emerald-700"
                )}
              >
                {isAdmin ? "Admin" : "Supplier"}
              </span>
              <span className="text-xs text-gray-400">
                {user?.company_code}
              </span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Logout"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}