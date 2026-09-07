/**
 * Authentication service.
 * Will integrate with Keycloak in Sprint 3-4.
 */

export const authService = {
  isAuthenticated: () => {
    // Placeholder — always returns true until Keycloak is integrated
    return true;
  },

  getToken: () => {
    return null;
  },

  logout: () => {
    // Will redirect to Keycloak logout in Sprint 4
    console.log("Logout not yet implemented");
  },
};
