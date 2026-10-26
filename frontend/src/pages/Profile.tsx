import { useState, useRef } from "react";
import {
  Building2,
  ShieldCheck,
  Boxes,
  Lock,
  AlertCircle,
  CheckCircle2,
  Camera,
  Upload,
  Trash2,
  Loader2,
  HardDrive,
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
import { cn } from "@/utils/cn";

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
    <div className="p-6 space-y-5 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* ─── 1. TOP PROFILE HEADER & IDENTITY HERO ─── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
        {/* Alerts */}
        {avatarSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-xs text-emerald-800 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{avatarSuccess}</span>
          </div>
        )}

        {avatarError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2.5 text-xs text-red-800 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">{avatarError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
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

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-slate-900 truncate">{matchedSupplier.name}</h1>
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                  {matchedSupplier.supplier_code}
                </span>
                {matchedSupplier.is_active ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active Partner
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                    Inactive
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                <span>{matchedSupplier.email || "partner@plant.local"}</span>
                <span className="text-slate-300">•</span>
                <span>{matchedSupplier.country || "Sri Lanka"}</span>
                {matchedSupplier.category && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>{matchedSupplier.category}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons for Avatar */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
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
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── 2. CORE DETAILS: HANDLING UNIT (HU) & REGISTRY DETAILS (2-COL GRID) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Handling Unit Sequence Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Handling Unit (HU) Sequence</h2>
                  <p className="text-[11px] text-slate-500">SSCC-20 barcode tracking for dispatch cartons</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isHuLocked ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    <Lock className="w-3 h-3 text-amber-600" />
                    Locked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    <AlertCircle className="w-3 h-3 text-rose-600" />
                    Setup Needed
                  </span>
                )}
                {isAdmin && isHuLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdminEditOpen(!isAdminEditOpen);
                      if (!isAdminEditOpen) setHuInput(matchedSupplier.current_hu_number || "");
                    }}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                  >
                    {isAdminEditOpen ? "Cancel" : "Edit"}
                  </button>
                )}
              </div>
            </div>

            {/* Status alerts */}
            {huSuccess && (
              <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{huSuccess}</span>
              </div>
            )}

            {huError && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{huError}</span>
              </div>
            )}

            {/* Locked or input state */}
            <div className="pt-3">
              {isHuLocked && !isAdminEditOpen ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Last Used HU Number
                      </span>
                      <span className="font-mono text-base sm:text-lg font-bold text-slate-900 block mt-0.5">
                        {matchedSupplier.current_hu_number || "Initialized"}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded shadow-2xs">
                      Synchronized
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Sequence is locked to preserve Calzedonia EDI integrity. Contact System Administrator for adjustments.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSaveHu} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {isAdminEditOpen ? "Override HU Sequence" : "Initial Last Used HU Number"}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={huInput}
                        onChange={(e) => setHuInput(e.target.value)}
                        placeholder="e.g. 0 (if starting fresh) or last serial"
                        className="flex-1 h-9 px-3 text-xs font-mono rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400 outline-none"
                        disabled={isSavingHu}
                        required
                      />
                      <button
                        type="submit"
                        disabled={isSavingHu || !huInput.trim()}
                        className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        {isSavingHu ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                        <span>{isAdminEditOpen ? "Update" : "Lock Sequence"}</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">Next carton barcode will generate from this number + 1.</p>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Right: Company Registry Details Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Company Registry Details</h2>
                <p className="text-[11px] text-slate-500">Official enterprise records from plant database</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Verified ID
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/80">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Company Name</span>
              <span className="font-semibold text-slate-900 truncate block mt-0.5">{matchedSupplier.name}</span>
            </div>

            <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/80">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Partner Code</span>
              <span className="font-mono font-bold text-slate-900 block mt-0.5">{matchedSupplier.supplier_code}</span>
            </div>

            <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/80">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Contact Person</span>
              <span className="font-medium text-slate-800 block mt-0.5">{matchedSupplier.contact_name || user?.name || "Representative"}</span>
            </div>

            <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/80">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Country / Region</span>
              <span className="font-medium text-slate-800 block mt-0.5">{matchedSupplier.country || "Sri Lanka"}</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 pt-1">
            To request changes to legal enterprise name or billing details, please contact Central HQ Administration.
          </p>
        </div>
      </div>

      {/* ─── 3. LOCAL CACHE & OFFLINE STORAGE (COMPACT FOOTER BAR FOR SUPPLIERS) ─── */}
      {!isAdmin && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-900">Local Cache & Offline Drafts</h3>
                {draftCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    {draftCount} {draftCount === 1 ? "Draft" : "Drafts"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {draftStorageInfo.draftCount} saved items • {draftStorageInfo.approxSizeKb} KB browser storage used on this device
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {cacheSuccessMsg && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md animate-in fade-in">
                {cacheSuccessMsg}
              </span>
            )}
            <button
              type="button"
              disabled={isClearingCache || draftStorageInfo.draftCount === 0}
              onClick={handleClearCache}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer",
                draftStorageInfo.draftCount === 0
                  ? "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                  : "bg-white text-red-600 border-slate-200 hover:bg-red-50 hover:border-red-200"
              )}
            >
              {isClearingCache ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Clearing...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>Clear Local Drafts</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}