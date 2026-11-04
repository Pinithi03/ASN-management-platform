// ─── Supplier Logistics & Dispatch Portal ──────────────────────────
// frontend/src/pages/SupplierDashboard.tsx

import { useQuery } from "@tanstack/react-query";
import {
  Truck,
  Package,
  Clock,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  Building2,
  TrendingUp,
  Box,
  Layers,
  ChevronRight,
} from "lucide-react";
import { poApi } from "@/services/poApi";
import { shipmentService } from "@/services/shipmentService";
import { useAuthStore } from "@/store/authStore";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18n from "@/i18n";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Custom Recharts Tooltip ──────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl px-4 py-3 shadow-2xl z-50">
        {label && (
          <p className="text-slate-400 text-xs font-semibold mb-1.5 border-b border-slate-800 pb-1">
            {label}
          </p>
        )}
        {payload.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 text-xs py-0.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entry.color || entry.fill || "#10b981" }}
            />
            <span className="text-slate-300 font-medium">{entry.name}:</span>
            <span className="text-white font-bold ml-auto">
              {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Color Palette ───────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#10b981", // Emerald
  SHIPPED: "#059669",
  PARTIAL: "#f59e0b", // Amber
  ACTIVE: "#3b82f6", // Blue
  UPDATED: "#8b5cf6", // Purple
  CANCELLED: "#64748b", // Slate
};

const PLANT_LABELS: Record<string, { name: string; location: string }> = {
  PPA1: { name: "Omega Line Ltd", location: "Sandalankawa" },
  PPA2: { name: "Vavuniya Apparels Ltd", location: "Vavuniya" },
  PPB1: { name: "Alpha Apparels Ltd", location: "Polgahawela" },
  PPC1: { name: "Benji Ltd", location: "Bingiriya" },
  PPD1: { name: "Sirio Ltd", location: "Badalgama" },
  PPE1: { name: "Vavuniya Apparels Ltd", location: "Vavuniya" },
};

