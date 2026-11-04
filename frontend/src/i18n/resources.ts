/**
 * Translation resources, bundled into the app (no HTTP loading).
 * English (`en`) is the source of truth; `zh-CN` and `it` must have the same keys
 * (checked by `npm run i18n:check`).
 */

import enCommon from "@/locales/en/common.json";
import enLayout from "@/locales/en/layout.json";
import enDashboard from "@/locales/en/dashboard.json";
import enProfile from "@/locales/en/profile.json";
import enDrafts from "@/locales/en/drafts.json";
import enOrderHistory from "@/locales/en/orderHistory.json";
import zhCommon from "@/locales/zh-CN/common.json";
import zhLayout from "@/locales/zh-CN/layout.json";
import zhDashboard from "@/locales/zh-CN/dashboard.json";
import zhProfile from "@/locales/zh-CN/profile.json";
import zhDrafts from "@/locales/zh-CN/drafts.json";
import zhOrderHistory from "@/locales/zh-CN/orderHistory.json";
import itCommon from "@/locales/it/common.json";
import itLayout from "@/locales/it/layout.json";
import itDashboard from "@/locales/it/dashboard.json";
import itProfile from "@/locales/it/profile.json";
import itDrafts from "@/locales/it/drafts.json";
import itOrderHistory from "@/locales/it/orderHistory.json";

export const resources = {
  en: {
    common: enCommon,
    layout: enLayout,
    dashboard: enDashboard,
    profile: enProfile,
    drafts: enDrafts,
    orderHistory: enOrderHistory,
  },
  "zh-CN": {
    common: zhCommon,
    layout: zhLayout,
    dashboard: zhDashboard,
    profile: zhProfile,
    drafts: zhDrafts,
    orderHistory: zhOrderHistory,
  },
  it: {
    common: itCommon,
    layout: itLayout,
    dashboard: itDashboard,
    profile: itProfile,
    drafts: itDrafts,
    orderHistory: itOrderHistory,
  },
};

export const namespaces = ["common", "layout", "dashboard", "profile", "drafts", "orderHistory"] as const;

export type LayoutResources = typeof enLayout;
