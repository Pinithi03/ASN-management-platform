import { cn } from "@/utils/cn";
import { statusBadgeClass } from "@/utils/statusStyles";
import { poStatusLabel } from "@/i18n/poStatus";

interface StatusBadgeProps {
  status: string | null | undefined;
  /** Translated text to show; defaults to the PO status label. */
  label?: string;
  className?: string;
}

/** Small pill: tinted background + darker text + the (translated) status text. */
export default function StatusBadge({ status, label, className }: StatusBadgeProps) {
  if (!status) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium leading-5",
        statusBadgeClass(status),
        className
      )}
    >
      {label ?? poStatusLabel(status)}
    </span>
  );
}
