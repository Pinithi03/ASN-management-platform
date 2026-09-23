/**
 * Supplier Partner Profile & Settings Page — Supplier Portal
 * Allows supplier partners to view & update company profile, contact details,
 * manage plant connections, and manage security settings.
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
  Save,
  RefreshCw,
  Sparkles,
  Sliders,
  Bell,
  Globe,
  Tag,
  UserCheck,
  Building,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { auditApi } from "@/services/auditApi";
import { cn } from "@/utils/cn";

const SRI_LANKA_PLANTS = [
  { name: "Sirio Ltd", code: "SIRIO (PPA1)", location: "Badalgama", isPrimary: true },
  { name: "Benji Ltd", code: "BENJI (PPC1)", location: "Bingiriya", isPrimary: false },
  { name: "Omega Line Ltd", code: "OMEGA (PPA2)", location: "Sandalankawa", isPrimary: false },
  { name: "Alpha Apparels Ltd", code: "ALPHA (PPA3)", location: "Polgahawela", isPrimary: false },
  { name: "Vavuniya Apparels Ltd", code: "VAVUNIYA (PPA4)", location: "Vavuniya", isPrimary: false },
];

export default function Profile() {
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<"company" | "plants" | "security">("company");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form State initialized from user state
  const [companyName, setCompanyName] = useState(user?.supplier_name || user?.full_name || "Coats Thread Exports Ltd");
  const [supplierCode] = useState(user?.supplier_code || "0000018194");
  const [email, setEmail] = useState(user?.email || "orders@coatsthread.lk");
  const [contactName, setContactName] = useState("Kamal Wickramasinghe");
  const [phone, setPhone] = useState("+94 11 4712000");
  const [country, setCountry] = useState("Sri Lanka");
  const [category, setCategory] = useState("Thread & Trims");
  const [taxId, setTaxId] = useState("PV-10293847");

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Notification Toggles
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [asnConfirmations, setAsnConfirmations] = useState(true);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    // 1. Update shared localStorage suppliers registry
    const savedStr = localStorage.getItem("asn_onboarded_suppliers");
    let list = savedStr ? JSON.parse(savedStr) : [];
    if (!list || list.length === 0) {
      list = [
        {
          id: "sup-1",
          name: "Coats Thread Exports Ltd",
          supplier_code: "0000018194",
          email: "orders@coatsthread.lk",
          contact_name: "Kamal Wickramasinghe",
          phone: "+94 11 4712000",
          country: "Sri Lanka",
          category: "Thread & Trims",
          is_active: true,
          onboarded_at: "2026-01-15T08:30:00Z",
        },
        {
          id: "sup-2",
          name: "Hayleys Fabric PLC",
          supplier_code: "0000001122",
          email: "apparel.orders@hayleysfabric.com",
          contact_name: "Nimali Perera",
          phone: "+94 34 2280000",
          country: "Sri Lanka",
          category: "Knit & Cotton Fabric",
          is_active: true,
          onboarded_at: "2026-02-01T10:00:00Z",
        },
        {
          id: "sup-3",
          name: "South Asia Textiles Ltd",
          supplier_code: "0000080589",
          email: "supply@southasiatextiles.com",
          contact_name: "Wasitha Maheshitha",
          phone: "+94 11 2855123",
          country: "Sri Lanka",
          category: "Dyed & Printed Fabric",
          is_active: true,
          onboarded_at: "2026-03-10T14:20:00Z",
        },
      ];
    }

    const currentCode = supplierCode || user?.supplier_code || "0000018194";
    const updatedList = list.map((item: any) => {
      if (item.supplier_code === currentCode || item.id === user?.supplier_id) {
        return {
          ...item,
          name: companyName.trim(),
          email: email.trim().toLowerCase(),
          contact_name: contactName.trim(),
          phone: phone.trim(),
          country: country.trim(),
          category: category,
          recently_updated_by_supplier: true,
          last_profile_updated_at: new Date().toISOString(),
        };
      }
      return item;
    });

    localStorage.setItem("asn_onboarded_suppliers", JSON.stringify(updatedList));

    // 2. Emit Audit Log for system admin tracking
    auditApi.create({
      action: "SUPPLIER_PROFILE_UPDATED",
      entity_type: "SUPPLIER",
      entity_id: currentCode,
      metadata: {
        name: companyName,
        supplier_code: currentCode,
        email: email,
        contact_name: contactName,
        phone: phone,
        category: category,
        updated_by: "SUPPLIER_SELF_SERVICE",
      },
    }).catch(() => {});

    setTimeout(() => {
      setSaving(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    }, 600);
  };

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
                <h1 className="text-xl font-bold tracking-tight text-white">{companyName}</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-400/20 text-emerald-100 border border-emerald-300/30 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" /> Verified Partner
                </span>
              </div>
              <p className="text-xs text-emerald-100/80 mt-1 flex items-center gap-3 font-mono">
                <span>Supplier Code: <strong className="text-white font-bold">#{supplierCode}</strong></span>
                <span>•</span>
                <span>Category: {category}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-xl text-xs text-emerald-100">
              <p className="text-[10px] text-emerald-200 uppercase font-bold">Primary Dispatch Plant</p>
              <p className="font-semibold text-white mt-0.5">{user?.company_name || "Sirio Ltd"} ({user?.company_code || "SIRIO"})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Header Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: "company", label: "Company Profile & Contact", icon: Building },
          { id: "plants", label: "Oniverse Plants & ASN Rules", icon: Sliders },
          { id: "security", label: "Security & Credentials", icon: Lock },
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

      {/* Tab 1: Company Profile & Contact */}
      {activeTab === "company" && (
        <form onSubmit={handleSaveProfile} className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-gray-900">Official Company Profile</h2>
              </div>
              {savedSuccess && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Profile Changes Saved!
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Registered Company Name
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Unique Calzedonia Supplier Code (Read-Only)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled
                    value={supplierCode}
                    className="w-full h-10 px-3.5 text-sm font-mono font-bold rounded-xl border border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed"
                  />
                  <ShieldCheck className="w-4 h-4 text-emerald-600 absolute right-3 top-3" />
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5 block">Managed by Oniverse Plant Administrator</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Official Orders Email
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none pl-9"
                  />
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Primary Contact Person Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none pl-9"
                  />
                  <UserCheck className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Direct Phone / Mobile
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none pl-9"
                  />
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Manufacturing Category
                </label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none pl-9"
                  >
                    <option value="Thread & Trims">Thread & Trims</option>
                    <option value="Knit & Cotton Fabric">Knit & Cotton Fabric</option>
                    <option value="Dyed & Printed Fabric">Dyed & Printed Fabric</option>
                    <option value="Elastics & Fasteners">Elastics & Fasteners</option>
                    <option value="Packaging & Labels">Packaging & Labels</option>
                  </select>
                  <Tag className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Country / Region
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none pl-9"
                  />
                  <Globe className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Business Registration / Tax ID
                </label>
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="w-full h-10 px-3.5 text-sm font-mono rounded-xl border border-gray-200 bg-gray-50/50 text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Profile Changes
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tab 2: Oniverse Plants & Dispatch Rules */}
      {activeTab === "plants" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Registered Oniverse Group Plants</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Your supplier account is authorized to dispatch ASNs to the following Sri Lanka manufacturing plants:
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                5 Authorized Plants
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SRI_LANKA_PLANTS.map((plant) => (
                <div
                  key={plant.name}
                  className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex items-start justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-gray-900">{plant.name}</p>
                      {plant.isPrimary && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-gray-500 mt-0.5">{plant.code}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-gray-400" /> {plant.location}, Sri Lanka
                    </p>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ONLINE
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Barcode & SSCC Configuration */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Sliders className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-gray-900">Automated Barcode & Handling Unit (HU) Standard</h2>
            </div>

            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl text-xs text-indigo-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" /> 20-Digit SSCC Standard Active
              </p>
              <p className="text-indigo-800">
                Your 10-digit Supplier Code prefix <code className="font-mono bg-white px-1 py-0.5 rounded border border-indigo-200 font-bold">{supplierCode}</code> is automatically prepended to generated Handling Unit (HU) barcodes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Security & Credentials */}
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
                  <p className="text-gray-500">Receive instant email notifications when new POs are ingested for your supplier code.</p>
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
                  <p className="text-gray-500">Receive confirmation emails when Calzedonia XML submission is generated.</p>
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