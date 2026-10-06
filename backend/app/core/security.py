"""
JWT verification using Keycloak's JWKS endpoint.

Tokens are signed by Keycloak with RS256. The backend:
 1. Fetches the public keys from Keycloak's JWKS endpoint (cached for 1 hour;
    a new key ID triggers a refetch).
 2. Verifies signature, issuer, audience and expiry.
 3. Returns the decoded claims dict.

No passwords or secrets are involved — only the public keys.
"""

from __future__ import annotations

from functools import lru_cache

import jwt
from jwt import PyJWKClient

from app.core.config import get_settings


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    """
    JWKS client with built-in key caching. Uses the internal URL
    (Docker network) to reach Keycloak, since the backend runs in
    the same Compose stack.
    """
    settings = get_settings()
    return PyJWKClient(
        settings.keycloak_jwks_url,
        cache_keys=True,
        lifespan=3600,  # re-fetch keys after 1 hour
    )


def decode_access_token(token: str) -> dict:
    """
    Verify and decode a Keycloak access token.

    Raises jwt.ExpiredSignatureError, jwt.InvalidAudienceError,
    jwt.InvalidIssuerError, or jwt.PyJWTError on any failure.
    """
    settings = get_settings()
    signing_key = _jwks_client().get_signing_key_from_jwt(token)

    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.KEYCLOAK_CLIENT_ID,  # "ans-backend"
        issuer=settings.keycloak_issuer,
        leeway=30,  # small clock-skew allowance
        options={"require": ["exp", "iat", "iss", "aud", "sub"]},
    )


async def warmup_jwks() -> None:
    """
    Pre-fetch the signing keys at startup so the first request
    doesn't pay the network cost. Safe to call from the FastAPI
    lifespan; runs in a thread because PyJWKClient uses blocking HTTP.
    """
    from starlette.concurrency import run_in_threadpool

    settings = get_settings()
    try:
        await run_in_threadpool(
            _jwks_client().get_jwk_set
        )
    except Exception:
        # Non-fatal: first request will fetch the keys instead.
        import logging
        logging.getLogger(__name__).warning(
            "Could not pre-fetch JWKS from %s — first request will be slower",
            settings.keycloak_jwks_url,
        )
