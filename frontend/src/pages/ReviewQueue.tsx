import { ClipboardCheck } from "lucide-react";

export default function ReviewQueue() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review and approve low-confidence email extractions.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-12">
        <ClipboardCheck className="h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">Review Queue</h3>
        <p className="mt-1 text-sm text-gray-500">
          Review queue will be implemented in Sprint 8.
        </p>
      </div>
    </div>
  );
}
