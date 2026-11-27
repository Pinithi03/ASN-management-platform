import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * Red notice for a delivery date that has already passed.
 * One style everywhere the past-date check appears (workbench, Excel upload).
 */
export default function PastDateAlert({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <div
      id={id}
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700",
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Classes for a date input that has a past-date / invalid-date error. */
export const DATE_INPUT_ERROR_CLASSES =
  "border-red-500 ring-2 ring-red-200 bg-red-50/40 focus:border-red-500 focus:ring-red-300 focus-visible:outline-red-500";

/** Classes for the inline error text under a date input. */
export const DATE_ERROR_TEXT_CLASSES = "text-sm text-red-600";
