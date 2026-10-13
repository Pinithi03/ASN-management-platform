/**
 * Supplier Onboarding & Management Page — Admin Portal
 * Complete CRUD Operations: Create, Read, Update, Delete & Active/Inactive Status Toggle.
 */

import { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  CheckCircle2,
  Building2,
  MapPin,
  UserCheck,
  X,
  Sparkles,
  Edit2,
  Trash2,
  AlertTriangle,
  Power,
  BellRing,
  ChevronLeft,
  ChevronRight,
  Archive,
  RotateCcw,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Camera,
  Upload,
  Loader2,
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
  profile_picture_url?: string;
  tax_id?: string;
  address?: string;
  current_hu_number?: string;
  hu_locked?: boolean;
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

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);

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
    }
  }, [serverSuppliers]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "ARCHIVED">("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // View Mode & Sorting State (Grid Cards matching reference image by default)
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sortBy, setSortBy] = useState<"name" | "code" | "recent" | "pos">("name");
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());

  // Avatar Upload Refs & State for Grid Cards & Modals
  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploadTarget, setAvatarUploadTarget] = useState<SupplierItem | null>(null);
  const [isUploadingModalAvatar, setIsUploadingModalAvatar] = useState(false);
  const [isUploadingCardAvatar, setIsUploadingCardAvatar] = useState(false);

  const compressAndEncodeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_SIZE = 512;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) {
              height = Math.round((height * MAX_SIZE) / width);
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = Math.round((width * MAX_SIZE) / height);
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error("Failed to load image file."));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });
  };

  const handleTriggerCardAvatarUpload = (supplier: SupplierItem) => {
    setAvatarUploadTarget(supplier);
    cardFileInputRef.current?.click();
  };

  const handleCardAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !avatarUploadTarget) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file (PNG, JPG, WebP).");
      return;
    }

    setIsUploadingCardAvatar(true);
    try {
      const dataUrl = await compressAndEncodeImage(file);
      await supplierApi.uploadAvatar(avatarUploadTarget.id, dataUrl);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      refetch();
      showToast(`Profile picture updated for ${avatarUploadTarget.name}!`);
    } catch (err: any) {
      console.error("Failed to update avatar:", err);
      showToast(err?.response?.data?.detail || err?.message || "Failed to upload profile picture.");
    } finally {
      setIsUploadingCardAvatar(false);
      setAvatarUploadTarget(null);
      if (cardFileInputRef.current) cardFileInputRef.current.value = "";
    }
  };

  const handleModalAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file (PNG, JPG, WebP).");
      return;
    }

    setIsUploadingModalAvatar(true);
    try {
      const dataUrl = await compressAndEncodeImage(file);
      setFormData((prev) => ({ ...prev, profile_picture_url: dataUrl }));
      showToast("Profile image attached! Click save to apply changes.");
    } catch (err) {
      console.error("Modal avatar processing failed:", err);
      showToast("Could not process image file.");
    } finally {
      setIsUploadingModalAvatar(false);
      if (modalFileInputRef.current) modalFileInputRef.current.value = "";
    }
  };

  const toggleSupplierSelection = (id: string) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (items: SupplierItem[]) => {
    if (selectedSupplierIds.size === items.length && items.length > 0) {
      setSelectedSupplierIds(new Set());
    } else {
      setSelectedSupplierIds(new Set(items.map((s) => s.id)));
    }
  };

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
    country: "Sri Lanka",
    profile_picture_url: "",
    current_hu_number: "",
    hu_locked: false,
    is_active: true,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      supplier_code: "",
      country: "Sri Lanka",
      profile_picture_url: "",
      current_hu_number: "",
      hu_locked: false,
      is_active: true,
    });
  };

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
    if (!formData.name.trim() || !formData.supplier_code.trim()) {
      showToast("Please fill in mandatory fields: Name and Supplier Code.");
      return;
    }

    try {
      const created = await supplierApi.create({
        name: formData.name.trim(),
        supplier_code: formData.supplier_code.trim().toUpperCase(),
        country: formData.country.trim() || "Sri Lanka",
        profile_picture_url: formData.profile_picture_url.trim() || undefined,
        current_hu_number: formData.current_hu_number.trim() || undefined,
        is_active: formData.is_active,
      });
      recordSupplierCreateEvent({
        id: created.id,
        supplier_code: created.supplier_code,
        name: created.name,
        email: created.email,
        credentials_sent: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      refetch();
      showToast(`Supplier onboarded: ${created.name} (#${created.supplier_code})`);
      setIsAddModalOpen(false);
      resetForm();
    } catch (err: any) {
      console.error("Create supplier failed:", err);
      const errorMsg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to onboard supplier. Please check details and try again.";
      showToast(typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg));
    }
  };

  // ─── XML DATA LOOKUP / AUTOFILL ──────────────────────────────
  const [isLookingUpXml, setIsLookingUpXml] = useState(false);
  const [xmlFoundBadge, setXmlFoundBadge] = useState<string | null>(null);

  const handleLookupXml = async (codeToLookup?: string) => {
    const code = (codeToLookup || formData.supplier_code).trim();
    if (!code) {
      showToast("Please enter a supplier code first to fetch details.");
      return;
    }
    setIsLookingUpXml(true);
    setXmlFoundBadge(null);
    try {
      const res = await supplierApi.lookupXml(code);
      if (res && res.found) {
        setFormData((prev) => ({
          ...prev,
          supplier_code: res.supplier_code || prev.supplier_code,
          name: res.name || prev.name,
          country: res.country || prev.country,
        }));
        setXmlFoundBadge(`Auto-filled from ${res.source_filename || "Inbound XML"}`);
        showToast(`Loaded details from XML: ${res.name} (#${res.supplier_code})`);
      } else {
        setXmlFoundBadge(null);
        showToast(`No inbound XML found for code ${code} yet.`);
      }
    } catch (err) {
      console.warn("XML lookup error:", err);
      showToast("Could not lookup XML for this code.");
    } finally {
      setIsLookingUpXml(false);
    }
  };

  // ─── UPDATE ───────────────────────────────────────────────────
  const handleOpenEdit = async (supplier: SupplierItem) => {
    if (supplier.recently_updated_by_supplier) {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplier.id ? { ...s, recently_updated_by_supplier: false } : s))
      );
    }
    setEditingSupplier(supplier);
    setXmlFoundBadge(null);
    setFormData({
      name: supplier.name,
      supplier_code: supplier.supplier_code,
      country: supplier.country || "Sri Lanka",
      profile_picture_url: supplier.profile_picture_url || "",
      current_hu_number: supplier.current_hu_number || "",
      hu_locked: Boolean(supplier.hu_locked),
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
      country: formData.country.trim(),
      is_active: formData.is_active,
    });

    try {
      const updated = await supplierApi.update(editingSupplier.id, {
        name: formData.name.trim(),
        supplier_code: formData.supplier_code.trim().toUpperCase(),
        country: formData.country.trim(),
        profile_picture_url: formData.profile_picture_url.trim() || undefined,
        current_hu_number: formData.current_hu_number.trim() || undefined,
        hu_locked: formData.hu_locked,
        is_active: formData.is_active,
      });
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      refetch();
      const changeMsg =
        changedFields.length > 0
          ? ` (${changedFields.map((c) => c.field_label).join(", ")})`
          : "";
      showToast(`Updated details for ${updated.name} (#${updated.supplier_code})${changeMsg}`);
      setEditingSupplier(null);
      resetForm();
    } catch (err: any) {
      console.error("Update supplier failed:", err);
      const errorMsg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to update supplier details.";
      showToast(typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg));
    }
  };

  const handleToggleActive = async (supplier: SupplierItem) => {
    const nextStatus = !supplier.is_active;
    recordSupplierFieldChanges(supplier, { is_active: nextStatus });
    try {
      await supplierApi.update(supplier.id, { is_active: nextStatus });
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      refetch();
      showToast(
        `${supplier.name} is now marked as ${nextStatus ? "ACTIVE PARTNER" : "INACTIVE / SUSPENDED"}`
      );
    } catch (err) {
      console.warn("Backend status update failed:", err);
      showToast("Failed to update status on server.");
    }
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

  const getAvatarFallbackBg = (name: string) => {
    const colors = [
      "bg-sky-100 text-sky-700 border-sky-200",
      "bg-amber-100 text-amber-800 border-amber-200",
      "bg-emerald-100 text-emerald-800 border-emerald-200",
      "bg-purple-100 text-purple-800 border-purple-200",
      "bg-rose-100 text-rose-800 border-rose-200",
      "bg-indigo-100 text-indigo-800 border-indigo-200",
    ];
    let hash = 0;
    for (let i = 0; i < (name || "").length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const sortedSuppliers = [...filteredSuppliers].sort((a, b) => {
    if (sortBy === "name") {
      return (a.name || "").localeCompare(b.name || "");
    }
    if (sortBy === "code") {
      return (a.supplier_code || "").localeCompare(b.supplier_code || "");
    }
    if (sortBy === "recent") {
      return new Date(b.onboarded_at).getTime() - new Date(a.onboarded_at).getTime();
    }
    if (sortBy === "pos") {
      return (b.total_pos || 0) - (a.total_pos || 0);
    }
    return 0;
  });

  // ─── PAGINATION (15 CARDS PER PAGE - DIRECTORY STYLE) ──────────
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortBy]);

  const totalSuppliers = sortedSuppliers.length;
  const totalPages = Math.ceil(totalSuppliers / PAGE_SIZE) || 1;
  const startItem = totalSuppliers === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, totalSuppliers);
  const paginationText =
    totalSuppliers === 0
      ? "0 of 0"
      : `${startItem.toLocaleString()} to ${endItem.toLocaleString()} of ${totalSuppliers.toLocaleString()}`;

  const paginatedSuppliers = sortedSuppliers.slice(
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
            Onboard, update, and manage partner suppliers with unique identification codes for automated email tracking.
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

      {/* Hidden file inputs for avatar uploads */}
      <input
        type="file"
        ref={cardFileInputRef}
        onChange={handleCardAvatarFileSelect}
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
      />
      <input
        type="file"
        ref={modalFileInputRef}
        onChange={handleModalAvatarSelect}
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
      />

      {/* Directory Control Toolbar (Matching UI Reference) */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Browse Status & Clear & Sort */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-400 font-semibold uppercase tracking-wider">Browse:</span>
              <div className="inline-flex rounded-xl bg-gray-100 p-0.5">
                {(["ALL", "ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                      statusFilter === st
                        ? "bg-white text-gray-900 shadow-xs"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {st === "ARCHIVED" && <Archive className="w-3 h-3 text-amber-600 inline mr-1" />}
                    {st === "ALL"
                      ? `All Partners (${activeCount + inactiveCount})`
                      : st === "ACTIVE"
                      ? `Active (${activeCount})`
                      : st === "INACTIVE"
                      ? `Inactive (${inactiveCount})`
                      : `Archived (${archivedCount})`}
                  </button>
                ))}
              </div>
              {(statusFilter !== "ALL" || search) && (
                <button
                  onClick={() => {
                    setStatusFilter("ALL");
                    setSearch("");
                  }}
                  className="text-xs text-brand-600 hover:text-brand-800 font-semibold underline underline-offset-2 ml-1"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="h-4 w-[1px] bg-gray-200 hidden sm:block" />

            {/* Sort by dropdown */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-400 font-semibold uppercase tracking-wider">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort suppliers by"
                className="h-8 px-2.5 text-xs font-semibold rounded-xl border border-gray-200 bg-gray-50 text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white"
              >
                <option value="name">Supplier Name (A-Z)</option>
                <option value="code">Supplier Code</option>
                <option value="recent">Most Recently Added</option>
                <option value="pos">Total Orders</option>
              </select>
            </div>
          </div>

          {/* Right: Search, Pagination, View Switcher */}
          <div className="flex items-center gap-3 justify-between lg:justify-end">
            {/* Search Input */}
            <div className="relative w-full sm:w-64 flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search partners..."
                className="h-8 w-full rounded-full border border-gray-200 bg-gray-50/70 pl-9 pr-7 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200/60 transition-colors"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Pagination snippet */}
            <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
              <span className="font-medium text-gray-700 px-1 select-none">{paginationText}</span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous page"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next page"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* View Mode Switcher Toggle */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200 shrink-0">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "grid"
                    ? "bg-white text-brand-600 shadow-2xs"
                    : "text-gray-400 hover:text-gray-700"
                }`}
                title="Grid Directory View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "table"
                    ? "bg-white text-brand-600 shadow-2xs"
                    : "text-gray-400 hover:text-gray-700"
                }`}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Selection Actions Bar (if any selected) */}
        {selectedSupplierIds.size > 0 && (
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-700 animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-brand-700">
                {selectedSupplierIds.size} partner{selectedSupplierIds.size > 1 ? "s" : ""} selected
              </span>
              <button
                onClick={() => toggleSelectAll(paginatedSuppliers)}
                className="text-xs text-gray-500 hover:text-gray-800 underline"
              >
                {selectedSupplierIds.size === paginatedSuppliers.length ? "Deselect on page" : "Select all on page"}
              </button>
            </div>
            <button
              onClick={() => setSelectedSupplierIds(new Set())}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      {viewMode === "grid" ? (
        /* ─── DIRECTORY GRID VIEW (MATCHING REFERENCE UI) ─── */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {paginatedSuppliers.map((s) => {
            const isArchived = Boolean(s.is_deleted);
            const isSelected = selectedSupplierIds.has(s.id);

            return (
              <div
                key={s.id}
                className={`rounded-2xl border bg-white shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative group p-4 ${
                  isArchived
                    ? "border-amber-200/90 bg-amber-50/15"
                    : s.recently_updated_by_supplier
                    ? "border-amber-300 ring-2 ring-amber-400/20"
                    : isSelected
                    ? "border-brand-500 ring-2 ring-brand-200"
                    : "border-gray-200/90 hover:border-gray-300"
                }`}
              >
                {/* Top Header inside Card: Selection circle & options */}
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => toggleSupplierSelection(s.id)}
                    className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-colors ${
                      isSelected
                        ? "border-brand-600 bg-brand-50"
                        : "border-gray-300 hover:border-gray-400 bg-white"
                    }`}
                    title={isSelected ? "Deselect partner" : "Select partner"}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-brand-600" />}
                  </button>

                  <div className="flex items-center gap-1">
                    {s.recently_updated_by_supplier && (
                      <button
                        onClick={() => handleAcknowledgeSupplierUpdate(s)}
                        className="px-1.5 py-0.5 text-[10px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md transition-colors"
                        title="Profile updated by supplier! Click to acknowledge."
                      >
                        Updated
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEdit(s)}
                      className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                      title="Edit partner details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Center Section: Avatar with Camera Hover Overlay */}
                <div className="flex flex-col items-center text-center">
                  <div
                    onClick={() => handleTriggerCardAvatarUpload(s)}
                    title="Click to upload or change profile photo"
                    className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-sm cursor-pointer group/avatar ring-2 ring-gray-100 hover:ring-brand-400 transition-all flex items-center justify-center shrink-0"
                  >
                    {s.profile_picture_url ? (
                      <img
                        src={s.profile_picture_url}
                        alt={s.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className={`w-full h-full flex items-center justify-center font-bold text-2xl uppercase ${getAvatarFallbackBg(
                          s.name
                        )}`}
                      >
                        {s.name.charAt(0)}
                      </div>
                    )}

                    {/* Camera Hover Overlay */}
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/avatar:opacity-100 flex flex-col items-center justify-center transition-opacity text-white text-[10px] font-semibold">
                      {isUploadingCardAvatar && avatarUploadTarget?.id === s.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Camera className="w-4.5 h-4.5 mb-0.5" />
                          <span>Photo</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Supplier Name styled in blue bold link font */}
                  <h3
                    onClick={() => handleOpenEdit(s)}
                    className="mt-3 text-sm font-bold text-blue-700 hover:text-blue-900 cursor-pointer transition-colors truncate max-w-full"
                    title={s.name}
                  >
                    {s.name}
                  </h3>

                  {/* Status badge pill & Code */}
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap justify-center">
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded border border-gray-200">
                      #{s.supplier_code}
                    </span>
                    {isArchived ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Archived
                      </span>
                    ) : s.is_active ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                        Inactive
                      </span>
                    )}
                  </div>

                  {/* Details (HU, Country) */}
                  <div className="mt-3 w-full text-left space-y-1 text-[11px] text-gray-600 border-t border-gray-100 pt-2.5">
                    {s.current_hu_number && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400 font-medium">HU Sequence:</span>
                        <span className="font-mono font-bold text-gray-800 truncate" title={s.current_hu_number}>
                          #{s.current_hu_number}
                        </span>
                      </div>
                    )}
                    {s.country && (
                      <div className="flex items-center gap-1.5 truncate text-[11px]">
                        <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate text-gray-500">{s.country}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                  {isArchived ? (
                    <button
                      onClick={() => handleRestoreSupplier(s)}
                      disabled={restoringId === s.id}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-all shadow-2xs"
                    >
                      <RotateCcw className={`w-3 h-3 ${restoringId === s.id ? "animate-spin" : ""}`} />
                      <span>{restoringId === s.id ? "Restoring..." : "Restore Partner"}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleToggleActive(s)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-lg border transition-all ${
                          s.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                        }`}
                        title={s.is_active ? "Click to deactivate" : "Click to activate"}
                      >
                        <Power className="w-2.5 h-2.5" />
                        <span>{s.is_active ? "Active" : "Inactive"}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleTriggerCardAvatarUpload(s)}
                          className="p-1 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-gray-100 transition-colors"
                          title="Change Profile Picture"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenDeleteModal(s)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Archive Supplier"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── TABLE VIEW ─── */
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <button
                      type="button"
                      onClick={() => toggleSelectAll(paginatedSuppliers)}
                      className="w-4 h-4 rounded border border-gray-300 flex items-center justify-center bg-white"
                      title="Select all"
                    >
                      {selectedSupplierIds.size === paginatedSuppliers.length && paginatedSuppliers.length > 0 && (
                        <div className="w-2 h-2 bg-brand-600 rounded-xs" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Partner</th>
                  <th className="py-3 px-4">HU Sequence</th>
                  <th className="py-3 px-4">Country</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedSuppliers.map((s) => {
                  const isArchived = Boolean(s.is_deleted);
                  const isSelected = selectedSupplierIds.has(s.id);

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-gray-50/80 transition-colors ${
                        isSelected ? "bg-brand-50/30" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => toggleSupplierSelection(s.id)}
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            isSelected ? "border-brand-600 bg-brand-50" : "border-gray-300 bg-white"
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 bg-brand-600 rounded-xs" />}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            onClick={() => handleTriggerCardAvatarUpload(s)}
                            className="relative w-9 h-9 rounded-full overflow-hidden border border-gray-200 shrink-0 cursor-pointer group/tblAvatar"
                            title="Click to change photo"
                          >
                            {s.profile_picture_url ? (
                              <img src={s.profile_picture_url} alt={s.name} className="w-full h-full object-cover" />
                            ) : (
                              <div
                                className={`w-full h-full flex items-center justify-center font-bold text-xs uppercase ${getAvatarFallbackBg(
                                  s.name
                                )}`}
                              >
                                {s.name.charAt(0)}
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/tblAvatar:opacity-100 flex items-center justify-center text-white transition-opacity">
                              <Camera className="w-3 h-3" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <span
                              onClick={() => handleOpenEdit(s)}
                              className="font-bold text-blue-700 hover:text-blue-900 cursor-pointer block truncate"
                            >
                              {s.name}
                            </span>
                            <span className="font-mono text-[10px] text-gray-400 block">#{s.supplier_code}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-gray-800">
                        {s.current_hu_number ? `#${s.current_hu_number}` : <span className="text-gray-400 font-normal">Not Set</span>}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{s.country || "—"}</td>
                      <td className="py-3 px-4">
                        {isArchived ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Archived
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleActive(s)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                              s.is_active
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                            }`}
                          >
                            {s.is_active ? "Active" : "Inactive"}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(s)}
                            className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleTriggerCardAvatarUpload(s)}
                            className="p-1 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-gray-100"
                            title="Upload Photo"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenDeleteModal(s)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                            title="Archive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom Pagination Footer */}
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
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
              {xmlFoundBadge && (
                <div className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{xmlFoundBadge}</span>
                </div>
              )}

              {/* Avatar Upload Preview Section */}
              <div className="flex items-center gap-4 p-3 bg-gray-50/80 rounded-xl border border-gray-200">
                <div
                  onClick={() => modalFileInputRef.current?.click()}
                  className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-sm cursor-pointer group/modalAvatar ring-2 ring-gray-200 hover:ring-brand-500 shrink-0 flex items-center justify-center bg-gray-100"
                  title="Click to select profile picture"
                >
                  {formData.profile_picture_url ? (
                    <img
                      src={formData.profile_picture_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className={`w-full h-full flex items-center justify-center font-bold text-xl uppercase ${
                        formData.name ? getAvatarFallbackBg(formData.name) : "bg-brand-50 text-brand-600"
                      }`}
                    >
                      {formData.name ? formData.name.charAt(0) : <Camera className="w-6 h-6 text-gray-400" />}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/modalAvatar:opacity-100 flex items-center justify-center transition-opacity text-white">
                    {isUploadingModalAvatar ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Partner Profile Picture / Logo</p>
                  <p className="text-[11px] text-gray-500">
                    Supports PNG, JPG, or WebP. Auto-optimized for instant loading.
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => modalFileInputRef.current?.click()}
                      disabled={isUploadingModalAvatar}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-700 bg-white hover:bg-brand-50 border border-brand-200 rounded-lg shadow-2xs transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      {formData.profile_picture_url ? "Change Photo" : "Upload Photo"}
                    </button>
                    {formData.profile_picture_url && (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, profile_picture_url: "" }))}
                        className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Supplier Code <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleLookupXml()}
                      disabled={isLookingUpXml || !formData.supplier_code.trim()}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-lg border border-brand-200 transition-colors disabled:opacity-40"
                      title="Fetch details from incoming XML attachments in mailbox"
                    >
                      <Sparkles className={`w-3 h-3 text-brand-600 ${isLookingUpXml ? "animate-spin" : ""}`} />
                      <span>{isLookingUpXml ? "Fetching..." : "Auto-fetch XML"}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.supplier_code}
                    onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })}
                    onBlur={() => {
                      if (formData.supplier_code.trim() && !formData.name) {
                        handleLookupXml(formData.supplier_code);
                      }
                    }}
                    placeholder="e.g. 0000111924"
                    className="w-full h-10 px-3 text-sm font-mono font-semibold rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">Unique EDI code from &lt;SdPartner&gt;</span>
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

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Current Handling Unit (HU) Number
                </label>
                <input
                  type="text"
                  value={formData.current_hu_number}
                  onChange={(e) => setFormData({ ...formData, current_hu_number: e.target.value })}
                  placeholder="e.g. 10000011220000000001 or 1"
                  className="w-full h-10 px-3 text-sm font-mono rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="text-[10px] text-gray-400 mt-0.5 block">
                  Initial starting sequence number currently generated by the supplier for packing units
                </span>
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
              {xmlFoundBadge && (
                <div className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{xmlFoundBadge}</span>
                </div>
              )}

              {/* Avatar Upload Preview Section */}
              <div className="flex items-center gap-4 p-3 bg-gray-50/80 rounded-xl border border-gray-200">
                <div
                  onClick={() => modalFileInputRef.current?.click()}
                  className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-sm cursor-pointer group/modalAvatar ring-2 ring-gray-200 hover:ring-brand-500 shrink-0 flex items-center justify-center bg-gray-100"
                  title="Click to select profile picture"
                >
                  {formData.profile_picture_url ? (
                    <img
                      src={formData.profile_picture_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className={`w-full h-full flex items-center justify-center font-bold text-xl uppercase ${
                        formData.name ? getAvatarFallbackBg(formData.name) : "bg-brand-50 text-brand-600"
                      }`}
                    >
                      {formData.name ? formData.name.charAt(0) : <Camera className="w-6 h-6 text-gray-400" />}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/modalAvatar:opacity-100 flex items-center justify-center transition-opacity text-white">
                    {isUploadingModalAvatar ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Partner Profile Picture / Logo</p>
                  <p className="text-[11px] text-gray-500">
                    Supports PNG, JPG, or WebP. Auto-optimized for instant loading.
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => modalFileInputRef.current?.click()}
                      disabled={isUploadingModalAvatar}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-700 bg-white hover:bg-brand-50 border border-brand-200 rounded-lg shadow-2xs transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      {formData.profile_picture_url ? "Change Photo" : "Upload Photo"}
                    </button>
                    {formData.profile_picture_url && (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, profile_picture_url: "" }))}
                        className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Supplier Code <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleLookupXml(formData.supplier_code)}
                      disabled={isLookingUpXml}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-lg border border-brand-200 transition-colors"
                      title="Sync latest details from incoming XML attachments in mailbox"
                    >
                      <Sparkles className={`w-3 h-3 text-brand-600 ${isLookingUpXml ? "animate-spin" : ""}`} />
                      <span>{isLookingUpXml ? "Syncing..." : "Sync XML"}</span>
                    </button>
                  </div>
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

              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50/80 rounded-xl border border-gray-200">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Current Generating HU Number
                  </label>
                  <input
                    type="text"
                    value={formData.current_hu_number}
                    onChange={(e) => setFormData({ ...formData, current_hu_number: e.target.value })}
                    placeholder="e.g. 10000011220000000001"
                    className="w-full h-10 px-3 text-sm font-mono rounded-xl border border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">
                    Admin editable: syncs and sets the running HU sequence
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Supplier Edit Lock
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-2 text-xs font-semibold text-gray-800">
                    <input
                      type="checkbox"
                      checked={formData.hu_locked}
                      onChange={(e) => setFormData({ ...formData, hu_locked: e.target.checked })}
                      className="w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                    />
                    <span>{formData.hu_locked ? "Locked for Supplier" : "Unlocked (Editable once)"}</span>
                  </label>
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    {formData.hu_locked ? "Supplier cannot change from portal" : "Supplier can configure once from portal"}
                  </span>
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