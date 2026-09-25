/**
 * App root — role-based routing for Admin and Supplier portals.
 */

import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import MainLayout from "@/components/layout/MainLayout";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import EmailInbox from "@/pages/EmailInbox";
import EmailDetailPage from "@/pages/EmailDetail";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Settings from "@/pages/Settings";
import UserManagement from "@/pages/UserManagement";
import Suppliers from "@/pages/Suppliers";
import Shipments from "@/pages/Shipments";
import Profile from "@/pages/Profile";
import AuditLogs from "@/pages/AuditLogs";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({ role, children }: { role: "COMPANY_ADMIN" | "SUPPLIER"; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route element={<RequireAuth><MainLayout /></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/asn" element={<Navigate to="/shipments" replace />} />
        <Route path="/review" element={<Navigate to="/shipments" replace />} />

        <Route path="/emails" element={<EmailInbox />} />
        <Route path="/emails/:emailId" element={<EmailDetailPage />} />
        <Route path="/suppliers" element={<RequireRole role="COMPANY_ADMIN"><Suppliers /></RequireRole>} />
        <Route path="/settings" element={<RequireRole role="COMPANY_ADMIN"><Settings /></RequireRole>} />
        <Route path="/settings/company" element={<Navigate to="/settings" replace />} />
        <Route path="/settings/users" element={<RequireRole role="COMPANY_ADMIN"><UserManagement /></RequireRole>} />
        <Route path="/users" element={<RequireRole role="COMPANY_ADMIN"><UserManagement /></RequireRole>} />
        <Route path="/audit-logs" element={<RequireRole role="COMPANY_ADMIN"><AuditLogs /></RequireRole>} />

        <Route path="/shipments" element={<Shipments />} />
        <Route path="/profile" element={<RequireRole role="SUPPLIER"><Profile /></RequireRole>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}