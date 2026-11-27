/**
 * KPI building blocks shared by the supplier Overview and the admin dashboard:
 * live-query defaults, count-up number, card and skeleton.
 */

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * Query options for KPI data. There is no WebSocket/SSE endpoint on the
 * backend, so KPIs poll every 30 s while the tab is visible, refetch on
 * focus, and are invalidated after mutations (see lib/crossTab.ts).
 */
export const KPI_QUERY_OPTIONS = {
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  staleTime: 10_000,
} as const;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Counts from the previous value to the new one in ~400 ms (instant with reduced motion). */
export function useCountUp(target: number, duration = 400): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target || prefersReducedMotion()) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, duration]);

  return display;
}

interface KpiCardProps {
  label: string;
  value: number;
  /** Turns the (animated) number into the display string, e.g. n => t("kpi.x.value", { count: n }). */
  format: (n: number) => string;
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  /** One short helper line under the value. */
  subtitle?: ReactNode;
  /** Colour for the value, e.g. red when something needs attention. */
  valueClassName?: string;
  onClick?: () => void;
}

export function KpiCard({ label, value, format, icon: Icon, iconClassName, subtitle, valueClassName, onClick }: KpiCardProps) {
  const shown = useCountUp(value);
  const [changed, setChanged] = useState(false);
  const prev = useRef(value);

  // Brief, subtle highlight when the value changes.
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      if (prefersReducedMotion()) return;
      setChanged(true);
      const id = setTimeout(() => setChanged(false), 900);
      return () => clearTimeout(id);
    }
  }, [value]);

  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "flex w-full flex-col rounded-lg border bg-white p-4 text-left transition-colors duration-300 motion-reduce:transition-none",
        changed ? "border-primary/40 bg-blue-50/40" : "border-slate-200",
        onClick && "hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600", iconClassName)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className={cn("mb-2 text-2xl font-semibold tabular-nums text-slate-900", valueClassName)} aria-live="polite">
        {format(Math.round(shown))}
      </div>
      {subtitle && (
        <div className="mt-auto border-t border-slate-100 pt-2 text-sm">
          <span className="block truncate text-slate-500">{subtitle}</span>
        </div>
      )}
    </Wrapper>
  );
}

export function KpiSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" aria-hidden="true">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-28 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
      </div>
      <div className="mb-3 h-7 w-24 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
      <div className="h-4 w-full animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
    </div>
  );
}

/** 4 per row on wide screens, 2 on laptop / tablet, 1 on narrow screens. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
