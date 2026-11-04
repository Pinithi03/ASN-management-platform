/**
 * i18next setup — import once in main.tsx before rendering.
 *
 * Language on app load:
 *   1. `locale` claim in the Keycloak token (applied by AuthProvider)
 *   2. browser language, if supported
 *   3. English
 *
 * The app uses `zh-CN`; Keycloak 26 calls Simplified Chinese `zh-Hans`.
 * Use toKeycloakLocale() whenever a language is sent to Keycloak.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { namespaces, resources } from "./resources";

export const SUPPORTED_LANGUAGES = ["en", "zh-CN", "it"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Each language's name in its own language — never translated. */
export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  en: "English",
  "zh-CN": "中文",
  it: "Italiano",
};

/** Map any locale variant to a supported language, or null if unsupported. */
export function normaliseLocale(value: string | null | undefined): AppLanguage | null {
  if (!value) return null;
  const code = value.trim().replace(/_/g, "-").toLowerCase();
  if (code === "zh" || code === "zh-cn" || code === "zh-hans" || code.startsWith("zh-hans-")) {
    return "zh-CN";
  }
  if (code === "it" || code.startsWith("it-")) return "it";
  if (code === "en" || code.startsWith("en-")) return "en";
  return null;
}

/** App language → locale code Keycloak understands. */
export function toKeycloakLocale(lang: string): string {
  const app = normaliseLocale(lang) ?? "en";
  return app === "zh-CN" ? "zh-Hans" : app;
}

function detectBrowserLanguage(): AppLanguage {
  const candidates = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const candidate of candidates) {
    const lang = normaliseLocale(candidate);
    if (lang) return lang;
  }
  return "en";
}

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

i18n.use(initReactI18next).init({
  resources,
  lng: detectBrowserLanguage(),
  fallbackLng: "en",
  supportedLngs: [...SUPPORTED_LANGUAGES],
  ns: [...namespaces],
  defaultNS: "common",
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
  initAsync: false, // resources are bundled, so be ready before the first render
});

/** The current language, always one of SUPPORTED_LANGUAGES. */
export function currentLanguage(): AppLanguage {
  return normaliseLocale(i18n.resolvedLanguage ?? i18n.language) ?? "en";
}

export default i18n;
