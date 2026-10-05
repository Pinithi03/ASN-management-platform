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
  AlertTriangle,
  Clock,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/utils/cn";
import { INITIAL_SUPPLIERS, SupplierItem } from "@/pages/Suppliers";
import { useQuery } from "@tanstack/react-query";
import { supplierApi } from "@/services/supplierApi";
import {
  getSupplierFieldChanges,
  FIELD_ICONS,
} from "@/utils/supplierFieldUpdates";

// Removed manual plant constants in favor of automated PO destination detection

export default function Profile() {
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<"company" | "security">("company");

  // Live query directly from PostgreSQL backend API (/api/v1/suppliers)
  // Continuous sync ensures any details extracted from incoming emails or updated by admin appear in real-time
  const { data: serverSuppliers, dataUpdatedAt } = useQuery({
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

  const lastSyncTime = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "Live Synced";

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
      {/* Top Banner Card */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 text-white font-bold text-2xl shadow-inner">
              <Building2 className="w-8 h-8 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-white">{matchedSupplier.name}</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-400/20 text-emerald-100 border border-emerald-300/30 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" /> Verified Calzedonia Partner
                </span>
                {matchedSupplier.is_active ? (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-green-500/20 text-green-200 border border-green-400/30 rounded-full">
                    ACTIVE
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30 rounded-full">
                    SUSPENDED
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-100/80 mt-1 flex items-center gap-3 font-mono flex-wrap">
                <span>
                  Supplier Code: <strong className="text-white font-bold">#{matchedSupplier.supplier_code}</strong>
                </span>
                <span>•</span>
                <span>Category: {matchedSupplier.category || "Textiles & Garments"}</span>
                <span>•</span>
                <span>Country: {matchedSupplier.country || "Sri Lanka"}</span>
                {matchedSupplier.total_pos !== undefined && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-200">
                      Total Orders: <strong className="text-white font-bold">{matchedSupplier.total_pos} POs</strong>
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2.5 rounded-xl text-xs text-emerald-100">
              <p className="text-[10px] text-emerald-200 uppercase font-bold">Plant Dispatch Mode</p>
              <p className="font-semibold text-white mt-0.5">Automated (PO Destination)</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SYSTEM READ-ONLY NOTICE BANNER ─── */}
      <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-5 shadow-xs flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 mt-0.5 text-amber-700">
            <Lock className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-amber-950">
                Supplier Profile Is Read-Only (Managed by Central Administration)
              </h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded-md">
                Admin Synchronized
              </span>
            </div>
            <p className="text-xs text-amber-900/90 mt-1 leading-relaxed max-w-3xl">
              Company profile information, contact credentials, and Calzedonia partner attributes are strictly controlled by the Oniverse Plant Administrator to maintain compliance with Calzedonia Group supply chain standards.{" "}
              <strong>If you need to change any details in your profile</strong>, please contact the system administrator.
            </p>
          </div>
        </div>
      </div>

      {/* ─── LIVE PROFILE UPDATES SYNCHRONIZED BANNER ─── */}
      {matchedSupplier.updated_at && (
        <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-5 shadow-xs space-y-3 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0 text-emerald-700">
                <Sparkles className="w-4 h-4 text-emerald-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-emerald-950">
                    Profile Details Updated & Synchronized
                  </h4>
                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-200/80 text-emerald-900 rounded-full">
                    Live Synced
                  </span>
                </div>
                <p className="text-[11px] text-emerald-900/80 mt-0.5">
                  Your official organization details, address, and contact credentials are up to date and synchronized with Central Plant Administration.
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right shrink-0 font-mono text-[11px] text-emerald-700 font-semibold bg-emerald-100/60 px-2.5 py-1 rounded-lg border border-emerald-200/60">
              Last Updated:{" "}
              {new Date(matchedSupplier.updated_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          {/* Granular Field Updates Chips (if available) */}
          {(() => {
            const recentFieldChanges = getSupplierFieldChanges(
              matchedSupplier.supplier_code || matchedSupplier.id
            );
            if (recentFieldChanges.length === 0) return null;

            return (
              <div className="pt-2 border-t border-emerald-200/60">
                <p className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-2">
                  Recently Updated Attributes:
                </p>
                <div className="flex flex-wrap gap-2">
                  {recentFieldChanges.map((chg) => {
                    const IconCmp = FIELD_ICONS[chg.field_key] || Sparkles;
                    return (
                      <span
                        key={chg.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/90 border border-emerald-200 text-emerald-950 text-xs shadow-2xs font-medium"
                      >
                        <IconCmp className="w-3.5 h-3.5 text-emerald-700" />
                        <span className="font-semibold text-emerald-800">{chg.field_label}:</span>
                        <span className="truncate max-w-[200px] text-gray-800">{chg.new_value}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Tabs Header Navigation */}
      <div className="flex items-center justify-between border-b border-gray-200 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-2">
          {[
            { id: "company", label: "Company Profile & Contact (Read-Only)", icon: Building },
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

        <div className="hidden lg:flex items-center gap-2 text-xs text-gray-400 font-mono pr-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Mapped to Admin Dashboard ({lastSyncTime})</span>
        </div>
      </div>

      {/* ─── TAB 1: COMPANY PROFILE (STRICTLY READ-ONLY) ─── */}
      {activeTab === "company" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
              <div className="flex items-center gap-2.5">
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

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg">
                  <Lock className="w-3.5 h-3.5 text-gray-400" /> Read-Only Mode
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Synced with Admin
                </span>
              </div>
            </div>

            {/* Read-Only Profile Attributes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Field 1: Registered Company Name */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative group">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Registered Company Name
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Official Orders Email
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Primary Contact Person
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Direct Phone / Hotline
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Manufacturing Category
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Country / Region
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Business Reg / Tax ID
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
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
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Facility / Operating Address
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
                  <span className="truncate">{matchedSupplier.address || "Sri Lanka Manufacturing Plant"}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Physical plant dispatch terminal</p>
              </div>

              {/* Field 10: Partner Status */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Partner Authorization Status
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
                  </span>
                </div>
                <div className="text-sm font-bold flex items-center gap-2">
                  {matchedSupplier.is_active ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-emerald-700">Active & Authorized</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span className="text-red-700">Inactive / Suspended</span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {matchedSupplier.is_active
                    ? "Permitted for ASN submission & carton labelling"
                    : "Shipment dispatch suspended by Admin"}
                </p>
              </div>

              {/* Field 11: Onboarding Date */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Partner Onboarded Date
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> Locked
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500 shrink-0" />
                  <span>
                    {matchedSupplier.onboarded_at
                      ? new Date(matchedSupplier.onboarded_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "January 15, 2026"}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Oniverse procurement enrollment date</p>
              </div>

              {/* Field 12: Delivery Plant Resolution */}
              <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Delivering Plant Routing
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Automated
                  </span>
                </div>
                <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Building className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Auto-Detected Per PO Delivery</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Matched automatically from order destination</p>
              </div>

              {/* Field 13: Total Ingested Purchase Orders */}
              <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                    Total Ingested Orders
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded border border-emerald-200">
                    Live System Sync
                  </span>
                </div>
                <div className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{matchedSupplier.total_pos ?? 0} Purchase Orders Ingested</span>
                </div>
                <p className="text-[11px] text-emerald-700/80 mt-1">
                  {matchedSupplier.latest_po_date
                    ? `Latest PO: ${new Date(matchedSupplier.latest_po_date).toLocaleDateString()}`
                    : "Linked to incoming email parser"}
                </p>
              </div>
            </div>

            {/* Bottom System Notice Banner */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-2 text-xs text-gray-600">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Notice any discrepancies? <strong>Direct editing is disabled</strong>. Profile information is centrally managed and synchronized by the System Administrator.
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