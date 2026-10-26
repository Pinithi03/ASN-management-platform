import { useState, useRef } from "react";
import {
  Building2,
  ShieldCheck,
  Globe,
  Tag,
  Boxes,
  Lock,
  AlertCircle,
  CheckCircle2,
  Camera,
  Upload,
  Trash2,
  Loader2,
  HardDrive,
  FileEdit,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { SupplierItem } from "@/pages/Suppliers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supplierApi } from "@/services/supplierApi";
import {
  useDraftCount,
  getDraftStorageEstimate,
  clearAllSupplierDrafts,
} from "@/utils/draftStorage";

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [huInput, setHuInput] = useState("");
  const [isSavingHu, setIsSavingHu] = useState(false);
  const [huError, setHuError] = useState<string | null>(null);
  const [huSuccess, setHuSuccess] = useState<string | null>(null);

  // Avatar upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);

  // Offline storage & cache clearing state (Supplier-only)
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheSuccessMsg, setCacheSuccessMsg] = useState<string | null>(null);
  const draftCount = useDraftCount(user?.role === "SUPPLIER" ? (user.supplier_code || undefined) : undefined);
  const draftStorageInfo = getDraftStorageEstimate(user?.role === "SUPPLIER" ? (user.supplier_code || undefined) : undefined);

  const handleClearCache = async () => {
    if (
      !window.confirm(
        "Are you sure you want to clear your local offline drafts and cached packing configurations? This will reset local unsent draft progress on this device."
      )
    ) {
      return;
    }
    setIsClearingCache(true);
    setCacheSuccessMsg(null);
    try {
      const suppCode = user?.role === "SUPPLIER" ? (user.supplier_code || undefined) : undefined;
      const res = await clearAllSupplierDrafts(suppCode);
      setCacheSuccessMsg(
        `Offline cache cleared successfully! (${res.clearedDrafts} draft${res.clearedDrafts === 1 ? "" : "s"} purged)`
      );
      setTimeout(() => setCacheSuccessMsg(null), 4000);
    } catch (err: any) {
      console.warn("Failed to clear offline cache:", err);
    } finally {
      setIsClearingCache(false);
    }
  };

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

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarError("Please select a valid image file (PNG, JPG, or WebP).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAvatarError("Image file size must be under 10MB.");
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError(null);
    setAvatarSuccess(null);

    try {
      const optimizedDataUrl = await compressAndEncodeImage(file);
      const targetId =
        matchedSupplier.id && matchedSupplier.id !== "profile-user"
          ? matchedSupplier.id
          : matchedSupplier.supplier_code;

      await supplierApi.uploadAvatar(targetId, optimizedDataUrl);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setAvatarSuccess("Profile picture uploaded and saved successfully!");
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      setAvatarError(err?.response?.data?.detail || err?.message || "Failed to upload profile picture.");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!matchedSupplier.profile_picture_url) return;
    setIsUploadingAvatar(true);
    setAvatarError(null);
    setAvatarSuccess(null);
    try {
      const targetId =
        matchedSupplier.id && matchedSupplier.id !== "profile-user"
          ? matchedSupplier.id
          : matchedSupplier.supplier_code;

      await supplierApi.uploadAvatar(targetId, null);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setAvatarSuccess("Profile picture removed successfully.");
    } catch (err: any) {
      console.error("Failed to remove avatar:", err);
      setAvatarError(err?.response?.data?.detail || err?.message || "Failed to remove profile picture.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Profile Header Card: Clean Slate & White Theme with Integrated Logo Branding */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
        {/* Status Alerts */}
        {avatarSuccess && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-800 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{avatarSuccess}</p>
            </div>
          </div>
        )}

        {avatarError && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{avatarError}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {/* Clickable Profile Avatar / Logo */}
            <div className="relative group shrink-0">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-xl border border-slate-200 shadow-2xs overflow-hidden bg-slate-50 flex items-center justify-center cursor-pointer group-hover:border-emerald-500 transition-colors"
                title="Click to upload or change logo"
              >
                {matchedSupplier.profile_picture_url ? (
                  <img
                    src={matchedSupplier.profile_picture_url}
                    alt={matchedSupplier.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-700">
                    <span className="text-xl font-bold uppercase">
                      {matchedSupplier.name ? matchedSupplier.name.charAt(0) : "S"}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick Hover Overlay */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute inset-0 rounded-xl bg-black/40 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                title="Change photo"
              >
                <Camera className="w-4 h-4 mb-0.5" />
                <span className="text-[9px] font-semibold">Change</span>
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">{matchedSupplier.name}</h1>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                  #{matchedSupplier.supplier_code}
                </span>
                {matchedSupplier.is_active ? (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active Supplier
                  </span>
                ) : (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-200">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {matchedSupplier.email || "Registered Partner Portal Profile"}
              </p>
            </div>
          </div>

          {/* Action Buttons for Avatar */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarFileSelect}
              accept="image/png, image/jpeg, image/jpg, image/webp"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isUploadingAvatar ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>{matchedSupplier.profile_picture_url ? "Change Logo" : "Upload Logo"}</span>
                </>
              )}
            </button>

            {matchedSupplier.profile_picture_url && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={isUploadingAvatar}
                className="px-3 py-2 text-xs font-medium text-red-600 hover:text-red-700 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
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
                  Last Used Handling Unit (HU) Number
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
                <p className="font-bold">Sequence Locked</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  To modify or re-align your HU sequence, please contact your System Administrator.
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
                    ? "Next carton generation will resume from this number + 1."
                    : "Enter last used Handling Unit number (0 if starting fresh). Next carton will generate from this number + 1."}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Last Used Handling Unit (HU) Number
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={huInput}
                    onChange={(e) => setHuInput(e.target.value)}
                    placeholder="e.g. 0 (if starting fresh) or last used serial (e.g. 50)"
                    className="w-full h-11 px-3.5 text-sm font-mono rounded-xl border border-gray-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-gray-50/50 focus:bg-white transition-colors"
                    disabled={isSavingHu}
                    required
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Next carton will generate from this number + 1 (e.g. 0 to 1).
                  </span>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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

            {/* Field 3: Country / Region */}
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

      {/* ─── SUPPLIER OFFLINE STORAGE & CACHE MANAGEMENT (SUPPLIER ONLY) ─── */}
      {!isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-gray-900">Offline Drafts & Local Cache</h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Manage temporary offline drafts, packing list configurations, and spreadsheet caches stored on this device.
              </p>
            </div>
            {draftCount > 0 && (
              <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <FileEdit className="w-3.5 h-3.5" />
                {draftCount} Active {draftCount === 1 ? "Draft" : "Drafts"}
              </span>
            )}
          </div>

          {cacheSuccessMsg && (
            <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{cacheSuccessMsg}</span>
            </div>
          )}

          {/* Metrics summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/70">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                Saved Offline Drafts
              </div>
              <div className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span>{draftStorageInfo.draftCount}</span>
                <span className="text-xs font-normal text-gray-400">items</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Wizard & Excel drop progress</p>
            </div>

            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/70">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                Storage Used
              </div>
              <div className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span>{draftStorageInfo.approxSizeKb}</span>
                <span className="text-xs font-normal text-gray-400">KB</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Browser storage footprint</p>
            </div>

            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/70">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                Cache Scope
              </div>
              <div className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5 mt-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Isolated to #{cleanCode || user?.supplier_code || "Supplier"}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Private to this supplier partner</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Clearing cache removes local unsent drafts without affecting live POs.</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isClearingCache || draftStorageInfo.draftCount === 0}
                onClick={handleClearCache}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all inline-flex items-center gap-2 cursor-pointer ${
                  draftStorageInfo.draftCount === 0
                    ? "bg-slate-50 text-slate-300 border border-slate-200 cursor-not-allowed"
                    : "bg-white text-red-600 border border-slate-200 hover:bg-red-50 hover:border-red-200"
                }`}
              >
                {isClearingCache ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    Clear Cache
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}