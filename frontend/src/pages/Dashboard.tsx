// ─── Dashboard Router Component ─────────────────────────────────────
// frontend/src/pages/Dashboard.tsx

import { useAuthStore } from "@/store/authStore";
import AdminDashboard from "./AdminDashboard";
import SupplierDashboard from "./SupplierDashboard";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "COMPANY_ADMIN";

  return isAdmin ? <AdminDashboard /> : <SupplierDashboard />;
}