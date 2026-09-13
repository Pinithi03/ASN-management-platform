/**
 * Shipment & ASN API Service.
 * Communicates with backend /api/v1/shipments and /api/v1/asn endpoints.
 */

import { api } from "./api";

export interface LineItemSummary {
  po_number: string;
  po_item: string;
  product_code: string;
  total_qty: number;
  carton_count: number;
  total_gw: number;
  total_nw: number;
  po_ordered_qty?: number;
  po_open_balance?: number;
  is_valid: boolean;
  errors: string[];
}

export interface ParsedCartonRow {
  row_index: number;
  po_number: string;
  po_item: string;
  pack_number: string;
  carton_number: number;
  supplier_carton_ref: string;
  product_code: string;
  lot_number: string;
  width?: number;
  gross_weight: number;
  net_weight: number;
  quantity: number;
  uom: string;
  errors: string[];
}

export interface ExcelValidationResult {
  is_valid: boolean;
  total_rows: number;
  total_cartons: number;
  total_gross_weight: number;
  total_net_weight: number;
  total_quantity: number;
  general_errors: string[];
  line_summaries: LineItemSummary[];
  rows: ParsedCartonRow[];
}

export interface CreateShipmentResponse {
  success: boolean;
  message: string;
  shipment: {
    id: string;
    shipment_number: string;
    plant_code: string;
    status: string;
    total_boxes: number;
    total_pieces: number;
    ship_date?: string;
    carrier?: string;
  };
  asn: {
    id: string;
    asn_number: string;
    status: string;
    xml_validated: boolean;
    xml_filename: string;
    email_subject: string;
  };
  handling_units: string[];
  xml_validation: {
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
  };
}

export const shipmentService = {
  /**
   * Download the standard 12-column packing list Excel template (.xlsx).
   */
  async downloadTemplate(poNumber?: string): Promise<Blob> {
    const url = poNumber ? `/shipments/template?po_number=${encodeURIComponent(poNumber)}` : `/shipments/template`;
    const res = await api.get(url, { responseType: "blob" });
    return res.data;
  },

  /**
   * Download tailored Excel packing template based on supplier packing setup (Box vs Roll & units count).
   */
  async downloadConfiguredTemplate(payload: {
    po_number: string;
    lines: Array<{
      po_item: string;
      pack_type: "BOX" | "ROLL";
      units_count: number;
      quantity?: number;
    }>;
  }): Promise<Blob> {
    const res = await api.post("/shipments/template/configured", payload, {
      responseType: "blob",
    });
    return res.data;
  },

  /**
   * Validate uploaded Excel packing list file.
   */
  async validateExcel(file: File, supplierId?: string): Promise<ExcelValidationResult> {
    const formData = new FormData();
    formData.append("file", file);
    if (supplierId) formData.append("supplier_id", supplierId);

    const res = await api.post<ExcelValidationResult>("/shipments/validate-excel", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  /**
   * Create shipment from validated Excel file.
   */
  async createFromExcel(params: {
    file: File;
    plant_code: string;
    supplier_code?: string;
    supplier_name?: string;
    supplier_id?: string;
    carrier?: string;
    tracking_number?: string;
    estimated_arrival?: string;
    note?: string;
  }): Promise<CreateShipmentResponse> {
    const formData = new FormData();
    formData.append("file", params.file);
    formData.append("plant_code", params.plant_code);
    if (params.supplier_code) formData.append("supplier_code", params.supplier_code);
    if (params.supplier_name) formData.append("supplier_name", params.supplier_name);
    if (params.supplier_id) formData.append("supplier_id", params.supplier_id);
    if (params.carrier) formData.append("carrier", params.carrier);
    if (params.tracking_number) formData.append("tracking_number", params.tracking_number);
    if (params.estimated_arrival) formData.append("estimated_arrival", params.estimated_arrival);
    if (params.note) formData.append("note", params.note);

    const res = await api.post<CreateShipmentResponse>("/shipments/create-from-excel", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  /**
   * List shipments.
   */
  async getShipments(status?: string, search?: string, supplierId?: string) {
    const params = new URLSearchParams();
    if (status && status !== "ALL") params.append("status", status);
    if (search) params.append("search", search);
    if (supplierId) params.append("supplier_id", supplierId);
    const res = await api.get(`/shipments?${params.toString()}`);
    return res.data;
  },

  /**
   * Download 6"x4" barcode label PDF.
   */
  async downloadLabelsPdf(shipmentId: string): Promise<Blob> {
    const res = await api.get(`/shipments/${shipmentId}/labels`, { responseType: "blob" });
    return res.data;
  },

  /**
   * Preview Calzedonia SdDataSlice XML.
   */
  async getASNXmlPreview(asnId: string) {
    const res = await api.get<{ asn_number: string; xml_content: string; xml_validated: boolean }>(
      `/asn/${asnId}/preview-xml`
    );
    return res.data;
  },

  /**
   * Download Calzedonia XML file.
   */
  async downloadASNXml(asnId: string): Promise<Blob> {
    const res = await api.get(`/asn/${asnId}/download-xml`, { responseType: "blob" });
    return res.data;
  },

  /**
   * Revalidate ASN XML.
   */
  async validateASNXml(asnId: string) {
    const res = await api.post(`/asn/${asnId}/validate`);
    return res.data;
  },

  /**
   * Dispatch ASN XML to Calzedonia.
   */
  async sendASN(asnId: string, recipientEmail?: string) {
    const url = recipientEmail ? `/asn/${asnId}/send?recipient_email=${encodeURIComponent(recipientEmail)}` : `/asn/${asnId}/send`;
    const res = await api.post(url);
    return res.data;
  },
};
