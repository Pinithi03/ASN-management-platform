import { FileText } from "lucide-react";

export default function PurchaseOrders() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage purchase orders across all companies.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-12">
        <FileText className="h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">Purchase Order Management</h3>
        <p className="mt-1 text-sm text-gray-500">
          PO management will be implemented in Sprint 8-9.
        </p>
      </div>
    </div>
  );
}
