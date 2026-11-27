/**
 * Shared page heading, styled like the "Purchase Orders" header, used on every page
 * so titles, badges and descriptions can't drift apart.
 *
 *   [breadcrumb]
 *   [h1 title] [badge]                         [actions →]
 *   [description]
 */

import { isValidElement } from "react";
import type { LucideIcon } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/utils/cn";

export type PageHeaderBadgeTone = "role" | "neutral" | "success" | "warning";

export interface PageHeaderBadge {
  label: React.ReactNode;
  /** A lucide icon, or any node (e.g. a status dot). */
  icon?: LucideIcon | React.ReactNode;
  tone?: PageHeaderBadgeTone;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  /** One badge, several (e.g. "Active" + "v1"), or a ready-made badge element (e.g. <StatusBadge>). */
  badge?: PageHeaderBadge | PageHeaderBadge[] | React.ReactElement;
  /** One line under the title. */
  description?: React.ReactNode;
  /** Buttons on the right; they wrap under the title on phones. */
  actions?: React.ReactNode;
  /** Optional line above the title. */
  breadcrumb?: React.ReactNode;
  /** Only for titles that are codes, e.g. a PO number. */
  mono?: boolean;
  /** id on the <h1>, for aria-labelledby. */
  titleId?: string;
  /** Long titles (e.g. email subjects) wrap instead of overflowing. */
  wrapTitle?: boolean;
  className?: string;
}

const TONES: Record<Exclude<PageHeaderBadgeTone, "role">, { pill: string; icon: string }> = {
  neutral: { pill: "bg-slate-50 text-slate-700 border-slate-200", icon: "text-slate-500" },
  success: { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "text-emerald-600" },
  warning: { pill: "bg-amber-50 text-amber-800 border-amber-200", icon: "text-amber-600" },
};
const ADMIN_TONE = { pill: "bg-blue-50 text-blue-700 border-blue-200", icon: "text-blue-600" };

export const PAGE_TITLE_CLASS = "text-2xl font-bold tracking-tight text-gray-950";
export const PAGE_BADGE_CLASS =
  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-2xs border";

function isLucideIcon(icon: unknown): icon is LucideIcon {
  // lucide icons are forwardRef components (objects with a render function) or plain functions.
  return typeof icon === "function" || (typeof icon === "object" && icon !== null && "render" in icon);
}

/** Pill + icon colours for a badge tone ("role": emerald for suppliers, blue for admins). */
export function badgeToneClasses(tone: PageHeaderBadgeTone, isSupplier: boolean) {
  return tone === "role" ? (isSupplier ? TONES.success : ADMIN_TONE) : TONES[tone];
}

export function PageHeaderBadgePill({ label, icon, tone = "neutral" }: PageHeaderBadge) {
  const isSupplier = useAuthStore((s) => s.user?.role === "SUPPLIER");
  const style = badgeToneClasses(tone, isSupplier);
  let iconNode: React.ReactNode = null;
  if (isLucideIcon(icon)) {
    const Icon = icon;
    iconNode = <Icon className={cn("h-3.5 w-3.5", style.icon)} aria-hidden="true" />;
  } else if (icon) {
    iconNode = icon;
  }
  return (
    <span className={cn(PAGE_BADGE_CLASS, style.pill)}>
      {iconNode}
      {label}
    </span>
  );
}

export default function PageHeader({
  title,
  badge,
  description,
  actions,
  breadcrumb,
  mono,
  titleId,
  wrapTitle,
  className,
}: PageHeaderProps) {
  const badgeElement = isValidElement(badge) ? badge : null;
  const badges = !badge || badgeElement ? [] : Array.isArray(badge) ? badge : [badge as PageHeaderBadge];
  return (
    <div className={cn("flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1">{breadcrumb}</div>}
        <div className="flex flex-wrap items-center gap-3">
          <h1 id={titleId} className={cn(PAGE_TITLE_CLASS, mono && "font-mono", wrapTitle && "min-w-0 break-words")}>
            {title}
          </h1>
          {badges.map((b, i) => (
            <PageHeaderBadgePill key={i} {...b} />
          ))}
          {badgeElement}
        </div>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