// Helper: Days between delivery date and today
const calculateDaysLeft = (dateStr: string | null | undefined): number | null => {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const formatDateSafe = (dateStr: string | null | undefined): string => {
  const noDate = i18n.t("dashboard:fallback.noDate");
  if (!dateStr) return noDate;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return noDate;
  try {
    return format(d, "MMM d, yyyy");
  } catch {
    return noDate;
  }
};

const getPoUom = (po: any): string => {
  if (po?.extra_data?.items && Array.isArray(po.extra_data.items) && po.extra_data.items[0]?.uom) {
    return po.extra_data.items[0].uom;
  }
  return po?.uom || "pcs";
};

const getCleanDestination = (dest: string | null | undefined): string => {
  if (!dest || !dest.trim()) return "Omega Line Ltd (PPA1)";
  const clean = dest.trim();
  const plantKey = clean.split(/[- ]/)[0].toUpperCase();
  if (PLANT_LABELS[plantKey]) {
    return `${PLANT_LABELS[plantKey].name} (${plantKey})`;
  }
  return clean;
};

const getPoProductDesc = (po: any): string => {
  const itemCode = po?.item_code || po?.extra_data?.items?.[0]?.item_code || po?.style_number;
  const desc = po?.description || po?.extra_data?.items?.[0]?.description;
  if (itemCode && desc && itemCode !== desc) {
    return `${itemCode} — ${desc}`;
  }
  return itemCode || desc || i18n.t("dashboard:fallback.apparelItem");
};

export default function SupplierDashboard() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Supplier identity identifier
  const supplierId = user?.supplier_id || user?.supplier_code || undefined;

  // 1. Fetch Scoped PO Stats for this supplier
  const { data: poStats, isLoading: poStatsLoading } = useQuery({
    queryKey: ["supplierPOStats", supplierId],
    queryFn: () => poApi.getStats(supplierId),
    refetchInterval: 10000,
  });

  // 2. Fetch Scoped Purchase Orders for upcoming delivery schedule
  const { data: poData, isLoading: poListLoading } = useQuery({
    queryKey: ["supplierPOsList", supplierId],
    queryFn: () => poApi.list({ per_page: 50, supplier_id: supplierId }),
    refetchInterval: 10000,
  });

  // 3. Fetch Shipments scoped to this supplier
  const { data: shipments, isLoading: shipmentsLoading } = useQuery({
    queryKey: ["supplierShipments", supplierId],
    queryFn: () => shipmentService.getShipments(undefined, undefined, supplierId),
    refetchInterval: 10000,
  });

  const isLoading = poStatsLoading || poListLoading || shipmentsLoading;

  // ─── Calculations & Visual Metrics ─────────────────────────────

  // A. Total Shipped Metrics (My Performance)
  const shipmentMetrics = useMemo(() => {
    if (!shipments || !Array.isArray(shipments)) {
      return { totalPieces: 0, totalBoxes: 0, totalCount: 0, avgPiecesPerBox: 0 };
    }
    const totalPieces = shipments.reduce((sum: number, s: any) => sum + (Number(s.total_pieces) || 0), 0);
    const totalBoxes = shipments.reduce((sum: number, s: any) => sum + (Number(s.total_boxes) || 0), 0);
    const totalCount = shipments.length;
    const avgPiecesPerBox = totalBoxes > 0 ? Math.round(totalPieces / totalBoxes) : 0;
    return { totalPieces, totalBoxes, totalCount, avgPiecesPerBox };
  }, [shipments]);

  // B. Delivery Deadlines & Upcoming Delivery Queue
  const { urgencyData, upcomingQueue, urgentCount, overdueCount } = useMemo(() => {
    const items = Array.isArray(poData) ? poData : (poData?.items || []);
    const activeOrPartial = items.filter(
      (po) => po.status === "ACTIVE" || po.status === "PARTIAL" || po.status === "UPDATED"
    );

    let overdue = 0;
    let critical = 0; // 0-3 days
    let upcoming = 0; // 4-7 days
    let onTrack = 0; // > 7 days

    const queue: Array<any> = [];

    activeOrPartial.forEach((po) => {
      const days = calculateDaysLeft(po.delivery_date);
      if (days !== null) {
        if (days < 0) overdue++;
        else if (days <= 3) critical++;
        else if (days <= 7) upcoming++;
        else onTrack++;

        queue.push({
          ...po,
          daysLeft: days,
        });
      }
    });

    // Smart operational sorting:
    // Priority 1: Due Today (0 days) & Due Tomorrow (1 day)
    // Priority 2: Due soon (2 to 14 days)
    // Priority 3: Recently Overdue (1 to 14 days overdue: -1, -2, -3... sorted closest to today first)
    // Priority 4: Due in 15 to 30 days
    // Priority 5: Stale / historical backlog (>14 days overdue)
    queue.sort((a, b) => {
      const getPriority = (d: number | null) => {
        if (d === null) return 999999;
        if (d === 0) return 0;
        if (d > 0 && d <= 7) return d;
        if (d < 0 && d >= -14) return 10 + Math.abs(d);
        if (d > 7 && d <= 30) return 30 + d;
        if (d < -14 && d >= -60) return 100 + Math.abs(d);
        return 1000 + Math.abs(d);
      };
      return getPriority(a.daysLeft) - getPriority(b.daysLeft);
    });

    const chartBuckets = [
      { id: "overdue", name: t("deadlines.bucketOverdue"), count: overdue, fill: "#ef4444" },
      { id: "critical", name: t("deadlines.bucketCritical"), count: critical, fill: "#f59e0b" },
      { id: "due7", name: t("deadlines.bucketDue7"), count: upcoming, fill: "#10b981" },
      { id: "onTrack", name: t("deadlines.bucketOnTrack"), count: onTrack, fill: "#06b6d4" },
    ];

    return {
      urgencyData: chartBuckets,
      upcomingQueue: queue.slice(0, 6),
      urgentCount: critical,
      overdueCount: overdue,
    };
  }, [poData, t]);

  // C. Monthly Shipping Progress (My Monthly Velocity)
  const monthlyProgress = useMemo(() => {
    const monthsMap = new Map<string, { key: string; label: string; pieces: number; boxes: number; shipments: number }>();
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("default", { month: "short" });
      monthsMap.set(key, { key, label, pieces: 0, boxes: 0, shipments: 0 });
    }

    if (Array.isArray(shipments)) {
      shipments.forEach((s: any) => {
        const rawDate = s.ship_date || s.created_at;
        if (!rawDate) return;
        const d = new Date(rawDate);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthsMap.has(key)) {
          const item = monthsMap.get(key)!;
          item.pieces += Number(s.total_pieces || 0);
          item.boxes += Number(s.total_boxes || 0);
          item.shipments += 1;
        }
      });
    }

    return Array.from(monthsMap.values());
  }, [shipments]);

  const currentMonthPieces = useMemo(() => {
    if (monthlyProgress.length === 0) return 0;
    return monthlyProgress[monthlyProgress.length - 1].pieces;
  }, [monthlyProgress]);

  // D. Order Lifecycle & Fulfillment Pipeline (Donut Chart)
  const { poLifecycleData, fulfillmentRate, partialRate, unprocessedRate } = useMemo(() => {
    if (!poStats) {
      return { poLifecycleData: [], fulfillmentRate: 0, partialRate: 0, unprocessedRate: 0 };
    }

    const total = poStats.total || 1;
    const completedOrShipped = (poStats.completed || 0) + (poStats.shipped || 0);
    const partial = poStats.partial || 0;
    const active = poStats.active || 0;
    const updated = poStats.updated || 0;
    const cancelled = poStats.cancelled || 0;

    const data = [
      { name: t("lifecycle.completedShipped"), value: completedOrShipped, color: STATUS_COLORS.COMPLETED },
      { name: t("lifecycle.partial"), value: partial, color: STATUS_COLORS.PARTIAL },
      { name: t("lifecycle.unprocessed"), value: active, color: STATUS_COLORS.ACTIVE },
      { name: t("lifecycle.updated"), value: updated, color: STATUS_COLORS.UPDATED },
      { name: t("lifecycle.cancelled"), value: cancelled, color: STATUS_COLORS.CANCELLED },
    ].filter((item) => item.value > 0);

    return {
      poLifecycleData: data,
      fulfillmentRate: Math.round((completedOrShipped / total) * 100),
      partialRate: Math.round((partial / total) * 100),
      unprocessedRate: Math.round((active / total) * 100),
    };
  }, [poStats, t]);

  // E. My Destination Plants Distribution
  const plantDistribution = useMemo(() => {
    const counts: Record<string, { boxes: number; pieces: number; shipments: number }> = {
      PPA1: { boxes: 0, pieces: 0, shipments: 0 },
      PPA2: { boxes: 0, pieces: 0, shipments: 0 },
      PPB1: { boxes: 0, pieces: 0, shipments: 0 },
      PPC1: { boxes: 0, pieces: 0, shipments: 0 },
      PPD1: { boxes: 0, pieces: 0, shipments: 0 },
    };

    if (Array.isArray(shipments)) {
      shipments.forEach((s: any) => {
        let code = (s.plant_code || "PPA1").toUpperCase();
        if (code.startsWith("PPE")) code = "PPA2";
        const target = counts[code] || counts["PPA1"];
        target.boxes += Number(s.total_boxes || 0);
        target.pieces += Number(s.total_pieces || 0);
        target.shipments += 1;
      });
    }

    const totalAllPieces = Object.values(counts).reduce((acc, c) => acc + c.pieces, 0) || 1;

    return Object.entries(counts).map(([code, val]) => ({
      code,
      name: PLANT_LABELS[code]?.name || code,
      boxes: val.boxes,
      pieces: val.pieces,
      shipments: val.shipments,
      percentage: Math.round((val.pieces / totalAllPieces) * 100),
    }));
  }, [shipments]);

  // F. Recent Dispatched Shipments
  const recentShipments = useMemo(() => {
    if (!shipments || !Array.isArray(shipments)) return [];
    return shipments.slice(0, 5);
  }, [shipments]);

  // ─── Top KPI Cards Definition ──────────────────────────────────
  const kpiCards = [
    {
      label: t("kpi.dispatchedVolume.label"),
      value: t("kpi.dispatchedVolume.value", { pieces: shipmentMetrics.totalPieces.toLocaleString() }),
      icon: Truck,
      iconBg: "bg-emerald-50 text-emerald-600 border-emerald-100",
      subtitle: t("kpi.dispatchedVolume.subtitle", {
        cartons: shipmentMetrics.totalBoxes.toLocaleString(),
        dispatches: shipmentMetrics.totalCount,
      }),
      badge: t("kpi.dispatchedVolume.badge"),
      badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
      onClick: () => navigate("/shipments"),
    },
    {
      label: t("kpi.dueSoon.label"),
      value: t("kpi.dueSoon.value", { count: urgentCount + overdueCount }),
      icon: AlertTriangle,
      iconBg: overdueCount > 0 ? "bg-red-50 text-red-600 border-red-100" : "bg-amber-50 text-amber-600 border-amber-100",
      subtitle:
        overdueCount > 0
          ? t("kpi.dueSoon.subtitleWithOverdue", { overdue: overdueCount, urgent: urgentCount })
          : t("kpi.dueSoon.subtitle", { urgent: urgentCount }),
      badge: overdueCount > 0 ? t("kpi.dueSoon.badgeAttention") : t("kpi.dueSoon.badgeApproaching"),
      badgeStyle: overdueCount > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200",
      onClick: () => navigate("/purchase-orders"),
    },
    {
      label: t("kpi.unprocessed.label"),
      value: t("kpi.unprocessed.value", { count: poStats?.active ?? 0 }),
      icon: Package,
      iconBg: "bg-slate-100 text-slate-700 border-slate-200",
      subtitle: t("kpi.unprocessed.subtitle", { percent: unprocessedRate }),
      badge: t("kpi.unprocessed.badge"),
      badgeStyle: "bg-slate-100 text-slate-700 border-slate-200",
      onClick: () => navigate("/purchase-orders?status=ACTIVE"),
    },
    {
      label: t("kpi.partial.label"),
      value: t("kpi.partial.value", { count: poStats?.partial ?? 0 }),
      icon: Layers,
      iconBg: "bg-amber-50 text-amber-600 border-amber-100",
      subtitle: t("kpi.partial.subtitle", { percent: fulfillmentRate }),
      badge: t("kpi.partial.badge", { percent: partialRate }),
      badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
      onClick: () => navigate("/purchase-orders?status=PARTIAL"),
    },
  ];

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t("header.title")}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("header.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/order-history")}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>{t("header.orderHistory", { count: poStats?.completed ?? 0 })}</span>
        </button>
      </div>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 rounded-full border-3 border-emerald-600/30 border-t-emerald-600 animate-spin" />
          <p className="text-xs font-medium text-slate-500 animate-pulse">
            {t("loading")}
          </p>
        </div>
      ) : (
        <>
          {/* ─── Top 4 KPI Metric Cards ───────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiCards.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  onClick={kpi.onClick}
                  className="rounded-xl bg-white border border-slate-200 p-5 shadow-2xs hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500">
                      {kpi.label}
                    </span>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${kpi.iconBg}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="text-2xl font-bold text-slate-900 tracking-tight mb-2.5">
                    {kpi.value}
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 truncate max-w-[180px]">
                      {kpi.subtitle}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${kpi.badgeStyle}`}>
                      {kpi.badge}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Row 1: Shipping Velocity & Order Lifecycle ──────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* A. My Monthly Shipping Velocity */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-sm font-bold text-slate-900">
                    {t("monthly.title")}
                  </h2>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
                    <span className="text-slate-600 font-medium">{t("monthly.legendPieces")}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-400" />
                    <span className="text-slate-600 font-medium">{t("monthly.legendCartons")}</span>
                  </div>
                </div>
              </div>

              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyProgress} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="supplierPiecesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="supplierBoxesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                    <XAxis
                      dataKey="label"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#e2e8f0" }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="pieces"
                      name={t("monthly.seriesPieces")}
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#supplierPiecesGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="boxes"
                      name={t("monthly.seriesCartons")}
                      stroke="#64748b"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#supplierBoxesGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  <Trans
                    t={t}
                    i18nKey="monthly.thisMonth"
                    values={{ value: currentMonthPieces.toLocaleString() }}
                    components={{ strong: <strong className="text-slate-900 font-semibold" /> }}
                  />
                </span>
                <button
                  onClick={() => navigate("/shipments")}
                  className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  {t("links.allShipments")} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* B. Order Lifecycle Pipeline (Donut Chart) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {t("lifecycle.title")}
                    </h2>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    {t("lifecycle.completedBadge", { percent: fulfillmentRate })}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  {t("lifecycle.subtitle")}
                </p>

                <div className="h-52 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={poLifecycleData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={78}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {poLifecycleData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-extrabold text-slate-900 dark:text-white">
                      {poStats?.total ?? 0}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {t("lifecycle.assignedPos")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                {poLifecycleData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-600 dark:text-slate-300 font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{item.value}</span>
                      <span className="text-slate-400 text-[11px]">
                        ({Math.round((item.value / (poStats?.total || 1)) * 100)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Row 2: Delivery Deadlines & Plants ───────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* A. Delivery Urgency Horizon */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {t("deadlines.title")}
                  </h2>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t("deadlines.targetDates")}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                {t("deadlines.subtitle")}
              </p>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={urgencyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#cbd5e1" }}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name={t("deadlines.seriesOrders")} radius={[6, 6, 0, 0]}>
                      {urgencyData.map((entry, index) => (
                        <Cell key={`bar-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50">
                  <p className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">{t("deadlines.tileOverdue")}</p>
                  <p className="text-lg font-extrabold text-rose-700 dark:text-rose-300">{overdueCount}</p>
                </div>
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50">
                  <p className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">{t("deadlines.tileDue3")}</p>
                  <p className="text-lg font-extrabold text-amber-700 dark:text-amber-300">{urgentCount}</p>
                </div>
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50">
                  <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">{t("deadlines.tileDue7")}</p>
                  <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                    {urgencyData.find((u) => u.id === "due7")?.count || 0}
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900/50">
                  <p className="text-[10px] uppercase font-bold text-cyan-600 dark:text-cyan-400">{t("deadlines.tileOnTrack")}</p>
                  <p className="text-lg font-extrabold text-cyan-700 dark:text-cyan-300">
                    {urgencyData.find((u) => u.id === "onTrack")?.count || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* B. Destination Manufacturing Plants */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    <h2 className="text-sm font-bold text-slate-900">
                      {t("plants.title")}
                    </h2>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {t("plants.assigned")}
                  </span>
                </div>

                <div className="space-y-3.5">
                  {plantDistribution.map((plant) => (
                    <div key={plant.code} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{plant.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-600">
                            {plant.code}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-slate-900">
                            {t("plants.pieces", { value: plant.pieces.toLocaleString() })}
                          </span>
                          <span className="text-slate-400 text-[11px] ml-1.5">
                            {t("plants.cartons", { count: plant.boxes })}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                        <div
                          className="bg-emerald-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(plant.percentage, 4)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{t("plants.footer")}</span>
                <span className="font-semibold text-emerald-600">{t("plants.validated")}</span>
              </div>
            </div>
          </div>

          {/* ─── Row 3: Actionable Urgent Deliveries & Dispatched Shipments */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* A. Critical Upcoming Orders */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <h2 className="text-sm font-bold text-slate-900">
                    {t("dueSoon.title")}
                  </h2>
                </div>
                <button
                  onClick={() => navigate("/purchase-orders")}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                >
                  {t("links.allOrders")} <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {upcomingQueue.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {upcomingQueue.map((po) => {
                    const days = po.daysLeft;
                    const isOverdue = days !== null && days < 0;
                    const isUrgent = days !== null && days >= 0 && days <= 3;
                    const uom = getPoUom(po);
                    const isPartial = po.status === "PARTIAL";
                    const cleanDest = getCleanDestination(po.destination);
                    const productDesc = getPoProductDesc(po);

                    return (
                      <div
                        key={po.id}
                        className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-xl transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 font-mono">
                              {po.po_number || t("dueSoon.unnamedPo")}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                isOverdue
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : isUrgent
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {isOverdue
                                ? t("dueSoon.overdue", { days: Math.abs(days) })
                                : days === 0
                                ? t("dueSoon.dueToday")
                                : days === 1
                                ? t("dueSoon.dueTomorrow")
                                : t("dueSoon.daysLeft", { days })}
                            </span>
                            {isPartial && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                {t("dueSoon.partial")}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 truncate">
                            <span className="font-medium text-slate-700">{cleanDest}</span>
                            {" · "}
                            <span>{productDesc}</span>
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {t("dueSoon.target", { date: formatDateSafe(po.delivery_date) })}{" "}
                            {isPartial && po.remaining_quantity != null ? (
                              <span className="font-semibold text-slate-700">
                                {Math.round(po.remaining_quantity).toLocaleString()}{" "}
                                <span className="font-normal text-slate-400">/ {(po.quantity || 0).toLocaleString()}</span>{" "}
                                <span className="text-emerald-600">{uom}</span>
                              </span>
                            ) : (
                              <span className="font-semibold text-slate-700">
                                {(po.quantity || 0).toLocaleString()}{" "}
                                <span className="text-emerald-600">{uom}</span>
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => navigate(`/shipments?create=true&po=${encodeURIComponent(po.po_number || "")}`)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                          >
                            {t("dueSoon.packNow")} <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-60" />
                  {t("dueSoon.allOnSchedule")}
                </div>
              )}
            </div>

            {/* B. Recent Dispatched Shipments */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-sm font-bold text-slate-900">
                    {t("recent.title")}
                  </h2>
                </div>
                <button
                  onClick={() => navigate("/shipments")}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                >
                  {t("links.allShipments")} <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {recentShipments.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {recentShipments.map((s: any) => (
                    <div
                      key={s.id}
                      onClick={() => navigate("/shipments")}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-xl transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 font-mono truncate">
                            {s.shipment_number}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {s.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {t("recent.plantLine", {
                            plant: s.plant_code || "PPA1",
                            cartons: s.total_boxes,
                            pieces: s.total_pieces,
                          })}
                        </p>
                      </div>

                      <div className="text-right flex-shrink-0 flex items-center gap-1 text-xs font-medium text-slate-500">
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 text-xs">
                  <Box className="w-8 h-8 mx-auto text-slate-400 mb-2 opacity-50" />
                  {t("recent.none")}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
