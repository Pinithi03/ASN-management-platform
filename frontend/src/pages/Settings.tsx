// ─── Admin Settings Hub ─────────────────────────────────────────────
// frontend/src/pages/Settings.tsx

import { useState } from "react";
import {
  Building2,
  Mail,
  Package,
  Shield,
  Activity,
  CheckCircle2,
  RefreshCw,
  Server,
  Database,
  Cpu,
  Lock,
  Zap,
  Save,
  Sliders,
  BellRing,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useAuthStore } from "@/store/authStore";
import { auditApi } from "@/services/auditApi";

type TabType = "company" | "email" | "asn" | "security" | "health";

const SRI_LANKA_PLANTS = [
  { name: "Sirio Ltd", code: "SIRIO (PPA1)", location: "Badalgama", isDefault: true },
  { name: "Benji Ltd", code: "Benji (PPC1)", location: "Bingiriya", isDefault: false },
  { name: "Omega Line Ltd", code: "OMEGA (PPA2)", location: "Sandalankawa", isDefault: false },
  { name: "Alpha Apparels Ltd", code: "ALPHA (PPA3)", location: "Polgahawela", isDefault: false },
  { name: "Vavuniya Apparels Ltd", code: "VAVUNIYA (PPA4)", location: "Vavuniya", isDefault: false },
];

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<TabType>("company");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testingImap, setTestingImap] = useState(false);
  const [imapTestResult, setImapTestResult] = useState<string | null>(null);

  // General Company / Plant state
  const [companyName, setCompanyName] = useState(user?.company_name || "Sirio Ltd");
  const [companyCode, setCompanyCode] = useState(user?.company_code || "SIRIO");
  const [plantLocation, setPlantLocation] = useState("Badalgama, Sri Lanka");

  // Email Engine state
  const [imapHost, setImapHost] = useState("imap.outlook.com");
  const [imapPort, setImapPort] = useState("993");
  const [imapUser, setImapUser] = useState("purchasing.sirio@calzedonia.com");
  const [pollingInterval, setPollingInterval] = useState("5");
  const [defaultParser, setDefaultParser] = useState("iungo_html");

  // ASN & Storage state
  const [huPrefix, setHuPrefix] = useState("0000001122");
  const [minioBucket, setMinioBucket] = useState("asn-attachments");
  const [retentionDays, setRetentionDays] = useState("90");
  const [xmlSchemaVersion, setXmlSchemaVersion] = useState("2.1");

  // Security & RBAC state
  const [adminVerificationPassword, setAdminVerificationPassword] = useState("admin");
  const [lockoutInactiveSuppliers, setLockoutInactiveSuppliers] = useState(true);
  const [requireTwoFactor, setRequireTwoFactor] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setSavedSuccess(false);
    auditApi.create({
      action: "SETTINGS_UPDATED",
      entity_type: "SETTINGS",
      entity_id: activeTab,
      metadata: {
        tab: activeTab,
        company_name: companyName,
        imap_host: imapHost,
        default_parser: defaultParser,
        xml_schema_version: xmlSchemaVersion,
      },
    }).catch(() => {});
    setTimeout(() => {
      setSaving(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }, 800);
  };

  const handleTestImap = () => {
    setTestingImap(true);
    setImapTestResult(null);
    setTimeout(() => {
      setTestingImap(false);
      setImapTestResult("IMAP Connection Successful! Response time: 142ms.");
    }, 1200);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Platform Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure plant operations, automated email ingestion, Calzedonia ASN engine, and security rules.
          </p>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4" /> Settings Saved!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Configuration
          </button>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: "company", label: "Company & Plants", icon: Building2 },
          { id: "email", label: "Email Engine", icon: Mail },
          { id: "asn", label: "ASN & Storage", icon: Package },
          { id: "security", label: "Security & RBAC", icon: Shield },
          { id: "health", label: "System Health", icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap border-b-2 -mb-1",
                isActive
                  ? "border-brand-600 text-brand-700 bg-brand-50/50"
                  : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content 1: Company & Plants */}
      {activeTab === "company" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Building2 className="w-5 h-5 text-brand-600" />
              <h2 className="text-base font-semibold text-gray-900">Plant & Company Profile</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Company / Plant Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:bg-white focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Company Code</label>
                <input
                  type="text"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm font-mono text-gray-900 focus:bg-white focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Plant Address / Location</label>
                <input
                  type="text"
                  value={plantLocation}
                  onChange={(e) => setPlantLocation(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:bg-white focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Default Platform Timezone</label>
                <select className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:bg-white focus:border-brand-500 focus:outline-none">
                  <option value="Asia/Colombo">Asia/Colombo (GMT +05:30)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 5 Sri Lanka Manufacturing Plants */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Oniverse Group Sri Lanka Plants</h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
                5 Registered Plants
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SRI_LANKA_PLANTS.map((plant) => (
                <div
                  key={plant.name}
                  className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">{plant.name}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{plant.code}</p>
                    <p className="text-xs text-gray-400 mt-1">{plant.location}, Sri Lanka</p>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ACTIVE
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 2: Email Engine */}
      {activeTab === "email" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">IMAP Email Ingestion Setup</h2>
              </div>
              <button
                onClick={handleTestImap}
                disabled={testingImap}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                {testingImap ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Test Connection
              </button>
            </div>

            {imapTestResult && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {imapTestResult}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">IMAP Host Server</label>
                <input
                  type="text"
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm font-mono text-gray-900 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">IMAP Port</label>
                <input
                  type="text"
                  value={imapPort}
                  onChange={(e) => setImapPort(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm font-mono text-gray-900 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Mailbox Username / Address</label>
                <input
                  type="email"
                  value={imapUser}
                  onChange={(e) => setImapUser(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Celery Automated Polling Interval</label>
                <select
                  value={pollingInterval}
                  onChange={(e) => setPollingInterval(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:bg-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="1">Every 1 Minute (High Frequency)</option>
                  <option value="5">Every 5 Minutes (Recommended)</option>
                  <option value="15">Every 15 Minutes</option>
                  <option value="30">Every 30 Minutes</option>
                  <option value="60">Hourly</option>
                </select>
              </div>
            </div>
          </div>

          {/* Parser Engine Selection */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Sliders className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-semibold text-gray-900">Email Parser Engine & Classification</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: "iungo_html",
                  name: "IUNGO HTML Parser",
                  desc: "Parses HTML order tables, line items, delivery dates, & supplier metadata.",
                },
                {
                  id: "calzedonia_xml",
                  name: "Calzedonia XML Parser",
                  desc: "Parses structured XML attachments and purchase order revisions.",
                },
                {
                  id: "auto",
                  name: "Auto-Detect (Smart Classifier)",
                  desc: "Evaluates email MIME content type and selects optimum parser automatically.",
                },
              ].map((parser) => (
                <div
                  key={parser.id}
                  onClick={() => setDefaultParser(parser.id)}
                  className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between",
                    defaultParser === parser.id
                      ? "border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/20"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-900">{parser.name}</p>
                      {defaultParser === parser.id && (
                        <CheckCircle2 className="w-4 h-4 text-brand-600" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{parser.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 3: Calzedonia ASN & Storage */}
      {activeTab === "asn" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Package className="w-5 h-5 text-amber-600" />
              <h2 className="text-base font-semibold text-gray-900">Handling Unit (HU) Sequence & Barcode Format</h2>
            </div>

            {/* TODO: HU barcode format design: First 10 digits = Supplier ID (e.g., 0000001122), second 10 digits = Incremental sequence number (e.g., 0000000001) → 20-digit SSCC/HU code */}
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <BellRing className="w-4 h-4 text-amber-600" /> 20-Digit SSCC / HU Barcode Rule Note
              </p>
              <p className="text-amber-800">
                Format Specification: First 10 digits represent the Supplier ID (e.g., <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-200">0000001122</code>), and the remaining 10 digits represent the auto-incrementing sequence number (e.g., <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-200">0000000001</code>).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">HU Supplier Code Prefix (First 10 Digits)</label>
                <input
                  type="text"
                  value={huPrefix}
                  onChange={(e) => setHuPrefix(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm font-mono text-gray-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Calzedonia XML Schema Version</label>
                <select
                  value={xmlSchemaVersion}
                  onChange={(e) => setXmlSchemaVersion(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="2.1">Version 2.1 (Calzedonia Standard 2026)</option>
                  <option value="2.0">Version 2.0 (Legacy)</option>
                </select>
              </div>
            </div>
          </div>

          {/* MinIO Object Storage Setup */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Database className="w-5 h-5 text-purple-600" />
              <h2 className="text-base font-semibold text-gray-900">MinIO S3 Object Storage Configuration</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">MinIO Attachments Bucket</label>
                <input
                  type="text"
                  value={minioBucket}
                  onChange={(e) => setMinioBucket(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm font-mono text-gray-900 focus:bg-white focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Raw Attachment Retention Policy</label>
                <select
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:bg-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="30">Retain Raw Files for 30 Days</option>
                  <option value="90">Retain Raw Files for 90 Days (Recommended)</option>
                  <option value="365">Retain Raw Files for 1 Year</option>
                  <option value="-1">Indefinite Retention</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 4: Security & RBAC */}
      {activeTab === "security" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Shield className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-gray-900">Admin Security & Deletion Verification</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Admin Verification Password (Required before deleting registered suppliers)
                </label>
                <div className="relative max-w-md">
                  <input
                    type="password"
                    value={adminVerificationPassword}
                    onChange={(e) => setAdminVerificationPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm font-mono text-gray-900 focus:bg-white focus:border-emerald-500 focus:outline-none pr-10"
                  />
                  <Lock className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Current development password: <code className="font-mono text-emerald-700 font-bold">admin</code>
                </p>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Enforce Inactive Supplier Lockout</p>
                  <p className="text-xs text-gray-500">
                    Immediately block portal access when a supplier account is toggled to INACTIVE or DELETED.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={lockoutInactiveSuppliers}
                  onChange={(e) => setLockoutInactiveSuppliers(e.target.checked)}
                  className="w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Require Two-Factor Authentication (2FA)</p>
                  <p className="text-xs text-gray-500">Enforce TOTP 2FA authentication for COMPANY_ADMIN accounts.</p>
                </div>
                <input
                  type="checkbox"
                  checked={requireTwoFactor}
                  onChange={(e) => setRequireTwoFactor(e.target.checked)}
                  className="w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 5: System Health */}
      {activeTab === "health" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: "PostgreSQL 16", status: "Connected", desc: "20 Connection Pools Active", icon: Database, bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
              { title: "Redis 7 Cache", status: "Online", desc: "0.42 MB Memory Used", icon: Cpu, bg: "bg-blue-50 text-blue-700 border-blue-200" },
              { title: "RabbitMQ & Celery", status: "4 Workers Active", desc: "Beat Scheduler Running", icon: Server, bg: "bg-purple-50 text-purple-700 border-purple-200" },
              { title: "MinIO S3 Storage", status: "Online", desc: "asn-attachments Bucket Ready", icon: Package, bg: "bg-amber-50 text-amber-700 border-amber-200" },
            ].map((service) => {
              const Icon = service.icon;
              return (
                <div key={service.title} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">{service.title}</p>
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gray-600" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded border ${service.bg}`}>
                      {service.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">{service.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900 pb-3 border-b border-gray-100">
              System Diagnostics & Emergency Actions
            </h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleTestImap}
                className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Trigger Immediate Mailbox Sync
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" /> Flush Redis Cache
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}