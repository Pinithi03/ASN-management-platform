import {
  Building2,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Globe,
  Tag,
  UserCheck,
  ShieldAlert,
  Sparkles,
  Trash2,
  PlusCircle,
} from "lucide-react";

export interface SupplierFieldChangeRecord {
  id: string;
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  field_key: string;
  field_label: string;
  old_value: string;
  new_value: string;
  updated_at: string;
}

const STORAGE_KEY = "supplier_profile_field_changes";

export const FIELD_ICONS: Record<string, typeof Sparkles> = {
  name: Building2,
  supplier_code: Building2,
  email: Mail,
  contact_name: UserCheck,
  phone: Phone,
  category: Tag,
  country: Globe,
  tax_id: ShieldCheck,
  address: MapPin,
  is_active: ShieldAlert,
  create: PlusCircle,
  delete: Trash2,
};

export const FIELD_COLORS: Record<string, string> = {
  name: "bg-blue-700 text-white border border-blue-800 shadow-xs",
  supplier_code: "bg-blue-700 text-white border border-blue-800 shadow-xs",
  email: "bg-indigo-700 text-white border border-indigo-800 shadow-xs",
  contact_name: "bg-emerald-700 text-white border border-emerald-800 shadow-xs",
  phone: "bg-amber-600 text-white border border-amber-700 shadow-xs",
  category: "bg-purple-700 text-white border border-purple-800 shadow-xs",
  country: "bg-teal-700 text-white border border-teal-800 shadow-xs",
  tax_id: "bg-sky-700 text-white border border-sky-800 shadow-xs",
  address: "bg-rose-700 text-white border border-rose-800 shadow-xs",
  is_active: "bg-emerald-700 text-white border border-emerald-800 shadow-xs",
  create: "bg-blue-700 text-white border border-blue-800 shadow-xs",
  delete: "bg-rose-700 text-white border border-rose-800 shadow-xs",
};

/**
 * Get all logged supplier field changes from localStorage
 */
export function getAllSupplierFieldChanges(): SupplierFieldChangeRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Get field changes for a specific supplier code or id
 */
export function getSupplierFieldChanges(supplierCodeOrId?: string): SupplierFieldChangeRecord[] {
  const all = getAllSupplierFieldChanges();
  if (!supplierCodeOrId) return all;

  const clean = supplierCodeOrId.replace(/^0+/, "").toLowerCase();
  return all.filter(
    (c) =>
      c.supplier_code === supplierCodeOrId ||
      c.supplier_id === supplierCodeOrId ||
      c.supplier_code.replace(/^0+/, "").toLowerCase() === clean
  );
}

/**
 * Detect diffs across all fields and log them to localStorage + dispatch real-time event
 */
export function recordSupplierFieldChanges(
  original: {
    id: string;
    supplier_code: string;
    name: string;
    email?: string;
    contact_name?: string;
    phone?: string;
    category?: string;
    country?: string;
    tax_id?: string;
    address?: string;
    is_active?: boolean;
  },
  updated: {
    name?: string;
    supplier_code?: string;
    email?: string;
    contact_name?: string;
    phone?: string;
    category?: string;
    country?: string;
    tax_id?: string;
    address?: string;
    is_active?: boolean;
  }
): SupplierFieldChangeRecord[] {
  const changes: SupplierFieldChangeRecord[] = [];
  const now = new Date().toISOString();
  const baseId = `chg-${original.supplier_code}-${Date.now()}`;

  const checkField = (
    field_key: string,
    field_label: string,
    oldVal?: string | boolean,
    newVal?: string | boolean
  ) => {
    if (newVal === undefined) return;
    const sOld = String(oldVal ?? "").trim();
    const sNew = String(newVal ?? "").trim();

    if (sOld !== sNew) {
      changes.push({
        id: `${baseId}-${field_key}`,
        supplier_id: original.id,
        supplier_code: original.supplier_code,
        supplier_name: updated.name || original.name,
        field_key,
        field_label,
        old_value: sOld || " ",
        new_value: sNew ? sNew : "Removed / Cleared",
        updated_at: now,
      });
    }
  };

  checkField("name", "Company Name", original.name, updated.name);
  checkField("supplier_code", "Supplier Code", original.supplier_code, updated.supplier_code);
  checkField("email", "Official Email", original.email, updated.email);
  checkField("contact_name", "Contact Person", original.contact_name, updated.contact_name);
  checkField("phone", "Phone Number", original.phone, updated.phone);
  checkField("category", "Category", original.category, updated.category);
  checkField("country", "Country", original.country, updated.country);
  checkField("tax_id", "Tax ID / Business Reg", original.tax_id, updated.tax_id);
  checkField("address", "Operating Facility Address", original.address, updated.address);

  if (updated.is_active !== undefined && original.is_active !== undefined && original.is_active !== updated.is_active) {
    changes.push({
      id: `${baseId}-is_active`,
      supplier_id: original.id,
      supplier_code: original.supplier_code,
      supplier_name: updated.name || original.name,
      field_key: "is_active",
      field_label: "Account Active Status",
      old_value: original.is_active ? "Active" : "Inactive",
      new_value: updated.is_active ? "Active" : "Inactive",
      updated_at: now,
    });
  }

  if (changes.length > 0) {
    const existing = getAllSupplierFieldChanges();
    // Prepend new changes and keep up to 100 recent entries
    const updatedLog = [...changes, ...existing].slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLog));

    // Dispatch global custom event for instant UI reactivity
    window.dispatchEvent(
      new CustomEvent("supplier-field-updated", { detail: { changes, supplier_code: original.supplier_code } })
    );
  }

  return changes;
}

/**
 * Record a supplier deletion event for Admin audit notifications
 */
export function recordSupplierDeleteEvent(supplier: {
  id: string;
  supplier_code: string;
  name: string;
}): void {
  const now = new Date().toISOString();
  const record: SupplierFieldChangeRecord = {
    id: `del-${supplier.supplier_code}-${Date.now()}`,
    supplier_id: supplier.id,
    supplier_code: supplier.supplier_code,
    supplier_name: supplier.name,
    field_key: "delete",
    field_label: "Supplier Profile Deleted",
    old_value: supplier.name,
    new_value: "Deleted from System",
    updated_at: now,
  };

  const existing = getAllSupplierFieldChanges();
  const updatedLog = [record, ...existing].slice(0, 100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLog));

  window.dispatchEvent(
    new CustomEvent("supplier-field-updated", { detail: { changes: [record], supplier_code: supplier.supplier_code } })
  );
}

/**
 * Record a new supplier onboarded event for Admin audit notifications
 */
export function recordSupplierCreateEvent(supplier: {
  id: string;
  supplier_code: string;
  name: string;
  email?: string;
  credentials_sent?: boolean;
}): void {
  const now = new Date().toISOString();
  const emailNotice = supplier.email ? ` (credentials emailed to ${supplier.email})` : "";
  const record: SupplierFieldChangeRecord = {
    id: `create-${supplier.supplier_code}-${Date.now()}`,
    supplier_id: supplier.id,
    supplier_code: supplier.supplier_code,
    supplier_name: supplier.name,
    field_key: "create",
    field_label: "New Supplier Onboarded",
    old_value: " ",
    new_value: `${supplier.name} (#${supplier.supplier_code})${emailNotice}`,
    updated_at: now,
  };

  const existing = getAllSupplierFieldChanges();
  const updatedLog = [record, ...existing].slice(0, 100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLog));

  window.dispatchEvent(
    new CustomEvent("supplier-field-updated", { detail: { changes: [record], supplier_code: supplier.supplier_code } })
  );
}
