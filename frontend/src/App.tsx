import { Routes, Route } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import Dashboard from "@/pages/Dashboard";
import EmailInbox from "@/pages/EmailInbox";
import PurchaseOrders from "@/pages/PurchaseOrders";
import ASNManagement from "@/pages/ASNManagement";
import ReviewQueue from "@/pages/ReviewQueue";
import Settings from "@/pages/Settings";
import CompanySettings from "@/pages/CompanySettings";
import UserManagement from "@/pages/UserManagement";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/emails" element={<EmailInbox />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/asn" element={<ASNManagement />} />
        <Route path="/review" element={<ReviewQueue />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/company" element={<CompanySettings />} />
        <Route path="/settings/users" element={<UserManagement />} />
      </Route>
    </Routes>
  );
}
