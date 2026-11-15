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
    <div
      className="flex h-screen w-screen items-center justify-center bg-cover bg-center bg-no-repeat overflow-hidden"
      style={{
        backgroundImage: "url('/assets/network-bg.jpg')",
        backgroundColor: "#0a0e27"
      }}
    >
      {/* Glass effect overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />

      {/* Glassmorphic card */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6">
        <div
          className="rounded-2xl border border-white/20 bg-white/10 px-8 py-12 shadow-2xl backdrop-blur-xl"
          style={{
            backdropFilter: "blur(10px)",
            background: "rgba(255, 255, 255, 0.08)",
            boxShadow: "0 8px 32px rgba(31, 38, 135, 0.37)"
          }}
        >
          {/* Logo/Brand */}
          <div className="mb-2 text-center">
            <h1 className="text-3xl font-bold text-white mb-1">ASN Platform</h1>
            <p className="text-sm text-gray-300">Advanced Shipping Note</p>
          </div>

          <div className="h-px bg-white/10 my-6" />

          {/* Loading spinner */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/20 border-t-cyan-400" />
            </div>
            <p className="text-sm text-gray-200 text-center">
              {t("auth.redirectingToLogin")}
            </p>
          </div>

          <div className="h-px bg-white/10 my-6" />

          {/* Footer text */}
          <p className="text-xs text-gray-400 text-center">
            Securing your session...
          </p>
        </div>
      </div>
    </div>
  );
}