/**
 * Overview widgets shared by the supplier and admin Overview pages.
 * All data comes from GET /dashboard/overview (see services/dashboardApi.ts).
 */

import { useMemo, type ComponentType, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Box,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Package,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard, KpiGrid } from "@/components/dashboard/Kpi";
import { formatDate, formatMonthShort, formatNumber } from "@/i18n/format";
import { parseLocalDate } from "@/utils/dates";
import { cn } from "@/utils/cn";
import type {
  DashboardOverview,
  OverviewDeadlines,
  OverviewMonth,
  OverviewPlant,
  OverviewShipment,
  OverviewStatusBreakdown,
  OverviewSupplier,
  OverviewUpcoming,
} from "@/services/dashboardApi";

export type OverviewAccent = "emerald" | "blue";

const ACCENT = {
  emerald: { hex: "#059669", text: "text-emerald-600", link: "text-emerald-600 hover:text-emerald-700", button: "bg-emerald-600 hover:bg-emerald-700" },
  blue: { hex: "#2563eb", text: "text-blue-600", link: "text-blue-600 hover:text-blue-700", button: "bg-blue-600 hover:bg-blue-700" },
} as const;

/* ─── Helpers ─────────────────────────────────────────────────── */

/** Whole-number percentages that always add up to 100 (largest remainder). */
export function percentages(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const floored = raw.map(Math.floor);
  let left = 100 - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    if (values[i] > 0) {
      floored[i] += 1;
      left -= 1;
    }
  }
  return floored;
}

/** Share of the total as a bar width in %, with no minimum stub for zero. */
export function barWidth(value: number, total: number): number {
  if (value <= 0 || total <= 0) return 0;
  return Math.min(100, (value / total) * 100);
}

/** Change vs last month in whole %, or null when last month had nothing. */
export function monthTrend(thisMonth: number, lastMonth: number): number | null {
  if (lastMonth <= 0) return null;
  return Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return formatMonthShort(new Date(y, (m || 1) - 1, 1));
}

/* ─── Building blocks ─────────────────────────────────────────── */

function Panel({
  icon: Icon,
  iconClassName,
  title,
  action,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-lg border border-slate-200 bg-white p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-sm font-semibold text-slate-900">
          <Icon className={cn("h-4 w-4 text-slate-500", iconClassName)} aria-hidden="true" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function LinkButton({ onClick, accent, children }: { onClick: () => void; accent: OverviewAccent; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex cursor-pointer items-center gap-1 text-xs font-semibold", ACCENT[accent].link)}
    >
      {children} <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

function EmptyState({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center text-sm text-slate-500">
      <Icon className="mb-2 h-8 w-8 text-slate-300" aria-hidden="true" />
      {children}
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-semibold text-slate-700">{label}</p>}
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2 py-0.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.payload?.fill || entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="ml-auto font-semibold tabular-nums text-slate-900">{formatNumber(entry.value)}</span>
        </div>
      ))}
      {payload[0]?.payload?.cartons !== undefined && payload[0]?.dataKey === "pieces" && (
        <p className="mt-1 text-slate-500">{payload[0].payload.cartonsLabel}</p>
      )}
    </div>
  );
};

/* ─── KPI cards ───────────────────────────────────────────────── */

export function OverviewKpis({ data }: { data: DashboardOverview }) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const k = data.kpis;
  const month = k.dispatched_this_month;
  const trend = monthTrend(month.pieces, k.dispatched_last_month_pieces);
  const dueWeek = k.due_3_days + k.due_7_days;

  return (
    <KpiGrid>
      <KpiCard
        label={t("kpi.open.label")}
        value={k.open_orders}
        format={(n) => t("kpi.open.value", { count: n })}
        icon={Package}
        subtitle={t("kpi.open.helper", { count: k.partially_shipped })}
        onClick={() => navigate("/purchase-orders")}
      />
      <KpiCard
        label={t("kpi.overdue.label")}
        value={k.overdue_orders}
        format={(n) => t("kpi.overdue.value", { count: n })}
        icon={AlertTriangle}
        iconClassName={k.overdue_orders > 0 ? "bg-red-50 text-red-600" : undefined}
        valueClassName={k.overdue_orders > 0 ? "text-red-700" : undefined}
        subtitle={t("kpi.overdue.helper")}
        onClick={() => navigate("/purchase-orders")}
      />
      <KpiCard
        label={t("kpi.due7.label")}
        value={dueWeek}
        format={(n) => t("kpi.due7.value", { count: n })}
        icon={Clock}
        iconClassName={dueWeek > 0 ? "bg-amber-50 text-amber-600" : undefined}
        valueClassName={dueWeek > 0 ? "text-amber-700" : undefined}
        subtitle={t("kpi.due7.helper", { count: k.due_3_days })}
        onClick={() => navigate("/purchase-orders")}
      />
      <KpiCard
        label={t("kpi.dispatched.label")}
        value={month.pieces}
        format={(n) => t("kpi.dispatched.value", { pieces: formatNumber(n) })}
        icon={Truck}
        iconClassName="bg-emerald-50 text-emerald-600"
        subtitle={
          <>
            {t("kpi.dispatched.helper", { cartons: formatNumber(month.cartons), shipments: formatNumber(month.shipments) })}
            {trend !== null && trend !== 0 && (
              <span className={cn("ml-1.5", trend > 0 ? "text-emerald-700" : "text-slate-500")}>
                {trend > 0 ? t("kpi.dispatched.trendUp", { percent: trend }) : t("kpi.dispatched.trendDown", { percent: Math.abs(trend) })}
              </span>
            )}
          </>
        }
        onClick={() => navigate("/shipments")}
      />
    </KpiGrid>
  );
}

