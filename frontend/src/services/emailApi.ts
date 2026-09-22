// ─── Email API Service ──────────────────────────────────────────
// frontend/src/services/emailApi.ts

import { api } from "./api";
import type {
  EmailRecord,
  EmailDetail,
  EmailStats,
  PaginatedResponse,
} from "@/types/email";

export interface EmailListParams {
  page?: number;
  per_page?: number;
  status?: string;
  email_type?: string;
  search?: string;
  po_number?: string;
  vendor_code?: string;
  company_id?: string;
}

// ─── API Calls ──────────────────────────────────────────────────

export const emailApi = {
  /** List emails with filters & pagination */
  list: async (params: EmailListParams = {}): Promise<PaginatedResponse<EmailRecord>> => {
    const { data } = await api.get("/emails", { params });
    return data;
  },

  /** Get email detail with parsed data */
  getById: async (emailId: string): Promise<EmailDetail> => {
    const { data } = await api.get(`/emails/${emailId}`);
    return data;
  },

  /** Download a stored attachment (or the original .eml) as a Blob */
  getAttachment: async (emailId: string, attachmentId: string): Promise<Blob> => {
    const { data } = await api.get(`/emails/${emailId}/attachments/${attachmentId}`, {
      responseType: "blob",
    });
    return data;
  },

  /** Get email processing statistics */
  getStats: async (companyId?: string): Promise<EmailStats> => {
    const { data } = await api.get("/emails/stats", {
      params: companyId ? { company_id: companyId } : {},
    });
    return data;
  },

  /** Re-queue an email for reprocessing */
  reprocess: async (emailId: string): Promise<{ status: string }> => {
    const { data } = await api.post(`/emails/${emailId}/reprocess`);
    return data;
  },

  /** Update email fields */
  update: async (
    emailId: string,
    body: { status?: string; email_type?: string; error_message?: string }
  ): Promise<{ status: string }> => {
    const { data } = await api.patch(`/emails/${emailId}`, body);
    return data;
  },

  /** Trigger test pipeline (IMAP → parse → DB) */
  testPipeline: async (companyId: string): Promise<unknown> => {
    const { data } = await api.get("/emails/test-pipeline", {
      params: { company_id: companyId },
    });
    return data;
  },
};