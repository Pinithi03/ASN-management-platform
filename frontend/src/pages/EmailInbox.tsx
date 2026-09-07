import { Mail } from "lucide-react";

export default function EmailInbox() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage incoming emails from suppliers and buyers.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-12">
        <Mail className="h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">Email Processing</h3>
        <p className="mt-1 text-sm text-gray-500">
          Email ingestion will be implemented in Sprint 5.
        </p>
      </div>
    </div>
  );
}
