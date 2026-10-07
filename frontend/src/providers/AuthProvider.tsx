/**
 * AuthProvider — wraps the whole app.
 *
 * On mount:
 *   1. Initialises keycloak-js (redirects to Keycloak if no session)
 *   2. Calls GET /auth/me to load the user profile
 *   3. Stores the profile in the Zustand auth store
 *   4. Renders children
 *
 * While that runs, a full-screen loader is shown.
 * If Keycloak is unreachable, a plain error with a retry button appears.
 */

import { useEffect, useState, type ReactNode } from "react";
import { initKeycloak, keycloak } from "@/lib/keycloak";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/auth";

type Status = "loading" | "ready" | "error";

export default function AuthProvider({ children }: { children: ReactNode }) {
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
        keycloak.login();
        return;
      }

      // Load the user profile from the backend.
      const me = await authService.getMe();
      setProfile(me);
      setStatus("ready");
    } catch (err: any) {
      console.error("Auth bootstrap failed:", err);
      setErrorMsg(err?.message || "Could not connect to the login server.");
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
          <p className="text-sm text-gray-500">Signing you in…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="max-w-sm rounded-lg border bg-white p-6 text-center shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            Unable to sign in
          </h2>
          <p className="mb-4 text-sm text-gray-500">{errorMsg}</p>
          <button
            onClick={bootstrap}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
