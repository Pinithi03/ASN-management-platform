/**
 * Line-item extraction for a purchase order.
 * Line items live in `extra_data.items`; older POs without items get a
 * single synthetic line built from the header fields.
 */

import type { PurchaseOrder } from "@/types/email";

export interface POLineItemRow {
  line_number: string;
  item_code: string;
  partner_item_code?: string;
  description: string;
  color?: string;
  size?: string;
  quantity: number;
  shipped_quantity: number;
  remaining_quantity: number;
  unit_price?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function extractLineItems(po: PurchaseOrder | null | undefined, fallbackDescription: string): POLineItemRow[] {
  if (!po) return [];
  const anyPo = po as any;
  const rawItems = (po.extra_data as any)?.items;

  if (Array.isArray(rawItems) && rawItems.length > 0) {
    return rawItems.map((it: any, idx: number) => {
      const qty = Number(it.quantity || 0);
      const shipped = Number(it.shipped_quantity ?? 0);
      const remaining = it.remaining_quantity !== undefined ? Number(it.remaining_quantity) : Math.max(0, qty - shipped);
      let unitPrice: number | undefined;
      if (it.unit_price != null && Number(it.unit_price) > 0) unitPrice = Number(it.unit_price);
      else if (po.unit_price && Number(po.unit_price) > 0) unitPrice = Number(po.unit_price);

      return {
        line_number: String(it.order_line_number || it.line_number || idx + 1),
        item_code: it.item_code || it.material_code || po.style_number || " ",
        partner_item_code: it.partner_item_code || it.partner_code || "",
        description: it.item_description || it.description || po.description || " ",
        color: it.color || "",
        size: it.size || it.qty_unit || it.uom || "M",
        quantity: qty,
        shipped_quantity: shipped,
        remaining_quantity: remaining,
        unit_price: unitPrice,
      };
    });
  }

  const qty = Number(po.quantity || 0);
  const shipped = Number(anyPo.shipped_quantity || 0);
  return [
    {
      line_number: "1",
      item_code: po.style_number || " ",
      partner_item_code: "",
      description: po.description || fallbackDescription,
      color: "",
      size: "PCS",
      quantity: qty,
      shipped_quantity: shipped,
      remaining_quantity: anyPo.remaining_quantity !== undefined ? Number(anyPo.remaining_quantity) : Math.max(0, qty - shipped),
      unit_price: po.unit_price ? Number(po.unit_price) : undefined,
    },
  ];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Route for a PO's detail page (opened in a new tab). */
export function poDetailPath(poId: string, mode?: "manual" | "excel"): string {
  const base = `/purchase-orders/${encodeURIComponent(poId)}`;
  return mode === "excel" ? `${base}?mode=excel` : base;
}
