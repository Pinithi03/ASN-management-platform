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

import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import MainLayout from "@/components/layout/MainLayout";
import Dashboard from "@/pages/Dashboard";
import EmailInbox from "@/pages/EmailInbox";
import EmailDetailPage from "@/pages/EmailDetail";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Settings from "@/pages/Settings";
import UserManagement from "@/pages/UserManagement";
import Suppliers from "@/pages/Suppliers";
import Shipments from "@/pages/Shipments";
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

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/asn" element={<Navigate to="/shipments" replace />} />
        <Route path="/review" element={<Navigate to="/shipments" replace />} />
        <Route path="/shipments" element={<Shipments />} />

        {/* Admin-only pages */}
        <Route
          path="/emails"
          element={<RequirePermission permissions={["*"]}><EmailInbox /></RequirePermission>}
        />
        <Route
          path="/emails/:emailId"
          element={<RequirePermission permissions={["*"]}><EmailDetailPage /></RequirePermission>}
        />
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

        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
