// ─── Admin Overview ──────────────────────────────────────────────
// frontend/src/pages/AdminDashboard.tsx
//
// Platform-wide totals from GET /dashboard/overview (no supplier filter).
// Every number is a server-side aggregate over all rows (no 50 / 100-item limit).

import { useTranslation } from "react-i18next";
import { KpiGrid, KpiSkeleton } from "@/components/dashboard/Kpi";
import PageHeader from "@/components/ui/PageHeader";
import {
  DeadlinesCard,
  MonthlyDispatchCard,
  OverviewError,
  OverviewKpis,
  PlantsCard,
  StatusDonutCard,
  SuppliersCard,
  UpcomingCard,
} from "@/components/dashboard/OverviewWidgets";
import { useOverview } from "@/hooks/useOverview";

export default function AdminDashboard() {
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
            <MonthlyDispatchCard monthly={data.monthly} accent="blue" />
            <StatusDonutCard breakdown={data.status_breakdown} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <DeadlinesCard deadlines={data.deadlines} />
            <PlantsCard plants={data.plants} accent="blue" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SuppliersCard items={data.suppliers ?? []} />
            <UpcomingCard items={data.upcoming} accent="blue" canPack={false} />
          </div>
        </>
      )}
    </div>
  );
}
