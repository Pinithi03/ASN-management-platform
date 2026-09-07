"""
Authentication & Authorization Service.

Handles:
    - Keycloak token validation
    - User session management
    - Role-based access control checks
    - Microsoft Entra ID / Outlook OAuth flow

Calls: UserRepository, Keycloak client
Called by: auth endpoints, deps.get_current_user()
"""

# TODO: Sprint 2 (EP-03) — Implement Keycloak integration
