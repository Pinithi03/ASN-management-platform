/**
 * Supplier Onboarding & Management Page — Admin Portal
 * Complete CRUD Operations: Create, Read, Update, Delete & Active/Inactive Status Toggle.
 */

import { useState, useEffect } from "react";
import {
  Search,
  Plus,
  CheckCircle2,
  Building2,
  Mail,
  Phone,
  MapPin,
  UserCheck,
  X,
  Clock,
  Sparkles,
  Edit2,
  Trash2,
  AlertTriangle,
  Power,
} from "lucide-react";
import { auditApi } from "@/services/auditApi";

export interface SupplierItem {
  id: string;
  name: string;
  supplier_code: string;
  email: string;
  contact_name?: string;
  phone?: string;
  country?: string;
  category?: string;
  is_active: boolean;
  onboarded_at: string;
}

const INITIAL_SUPPLIERS: SupplierItem[] = [
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
  {
    id: "sup-4",
    name: "Prym Intimates Lanka Ltd",
    supplier_code: "0000058376",
    email: "onboarding@prym-intimates.lk",
    contact_name: "Saman Kumara",
    phone: "+94 11 4567890",
    country: "Sri Lanka",
    category: "Elastics & Fasteners",
    is_active: true,
    onboarded_at: "2026-04-05T09:15:00Z",
  },
  {
    id: "sup-5",
    name: "YKK Lanka Private Ltd",
    supplier_code: "SUP-001",
    email: "sales@ykk.lk",
    contact_name: "Takahiro Sato",
    phone: "+94 11 2489100",
    country: "Sri Lanka",
    category: "Zippers & Fasteners",
    is_active: true,
    onboarded_at: "2026-05-12T11:45:00Z",
  },
];

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<SupplierItem[]>(() => {
    const saved = localStorage.getItem("asn_onboarded_suppliers");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_SUPPLIERS;
      }
    }
    return INITIAL_SUPPLIERS;
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierItem | null>(null);

  // Admin Security Verification State for Deletion
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);

  const handleOpenDeleteModal = (supplier: SupplierItem) => {
    setDeletingSupplier(supplier);
    setAdminPasswordInput("");
    setAdminAuthError(null);
  };

  // ─── DELETE (WITH ADMIN VERIFICATION) ────────────────────────
  const handleDeleteConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingSupplier) return;

    // Verify Admin Credentials (accepts admin, admin123, Abc123@#, password)
    const validPasswords = ["admin", "admin123", "abc123@#", "password"];
    const inputClean = adminPasswordInput.trim().toLowerCase();

    if (!inputClean || !validPasswords.includes(inputClean)) {
      setAdminAuthError("Security Verification Failed: Invalid Admin Password. Access Denied.");
      return;
    }

    const name = deletingSupplier.name;
    const code = deletingSupplier.supplier_code;

    setSuppliers((prev) => prev.filter((s) => s.id !== deletingSupplier.id));
    showToast(`Verified Admin Action: Deleted supplier ${name} (#${code})`);
    auditApi.create({
      action: "SUPPLIER_DELETED",
      entity_type: "SUPPLIER",
      entity_id: code,
      metadata: { name, supplier_code: code },
    }).catch(() => {});
    setDeletingSupplier(null);
    setAdminPasswordInput("");
    setAdminAuthError(null);
  };

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    supplier_code: "",
    email: "",
    contact_name: "",
    phone: "",
    country: "Sri Lanka",
    category: "Textiles & Garments",
    is_active: true,
  });

  // Save suppliers to localStorage on change
  useEffect(() => {
    localStorage.setItem("asn_onboarded_suppliers", JSON.stringify(suppliers));
  }, [suppliers]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ─── CREATE ───────────────────────────────────────────────────
  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.supplier_code || !formData.email) {
      alert("Please fill in mandatory fields: Name, Unique Supplier Code, and Email.");
      return;
    }

    const newSupplier: SupplierItem = {
      id: `sup-${Date.now()}`,
      name: formData.name.trim(),
      supplier_code: formData.supplier_code.trim().toUpperCase(),
      email: formData.email.trim().toLowerCase(),
      contact_name: formData.contact_name.trim(),
      phone: formData.phone.trim(),
      country: formData.country.trim(),
      category: formData.category,
      is_active: formData.is_active,
      onboarded_at: new Date().toISOString(),
    };

    setSuppliers((prev) => [newSupplier, ...prev]);
    showToast(`Successfully onboarded ${newSupplier.name} (#${newSupplier.supplier_code})!`);
    auditApi.create({
      action: "SUPPLIER_ONBOARDED",
      entity_type: "SUPPLIER",
      entity_id: newSupplier.supplier_code,
      metadata: {
        name: newSupplier.name,
        supplier_code: newSupplier.supplier_code,
        email: newSupplier.email,
        category: newSupplier.category,
      },
    }).catch(() => {});
    setIsAddModalOpen(false);
    resetForm();
  };

  // ─── UPDATE ───────────────────────────────────────────────────
  const handleOpenEdit = (supplier: SupplierItem) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      supplier_code: supplier.supplier_code,
      email: supplier.email,
      contact_name: supplier.contact_name || "",
      phone: supplier.phone || "",
      country: supplier.country || "Sri Lanka",
      category: supplier.category || "Textiles & Garments",
      is_active: supplier.is_active,
    });
  };

  const handleUpdateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;

    setSuppliers((prev) =>
      prev.map((s) =>
        s.id === editingSupplier.id
          ? {
              ...s,
              name: formData.name.trim(),
              supplier_code: formData.supplier_code.trim().toUpperCase(),
              email: formData.email.trim().toLowerCase(),
              contact_name: formData.contact_name.trim(),
              phone: formData.phone.trim(),
              country: formData.country.trim(),
              category: formData.category,
              is_active: formData.is_active,
            }
          : s
      )
    );

    showToast(`Updated details for ${formData.name} (#${formData.supplier_code})`);
    auditApi.create({
      action: "SUPPLIER_UPDATED",
      entity_type: "SUPPLIER",
      entity_id: formData.supplier_code,
      metadata: {
        name: formData.name,
        supplier_code: formData.supplier_code,
        email: formData.email,
        is_active: formData.is_active,
      },
    }).catch(() => {});
    setEditingSupplier(null);
    resetForm();
  };

  // ─── TOGGLE ACTIVE / INACTIVE ─────────────────────────────────
  const handleToggleActive = (supplier: SupplierItem) => {
    const nextStatus = !supplier.is_active;
    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplier.id ? { ...s, is_active: nextStatus } : s))
    );
    showToast(
      `${supplier.name} is now marked as ${nextStatus ? "ACTIVE PARTNER" : "INACTIVE / SUSPENDED"}`
    );
    auditApi.create({
      action: nextStatus ? "SUPPLIER_ACTIVATED" : "SUPPLIER_DEACTIVATED",
      entity_type: "SUPPLIER",
      entity_id: supplier.supplier_code,
      metadata: {
        name: supplier.name,
        supplier_code: supplier.supplier_code,
        is_active: nextStatus,
      },
    }).catch(() => {});
  };

  const resetForm = () => {
    setFormData({
      name: "",
      supplier_code: "",
      email: "",
      contact_name: "",
      phone: "",
      country: "Sri Lanka",
      category: "Textiles & Garments",
      is_active: true,
    });
  };

  // ─── FILTERING ────────────────────────────────────────────────
  const filteredSuppliers = suppliers.filter((s) => {
    if (statusFilter === "ACTIVE" && !s.is_active) return false;
    if (statusFilter === "INACTIVE" && s.is_active) return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.supplier_code.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.contact_name && s.contact_name.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q))
    );
  });

  const activeCount = suppliers.filter((s) => s.is_active).length;
  const inactiveCount = suppliers.length - activeCount;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplier Onboarding & Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Onboard, update, and manage Calzedonia partner suppliers with unique identification codes for automated email tracking.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 transition-all"
        >
          <Plus className="h-4.5 w-4.5" />
          Onboard New Supplier
        </button>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-xl flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Onboarded</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{suppliers.length}</p>
            </div>
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-brand-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Partners</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
            </div>
            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Inactive / Suspended</p>
              <p className="text-2xl font-bold text-red-500 mt-1">{inactiveCount}</p>
            </div>
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <Power className="w-5 h-5 text-red-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Controls: Search & Status Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-gray-200 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by supplier code, name, email, contact..."
            className="h-9.5 w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === st
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {st === "ALL" ? `All (${suppliers.length})` : st === "ACTIVE" ? `Active (${activeCount})` : `Inactive (${inactiveCount})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Suppliers Card Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSuppliers.map((s) => (
          <div
            key={s.id}
            className={`rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
              s.is_active ? "border-gray-200" : "border-red-200 bg-red-50/20"
            }`}
          >
            <div>
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate">{s.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-brand-50 text-brand-700 rounded-md border border-brand-200">
                      #{s.supplier_code}
                    </span>
                    {s.category && (
                      <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md font-medium">
                        {s.category}
                      </span>
                    )}
                  </div>
                </div>

                {/* Active Toggle Badge Button */}
                <button
                  onClick={() => handleToggleActive(s)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border transition-all shrink-0 ${
                    s.is_active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                  }`}
                  title={s.is_active ? "Click to deactivate partner" : "Click to activate partner"}
                >
                  <Power className="w-3 h-3" />
                  <span>{s.is_active ? "Active" : "Inactive"}</span>
                </button>
              </div>

              {/* Details Body */}
              <div className="mt-4 space-y-2 text-xs text-gray-600 border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2 truncate">
                  <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate font-medium">{s.email}</span>
                </div>
                {s.contact_name && (
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>Contact: <strong className="text-gray-800">{s.contact_name}</strong></span>
                  </div>
                )}
                {s.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>{s.phone}</span>
                  </div>
                )}
                {s.country && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>{s.country}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card Footer Actions (Edit & Delete) */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <Clock className="w-3 h-3" />
                {new Date(s.onboarded_at).toLocaleDateString()}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEdit(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  title="Edit Supplier Details"
                >
                  <Edit2 className="w-3 h-3 text-gray-500" />
                  Edit
                </button>
                <button
                  onClick={() => handleOpenDeleteModal(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  title="Delete Supplier"
                >
                  <Trash2 className="w-3 h-3 text-red-500" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── CREATE / ONBOARD MODAL ─────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-600" />
                <h2 className="text-lg font-bold text-gray-900">Onboard New Supplier Partner</h2>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Supplier Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. South Asia Textiles Ltd"
                  className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Unique Supplier Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.supplier_code}
                    onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })}
                    placeholder="e.g. 0000080589 or SUP-001"
                    className="w-full h-10 px-3 text-sm font-mono font-semibold rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">Used for automated email tracking</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Official Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="orders@supplier.com"
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    placeholder="e.g. Wasitha Maheshitha"
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+94 11 2345678"
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  >
                    <option value="Textiles & Garments">Textiles & Garments</option>
                    <option value="Knit & Cotton Fabric">Knit & Cotton Fabric</option>
                    <option value="Dyed & Printed Fabric">Dyed & Printed Fabric</option>
                    <option value="Thread & Trims">Thread & Trims</option>
                    <option value="Elastics & Fasteners">Elastics & Fasteners</option>
                    <option value="Packaging & Labels">Packaging & Labels</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="Sri Lanka"
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 rounded-xl shadow-sm transition-all"
                >
                  Onboard Partner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── UPDATE / EDIT MODAL ───────────────────────────────────── */}
      {editingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-brand-600" />
                <h2 className="text-lg font-bold text-gray-900">Edit Supplier Details</h2>
              </div>
              <button
                onClick={() => setEditingSupplier(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSupplier} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Supplier Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Unique Supplier Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.supplier_code}
                    onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })}
                    className="w-full h-10 px-3 text-sm font-mono font-semibold rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Official Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  >
                    <option value="Textiles & Garments">Textiles & Garments</option>
                    <option value="Knit & Cotton Fabric">Knit & Cotton Fabric</option>
                    <option value="Dyed & Printed Fabric">Dyed & Printed Fabric</option>
                    <option value="Thread & Trims">Thread & Trims</option>
                    <option value="Elastics & Fasteners">Elastics & Fasteners</option>
                    <option value="Packaging & Labels">Packaging & Labels</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                  />
                  <span className="text-sm font-semibold text-gray-800">Supplier Account Active</span>
                </label>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingSupplier(null)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DELETE CONFIRMATION WITH ADMIN VERIFICATION MODAL ──────── */}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-red-100 shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900">Admin Security Verification Required</h3>
              <p className="text-xs text-gray-500 mt-1">
                You are deleting <strong className="text-gray-900">{deletingSupplier.name}</strong> (<span className="font-mono font-bold text-brand-700">#{deletingSupplier.supplier_code}</span>).
              </p>
              <p className="text-[11px] text-red-600 font-medium bg-red-50 p-2.5 rounded-xl border border-red-100 mt-2">
                ⚠️ Danger: This action revokes supplier portal access and unlinks automated tracking rules.
              </p>
            </div>

            {/* Admin Verification Form */}
            <form onSubmit={handleDeleteConfirm} className="space-y-3 text-left pt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Verify Admin Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={adminPasswordInput}
                  onChange={(e) => {
                    setAdminPasswordInput(e.target.value);
                    setAdminAuthError(null);
                  }}
                  placeholder="Enter admin password (e.g. admin or admin123)..."
                  className="w-full h-10 px-3 text-sm rounded-xl border border-gray-300 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <span className="text-[10px] text-gray-400 mt-0.5 block">
                  Default dev admin password: <code className="text-gray-700">admin</code>
                </span>
              </div>

              {adminAuthError && (
                <div className="p-2.5 bg-red-100 text-red-800 text-xs font-semibold rounded-lg border border-red-200">
                  {adminAuthError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingSupplier(null);
                    setAdminPasswordInput("");
                    setAdminAuthError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl shadow-sm transition-all"
                >
                  Verify & Delete Partner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}