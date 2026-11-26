/**
 * Main Layout — Sidebar, Header & Supplier Security Lockout Check
 */

import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Trans, useTranslation } from "react-i18next";
import Sidebar from "./Sidebar";
import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";
import { supplierApi } from "@/services/supplierApi";
import { ShieldAlert, Lock, Building2, Menu } from "lucide-react";

const SIDEBAR_PREF_KEY = "ans_sidebar_collapsed";

function readCollapsedPref(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export default function MainLayout() {
  const { t } = useTranslation(["layout", "common"]);
  const location = useLocation();

  /*
   * Sidebar modes:
   *   ≥1280 px     full width (user can collapse; choice is remembered)
   *   768–1279 px  icon-only rail, expands on toggle
   *   <768 px      hidden; hamburger opens a slide-over
   */
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const isTablet = useMediaQuery("(min-width: 768px)") && !isDesktop;
  const isMobile = !isDesktop && !isTablet;
  const [desktopCollapsed, setDesktopCollapsed] = useState(readCollapsedPref);
  const [railExpanded, setRailExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarCollapsed = isDesktop ? desktopCollapsed : isTablet ? !railExpanded : false;
  const toggleSidebar = () => {
    if (isDesktop) {
      setDesktopCollapsed((c) => {
        try {
          localStorage.setItem(SIDEBAR_PREF_KEY, c ? "0" : "1");
        } catch {
          /* storage unavailable */
        }
        return !c;
      });
    } else if (isTablet) {
      setRailExpanded((v) => !v);
    } else {
      setMobileOpen((v) => !v);
    }
  };

  // Close the slide-over / expanded rail after navigating.
  useEffect(() => {
    setMobileOpen(false);
    setRailExpanded(false);
  }, [location.pathname]);

  // Esc closes the mobile slide-over.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isSupplier = user?.role === "SUPPLIER";

  // Determine supplier status from live backend API (live sync across all sessions)
  const { data: supplierProfile } = useQuery({
    queryKey: ["currentSupplierStatus", user?.supplier_code],
    queryFn: async () => {
      if (!isSupplier || !user?.supplier_code) return null;
      const list = await supplierApi.list({ include_deleted: true });
      return (
        list.find(
          (s) =>
            s.supplier_code === user.supplier_code ||
            (s.email && s.email.toLowerCase() === user.email?.toLowerCase())
        ) || null
      );
    },
    enabled: isSupplier && !!user?.supplier_code,
    refetchInterval: 10000,
  });

  let supplierAccountState: "ACTIVE" | "INACTIVE" | "DELETED" = "ACTIVE";
  if (isSupplier && supplierProfile) {
    if (supplierProfile.is_deleted) {
      supplierAccountState = "DELETED";
    } else if (!supplierProfile.is_active) {
      supplierAccountState = "INACTIVE";
    }
  }

  const isLockoutActive = isSupplier && supplierAccountState !== "ACTIVE";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      {isMobile ? (
        mobileOpen && (
          <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={t("layout:sidebar.toggleMenu")}>
            <div className="absolute inset-0 bg-slate-900/40 animate-page-fade" onClick={() => setMobileOpen(false)} />
            <div className="relative h-full shadow-lg">
              <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
            </div>
          </div>
        )
      ) : (
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      )}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top bar with hamburger — phones only (<768 px) */}
        {isMobile && (
          <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4 shrink-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
              title={t("layout:sidebar.toggleMenu")}
              aria-label={t("layout:sidebar.toggleMenu")}
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold text-slate-900">ANS Portal</span>
            <div className="w-8" />
          </div>
        )}
        {/* key on the route → quick (150 ms) fade-in of the main content on navigation */}
        <main key={location.pathname} className="flex-1 min-h-0 overflow-y-auto flex flex-col animate-page-fade">
          {isLockoutActive ? (
            <div className="flex flex-col items-center justify-center min-h-[75vh] p-6 text-center animate-in fade-in">
              <div className="bg-white rounded-3xl border border-red-200 p-8 shadow-xl max-w-lg w-full space-y-5 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 shadow-inner">
                  {supplierAccountState === "DELETED" ? (
                    <ShieldAlert className="w-8 h-8" />
                  ) : (
                    <Lock className="w-8 h-8" />
                  )}
                </div>

                <div className="space-y-2">
                  <span
                    className={`inline-block px-3 py-1 text-xs font-semibold font-mono rounded-full ${
                      supplierAccountState === "DELETED"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {supplierAccountState === "DELETED"
                      ? t("layout:lockout.accountRevoked")
                      : t("layout:lockout.accountSuspended")}
                  </span>

                  <h2 className="text-xl font-bold text-slate-900">
                    {supplierAccountState === "DELETED"
                      ? t("layout:lockout.revokedTitle")
                      : t("layout:lockout.suspendedTitle")}
                  </h2>

                  <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                    {supplierAccountState === "DELETED"
                      ? t("layout:lockout.revokedMessage")
                      : t("layout:lockout.suspendedMessage")}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                  <p>
                    <Trans
                      t={t}
                      i18nKey="layout:lockout.contact"
                      values={{ email: "sirio.asn.dev@gmail.com" }}
                      components={{
                        link: <a href="mailto:sirio.asn.dev@gmail.com" className="text-brand-600 font-medium hover:underline" />,
                      }}
                    />
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-center">
                  <button
                    onClick={() => logout()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 rounded-lg shadow-2xs transition-all"
                  >
                    <Building2 className="w-4 h-4" />
                    {t("common:actions.signOut")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
