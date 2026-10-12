import { useState } from "react";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Globe,
  Tag,
  UserCheck,
  FileText,
  Boxes,
  Lock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { SupplierItem } from "@/pages/Suppliers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supplierApi } from "@/services/supplierApi";

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [huInput, setHuInput] = useState("");
  const [isSavingHu, setIsSavingHu] = useState(false);
  const [huError, setHuError] = useState<string | null>(null);
  const [huSuccess, setHuSuccess] = useState<string | null>(null);

  // Live query directly from PostgreSQL backend API (/api/v1/suppliers)
  const { data: serverSuppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => supplierApi.list(),
    refetchInterval: 5000,
  });

  const suppliersList: SupplierItem[] = serverSuppliers ?? [];

  // Match the active logged-in supplier with Admin Dashboard registry
  const currentSupplierCode = user?.supplier_code || "";
  const cleanCode = currentSupplierCode.replace(/^0+/, "");

  const found = suppliersList.find(
    (s) =>
      (currentSupplierCode && s.supplier_code === currentSupplierCode) ||
      (cleanCode && s.supplier_code.replace(/^0+/, "") === cleanCode) ||
      (user?.supplier_id && s.id === user.supplier_id) ||
      (user?.supplier_name && s.name.toLowerCase() === user.supplier_name.toLowerCase())
  );

  const matchedSupplier: SupplierItem = found || {
    id: user?.supplier_id || "profile-user",
    name: user?.supplier_name || user?.name || "Supplier Partner",
    supplier_code: user?.supplier_code || "N/A",
    email: user?.email || "partner@plant.local",
    contact_name: user?.name || "Partner Representative",
    phone: "N/A",
    country: "Sri Lanka",
    category: "Textiles & Garments",
    is_active: true,
    onboarded_at: new Date().toISOString(),
  };

  const isHuLocked = Boolean(matchedSupplier.current_hu_number || matchedSupplier.hu_locked);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const [isAdminEditOpen, setIsAdminEditOpen] = useState(false);

  const handleSaveHu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!huInput.trim()) return;
    setIsSavingHu(true);
    setHuError(null);
    setHuSuccess(null);
    try {
      const targetId =
        matchedSupplier.id && matchedSupplier.id !== "profile-user"
          ? matchedSupplier.id
          : matchedSupplier.supplier_code;

      await supplierApi.setHuNumber(targetId, huInput.trim());
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setHuSuccess("Handling Unit (HU) sequence number saved successfully and locked.");
      setHuInput("");
      setIsAdminEditOpen(false);
    } catch (err: any) {
      setHuError(err?.response?.data?.detail || err?.message || "Failed to configure HU number.");
    } finally {
      setIsSavingHu(false);
    }
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

      {/* ─── HANDLING UNIT (HU) SEQUENCE NUMBER SECTION ─── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                Handling Unit (HU) Sequence Number
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Current running HU barcode identifier generated by your facility for packing cartons
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isHuLocked ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                Locked & In Production
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                Initial Setup Required
              </span>
            )}
            {isAdmin && isHuLocked && (
              <button
                type="button"
                onClick={() => {
                  setIsAdminEditOpen(!isAdminEditOpen);
                  if (!isAdminEditOpen) setHuInput(matchedSupplier.current_hu_number || "");
                }}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors"
              >
                {isAdminEditOpen ? "Cancel Admin Edit" : "Admin Edit"}
              </button>
            )}
          </div>
        </div>

        {/* Status Alerts */}
        {huSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">HU Sequence Successfully Configured</p>
              <p className="mt-0.5 text-emerald-700">{huSuccess}</p>
            </div>
          </div>
        )}

        {huError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Configuration Error</p>
              <p className="mt-0.5 text-red-700">{huError}</p>
            </div>
          </div>
        )}

        {isHuLocked && !isAdminEditOpen ? (
          /* LOCKED STATE: Read-Only View for Supplier */
          <div className="space-y-4">
            <div className="p-5 rounded-xl border border-gray-200 bg-gray-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Active Generating Handling Unit Number
                </span>
                <div className="font-mono text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-emerald-600">#</span>
                  <span>{matchedSupplier.current_hu_number || "Initialized"}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Synchronized with the automated packing and dispatch pipeline.
                </p>
              </div>
              <div className="sm:text-right">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-2xs">
                  <Lock className="w-3.5 h-3.5 text-gray-500" />
                  Read-Only Mode
                </span>
              </div>
            </div>

            {/* Notice about contacting Admin */}
            <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200/80 flex items-start gap-3 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Sequence Locked to Prevent Collisions</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  This field is editable only once during onboarding to ensure unique 20-digit handling unit numbering. 
                  If you need to change, re-align, or increment your current HU sequence, please request assistance from your{" "}
                  <strong>System Administrator</strong>. Admins can update this field directly from the Admin Dashboard.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* UNLOCKED OR ADMIN EDIT STATE: Input Form */
          <form onSubmit={handleSaveHu} className="space-y-4">
            <div className="p-4 bg-rose-50/80 rounded-xl border border-rose-200/90 flex items-start gap-3 text-xs text-rose-950 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-900">
                  {isAdminEditOpen ? "Administrator Sequence Override" : "Initial One-Time HU Setup"}
                </p>
                <p className="mt-0.5 text-rose-800 leading-relaxed">
                  {isAdminEditOpen
                    ? "As a System Administrator, you can update this supplier's current generating HU number. This will update the supplier record and realign the system sequence."
                    : "Please enter the current Handling Unit (HU) number your factory or packing line is currently generating. Once you confirm and save this value, it will be locked and cannot be altered from this portal without administrator assistance."}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Current Generating HU Number
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={huInput}
                    onChange={(e) => setHuInput(e.target.value)}
                    placeholder="e.g. 10000000000000000001 or current running serial"
                    className="w-full h-11 px-3.5 text-sm font-mono rounded-xl border border-gray-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-gray-50/50 focus:bg-white transition-colors"
                    disabled={isSavingHu}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSavingHu || !huInput.trim()}
                  className="h-11 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isSavingHu ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving & Locking...
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      {isAdminEditOpen ? "Update HU Sequence" : "Confirm & Lock HU Sequence"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* ─── OFFICIAL COMPANY PROFILE DETAILS ─── */}
      <div className="space-y-6 animate-in fade-in duration-150">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
          <div className="pb-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">Official Company Profile Details</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Sourced directly from the Plant Admin Supplier Registry
            </p>
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

            {/* Field 2: Supplier Partner Code */}
            <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 relative">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                  Supplier Partner Code
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
              <p className="text-[11px] text-gray-400 mt-1">Raw material & textile classification</p>
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

          {/* Support Notice */}
          <div className="p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-200/70 flex items-center gap-2.5 text-xs text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              If you need to make any changes to your company profile, please contact the <strong>System Administrator</strong> for support.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}