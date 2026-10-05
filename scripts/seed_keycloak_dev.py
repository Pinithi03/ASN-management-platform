#!/usr/bin/env python3
"""
Seed Keycloak with DEV test users (never run against production).

Creates in realm "oniverse":
  * dev.admin   - role ADMIN; asked to set up an authenticator app (OTP) on first login
  * suppliers   - role SUPPLIER, username = Partner ID (supplier_code), linked to the
                  real `suppliers` rows of your dev database via supplier_id / supplier_code

Emails are fake (<code>@dev.local) so nothing can reach a real supplier; in dev all
Keycloak mail goes to Mailpit anyway (http://localhost:8025).

Safe to run again: existing users are updated, not duplicated.

Usage (from the repo root, with docker compose up and your .env filled in):
    python scripts/seed_keycloak_dev.py                      # admin + first 3 active suppliers
    python scripts/seed_keycloak_dev.py --suppliers 0000018194,0000012345
    python scripts/seed_keycloak_dev.py --first-login        # suppliers must set a password first

Needs: httpx, asyncpg, python-dotenv (all in backend/requirements.txt).
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
import httpx
from dotenv import load_dotenv

REALM = "oniverse"
ROOT = Path(__file__).resolve().parent.parent


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def load_settings() -> dict[str, str]:
    load_dotenv(ROOT / ".env")
    s = {
        "env": os.getenv("ENVIRONMENT", "development"),
        "kc_url": os.getenv("KEYCLOAK_PUBLIC_URL", "http://localhost:8080/auth").rstrip("/"),
        "kc_admin": os.getenv("KC_BOOTSTRAP_ADMIN_USERNAME", "admin"),
        "kc_admin_pw": os.getenv("KC_BOOTSTRAP_ADMIN_PASSWORD", ""),
        "db_url": os.getenv("DATABASE_URL", ""),
        "password": os.getenv("DEV_SEED_PASSWORD", "DevPassword#2026"),
    }
    # Hard guard: this script sets known passwords, so it must never touch production.
    host = urlparse(s["kc_url"]).hostname
    if s["env"].lower() == "production" or host not in ("localhost", "127.0.0.1"):
        fail(f"refusing to run: ENVIRONMENT={s['env']!r}, Keycloak host={host!r} (dev/localhost only)")
    if not s["kc_admin_pw"]:
        fail("KC_BOOTSTRAP_ADMIN_PASSWORD is not set in .env")
    return s


async def fetch_suppliers(db_url: str, codes: list[str] | None) -> list[asyncpg.Record]:
    if not db_url:
        fail("DATABASE_URL is not set in .env")
    dsn = db_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn)
    try:
        if codes:
            rows = await conn.fetch(
                "SELECT id, supplier_code, name FROM suppliers WHERE supplier_code = ANY($1::text[])",
                codes,
            )
            missing = set(codes) - {r["supplier_code"] for r in rows}
            if missing:
                print(f"WARNING: not found in suppliers table: {', '.join(sorted(missing))}")
        else:
            rows = await conn.fetch(
                "SELECT id, supplier_code, name FROM suppliers WHERE is_active "
                "ORDER BY supplier_code LIMIT 3"
            )
        return list(rows)
    finally:
        await conn.close()


class KeycloakAdmin:
    def __init__(self, s: dict[str, str]):
        self.base = s["kc_url"]
        self.http = httpx.Client(timeout=15)
        r = self.http.post(
            f"{self.base}/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli",
                  "username": s["kc_admin"], "password": s["kc_admin_pw"]},
        )
        if r.status_code != 200:
            fail(f"cannot log in to Keycloak as {s['kc_admin']!r} ({r.status_code}). Is it running?")
        self.http.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        self.api = f"{self.base}/admin/realms/{REALM}"

    def _check(self, r: httpx.Response, what: str) -> httpx.Response:
        if r.status_code >= 400:
            fail(f"{what}: {r.status_code} {r.text[:200]}")
        return r

    def upsert_user(self, username: str, role: str, first_name: str,
                    attributes: dict[str, list[str]], password: str,
                    required_actions: list[str]) -> str:
        body = {
            "username": username, "enabled": True, "emailVerified": True,
            "email": f"{username}@dev.local", "firstName": first_name[:255],
            "attributes": attributes, "requiredActions": required_actions,
        }
        found = self._check(self.http.get(f"{self.api}/users", params={"username": username, "exact": "true"}),
                            "look up user").json()
        if found:
            uid = found[0]["id"]
            self._check(self.http.put(f"{self.api}/users/{uid}", json=body), f"update {username}")
            action = "updated"
        else:
            self._check(self.http.post(f"{self.api}/users", json=body), f"create {username}")
            uid = self.http.get(f"{self.api}/users", params={"username": username, "exact": "true"}).json()[0]["id"]
            action = "created"
        r = self.http.put(f"{self.api}/users/{uid}/reset-password",
                          json={"type": "password", "value": password, "temporary": False})
        if r.status_code >= 400 and "PasswordHistory" not in r.text:  # same password already set: fine
            self._check(r, f"set password for {username}")
        role_rep = self._check(self.http.get(f"{self.api}/roles/{role}"), f"read role {role}").json()
        self._check(self.http.post(f"{self.api}/users/{uid}/role-mappings/realm", json=[role_rep]),
                    f"assign {role} to {username}")
        print(f"  {action:8} {username:<14} role={role}")
        return uid


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed Keycloak with dev test users")
    ap.add_argument("--suppliers", help="comma-separated Partner IDs (default: first 3 active suppliers)")
    ap.add_argument("--first-login", action="store_true",
                    help="suppliers must set their own password on first login (UPDATE_PASSWORD)")
    args = ap.parse_args()

    s = load_settings()
    codes = [c.strip() for c in args.suppliers.split(",")] if args.suppliers else None
    suppliers = asyncio.run(fetch_suppliers(s["db_url"], codes))
    kc = KeycloakAdmin(s)

    print(f"Seeding realm '{REALM}' at {s['kc_url']}")
    kc.upsert_user("dev.admin", "ADMIN", "Dev Admin", {}, s["password"], [])
    for row in suppliers:
        code = row["supplier_code"]
        kc.upsert_user(
            code, "SUPPLIER", row["name"] or code,
            {"supplier_id": [str(row["id"])], "supplier_code": [code]},
            s["password"], ["UPDATE_PASSWORD"] if args.first_login else [],
        )
    print(f"\nDone. Password for all dev users: {s['password']} (DEV_SEED_PASSWORD in .env)")
    print("dev.admin is asked to set up an authenticator app (OTP) on first login.")
    print(f"Login page: {s['kc_url']}/realms/{REALM}/account")


if __name__ == "__main__":
    main()