/* ─── Monthly dispatch (bars) ─────────────────────────────────── */

export function MonthlyDispatchCard({ monthly, accent }: { monthly: OverviewMonth[]; accent: OverviewAccent }) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const chartData = useMemo(
    () =>
      monthly.map((m) => ({
        ...m,
        label: monthLabel(m.month),
        cartonsLabel: t("monthly.tooltipCartons", { cartons: formatNumber(m.cartons), shipments: formatNumber(m.shipments) }),
      })),
    [monthly, t]
  );
  const hasData = monthly.some((m) => m.pieces > 0);
  const current = monthly[monthly.length - 1]?.pieces ?? 0;

  return (
    <Panel icon={TrendingUp} iconClassName={ACCENT[accent].text} title={t("monthly.title")} className="lg:col-span-2">
      {hasData ? (
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="pieces" name={t("monthly.seriesPieces")} fill={ACCENT[accent].hex} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState icon={Truck}>{t("monthly.empty")}</EmptyState>
      )}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        <span className="text-slate-500">
          <Trans
            t={t}
            i18nKey="monthly.thisMonth"
            values={{ value: formatNumber(current) }}
            components={{ strong: <strong className="font-semibold text-slate-900" /> }}
          />
        </span>
        <LinkButton onClick={() => navigate("/shipments")} accent={accent}>
          {t("links.allShipments")}
        </LinkButton>
      </div>
    </Panel>
  );
}

/* ─── Order status donut ──────────────────────────────────────── */

const STATUS_SLICES: Array<{ key: keyof OverviewStatusBreakdown; labelKey: string; color: string; optional?: boolean }> = [
  { key: "open", labelKey: "status.open", color: "#3b82f6" },
  { key: "partially_shipped", labelKey: "status.partiallyShipped", color: "#f59e0b" },
  { key: "shipped", labelKey: "status.shipped", color: "#10b981" },
  { key: "completed", labelKey: "status.completed", color: "#047857" },
  { key: "cancelled", labelKey: "status.cancelled", color: "#94a3b8", optional: true },
  { key: "other", labelKey: "status.other", color: "#cbd5e1", optional: true },
];

