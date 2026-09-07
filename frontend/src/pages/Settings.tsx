import { Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Platform configuration and preferences.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-12">
        <SettingsIcon className="h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">Platform Settings</h3>
        <p className="mt-1 text-sm text-gray-500">
          Settings panel will be implemented in Sprint 13-14.
        </p>
      </div>
    </div>
  );
}
