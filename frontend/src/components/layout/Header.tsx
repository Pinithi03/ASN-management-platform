/**
 * Header — shows search, notifications, active account info, and Calzedonia partner badge.
 * Includes an instant account switcher between Plant Admin & Calzedonia Supplier Partners.
 */

import { useState, useRef, useEffect } from "react";
import { Bell, Search, Menu, LogOut, ChevronDown, Check, Building2, ShieldCheck } from "lucide-react";
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

export default function Header({ onMenuToggle }: HeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const switchSupplier = useAuthStore((s) => s.switchSupplier);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === "COMPANY_ADMIN";

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
                : `Search POs for ${user?.supplier_name?.slice(0, 15) || "Supplier"}...`
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

        {/* Notification bell */}
        <button className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

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