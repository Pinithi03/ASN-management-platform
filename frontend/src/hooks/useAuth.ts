/**
 * Authentication hook.
 * Will integrate with Keycloak in Sprint 3-4.
 */

export function useAuth() {
  return {
    isAuthenticated: true,
    user: null,
    login: () => {},
    logout: () => {},
    isLoading: false,
  };
}
