/**
 * Dashboard — role-aware landing page.
 * Admin sees email/PO/ASN/supplier stats + review activity.
 * Supplier sees PO/shipment/ASN stats + shipment activity.
 */

import {
  Mail,
  FileText,
  Send,
  Truck,
  PackagePlus,
  ClipboardCheck,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  BarChart3,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import {
  adminDashboardStats,
  supplierDashboardStats,
  adminActivityFeed,
  supplierActivityFeed,
  mockEmails,
  mockPurchaseOrders,
  mockASNs,
} from "@/data/mockData";
import { cn } from "@/utils/cn";
import type { ActivityItem } from "@/data/mockData";
import type { DashboardStats } from "@/types";

/* ------------------------------------------------------------------ */
/*  Stat Card                                                         */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  label: string;
  value: number | string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}

function StatCard({ label, value, change, trend, icon: Icon, iconBg, iconColor }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {change && (
            <div className="mt-1 flex items-center gap-1">
              {trend === "up" && <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />}
              {trend === "down" && <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />}
              <span className={cn("text-xs font-medium", trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-gray-500")}>
                {change}
              </span>
            </div>
          )}
        </div>
        <div className={cn("rounded-lg p-2.5", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity Feed                                                     */
/* ------------------------------------------------------------------ */

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail, po: FileText, asn: Send, shipment: PackagePlus, supplier: Truck, review: ClipboardCheck,
};
const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2, warning: AlertCircle, error: XCircle, info: Clock,
};
const statusColors: Record<string, string> = {
  success: "text-emerald-500", warning: "text-amber-500", error: "text-red-500", info: "text-blue-500",
};

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
        <button className="text-xs font-medium text-brand-600 hover:text-brand-700">View all</button>
      </div>
      <div className="divide-y divide-gray-100">
        {items.map((item) => {
          const TypeIcon = activityIcons[item.type] || Clock;
          const SIcon = statusIcons[item.status] || Clock;
          return (
            <div key={item.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50">
              <div className="mt-0.5 rounded-lg bg-gray-100 p-2">
                <TypeIcon className="h-4 w-4 text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">{item.message}</p>
                <p className="mt-0.5 text-xs text-gray-400">{item.time}</p>
              </div>
              <SIcon className={cn("mt-0.5 h-4 w-4", statusColors[item.status])} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick Actions                                                     */
/* ------------------------------------------------------------------ */

interface QuickAction {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}

const adminActions: QuickAction[] = [
  { label: "Review Emails", description: "3 unprocessed emails waiting", icon: Mail, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "Pending ASNs", description: "2 ASNs need validation", icon: ClipboardCheck, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "View Reports", description: "Weekly summary ready", icon: BarChart3, color: "text-purple-600", bg: "bg-purple-50" },
];

const supplierActions: QuickAction[] = [
  { label: "Create Shipment", description: "Pack items for open POs", icon: PackagePlus, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "Generate ASN", description: "Submit advance ship notice", icon: Send, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "View POs", description: "5 active purchase orders", icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
];

function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {actions.map((action) => (
          <button key={action.label} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-gray-50">
            <div className={cn("rounded-lg p-2.5", action.bg)}>
              <action.icon className={cn("h-5 w-5", action.color)} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{action.label}</p>
              <p className="text-xs text-gray-500">{action.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Table                                                       */
/* ------------------------------------------------------------------ */

function RecentTable({ title, rows }: { title: string; rows: { id: string; label: string; status: string; date: string }[] }) {
  const sc = (s: string) => {
    const l = s.toLowerCase();
    if (["completed", "accepted", "committed", "sent", "delivered", "parsed"].includes(l)) return "bg-emerald-100 text-emerald-700";
    if (["queued", "draft", "active", "review", "processing", "packing"].includes(l)) return "bg-amber-100 text-amber-700";
    if (["failed", "rejected", "cancelled", "error"].includes(l)) return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button className="text-xs font-medium text-brand-600 hover:text-brand-700">See all</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
              <th className="px-5 py-2.5">ID</th>
              <th className="px-5 py-2.5">Description</th>
              <th className="px-5 py-2.5">Status</th>
              <th className="px-5 py-2.5">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-gray-600">{row.id}</td>
                <td className="px-5 py-2.5 text-gray-900">{row.label}</td>
                <td className="px-5 py-2.5">
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", sc(row.status))}>{row.status}</span>
                </td>
                <td className="whitespace-nowrap px-5 py-2.5 text-gray-500">{row.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "COMPANY_ADMIN";

  const stats: DashboardStats = isAdmin ? adminDashboardStats : supplierDashboardStats;
  const activity = isAdmin ? adminActivityFeed : supplierActivityFeed;
  const actions = isAdmin ? adminActions : supplierActions;

  // Helper to look up supplier name by id
  const getSupplierLabel = (supplierId: string) => {
    const names: Record<string, string> = { s1: "TextCorp", s2: "StitchWorks", s3: "Fabric India", s4: "SilkTex" };
    return names[supplierId] || supplierId;
  };

  const recentPOs = mockPurchaseOrders.slice(0, 4).map((po) => ({
    id: po.po_number,
    label: po.description || "Purchase Order",
    status: po.status,
    date: new Date(po.created_at).toLocaleDateString(),
  }));

  const recentASNs = mockASNs.slice(0, 4).map((asn) => ({
    id: asn.asn_number,
    label: `${getSupplierLabel(asn.supplier_id)} — Shipment ${asn.shipment_id}`,
    status: asn.status,
    date: new Date(asn.created_at).toLocaleDateString(),
  }));

  const recentEmails = mockEmails.slice(0, 4).map((e) => ({
    id: e.message_id.slice(0, 12) + "…",
    label: e.subject || "No subject",
    status: e.status,
    date: e.received_at ? new Date(e.received_at).toLocaleDateString() : "—",
  }));

  const adminStatCards: StatCardProps[] = [
    { label: "Emails Received", value: stats.emails_received, change: `${stats.emails_pending_review} pending review`, trend: "neutral", icon: Mail, iconBg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Active POs", value: stats.active_pos, change: "+3 new", trend: "up", icon: FileText, iconBg: "bg-amber-50", iconColor: "text-amber-600" },
    { label: "ASNs Pending", value: stats.asns_pending, change: "2 need review", trend: "neutral", icon: Send, iconBg: "bg-purple-50", iconColor: "text-purple-600" },
    { label: "Active Shipments", value: stats.active_shipments, change: `${stats.asns_dispatched} dispatched`, trend: "up", icon: Truck, iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  ];

  const supplierStatCards: StatCardProps[] = [
    { label: "Active POs", value: stats.active_pos, change: "3 open", trend: "neutral", icon: FileText, iconBg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "Shipments", value: stats.active_shipments, change: "+2 this week", trend: "up", icon: PackagePlus, iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
    { label: "ASNs Pending", value: stats.asns_pending, change: "1 pending", trend: "neutral", icon: Send, iconBg: "bg-amber-50", iconColor: "text-amber-600" },
    { label: "ASNs Dispatched", value: stats.asns_dispatched, change: "Sent to plant", trend: "neutral", icon: ClipboardCheck, iconBg: "bg-purple-50", iconColor: "text-purple-600" },
  ];

  const statCards = isAdmin ? adminStatCards : supplierStatCards;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? "Admin Dashboard" : "Supplier Dashboard"}</h1>
        <p className="mt-1 text-sm text-gray-500">Welcome back, {user?.full_name ?? "User"}. Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><ActivityFeed items={activity} /></div>
        <div><QuickActions actions={actions} /></div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {isAdmin ? (
          <>
            <RecentTable title="Recent Emails" rows={recentEmails} />
            <RecentTable title="Recent ASNs" rows={recentASNs} />
          </>
        ) : (
          <>
            <RecentTable title="Your Purchase Orders" rows={recentPOs} />
            <RecentTable title="Your ASNs" rows={recentASNs} />
          </>
        )}
      </div>
    </div>
  );
}