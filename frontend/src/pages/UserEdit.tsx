/**
 * Edit administrator page — /users/:userId/edit (admin only, English).
 * Replaces the "Edit administrator" modal; opened in a new tab.
 */

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { userApi } from "@/services/userApi";
import { getErrorMessage } from "@/services/apiError";
import { broadcastInvalidate } from "@/lib/crossTab";
import { cn } from "@/utils/cn";

const schema = z.object({
  full_name: z.string().trim().min(1, "Full name is required.").max(120, "Use at most 120 characters."),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export default function UserEdit() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();

  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => userApi.list() });
  const user = users?.find((u) => u.id === userId);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", role: "ADMIN", is_active: true },
  });

  useEffect(() => {
    if (user) {
      reset({
        full_name: user.full_name || "",
        role: user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN",
        is_active: user.is_active,
      });
    }
  }, [user, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      await userApi.update(userId, { ...values, plant_code: "HQ" });
      reset(values);
      broadcastInvalidate(["users"]);
    } catch (err) {
      setError("root", { message: getErrorMessage(err, "Could not update the administrator.") });
      throw err;
    }
  };

  if (isLoading) {
    return <div className="mx-auto m-6 h-72 max-w-2xl animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />;
  }
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          User not found.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Edit administrator</h1>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>
        <button type="button" onClick={() => navigate("/settings/users")} className="btn btn-secondary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All users
        </button>
      </div>

      {isSubmitSuccessful && !isDirty && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Changes saved.
        </div>
      )}
      {errors.root?.message && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.root.message}
        </p>
      )}

      <form
        onSubmit={handleSubmit((v) => onSubmit(v).catch(() => undefined))}
        noValidate
        className="space-y-5 rounded-lg border border-slate-200 bg-white p-5"
      >
        <div>
          <label htmlFor="ue-name" className="mb-1 block text-sm font-medium text-slate-700">
            Full name <span className="text-red-600">*</span>
          </label>
          <input
            id="ue-name"
            {...register("full_name")}
            maxLength={120}
            aria-invalid={Boolean(errors.full_name)}
            className={cn(
              "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
              errors.full_name ? "border-red-400" : "border-slate-200"
            )}
          />
          {errors.full_name && <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>}
        </div>

        <div>
          <label htmlFor="ue-role" className="mb-1 block text-sm font-medium text-slate-700">
            Role
          </label>
          <select
            id="ue-role"
            {...register("role")}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="SUPER_ADMIN">Super administrator (full system and organisation control)</option>
            <option value="ADMIN">System administrator (operations and ASN management)</option>
          </select>
          <p className="mt-1 text-sm text-slate-500">Administrators work across all plants and headquarters.</p>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" {...register("is_active")} className="h-4 w-4 rounded border-slate-300" />
          Account active
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={() => navigate("/settings/users")} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting || !isDirty} className="btn btn-primary">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {isSubmitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
