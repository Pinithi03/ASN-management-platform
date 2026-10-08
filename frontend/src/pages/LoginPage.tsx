/**
 * Login is handled directly by Keycloak.
 */
import { useEffect } from "react";
import { keycloak } from "@/lib/keycloak";

export default function LoginPage() {
  useEffect(() => {
    keycloak.login();
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <p className="text-sm text-gray-500">Redirecting to login…</p>
      </div>
    </div>
  );
}