/**
 * App root — permission-based routing.
 *
 * No /login route — with keycloak-js login-required, nobody
 * reaches the app without a Keycloak session.
 *
 * Guards use the permissions array from /auth/me:
 *   ADMIN has ["*"] which passes everything.
 *   SUPPLIER has specific permissions for their own data.
 */

import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { clearSharedPlantState } from "@/utils/plantResolver";
import MainLayout from "@/components/layout/MainLayout";
import Dashboard from "@/pages/Dashboard";
import EmailInbox from "@/pages/EmailInbox";
import EmailDetailPage from "@/pages/EmailDetail";
import PurchaseOrders from "@/pages/PurchaseOrders";
import PurchaseOrderLines from "@/pages/PurchaseOrderLines";
import OrderHistory from "@/pages/OrderHistory";
import Settings from "@/pages/Settings";
import UserManagement from "@/pages/UserManagement";
import Suppliers from "@/pages/Suppliers";
import Shipments from "@/pages/Shipments";
import Drafts from "@/pages/Drafts";
import Profile from "@/pages/Profile";

/** Guard: user must hold ALL listed permissions (ADMIN's "*" passes everything). */
function RequirePermission({
  permissions,
  children,
}: {
  permissions: string[];
  children: React.ReactNode;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasAll = permissions.every((p) => hasPermission(p));
  if (!hasAll) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Preserves ?plant=...&loc=...&status=... search parameters across default sub-route redirects. */
function RedirectWithSearch({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

/**
 * Root landing redirect:
 * - Supplier / standard users land directly on the Purchase Orders Plant Selection Gateway.
 * - Admin users land on Overview (/overview).
 */
function RootRedirect() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  if (!isAdmin) {
    clearSharedPlantState();
    return <Navigate to="/purchase-orders/manual" replace />;
  }
  return <Navigate to="/overview" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/overview" element={<Dashboard />} />
        <Route path="/dashboard" element={<Navigate to="/overview" replace />} />

        {/* 1. Purchase Orders (Manual Process & Excel Drop) */}
        <Route path="/purchase-orders" element={<RedirectWithSearch to="/purchase-orders/manual" />} />
        <Route path="/purchase-orders/manual" element={<PurchaseOrders mode="manual" />} />
        <Route path="/purchase-orders/excel" element={<PurchaseOrders mode="excel" />} />

        {/* 2. Purchase Order Lines (Manual Process & Excel Drop) */}
        <Route path="/purchase-order-lines" element={<RedirectWithSearch to="/purchase-order-lines/manual" />} />
        <Route path="/purchase-order-lines/manual" element={<PurchaseOrderLines mode="manual" />} />
        <Route path="/purchase-order-lines/excel" element={<PurchaseOrderLines mode="excel" />} />

        {/* 3. Drafts, 4. Shipments, 5. Order History */}
        <Route path="/drafts" element={<Drafts />} />
        <Route path="/asn" element={<Navigate to="/shipments" replace />} />
        <Route path="/review" element={<Navigate to="/shipments" replace />} />
        <Route path="/shipments" element={<Shipments />} />
        <Route path="/order-history" element={<OrderHistory />} />

        {/* 7. Emails */}
        <Route path="/emails" element={<EmailInbox />} />
        <Route path="/emails/:emailId" element={<EmailDetailPage />} />

        {/* Admin-only pages */}
        <Route
          path="/suppliers"
          element={<RequirePermission permissions={["*"]}><Suppliers /></RequirePermission>}
        />
        <Route
          path="/settings"
          element={<RequirePermission permissions={["*"]}><Settings /></RequirePermission>}
        />
        <Route path="/settings/company" element={<Navigate to="/settings" replace />} />
        <Route
          path="/settings/users"
          element={<RequirePermission permissions={["*"]}><UserManagement /></RequirePermission>}
        />
        <Route
          path="/users"
          element={<RequirePermission permissions={["*"]}><UserManagement /></RequirePermission>}
        />

        {/* 8. Profile */}
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
