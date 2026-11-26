/**
 * Supplier onboarding / edit page (admin) — /suppliers/new and /suppliers/:supplierId/edit
 *
 * Replaces the add/edit supplier modals. Opened in a new tab from the
 * supplier directory; loads the supplier from the server by id.
 * Admin screen — English only.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Camera, CheckCircle2, Loader2, Sparkles, Upload } from "lucide-react";
import { supplierApi } from "@/services/supplierApi";
import { getErrorMessage } from "@/services/apiError";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from "@/i18n";
import { recordSupplierCreateEvent, recordSupplierFieldChanges } from "@/utils/supplierFieldUpdates";
import { broadcastInvalidate } from "@/lib/crossTab";
import { compressAndEncodeImage } from "@/utils/image";
import { cn } from "@/utils/cn";
import type { SupplierItem } from "@/pages/Suppliers";

const schema = z.object({
  name: z.string().trim().min(1, "Supplier name is required.").max(200, "Use at most 200 characters."),
  supplier_code: z
    .string()
    .trim()
    .min(1, "Supplier code is required.")
    .max(20, "Use at most 20 characters.")
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, digits and dashes only."),
  country: z.string().trim().max(100, "Use at most 100 characters."),
  preferred_language: z.string(),
  current_hu_number: z
    .string()
    .trim()
    .max(20, "Use at most 20 digits.")
    .regex(/^\d*$/, "Digits only (0 or more)."),
  hu_locked: z.boolean(),
  is_active: z.boolean(),
  profile_picture_url: z.string(),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  name: "",
  supplier_code: "",
  country: "Sri Lanka",
  preferred_language: "en",
  current_hu_number: "",
  hu_locked: false,
  is_active: true,
  profile_picture_url: "",
};

const inputClass = (hasError?: boolean) =>
  cn(
    "w-full h-10 rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition-colors",
    "focus:border-primary focus:ring-2 focus:ring-primary/20",
    hasError ? "border-red-400" : "border-slate-200"
  );

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  );
}

export default function SupplierForm() {
  const { supplierId } = useParams();
  const isEdit = Boolean(supplierId);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [processingImage, setProcessingImage] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => supplierApi.list(),
    enabled: isEdit,
    refetchInterval: false,
  });
  const supplier: SupplierItem | undefined = suppliers?.find((s) => s.id === supplierId);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY, mode: "onBlur" });

  useEffect(() => {
    if (supplier) {
      reset({
        name: supplier.name,
        supplier_code: supplier.supplier_code,
        country: supplier.country || "Sri Lanka",
        preferred_language: supplier.preferred_language || "en",
        current_hu_number: supplier.current_hu_number || "",
        hu_locked: Boolean(supplier.hu_locked),
        is_active: supplier.is_active,
        profile_picture_url: supplier.profile_picture_url || "",
      });
    }
  }, [supplier, reset]);

  useEffect(() => {
    document.title = `${isEdit ? "Edit supplier" : "Onboard supplier"} · ANS Portal`;
  }, [isEdit]);

  const picture = watch("profile_picture_url");
  const name = watch("name");
  const huLocked = watch("hu_locked");

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Please choose a PNG, JPG or WebP image.");
      return;
    }
    setProcessingImage(true);
    try {
      setValue("profile_picture_url", await compressAndEncodeImage(file), { shouldDirty: true });
    } catch {
      setNotice("Could not process that image.");
    } finally {
      setProcessingImage(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const lookupXml = async () => {
    const code = getValues("supplier_code").trim();
    if (!code) return;
    setLookingUp(true);
    setNotice(null);
    try {
      const res = await supplierApi.lookupXml(code);
      if (res?.found) {
        if (res.supplier_code) setValue("supplier_code", res.supplier_code, { shouldDirty: true });
        if (res.name) setValue("name", res.name, { shouldDirty: true, shouldValidate: true });
        if (res.country) setValue("country", res.country, { shouldDirty: true });
        setNotice(`Auto-filled from ${res.source_filename || "inbound XML"}.`);
      } else {
        setNotice(`No inbound XML found for code ${code} yet.`);
      }
    } catch {
      setNotice("Could not look up XML for this code.");
    } finally {
      setLookingUp(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setSavedMessage(null);
    const payload = {
      name: values.name,
      supplier_code: values.supplier_code.toUpperCase(),
      country: values.country || "Sri Lanka",
      profile_picture_url: values.profile_picture_url || undefined,
      current_hu_number: values.current_hu_number,
      is_active: values.is_active,
      preferred_language: values.preferred_language,
    };
    try {
      if (isEdit && supplier) {
        recordSupplierFieldChanges(supplier, {
          name: payload.name,
          supplier_code: payload.supplier_code,
          country: payload.country,
          is_active: payload.is_active,
        });
        const updated = await supplierApi.update(supplier.id, { ...payload, hu_locked: values.hu_locked });
        reset(values);
        setSavedMessage(`Saved changes for ${updated.name} (${updated.supplier_code}).`);
      } else {
        const created = await supplierApi.create({
          ...payload,
          current_hu_number: values.current_hu_number || undefined,
        });
        recordSupplierCreateEvent({
          id: created.id,
          supplier_code: created.supplier_code,
          name: created.name,
          email: created.email,
          credentials_sent: true,
        });
        broadcastInvalidate(["suppliers"]);
        navigate(`/suppliers/${created.id}/edit`, { replace: true });
        setSavedMessage(`Supplier onboarded: ${created.name} (${created.supplier_code}).`);
        return;
      }
      broadcastInvalidate(["suppliers"]);
    } catch (err) {
      setServerError(getErrorMessage(err, "Could not save the supplier. Check the details and try again."));
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6" aria-busy="true">
        <div className="h-96 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
      </div>
    );
  }

  if (isEdit && !supplier) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Supplier not found. It may have been removed.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{isEdit ? "Edit supplier" : "Onboard new supplier"}</h1>
        <button type="button" onClick={() => navigate("/suppliers")} className="btn btn-secondary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Supplier directory
        </button>
      </div>

      {savedMessage && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {savedMessage}
        </div>
      )}
      {serverError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
        {notice && (
          <p className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <Sparkles className="h-4 w-4 text-slate-500" aria-hidden="true" />
            {notice}
          </p>
        )}

        {/* Picture */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Choose a profile picture"
          >
            {picture ? (
              <img src={picture} alt="" className="h-full w-full object-cover" />
            ) : name ? (
              <span className="text-xl font-semibold uppercase text-slate-600">{name.charAt(0)}</span>
            ) : (
              <Camera className="h-6 w-6 text-slate-400" aria-hidden="true" />
            )}
            {processingImage && (
              <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              </span>
            )}
          </button>
          <div>
            <p className="text-sm font-medium text-slate-800">Profile picture / logo</p>
            <p className="text-sm text-slate-500">PNG, JPG or WebP. Resized automatically.</p>
            <div className="mt-1.5 flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary btn-sm">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {picture ? "Change" : "Upload"}
              </button>
              {picture && (
                <button
                  type="button"
                  onClick={() => setValue("profile_picture_url", "", { shouldDirty: true })}
                  className="btn btn-sm text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickImage} />
        </div>

        <div>
          <label htmlFor="sf-name" className="mb-1 block text-sm font-medium text-slate-700">
            Supplier company name <span className="text-red-600">*</span>
          </label>
          <input id="sf-name" {...register("name")} maxLength={200} aria-invalid={Boolean(errors.name)} className={inputClass(Boolean(errors.name))} />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="sf-code" className="block text-sm font-medium text-slate-700">
                Supplier code <span className="text-red-600">*</span>
              </label>
              {!isEdit && (
                <button type="button" onClick={lookupXml} disabled={lookingUp} className="text-sm font-medium text-primary hover:underline disabled:opacity-50">
                  {lookingUp ? "Fetching…" : "Auto-fill from XML"}
                </button>
              )}
            </div>
            <input
              id="sf-code"
              {...register("supplier_code", {
                onBlur: () => {
                  if (!isEdit && !getValues("name")) void lookupXml();
                },
              })}
              maxLength={20}
              aria-invalid={Boolean(errors.supplier_code)}
              className={cn(inputClass(Boolean(errors.supplier_code)), "font-mono")}
            />
            <p className="mt-1 text-sm text-slate-500">Unique EDI code from &lt;SdPartner&gt;.</p>
            <FieldError message={errors.supplier_code?.message} />
          </div>
          <div>
            <label htmlFor="sf-country" className="mb-1 block text-sm font-medium text-slate-700">
              Country
            </label>
            <input id="sf-country" {...register("country")} maxLength={100} className={inputClass(Boolean(errors.country))} />
            <FieldError message={errors.country?.message} />
          </div>
          <div>
            <label htmlFor="sf-lang" className="mb-1 block text-sm font-medium text-slate-700">
              Language
            </label>
            <select id="sf-lang" {...register("preferred_language")} className={inputClass()}>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_NAMES[lang]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sf-hu" className="mb-1 block text-sm font-medium text-slate-700">
              Last used HU number
            </label>
            <input
              id="sf-hu"
              inputMode="numeric"
              {...register("current_hu_number")}
              maxLength={20}
              aria-invalid={Boolean(errors.current_hu_number)}
              className={cn(inputClass(Boolean(errors.current_hu_number)), "font-mono")}
            />
            <p className="mt-1 text-sm text-slate-500">The next carton sequence starts at this number + 1.</p>
            <FieldError message={errors.current_hu_number?.message} />
          </div>
        </div>

        {isEdit && (
          <div className="space-y-3 rounded-lg bg-slate-50 p-4">
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" {...register("hu_locked")} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span>
                <span className="font-medium">Lock HU number for the supplier</span>
                <span className="block text-slate-500">
                  {huLocked ? "The supplier cannot change it from the portal." : "The supplier can set it once from the portal."}
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" {...register("is_active")} className="h-4 w-4 rounded border-slate-300" />
              Supplier account active
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={() => navigate("/suppliers")} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting || processingImage || (isEdit && !isDirty)} className="btn btn-primary">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Onboard supplier"}
          </button>
        </div>
      </form>
    </div>
  );
}
