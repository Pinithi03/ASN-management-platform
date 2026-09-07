import { Truck } from "lucide-react";

export default function ASNManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ASN Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create, review, and dispatch Advanced Shipping Notices.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-12">
        <Truck className="h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">ASN Generation & Dispatch</h3>
        <p className="mt-1 text-sm text-gray-500">
          ASN management will be implemented in Sprint 10-12.
        </p>
      </div>
    </div>
  );
}
