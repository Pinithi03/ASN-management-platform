/**
 * Axios API client with Keycloak token handling.
 *
 * - Request interceptor: refreshes the token if it expires within 30 s,
 *   then attaches Authorization: Bearer <token>.
 * - Response interceptor: on 401, tries one token refresh; if that fails,
 *   redirects to the Keycloak login page.
 */

import axios from "axios";
import { keycloak } from "@/lib/keycloak";

export const api = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request: attach the Keycloak token ─────────────────────
api.interceptors.request.use(
  async (config) => {
    // Refresh if the token expires within 30 seconds.
    // updateToken queues concurrent calls, so this is safe to call often.
    try {
      await keycloak.updateToken(30);
    } catch {
      // Refresh failed — session is gone; Keycloak will redirect on the
      // next page navigation. Don't block this request.
    }

    if (keycloak.token) {
      config.headers.Authorization = `Bearer ${keycloak.token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response: retry once on 401, then redirect to login ────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retried) {
      original._retried = true;
      try {
        await keycloak.updateToken(-1); // force refresh
        original.headers.Authorization = `Bearer ${keycloak.token}`;
        return api(original);
      } catch {
        // Session is truly gone — back to the login page.
        keycloak.login();
      }
    }

    return Promise.reject(error);
  },
);
