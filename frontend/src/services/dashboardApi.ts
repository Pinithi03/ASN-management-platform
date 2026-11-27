/**
 * Overview data — GET /api/v1/dashboard/overview
 *
 * All numbers are SQL aggregates over every matching row (no 50-item limit).
 * Suppliers are always scoped to their own supplier by the server (from the token);
 * admins get platform-wide totals, or one supplier with `supplier_id`.
 */

import { api } from "./api";

export interface OverviewKpis {
  open_orders: number;
  partially_shipped: number;
  overdue_orders: number;
  due_3_days: number;
  due_7_days: number;
  dispatched_this_month: { pieces: number; cartons: number; shipments: number };
  dispatched_last_month_pieces: number;
}

export interface OverviewStatusBreakdown {
  open: number;
  partially_shipped: number;
  shipped: number;
  completed: number;
  cancelled: number;
  /** Statuses outside the known lifecycle, so the buckets always add up to `total`. */
  other: number;
  total: number;
  /** POs with version > 1. A note, not a slice. */
  updated_by_customer: number;
}

export interface OverviewMonth {
  /** YYYY-MM */
  month: string;
  pieces: number;
  cartons: number;
  shipments: number;
}

export interface OverviewDeadlines {
  overdue: number;
  due_3_days: number;
  due_7_days: number;
  on_track: number;
  no_date: number;
}

export interface OverviewPlant {
  /** Plant group key (OMEGA, ALPHA, …) or "OTHER". */
  plant_key: string;
  plant_code: string;
  name: string;
  open_orders: number;
  dispatched_pieces: number;
  dispatched_cartons: number;
  has_orders: boolean;
}

export interface OverviewUpcoming {
  po_id: string;
  po_number: string;
  plant_key: string;
  plant_code: string | null;
  delivery_date: string | null;
  days_left: number;
  status: string;
  item_code: string | null;
  description: string | null;
  quantity: number;
  remaining_quantity: number;
  uom: string;
}

export interface OverviewShipment {
  id: string;
  shipment_number: string;
  status: string;
  plant_key: string;
  plant_code: string | null;
  cartons: number;
  pieces: number;
  date: string | null;
}

export interface OverviewSupplier {
  supplier_id: string;
  name: string;
  supplier_code: string;
  shipments: number;
  pieces: number;
  cartons: number;
  open_orders: number;
}

export interface DashboardOverview {
  /** Business date used for the deadlines (Asia/Colombo), YYYY-MM-DD. */
  today: string;
  kpis: OverviewKpis;
  status_breakdown: OverviewStatusBreakdown;
  monthly: OverviewMonth[];
  deadlines: OverviewDeadlines;
  plants: OverviewPlant[];
  upcoming: OverviewUpcoming[];
  recent_shipments: OverviewShipment[];
  /** Admins only. */
  suppliers?: OverviewSupplier[];
}

export const dashboardApi = {
  getOverview: async (params: { supplier_id?: string } = {}): Promise<DashboardOverview> => {
    const { data } = await api.get("/dashboard/overview", { params });
    return data;
  },
};
