/**
 * AuthProvider — wraps the whole app.
 *
 * On mount:
 *   1. Initialises keycloak-js (redirects to Keycloak if no session)
 *   2. Applies the user's language from the token's `locale` claim
 *   3. Calls GET /auth/me to load the user profile
 *   4. Stores the profile in the Zustand auth store
 *   5. Renders children
 *
 * While that runs, a full-screen loader is shown.
 * If Keycloak is unreachable, a plain error with a retry button appears.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { initKeycloak, keycloak, login } from "@/lib/keycloak";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/auth";
import i18n, { normaliseLocale } from "@/i18n";
import { getErrorMessage } from "@/services/apiError";

type Status = "loading" | "ready" | "error";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation(["layout", "common"]);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const setProfile = useAuthStore((s) => s.setProfile);

  const bootstrap = async () => {
    setStatus("loading");
    setErrorMsg("");

    try {
      const authenticated = await initKeycloak();
      if (!authenticated) {
        // Should not happen with login-required, but just in case.
        login();
        return;
      }

      // The language saved on the user's account wins over the browser language.
      const tokenLanguage = normaliseLocale(keycloak.tokenParsed?.locale);
      if (tokenLanguage && tokenLanguage !== i18n.language) {
        await i18n.changeLanguage(tokenLanguage);
      }

      // Load the user profile from the backend.
      const me = await authService.getMe();
      // The backend also knows a supplier's saved language when the token has no `locale` yet
      const savedLanguage = normaliseLocale(me.language);
      if (savedLanguage && savedLanguage !== i18n.language) {
        await i18n.changeLanguage(savedLanguage);
      }
      setProfile(me);
      setStatus("ready");
    } catch (err: any) {
      console.error("Auth bootstrap failed:", err);
      setErrorMsg(getErrorMessage(err, t("layout:auth.couldNotConnect")));
      setStatus("error");
    }
  };

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-gray-500">{t("layout:auth.signingIn")}</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="max-w-sm rounded-lg border bg-white p-6 text-center shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            {t("layout:auth.unableToSignIn")}
          </h2>
          <p className="mb-4 text-sm text-gray-500">{errorMsg}</p>
          <button
            onClick={bootstrap}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t("common:actions.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