export function StatusDonutCard({ breakdown }: { breakdown: OverviewStatusBreakdown }) {
  const { t } = useTranslation("dashboard");
  const slices = STATUS_SLICES.filter((s) => !s.optional || breakdown[s.key] > 0).map((s) => ({
    name: t(s.labelKey as "status.open"),
    value: breakdown[s.key],
    color: s.color,
  }));
  const pct = percentages(slices.map((s) => s.value));
  const total = breakdown.total;

  return (
    <Panel icon={BarChart3} title={t("status.title")}>
      {total > 0 ? (
        <>
          <div className="relative mx-auto h-48 w-full max-w-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices.filter((s) => s.value > 0)}
                  dataKey="value"
                  innerRadius={60}
                  outerRadius={82}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {slices
                    .filter((s) => s.value > 0)
                    .map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-heading text-2xl font-bold tabular-nums text-slate-900">{formatNumber(total)}</span>
              <span className="text-xs font-medium text-slate-500">{t("status.centre")}</span>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
            {slices.map((s, i) => (
              <li key={s.name} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold text-slate-900">{formatNumber(s.value)}</span>
                  <span className="ml-1.5 text-xs text-slate-400">{pct[i]}%</span>
                </span>
              </li>
            ))}
          </ul>
          {breakdown.updated_by_customer > 0 && (
            <p className="mt-2 text-xs text-slate-500">{t("status.updatedByCustomer", { count: breakdown.updated_by_customer })}</p>
          )}
        </>
      ) : (
        <EmptyState icon={Package}>{t("status.empty")}</EmptyState>
      )}
    </Panel>
  );
}

/* ─── Delivery deadlines ──────────────────────────────────────── */

export function DeadlinesCard({ deadlines }: { deadlines: OverviewDeadlines }) {
  const { t } = useTranslation("dashboard");
  const buckets = [
    { id: "overdue", name: t("deadlines.overdue"), count: deadlines.overdue, fill: "#ef4444", tile: "bg-red-50 border-red-200 text-red-700" },
    { id: "due3", name: t("deadlines.due3"), count: deadlines.due_3_days, fill: "#f59e0b", tile: "bg-amber-50 border-amber-200 text-amber-800" },
    { id: "due7", name: t("deadlines.due7"), count: deadlines.due_7_days, fill: "#10b981", tile: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { id: "onTrack", name: t("deadlines.onTrack"), count: deadlines.on_track, fill: "#06b6d4", tile: "bg-cyan-50 border-cyan-200 text-cyan-800" },
  ];
  const anyOpen = buckets.some((b) => b.count > 0) || deadlines.no_date > 0;

  return (
    <Panel icon={Calendar} iconClassName="text-amber-500" title={t("deadlines.title")}>
      {anyOpen ? (
        <>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="count" name={t("deadlines.seriesOrders")} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                  {buckets.map((b) => (
                    <Cell key={b.id} fill={b.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-center sm:grid-cols-4">
            {buckets.map((b) => (
              <div key={b.id} className={cn("rounded-lg border p-2", b.tile)}>
                <p className="text-xs font-medium">{b.name}</p>
                <p className="font-heading text-lg font-bold tabular-nums">{formatNumber(b.count)}</p>
              </div>
            ))}
          </div>
          {deadlines.no_date > 0 && (
            <p className="mt-2 text-xs text-slate-500">{t("deadlines.noDate", { count: deadlines.no_date })}</p>
          )}
        </>
      ) : (
        <EmptyState icon={CheckCircle2}>{t("deadlines.empty")}</EmptyState>
      )}
    </Panel>
  );
}

/* ─── Manufacturing destinations ──────────────────────────────── */

export function PlantsCard({ plants, accent }: { plants: OverviewPlant[]; accent: OverviewAccent }) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const totalPieces = plants.reduce((a, p) => a + p.dispatched_pieces, 0);

  return (
    <Panel icon={Building2} iconClassName={ACCENT[accent].text} title={t("plants.title")}>
      <ul className="space-y-1">
        {plants.map((p) => {
          const isOther = p.plant_key === "OTHER";
          const clickable = p.has_orders && !isOther;
          const name = isOther ? t("plants.other") : p.name;
          const width = barWidth(p.dispatched_pieces, totalPieces);
          const content = (
            <>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("truncate font-medium", p.has_orders ? "text-slate-900" : "text-slate-400")}>{name}</span>
                  {!isOther && (
                    <span className="shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 font-mono text-xs text-slate-500">
                      {p.plant_code}
                    </span>
                  )}
                </span>
                {p.has_orders ? (
                  <span className="shrink-0 text-right text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">{t("plants.open", { count: p.open_orders })}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    {t("plants.dispatched", { pieces: formatNumber(p.dispatched_pieces), cartons: formatNumber(p.dispatched_cartons) })}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">{t("plants.noOrders")}</span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                {width > 0 && (
                  <div className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${width}%`, backgroundColor: ACCENT[accent].hex }} />
                )}
              </div>
            </>
          );
          return (
            <li key={p.plant_key}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => navigate(`/purchase-orders/manual?plant=${encodeURIComponent(p.plant_key)}`)}
                  title={t("plants.openTitle", { plant: p.name })}
                  className="w-full cursor-pointer rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {content}
                </button>
              ) : (
                <div className="px-2 py-2">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ─── Deliveries due soon ─────────────────────────────────────── */

export function UpcomingCard({ items, accent, canPack }: { items: OverviewUpcoming[]; accent: OverviewAccent; canPack: boolean }) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();

  return (
    <Panel
      icon={Clock}
      title={t("dueSoon.title")}
      action={
        <LinkButton onClick={() => navigate("/purchase-orders")} accent={accent}>
          {t("links.allOrders")}
        </LinkButton>
      }
    >
      {items.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {items.map((po) => {
            const days = po.days_left;
            const overdue = days < 0;
            const urgent = days >= 0 && days <= 3;
            const partial = po.status === "PARTIAL";
            const date = parseLocalDate(po.delivery_date);
            const product = po.item_code && po.description && po.item_code !== po.description
              ? `${po.item_code} — ${po.description}`
              : po.item_code || po.description || t("fallback.apparelItem");
            return (
              <li key={po.po_id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/purchase-orders/${po.po_id}`)}
                      className="cursor-pointer font-mono text-xs font-semibold text-slate-900 hover:underline"
                    >
                      {po.po_number || t("dueSoon.unnamedPo")}
                    </button>
                    <span
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-xs font-medium",
                        overdue
                          ? "border-red-200 bg-red-50 text-red-700"
                          : urgent
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      )}
                    >
                      {overdue
                        ? t("dueSoon.overdue", { days: Math.abs(days) })
                        : days === 0
                        ? t("dueSoon.dueToday")
                        : days === 1
                        ? t("dueSoon.dueTomorrow")
                        : t("dueSoon.daysLeft", { days })}
                    </span>
                    {partial && (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                        {t("dueSoon.partial")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {po.plant_code && <span className="font-medium text-slate-700">{po.plant_code} · </span>}
                    {product}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {t("dueSoon.target", { date: date ? formatDate(date) : t("fallback.noDate") })}{" "}
                    <span className="font-semibold text-slate-700">
                      {formatNumber(Math.round(partial ? po.remaining_quantity : po.quantity))}
                      {partial && <span className="font-normal text-slate-400"> / {formatNumber(po.quantity)}</span>} {po.uom}
                    </span>
                  </p>
                </div>
                {canPack && (
                  <button
                    type="button"
                    onClick={() => navigate(`/shipments?create=true&po=${encodeURIComponent(po.po_number || "")}`)}
                    className={cn("flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white", ACCENT[accent].button)}
                  >
                    {t("dueSoon.packNow")} <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={CheckCircle2}>{t("dueSoon.empty")}</EmptyState>
      )}
    </Panel>
  );
}

/* ─── Recent dispatches ───────────────────────────────────────── */

export function RecentShipmentsCard({ items, accent }: { items: OverviewShipment[]; accent: OverviewAccent }) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();

  return (
    <Panel
      icon={Box}
      iconClassName={ACCENT[accent].text}
      title={t("recent.title")}
      action={
        <LinkButton onClick={() => navigate("/shipments")} accent={accent}>
          {t("links.allShipments")}
        </LinkButton>
      }
    >
      {items.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => navigate(`/shipments/${s.id}`)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-slate-900">{s.shipment_number}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {t("recent.line", {
                      plant: s.plant_code || t("plants.other"),
                      cartons: formatNumber(s.cartons),
                      pieces: formatNumber(s.pieces),
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{s.date ? formatDate(parseLocalDate(s.date) ?? s.date) : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Truck}>{t("recent.none")}</EmptyState>
      )}
    </Panel>
  );
}

/* ─── Supplier performance (admin) ────────────────────────────── */

export function SuppliersCard({ items }: { items: OverviewSupplier[] }) {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();

  return (
    <Panel
      icon={Users}
      title={t("suppliers.title")}
      action={
        <LinkButton onClick={() => navigate("/suppliers")} accent="blue">
          {t("suppliers.all")}
        </LinkButton>
      }
    >
      {items.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {items.map((s, rank) => (
            <li key={s.supplier_id} className="flex items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                  {rank + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{s.name}</span>
                  <span className="block truncate font-mono text-xs text-slate-400">
                    {s.supplier_code} · {t("suppliers.open", { count: s.open_orders })}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums text-slate-900">
                  {s.pieces > 0 ? t("suppliers.pieces", { pieces: formatNumber(s.pieces) }) : t("suppliers.pending")}
                </span>
                {s.pieces > 0 && (
                  <span className="block text-xs text-slate-400">
                    {t("suppliers.detail", { cartons: formatNumber(s.cartons), shipments: formatNumber(s.shipments) })}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Users}>{t("suppliers.empty")}</EmptyState>
      )}
    </Panel>
  );
}

/* ─── Loading / error ─────────────────────────────────────────── */

export function OverviewError() {
  const { t } = useTranslation("dashboard");
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {t("loadFailed")}
    </div>
  );
}
