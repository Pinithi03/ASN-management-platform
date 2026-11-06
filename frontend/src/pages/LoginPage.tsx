/**
 * Login is handled directly by Keycloak.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { login } from "@/lib/keycloak";

export default function LoginPage() {
  const { t } = useTranslation("layout");

  useEffect(() => {
    login();
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <p className="text-sm text-gray-500">{t("auth.redirectingToLogin")}</p>
      </div>
    </div>
  );
}