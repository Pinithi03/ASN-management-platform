// ─── Supplier Overview ───────────────────────────────────────────
// frontend/src/pages/SupplierDashboard.tsx
//
// One query to GET /dashboard/overview. The server scopes it to the supplier
// in the token and computes every number over all rows (no 50-item limit).
// Refreshes every 30 s, on focus, and when another tab changes POs / shipments.

import { useTranslation } from "react-i18next";
import { KpiGrid, KpiSkeleton } from "@/components/dashboard/Kpi";
import PageHeader from "@/components/ui/PageHeader";
import {
  DeadlinesCard,
  MonthlyDispatchCard,
  OverviewError,
  OverviewKpis,
  PlantsCard,
  RecentShipmentsCard,
  StatusDonutCard,
  UpcomingCard,
} from "@/components/dashboard/OverviewWidgets";
import { useOverview } from "@/hooks/useOverview";

export default function SupplierDashboard() {
  const { t } = useTranslation("dashboard");
  const { data, isLoading, isError } = useOverview();

  return (
    <div className="p-4 sm:p-6 space-y-5 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <PageHeader title={t("header.title")} />

      {isLoading ? (
        <div className="space-y-5" aria-busy="true" aria-label={t("loading")}>
          <KpiGrid>
            {[0, 1, 2, 3].map((i) => (
              <KpiSkeleton key={i} />
            ))}
          </KpiGrid>
          <div className="h-72 animate-pulse rounded-lg bg-white motion-reduce:animate-none" />
        </div>
      ) : isError || !data ? (
        <OverviewError />
      ) : (
        <>
          <OverviewKpis data={data} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <MonthlyDispatchCard monthly={data.monthly} accent="emerald" />
            <StatusDonutCard breakdown={data.status_breakdown} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <DeadlinesCard deadlines={data.deadlines} />
            <PlantsCard plants={data.plants} accent="emerald" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <UpcomingCard items={data.upcoming} accent="emerald" canPack />
            <RecentShipmentsCard items={data.recent_shipments} accent="emerald" />
          </div>
        </>
      )}
    </div>
  );
}
