/**
 * Axios HTTP client configured for the backend API.
 *
 * Features:
 *   - Base URL: /api/v1 (proxied in dev, Nginx in prod)
 *   - Automatic JWT injection via request interceptor
 *   - Token refresh on 401 via response interceptor
 *   - Request/response logging in development
 */

// TODO: Sprint 1 (EP-02) — Implement API client
// import axios from "axios";
//
// export const api = axios.create({
//   baseURL: "/api/v1",
//   headers: { "Content-Type": "application/json" },
// });
