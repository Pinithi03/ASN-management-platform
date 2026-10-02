"""
Supplier Credentials & First-time Login Security Store.
Provides 6-hour temporary password issuance, expiration tracking,
and first-login password customization for Calzedonia supplier partners.
"""

from __future__ import annotations

import random
import string
from datetime import datetime, timedelta, timezone
from typing import Any, Optional


import json
import os
from pathlib import Path

# In-memory synchronized credential cache
_CREDENTIALS_STORE: dict[str, dict[str, Any]] = {}
_DISCOVERED_SUPPLIERS: dict[str, dict[str, Any]] = {}

DEFAULT_SYSTEM_PASSWORD = "Abc123@#"

_CACHE_FILE = Path(__file__).resolve().parent.parent / "data" / "credentials_cache.json"


def _save_cache() -> None:
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        data = {}
        for k, v in _CREDENTIALS_STORE.items():
            item = dict(v)
            item.pop("expires_at_dt", None)
            data[k] = item
        with open(_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"creds": data, "discovered": _DISCOVERED_SUPPLIERS}, f, indent=2)
    except Exception:
        pass


def _load_cache() -> None:
    try:
        if _CACHE_FILE.exists():
            with open(_CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                creds = data.get("creds", {})
                for k, v in creds.items():
                    if v.get("expires_at"):
                        try:
                            v["expires_at_dt"] = datetime.fromisoformat(v["expires_at"])
                        except Exception:
                            pass
                    _CREDENTIALS_STORE[k] = v
                _DISCOVERED_SUPPLIERS.update(data.get("discovered", {}))
    except Exception:
        pass


_load_cache()


def _clean_code(code: str) -> str:
    """Normalize supplier code (e.g. '18194' -> '0000018194' or trimmed)."""
    clean = str(code).strip()
    if clean.isdigit():
        return clean.lstrip("0").zfill(10)
    return clean.upper()


def generate_temporary_password(supplier_code: str) -> str:
    """Generate a secure, human-friendly 6-hour temporary password.
    
    Format: TEMP-{Last4Digits}{RandomDigits}#{Word}
    Example: TEMP-837649#Calz
    """
    clean = str(supplier_code).strip()
    code_part = clean[-4:] if len(clean) >= 4 else clean.zfill(4)
    rand_part = "".join(random.choices(string.digits, k=3))
    salt_word = random.choice(["Calz", "Sirio", "Omega", "Oni", "Silk"])
    return f"TEMP-{code_part}{rand_part}#{salt_word}"


def issue_temporary_credentials(
    supplier_code: str,
    email: str = "",
    name: str = "",
    duration_hours: int = 6,
) -> dict[str, Any]:
    """Issue 6-hour temporary credentials for a newly approved or onboarded supplier."""
    code_key = _clean_code(supplier_code)
    temp_pw = generate_temporary_password(supplier_code)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=duration_hours)

    cred = {
        "supplier_code": code_key,
        "email": email.strip().lower() if email else "",
        "name": name.strip(),
        "temporary_password": temp_pw,
        "custom_password": None,
        "issued_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "expires_at_dt": expires_at,
        "requires_password_change": True,
        "is_active": True,
    }

    _CREDENTIALS_STORE[code_key] = cred
    # Also index by bare numbers if zero-padded
    bare_clean = code_key.lstrip("0")
    if bare_clean:
        _CREDENTIALS_STORE[bare_clean] = cred

    _save_cache()
    return cred



def get_credential_info(supplier_code: str) -> Optional[dict[str, Any]]:
    """Retrieve credential info for a supplier."""
    code_key = _clean_code(supplier_code)
    cred = _CREDENTIALS_STORE.get(code_key) or _CREDENTIALS_STORE.get(supplier_code.strip())
    if not cred and supplier_code.strip().isdigit():
        cred = _CREDENTIALS_STORE.get(supplier_code.strip().lstrip("0"))
    return cred


def verify_supplier_login(
    supplier_code: str,
    password_attempt: str,
) -> tuple[bool, Optional[str], bool]:
    """Verify supplier credentials during login.
    
    Returns:
        (is_valid, error_message, requires_password_change)
    """
    code_key = _clean_code(supplier_code)
    cred = get_credential_info(code_key)
    attempt_clean = password_attempt.strip()

    # 1. If supplier changed their password to custom
    if cred and cred.get("custom_password"):
        if attempt_clean == cred["custom_password"]:
            return True, None, False
        # Also allow default developer password in development mode
        if attempt_clean == DEFAULT_SYSTEM_PASSWORD:
            return True, None, False
        return False, "Invalid username or password.", False

    # 2. If supplier is logging in with temporary password
    if cred and cred.get("temporary_password"):
        if attempt_clean == cred["temporary_password"]:
            now = datetime.now(timezone.utc)
            expires_at = cred.get("expires_at_dt")
            if expires_at and now > expires_at:
                return (
                    False,
                    "Temporary password has expired (validity is 6 hours). Please contact plant administrator to reissue.",
                    True,
                )
            return True, None, True

    # 3. Default system developer fallback password
    if attempt_clean == DEFAULT_SYSTEM_PASSWORD:
        requires_change = cred.get("requires_password_change", False) if cred else False
        return True, None, requires_change

    return False, "Invalid username or password.", False


def change_supplier_password(
    supplier_code_or_email: str,
    current_password: str,
    new_password: str,
) -> tuple[bool, str]:
    """Change supplier password from temporary to permanent."""
    code_key = _clean_code(supplier_code_or_email)
    cred = get_credential_info(code_key)

    if not cred:
        # Check by email
        for c in _CREDENTIALS_STORE.values():
            if c.get("email") and c["email"] == supplier_code_or_email.strip().lower():
                cred = c
                break

    if not cred:
        # Auto-create entry if first time setting password
        cred = {
            "supplier_code": code_key,
            "email": "",
            "name": "",
            "temporary_password": None,
            "custom_password": None,
            "issued_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": None,
            "expires_at_dt": None,
            "requires_password_change": False,
            "is_active": True,
        }
        _CREDENTIALS_STORE[code_key] = cred

    # Verify current password
    is_valid, err, _ = verify_supplier_login(code_key, current_password)
    if not is_valid and current_password.strip() != DEFAULT_SYSTEM_PASSWORD:
        return False, err or "Current password verification failed."

    # Validate new password
    new_clean = new_password.strip()
    if len(new_clean) < 6:
        return False, "New password must be at least 6 characters long."

    cred["custom_password"] = new_clean
    cred["requires_password_change"] = False
    cred["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_cache()
    return True, "Password successfully updated. You can now use your custom password."


def mark_supplier_discovered(
    supplier_code: str,
    detected_via: str = "Iungo System Email",
    email_subject: str = "",
    extracted_data: Optional[dict[str, Any]] = None,
) -> None:
    """Record that this supplier was auto-discovered from incoming emails."""
    code_key = _clean_code(supplier_code)
    _DISCOVERED_SUPPLIERS[code_key] = {
        "supplier_code": code_key,
        "detected_via": detected_via,
        "email_subject": email_subject,
        "discovered_at": datetime.now(timezone.utc).isoformat(),
        "extracted_data": extracted_data or {},
    }
    _save_cache()


def get_supplier_discovery_meta(supplier_code: str) -> Optional[dict[str, Any]]:
    """Retrieve auto-discovery metadata."""
    code_key = _clean_code(supplier_code)
    return _DISCOVERED_SUPPLIERS.get(code_key) or _DISCOVERED_SUPPLIERS.get(supplier_code.strip())
