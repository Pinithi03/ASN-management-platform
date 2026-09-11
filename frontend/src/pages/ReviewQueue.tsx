// ─── Review Queue Page ──────────────────────────────────────────
// frontend/src/pages/ReviewQueue.tsx

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye, RefreshCw, AlertTriangle, Inbox } from "lucide-react";
import { emailApi } from "@/services/emailApi";
import type { EmailDetail } from "@/types/email";
import { format } from "date-fns";

export default function ReviewQueue() {
  const queryClient = useQueryClient();
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  // ─── Queries ────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["reviewQueue"],
    queryFn: () =>
      emailApi.list({
        status: "REVIEW",
        per_page: 50,
      }),
  });

  // Also fetch PARSED emails that might need review
  const { data: parsedData } = useQuery({
    queryKey: ["parsedEmails"],
    queryFn: () =>
      emailApi.list({
        status: "PARSED",
        per_page: 50,
      }),
  });

  const { data: emailDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["emailDetail", selectedEmailId],
    queryFn: () => emailApi.getById(selectedEmailId!),
    enabled: !!selectedEmailId,
  });

  // ─── Mutations ──────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: (id: string) => emailApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewQueue"] });
      queryClient.invalidateQueries({ queryKey: ["parsedEmails"] });
      queryClient.invalidateQueries({ queryKey: ["emailStats"] });
      queryClient.invalidateQueries({ queryKey: ["emailDetail"] });
      setSelectedEmailId(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      emailApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewQueue"] });
      queryClient.invalidateQueries({ queryKey: ["parsedEmails"] });
      queryClient.invalidateQueries({ queryKey: ["emailStats"] });
      queryClient.invalidateQueries({ queryKey: ["emailDetail"] });
      setSelectedEmailId(null);
    },
  });

  const handleReject = (id: string) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason) {
      rejectMutation.mutate({ id, reason });
    }
  };

  // Combine review + parsed emails
  const reviewItems = [
    ...(data?.items ?? []),
    ...(parsedData?.items ?? []),
  ];

  const totalCount = reviewItems.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Review Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount} email{totalCount !== 1 ? "s" : ""} pending review
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              // Approve all parsed emails
              reviewItems
                .filter((e) => e.status === "PARSED")
                .forEach((e) => approveMutation.mutate(e.id));
            }}
            disabled={reviewItems.filter((e) => e.status === "PARSED").length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Approve All Parsed
          </button>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          Loading review queue...
        </div>
      ) : totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border border-gray-200">
          <Inbox className="w-16 h-16 mb-4 text-green-300" />
          <p className="text-xl font-medium text-gray-600">All clear!</p>
          <p className="text-sm text-gray-400 mt-1">No emails pending review</p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Review List */}
          <div className={`${selectedEmailId ? "w-1/2" : "w-full"} space-y-3 transition-all`}>
            {reviewItems.map((email) => (
              <div
                key={email.id}
                onClick={() => setSelectedEmailId(email.id)}
                className={`bg-white rounded-lg border p-4 cursor-pointer hover:border-blue-300 transition-colors ${
                  selectedEmailId === email.id
                    ? "border-blue-400 ring-1 ring-blue-200"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                          email.status === "REVIEW"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {email.status}
                      </span>
                      {email.email_type && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded">
                          {email.email_type}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                      {email.subject || "No subject"}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      From: {email.from_address || "Unknown"} ·{" "}
                      {email.received_at
                        ? format(new Date(email.received_at), "MMM d, HH:mm")
                        : "—"}
                    </p>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        approveMutation.mutate(email.id);
                      }}
                      disabled={approveMutation.isPending}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Approve"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReject(email.id);
                      }}
                      disabled={rejectMutation.isPending}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Reject"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Detail Panel */}
          {selectedEmailId && emailDetail && (
            <div className="w-1/2 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="font-medium text-gray-900">Review Detail</h3>
                <button
                  onClick={() => setSelectedEmailId(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕ Close
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
                {/* Email Info */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">
                    {emailDetail.subject || "No subject"}
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">From:</span>{" "}
                      <span className="text-gray-900">{emailDetail.from_address}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Type:</span>{" "}
                      <span className="text-gray-900">{emailDetail.email_type || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Parsed Data */}
                {emailDetail.parsed_data.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 mb-2">Extracted Data</h5>
                    {emailDetail.parsed_data.map((pd) => (
                      <div
                        key={pd.id}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-lg mb-2"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                            {pd.parser_used} Parser
                          </span>
                          {pd.po_number_extracted && (
                            <span className="text-sm font-bold text-gray-900">
                              PO# {pd.po_number_extracted}
                            </span>
                          )}
                        </div>

                        {pd.normalized && (
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {Object.entries(pd.normalized).map(([key, value]) =>
                              value ? (
                                <div key={key}>
                                  <span className="text-gray-500 text-xs">
                                    {key.replace(/_/g, " ")}:
                                  </span>{" "}
                                  <span className="text-gray-900 font-medium">
                                    {typeof value === "number"
                                      ? value.toLocaleString()
                                      : String(value)}
                                  </span>
                                </div>
                              ) : null
                            )}
                          </div>
                        )}

                        {pd.validation_errors.length > 0 && (
                          <div className="mt-2 p-2 bg-yellow-50 rounded text-xs text-yellow-700">
                            <AlertTriangle className="w-3 h-3 inline mr-1" />
                            {pd.validation_errors.join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Body Preview */}
                {emailDetail.body_text && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 mb-1">
                      Original Email Body
                    </h5>
                    <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {emailDetail.body_text.substring(0, 2000)}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => approveMutation.mutate(emailDetail.id)}
                    disabled={approveMutation.isPending}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(emailDetail.id)}
                    disabled={rejectMutation.isPending}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}