/**
 * Keycloak instance and initialisation.
 *
 * - `login-required`: nobody reaches the app without a session.
 * - PKCE S256: protects the authorisation code exchange.
 * - Tokens stay in memory only — never localStorage.
 * - `checkLoginIframe: false`: avoids third-party cookie issues.
 */

import Keycloak from "keycloak-js";

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080/auth",
  realm: import.meta.env.VITE_KEYCLOAK_REALM || "oniverse",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "ans-frontend",
});

// Guard: keycloak-js does not allow init() to be called twice
// (React StrictMode calls effects twice in dev).
let initPromise: Promise<boolean> | null = null;

export function initKeycloak(): Promise<boolean> {
  if (!initPromise) {
    initPromise = keycloak.init({
      onLoad: "login-required",
      pkceMethod: "S256",
      checkLoginIframe: false,
    });
  }
  return initPromise!;
}

// Silently refresh the token when it's about to expire.
keycloak.onTokenExpired = () => {
  keycloak.updateToken(30).catch(() => {
    // Refresh token is also expired — back to login.
    keycloak.login();
  });
};
