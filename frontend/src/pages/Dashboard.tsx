import {
  Mail,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  TruckIcon,
} from "lucide-react";

const stats = [
  { label: "Emails Received", value: "—", icon: Mail, color: "text-blue-600 bg-blue-100" },
  { label: "Successfully Parsed", value: "—", icon: CheckCircle2, color: "text-green-600 bg-green-100" },
  { label: "Pending Review", value: "—", icon: ClipboardList, color: "text-amber-600 bg-amber-100" },
  { label: "Errors", value: "—", icon: AlertCircle, color: "text-red-600 bg-red-100" },
  { label: "ASNs Dispatched", value: "—", icon: TruckIcon, color: "text-purple-600 bg-purple-100" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of email processing and ASN dispatch status.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <p className="mt-2 text-sm text-gray-500">
            Activity feed will be available once email processing is implemented (Sprint 5+).
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Processing Trends</h2>
          <p className="mt-2 text-sm text-gray-500">
            Charts will be available once data is being processed (Sprint 12+).
          </p>
        </div>
      </div>
    </div>
  );
}
