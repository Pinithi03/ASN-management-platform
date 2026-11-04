/**
 * Translation resources, bundled into the app (no HTTP loading).
 * English (`en`) is the source of truth; `zh-CN` and `it` must have the same keys
 * (checked by `npm run i18n:check`).
 */

import enCommon from "@/locales/en/common.json";
import enLayout from "@/locales/en/layout.json";
import enDashboard from "@/locales/en/dashboard.json";
import zhCommon from "@/locales/zh-CN/common.json";
import zhLayout from "@/locales/zh-CN/layout.json";
import zhDashboard from "@/locales/zh-CN/dashboard.json";
import itCommon from "@/locales/it/common.json";
import itLayout from "@/locales/it/layout.json";
import itDashboard from "@/locales/it/dashboard.json";

export const resources = {
  en: { common: enCommon, layout: enLayout, dashboard: enDashboard },
  "zh-CN": { common: zhCommon, layout: zhLayout, dashboard: zhDashboard },
  it: { common: itCommon, layout: itLayout, dashboard: itDashboard },
};

export const namespaces = ["common", "layout", "dashboard"] as const;

export type LayoutResources = typeof enLayout;
