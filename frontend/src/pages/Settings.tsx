/**
 * Settings — admin-only settings hub with links to sub-pages.
 */

import { NavLink } from "react-router-dom";
import { Building2, Users, Bell, Shield, Database } from "lucide-react";
import { cn } from "@/utils/cn";

const items = [
  { to: "/settings/company", icon: Building2, label: "Company Settings", desc: "Plant info, IMAP/SMTP config, branding" },
  { to: "/settings/users", icon: Users, label: "User Management", desc: "Add, edit, deactivate users and roles" },
  { to: "#", icon: Bell, label: "Notifications", desc: "Email alerts and webhook config (coming soon)" },
  { to: "#", icon: Shield, label: "Security", desc: "Password policies, 2FA, API keys (coming soon)" },
  { to: "#", icon: Database, label: "Data & Storage", desc: "MinIO buckets, retention policies (coming soon)" },
];

export default function Settings() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your plant configuration.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <NavLink key={item.label} to={item.to}
            className={cn("flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 transition-colors",item.to!=="#"?"hover:border-brand-300 hover:bg-brand-50":"cursor-default opacity-60")}>
            <div className="rounded-lg bg-brand-50 p-2.5"><item.icon className="h-5 w-5 text-brand-600"/></div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{item.label}</p>
              <p className="mt-0.5 text-xs text-gray-500">{item.desc}</p>
            </div>
          </NavLink>
        ))}
      </div>
    </div>
  );
}