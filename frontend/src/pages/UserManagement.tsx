import { Users } from "lucide-react";

export default function UserManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage users, roles, and permissions.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-12">
        <Users className="h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">User Administration</h3>
        <p className="mt-1 text-sm text-gray-500">
          User management will be implemented in Sprint 4.
        </p>
      </div>
    </div>
  );
}
