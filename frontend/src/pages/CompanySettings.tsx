import { Building2 } from "lucide-react";

export default function CompanySettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Company Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure IMAP connections, parser templates, and company preferences.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-12">
        <Building2 className="h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">Company Configuration</h3>
        <p className="mt-1 text-sm text-gray-500">
          Company settings will be implemented in Sprint 13-14.
        </p>
      </div>
    </div>
  );
}
