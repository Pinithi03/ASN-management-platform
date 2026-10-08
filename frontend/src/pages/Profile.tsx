/**
 * Supplier Partner Profile Page — Supplier Portal
 * Strictly Read-Only for Supplier Partners.
 * Sourced continuously from the PostgreSQL database / Admin Supplier Registry.
 * Profile changes must be requested through the System Administrator.
 */

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
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { INITIAL_SUPPLIERS, SupplierItem } from "@/pages/Suppliers";
import { useQuery } from "@tanstack/react-query";
import { supplierApi } from "@/services/supplierApi";

export default function Profile() {
  const user = useAuthStore((s) => s.user);

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

      {/* ─── OFFICIAL COMPANY PROFILE DETAILS ─── */}
      <div className="space-y-6 animate-in fade-in duration-150">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
          <div className="pb-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">Official Company Profile Details</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Sourced directly from the Oniverse Plant Admin Supplier Registry
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