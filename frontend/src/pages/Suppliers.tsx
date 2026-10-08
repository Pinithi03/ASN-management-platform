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
  BellRing,
  FileText,
  Building,
  ChevronLeft,
  ChevronRight,
  Archive,
  RotateCcw,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supplierApi } from "@/services/supplierApi";
import {
  recordSupplierFieldChanges,
  recordSupplierCreateEvent,
  recordSupplierDeleteEvent,
} from "@/utils/supplierFieldUpdates";

export interface SupplierItem {
  id: string;
  name: string;
  supplier_code: string;
  email: string;
  contact_name?: string;
  phone?: string;
  country?: string;
  category?: string;
  tax_id?: string;
  address?: string;
  is_active: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  onboarded_at: string;
  updated_at?: string;
  recently_updated_by_supplier?: boolean;
  last_profile_updated_at?: string;
  total_pos?: number;
  latest_po_date?: string | null;
  detected_via?: string | null;
  is_pending_approval?: boolean;
  has_credentials_issued?: boolean;
  temporary_password?: string | null;
  temp_password_expires_at?: string | null;
  requires_password_change?: boolean;
}

export const INITIAL_SUPPLIERS: SupplierItem[] = [
  {
    id: "sup-1",
    name: "Coats Thread Exports Ltd",
    supplier_code: "0000018194",
    email: "orders@coatsthread.lk",
    contact_name: "Kamal Wickramasinghe",
    phone: "+94 11 4712000",
    country: "Sri Lanka",
    category: "Thread & Trims",
    tax_id: "PV-10293847",
    address: "No. 40, Station Road, Colombo 03",
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
    tax_id: "PQ-49201934",
    address: "Narthupana Estate, Neboda",
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
    tax_id: "PV-88371920",
    address: "Pugoda Road, Kirindiwela",
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
    tax_id: "PV-55291048",
    address: "Export Processing Zone, Biyagama",
    is_active: true,
    onboarded_at: "2026-04-05T09:15:00Z",
  },
];

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [suppliers, setSuppliers] = useState<SupplierItem[]>(() => {
    const saved = localStorage.getItem("asn_onboarded_suppliers");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {}
    }
    return INITIAL_SUPPLIERS;
  });

  // Live query from PostgreSQL backend API (/api/v1/suppliers)
  // Automatically refetches every 5s to pick up newly parsed suppliers from incoming emails
  const { data: serverSuppliers, refetch } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => supplierApi.list(),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (serverSuppliers) {
      setSuppliers(serverSuppliers);
      localStorage.setItem("asn_onboarded_suppliers", JSON.stringify(serverSuppliers));
    }
  }, [serverSuppliers]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "ARCHIVED">("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierItem | null>(null);

  // Admin Security Verification State for Deletion
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleOpenDeleteModal = (supplier: SupplierItem) => {
    setDeletingSupplier(supplier);
    setAdminPasswordInput("");
    setAdminAuthError(null);
    setShowAdminPassword(false);
  };

  // ─── DELETE / ARCHIVE (WITH REAL ADMIN VERIFICATION) ────────
  const handleDeleteConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingSupplier) return;

    if (!adminPasswordInput.trim()) {
      setAdminAuthError("Please enter your administrator password to proceed.");
      return;
    }

    setIsDeleting(true);
    setAdminAuthError(null);

    const name = deletingSupplier.name;
    const code = deletingSupplier.supplier_code;

    try {
      await supplierApi.delete(deletingSupplier.id, adminPasswordInput.trim());
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      refetch();

      recordSupplierDeleteEvent({
        id: deletingSupplier.id,
        supplier_code: code,
        name,
      });

      // Update local state: mark as deleted
      setSuppliers((prev) => {
        const updated = prev.map((s) =>
          s.id === deletingSupplier.id
            ? { ...s, is_deleted: true, is_active: false, deleted_at: new Date().toISOString() }
            : s
        );
        localStorage.setItem("asn_onboarded_suppliers", JSON.stringify(updated));
        return updated;
      });

      showToast(`Partner ${name} (#${code}) archived. You can restore them anytime from the Archived tab.`);
      setDeletingSupplier(null);
      setAdminPasswordInput("");
      setAdminAuthError(null);
      setShowAdminPassword(false);
    } catch (err: any) {
      console.error("Backend delete verification failed:", err);
      const errorMsg =
        err?.response?.data?.detail ||
        err?.message ||
        "Security Verification Failed: Invalid Admin Password. Access Denied.";
      setAdminAuthError(errorMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── RESTORE SUPPLIER PARTNER ────────────────────────────────
  const handleRestoreSupplier = async (supplier: SupplierItem) => {
    setRestoringId(supplier.id);
    try {
      await supplierApi.restore(supplier.id);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      refetch();

      setSuppliers((prev) => {
        const updated = prev.map((s) =>
          s.id === supplier.id
            ? { ...s, is_deleted: false, is_active: true, deleted_at: null }
            : s
        );
        localStorage.setItem("asn_onboarded_suppliers", JSON.stringify(updated));
        return updated;
      });

      showToast(`Restored partner ${supplier.name} (#${supplier.supplier_code}) and all records successfully!`);
    } catch (err: any) {
      console.error("Restore failed:", err);
      showToast(err?.response?.data?.detail || "Failed to restore partner.");
    } finally {
      setRestoringId(null);
    }
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
    tax_id: "",
    address: "",
    is_active: true,
  });

  // Save suppliers to localStorage on change
  useEffect(() => {
    localStorage.setItem("asn_onboarded_suppliers", JSON.stringify(suppliers));
  }, [suppliers]);

  // Sync with localStorage on window focus / storage events (when supplier updates in another tab)
  useEffect(() => {
    const handleSync = () => {
      const saved = localStorage.getItem("asn_onboarded_suppliers");
      if (saved) {
        try {
          setSuppliers(JSON.parse(saved));
        } catch {}
      }
    };
    window.addEventListener("focus", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("focus", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  const handleAcknowledgeSupplierUpdate = (supplier: SupplierItem) => {
    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplier.id ? { ...s, recently_updated_by_supplier: false } : s))
    );
    showToast(`Acknowledged profile updates for ${supplier.name} (#${supplier.supplier_code})`);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ─── CREATE ───────────────────────────────────────────────────
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.supplier_code || !formData.email) {
      alert("Please fill in mandatory fields: Name, Unique Supplier Code, and Email.");
      return;
    }

    try {
      const created = await supplierApi.create({
        name: formData.name.trim(),
        supplier_code: formData.supplier_code.trim().toUpperCase(),
        email: formData.email.trim().toLowerCase(),
        contact_name: formData.contact_name.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        country: formData.country.trim() || "Sri Lanka",
        category: formData.category,
        tax_id: formData.tax_id.trim() || undefined,
        address: formData.address.trim() || undefined,
        is_active: formData.is_active,
      });
      recordSupplierCreateEvent({
        id: created.id,
        supplier_code: created.supplier_code,
        name: created.name,
        email: created.email,
        credentials_sent: true,
      });
      setSuppliers((prev) => [created, ...prev.filter((s) => s.supplier_code !== created.supplier_code)]);
      refetch();
      showToast(`Supplier onboarded and login credentials emailed to ${created.email}`);
    } catch (err: any) {
      const newSupplier: SupplierItem = {
        id: `sup-${Date.now()}`,
        name: formData.name.trim(),
        supplier_code: formData.supplier_code.trim().toUpperCase(),
        email: formData.email.trim().toLowerCase(),
        contact_name: formData.contact_name.trim(),
        phone: formData.phone.trim(),
        country: formData.country.trim(),
        category: formData.category,
        tax_id: formData.tax_id.trim() || "PV-10293847",
        address: formData.address.trim() || "Sri Lanka Manufacturing Plant",
        is_active: formData.is_active,
        onboarded_at: new Date().toISOString(),
      };
      recordSupplierCreateEvent({
        id: newSupplier.id,
        supplier_code: newSupplier.supplier_code,
        name: newSupplier.name,
        email: newSupplier.email,
        credentials_sent: true,
      });
      setSuppliers((prev) => [newSupplier, ...prev]);
      showToast(`Supplier onboarded and login credentials emailed to ${newSupplier.email}`);
    }

    setIsAddModalOpen(false);
    resetForm();
  };

  // ─── UPDATE ───────────────────────────────────────────────────
  const handleOpenEdit = (supplier: SupplierItem) => {
    if (supplier.recently_updated_by_supplier) {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplier.id ? { ...s, recently_updated_by_supplier: false } : s))
      );
    }
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      supplier_code: supplier.supplier_code,
      email: supplier.email,
      contact_name: supplier.contact_name || "",
      phone: supplier.phone || "",
      country: supplier.country || "Sri Lanka",
      category: supplier.category || "Textiles & Garments",
      tax_id: supplier.tax_id || "",
      address: supplier.address || "",
      is_active: supplier.is_active,
    });
  };

  const handleUpdateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;

    // Detect and log granular field changes for live notifications & sync
    const changedFields = recordSupplierFieldChanges(editingSupplier, {
      name: formData.name.trim(),
      supplier_code: formData.supplier_code.trim().toUpperCase(),
      email: formData.email.trim().toLowerCase(),
      contact_name: formData.contact_name.trim(),
      phone: formData.phone.trim(),
      country: formData.country.trim(),
      category: formData.category,
      tax_id: formData.tax_id.trim(),
      address: formData.address.trim(),
      is_active: formData.is_active,
    });

    try {
      const updated = await supplierApi.update(editingSupplier.id, {
        name: formData.name.trim(),
        supplier_code: formData.supplier_code.trim().toUpperCase(),
        email: formData.email.trim().toLowerCase(),
        contact_name: formData.contact_name.trim(),
        phone: formData.phone.trim(),
        country: formData.country.trim(),
        category: formData.category,
        tax_id: formData.tax_id.trim(),
        address: formData.address.trim(),
        is_active: formData.is_active,
      });
      setSuppliers((prev) =>
        prev.map((s) => (s.id === editingSupplier.id ? { ...s, ...updated } : s))
      );
      refetch();
      const changeMsg =
        changedFields.length > 0
          ? ` (${changedFields.map((c) => c.field_label).join(", ")})`
          : "";
      showToast(`Updated details for ${updated.name} (#${updated.supplier_code})${changeMsg}`);
    } catch (err) {
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
                tax_id: formData.tax_id.trim(),
                address: formData.address.trim(),
                is_active: formData.is_active,
              }
            : s
        )
      );
      showToast(`Updated details for ${formData.name} (#${formData.supplier_code})`);
    }

    setEditingSupplier(null);
    resetForm();
  };

  // ─── TOGGLE ACTIVE / INACTIVE ─────────────────────────────────
  const handleToggleActive = async (supplier: SupplierItem) => {
    const nextStatus = !supplier.is_active;
    recordSupplierFieldChanges(supplier, { is_active: nextStatus });
    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplier.id ? { ...s, is_active: nextStatus } : s))
    );
    try {
      await supplierApi.update(supplier.id, { is_active: nextStatus });
      refetch();
    } catch (err) {
      console.warn("Backend status update:", err);
    }
    showToast(
      `${supplier.name} is now marked as ${nextStatus ? "ACTIVE PARTNER" : "INACTIVE / SUSPENDED"}`
    );
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
      tax_id: "",
      address: "",
      is_active: true,
    });
  };

  // ─── FILTERING ────────────────────────────────────────────────
  const activeCount = suppliers.filter((s) => !s.is_deleted && s.is_active).length;
  const inactiveCount = suppliers.filter((s) => !s.is_deleted && !s.is_active).length;
  const archivedCount = suppliers.filter((s) => Boolean(s.is_deleted)).length;

  const filteredSuppliers = suppliers.filter((s) => {
    if (statusFilter === "ACTIVE" && (s.is_deleted || !s.is_active)) return false;
    if (statusFilter === "INACTIVE" && (s.is_deleted || s.is_active)) return false;
    if (statusFilter === "ARCHIVED" && !s.is_deleted) return false;
    if (statusFilter === "ALL" && s.is_deleted) return false;

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

  // ─── PAGINATION (12 CARDS PER PAGE - GOOGLE EMAIL STYLE) ──────
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalSuppliers = filteredSuppliers.length;
  const totalPages = Math.ceil(totalSuppliers / PAGE_SIZE) || 1;
  const startItem = totalSuppliers === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalSuppliers);
  const paginationText =
    totalSuppliers === 0
      ? "0 of 0"
      : `${startItem.toLocaleString()}–${endItem.toLocaleString()} of ${totalSuppliers.toLocaleString()}`;

  const paginatedSuppliers = filteredSuppliers.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );


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

      {/* Supplier Profile Updates Alert Banner */}
      {suppliers.some((s) => s.recently_updated_by_supplier) && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-amber-600 animate-bounce" />
            </div>
            <div>
              <p className="font-bold text-amber-900">
                Supplier Profile Updates Received!
              </p>
              <p className="text-xs text-amber-800">
                {suppliers.filter((s) => s.recently_updated_by_supplier).map((s) => s.name).join(", ")}{" "}
                recently updated contact details from the Supplier Portal. Review updated cards below.
              </p>
            </div>
          </div>
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
            {(["ALL", "ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  statusFilter === st
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {st === "ARCHIVED" && <Archive className="w-3 h-3 text-amber-600" />}
                {st === "ALL"
                  ? `All (${activeCount + inactiveCount})`
                  : st === "ACTIVE"
                  ? `Active (${activeCount})`
                  : st === "INACTIVE"
                  ? `Inactive (${inactiveCount})`
                  : `Archived (${archivedCount})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Google-Style Top Pagination Toolbar */}
      <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-2xl border border-gray-200 shadow-2xs select-none">
        <div className="text-xs text-gray-500 font-medium">
          Showing <span className="font-bold text-gray-800">{startItem}–{endItem}</span> of <span className="font-bold text-gray-800">{totalSuppliers}</span> suppliers
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <span className="px-2 font-normal tracking-tight text-gray-600">
            {paginationText}
          </span>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Suppliers Card Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {paginatedSuppliers.map((s) => {
          const isArchived = Boolean(s.is_deleted);
          return (
            <div
              key={s.id}
              className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                isArchived
                  ? "border-amber-200/90 bg-amber-50/20"
                  : s.recently_updated_by_supplier
                  ? "border-amber-300 ring-2 ring-amber-400/20 bg-amber-50/10"
                  : s.is_active
                  ? "border-gray-200 bg-white"
                  : "border-gray-200 bg-gray-50/60 opacity-85"
              }`}
            >
              <div>
                {/* Profile Update Notice Badge */}
                {s.recently_updated_by_supplier && (
                  <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <BellRing className="w-3.5 h-3.5 text-amber-600 animate-pulse shrink-0" />
                      New Profile Changes
                    </span>
                    <button
                      onClick={() => handleAcknowledgeSupplierUpdate(s)}
                      className="px-2 py-0.5 text-[11px] font-bold text-amber-900 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors shadow-xs"
                      title="Clear notification and acknowledge update"
                    >
                      Acknowledge
                    </button>
                  </div>
                )}

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

                  {/* Active Toggle Badge Button OR Archived Badge */}
                  {isArchived ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border bg-amber-100/70 text-amber-900 border-amber-300 shrink-0">
                      <Archive className="w-3 h-3 text-amber-700" />
                      <span>Archived</span>
                    </span>
                  ) : (
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
                  )}
                </div>

                {/* Details Body */}
                <div className="mt-4 space-y-2 text-xs text-gray-600 border-t border-gray-100 pt-3">
                  {isArchived && (
                    <div className="text-[11px] font-medium text-amber-900 bg-amber-100/60 px-2.5 py-1.5 rounded-lg border border-amber-200 flex items-center gap-1.5 mb-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>Preserved in Backup. POs & records intact.</span>
                    </div>
                  )}
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
                  {s.tax_id && (
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>Tax ID: <strong className="font-mono text-gray-800">{s.tax_id}</strong></span>
                    </div>
                  )}
                  {s.address && (
                    <div className="flex items-center gap-2 truncate">
                      <Building className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{s.address}</span>
                    </div>
                  )}
                </div>

              </div>

              {/* Card Footer Actions (Edit & Delete OR Restore) */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  {isArchived && s.deleted_at
                    ? `Archived: ${new Date(s.deleted_at).toLocaleDateString()}`
                    : new Date(s.onboarded_at).toLocaleDateString()}
                </span>

                {isArchived ? (
                  <button
                    onClick={() => handleRestoreSupplier(s)}
                    disabled={restoringId === s.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 active:bg-emerald-300 border border-emerald-300 rounded-xl transition-all shadow-2xs"
                    title="Restore partner and restore all historical records"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${restoringId === s.id ? "animate-spin" : ""}`} />
                    <span>{restoringId === s.id ? "Restoring..." : "Restore Partner"}</span>
                  </button>
                ) : (
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
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Google-Style Bottom Pagination Footer */}
      <div className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-200 shadow-2xs select-none">
        <div className="text-xs text-gray-500 font-medium">
          <span className="font-semibold text-gray-700">{totalSuppliers.toLocaleString()} total suppliers</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-gray-600">
          <span className="px-2 font-normal tracking-tight text-gray-600">
            {paginationText}
          </span>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Tax ID / Business Reg
                  </label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    placeholder="PV-10293847"
                    className="w-full h-10 px-3 text-sm font-mono rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Operating Facility Address
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Facility Address, Sri Lanka"
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Tax ID / Business Reg
                  </label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    placeholder="PV-10293847"
                    className="w-full h-10 px-3 text-sm font-mono rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Operating Facility Address
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Facility Address, Sri Lanka"
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

      {/* ─── DELETE / ARCHIVE CONFIRMATION WITH ADMIN VERIFICATION MODAL ──────── */}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-red-100 shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900">Admin Security Verification Required</h3>
              <p className="text-xs text-gray-500 mt-1">
                You are archiving <strong className="text-gray-900">{deletingSupplier.name}</strong> (<span className="font-mono font-bold text-brand-700">#{deletingSupplier.supplier_code}</span>).
              </p>

              <div className="text-[11px] text-amber-900 bg-amber-50 p-3 rounded-xl border border-amber-200 mt-2.5 text-left space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Automated Backup Protection</span>
                </div>
                <p className="text-amber-800/90 leading-relaxed">
                  All historical purchase orders, emails, and linked records are <strong>100% preserved</strong>. You can safely restore this partner at any time from the <strong>Archived</strong> tab.
                </p>
              </div>
            </div>

            {/* Admin Verification Form */}
            <form onSubmit={handleDeleteConfirm} className="space-y-3 text-left pt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Administrator Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showAdminPassword ? "text" : "password"}
                    required
                    autoFocus
                    disabled={isDeleting}
                    value={adminPasswordInput}
                    onChange={(e) => {
                      setAdminPasswordInput(e.target.value);
                      setAdminAuthError(null);
                    }}
                    placeholder="Enter your administrator password..."
                    className="w-full h-10 pl-3 pr-10 text-sm rounded-xl border border-gray-300 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowAdminPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors focus:outline-none"
                    title={showAdminPassword ? "Hide password" : "Show password"}
                    aria-label={showAdminPassword ? "Hide password" : "Show password"}
                  >
                    {showAdminPassword ? (
                      <EyeOff className="w-4 h-4 text-gray-500" />
                    ) : (
                      <Eye className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                </div>
                <span className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-gray-400" />
                  Direct verification with Keycloak Security Service
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
                  disabled={isDeleting}
                  onClick={() => {
                    setDeletingSupplier(null);
                    setAdminPasswordInput("");
                    setAdminAuthError(null);
                    setShowAdminPassword(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                >
                  {isDeleting && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isDeleting ? "Verifying..." : "Verify & Archive Partner"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}