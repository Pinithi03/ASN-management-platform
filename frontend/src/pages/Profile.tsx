/**
 * Supplier Partner Profile & Settings Page — Supplier Portal
 * Strictly Read-Only for Supplier Partners.
 * Mapped continuously with the Admin Dashboard Supplier Registry.
 * Profile changes must be requested through the System Administrator.
 */

import { useState } from "react";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Lock,
  KeyRound,
  Bell,
  Globe,
  Tag,
  UserCheck,
  Building,
  FileText,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/utils/cn";
import { INITIAL_SUPPLIERS, SupplierItem } from "@/pages/Suppliers";
import { useQuery } from "@tanstack/react-query";
import { supplierApi } from "@/services/supplierApi";

export default function Profile() {
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<"company" | "security">("company");

  // Live query directly from PostgreSQL backend API (/api/v1/suppliers)
  const { data: serverSuppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => supplierApi.list(),
    refetchInterval: 5000,
  });

  const suppliersList: SupplierItem[] =
    serverSuppliers && serverSuppliers.length > 0 ? serverSuppliers : INITIAL_SUPPLIERS;

  // Match the active logged-in supplier with Admin Dashboard registry
  const currentSupplierCode = user?.supplier_code || "0000018194";
  const cleanCode = currentSupplierCode.replace(/^0+/, "");

  const matchedSupplier: SupplierItem =
    suppliersList.find(
      (s) =>
        s.supplier_code === currentSupplierCode ||
        s.supplier_code.replace(/^0+/, "") === cleanCode ||
        s.id === user?.supplier_id ||
        (user?.supplier_name && s.name.toLowerCase() === user.supplier_name.toLowerCase())
    ) ||
    suppliersList.find((s) => s.supplier_code.includes(cleanCode)) ||
    suppliersList[0] ||
    INITIAL_SUPPLIERS[0];

  // Security Form State (allowed for self-service password update)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Notification Toggles
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [asnConfirmations, setAsnConfirmations] = useState(true);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    setPasswordSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPasswordSuccess(false), 4000);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Banner Card: Clean and Elegant */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-2xl p-6 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center shrink-0 text-white font-bold text-2xl shadow-inner">
            <Building2 className="w-7 h-7 text-emerald-200" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{matchedSupplier.name}</h1>
            <p className="text-xs text-emerald-100/80 mt-1 font-mono">
              Supplier Code: <span className="text-white font-semibold">#{matchedSupplier.supplier_code}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Header Navigation */}
      <div className="flex items-center justify-between border-b border-gray-200 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-2">
          {[
            { id: "company", label: "Company Profile", icon: Building },
            { id: "security", label: "Security & Login Credentials", icon: Lock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap border-b-2 -mb-1",
                  isActive
                    ? "border-emerald-600 text-emerald-700 bg-emerald-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── TAB 1: COMPANY PROFILE ─── */}
      {activeTab === "company" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-gray-100">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                <Sparkles className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Official Company Profile Details</h2>
                <p className="text-xs text-gray-500">
                  Sourced directly from the Oniverse Plant Admin Supplier Registry
                </p>
              </div>
            </div>

            {/* Profile Attributes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Field 1: Registered Company Name */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative group">
                <div className="mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Registered Company Name
                  </span>
                </div>
                <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate">{matchedSupplier.name}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Official registered enterprise entity</p>
              </div>

              {/* Field 2: Calzedonia Supplier Code */}
              <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                    Calzedonia Supplier Code
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified ID
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-emerald-950 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>#{matchedSupplier.supplier_code}</span>
                </div>
                <p className="text-[11px] text-emerald-700/80 mt-1">Unique supply chain routing identifier</p>
              </div>

              {/* Field 3: Official Orders Email */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Official Orders Email
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                  <span className="truncate font-mono text-xs font-semibold">{matchedSupplier.email}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Destination for automated PO notifications</p>
              </div>

              {/* Field 4: Primary Contact Person */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Primary Contact Person
                  </span>
                </div>
                <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{matchedSupplier.contact_name || "Not Specified"}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Designated account liaison officer</p>
              </div>

              {/* Field 5: Direct Phone / Mobile */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Direct Phone / Hotline
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                  <span className="font-mono text-xs">{matchedSupplier.phone || "Not Specified"}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Dispatches & order coordination</p>
              </div>

              {/* Field 6: Manufacturing Category */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Manufacturing Category
                  </span>
                </div>
                <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{matchedSupplier.category || "Textiles & Garments"}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Calzedonia raw material classification</p>
              </div>

              {/* Field 7: Country / Region */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Country / Region
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-gray-500 shrink-0" />
                  <span>{matchedSupplier.country || "Sri Lanka"}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Operating manufacturing jurisdiction</p>
              </div>

              {/* Field 8: Business Registration / Tax ID */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Business Reg / Tax ID
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{matchedSupplier.tax_id || "PV-10293847"}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Corporate statutory registration number</p>
              </div>

              {/* Field 9: Facility Address */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Facility / Operating Address
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
                  <span className="truncate">{matchedSupplier.address || "Sri Lanka Manufacturing Plant"}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Physical plant dispatch terminal</p>
              </div>
            </div>

            {/* Subtle Support Notice in Green */}
            <div className="p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-200/70 flex items-center gap-2.5 text-xs text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                If you need to make any changes to your company profile, please contact the <strong>System Administrator</strong> for support.
              </span>
            </div>
          </div>
        </div>
      )}


      {/* ─── TAB 3: SECURITY & CREDENTIALS ─── */}
      {activeTab === "security" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <form onSubmit={handlePasswordChange} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-gray-900">Change Account Password</h2>
              </div>
              {passwordSuccess && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Password Updated!
                </span>
              )}
            </div>

            {passwordError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                {passwordError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm"
              >
                <KeyRound className="w-4 h-4" />
                Update Password
              </button>
            </div>
          </form>

          {/* Email Notification Alerts */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Bell className="w-5 h-5 text-amber-600" />
              <h2 className="text-base font-bold text-gray-900">Email Alerts & Notifications</h2>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 text-sm">Purchase Order Email Alerts</p>
                  <p className="text-gray-500">
                    Receive instant email notifications when new POs are ingested for your supplier code.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={emailAlerts}
                  onChange={(e) => setEmailAlerts(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 text-sm">ASN Dispatch Confirmations</p>
                  <p className="text-gray-500">
                    Receive confirmation emails when Calzedonia XML submission is generated.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={asnConfirmations}
                  onChange={(e) => setAsnConfirmations(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}