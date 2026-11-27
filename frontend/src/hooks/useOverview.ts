import { useQuery } from "@tanstack/react-query";
import { KPI_QUERY_OPTIONS } from "@/components/dashboard/Kpi";
import { dashboardApi } from "@/services/dashboardApi";

/**
 * Overview data (KPIs, charts, plants, upcoming deliveries).
 * Refetches every 30 s and on window focus; lib/crossTab.ts invalidates
 * "dashboardOverview" when POs or shipments change in any tab.
 * Suppliers are scoped by the server; admins may pass a supplier_id filter.
 */
export function useOverview(supplierId?: string) {
  return useQuery({
    queryKey: ["dashboardOverview", supplierId ?? "all"],
    queryFn: () => dashboardApi.getOverview(supplierId ? { supplier_id: supplierId } : {}),
    ...KPI_QUERY_OPTIONS,
  });
}
