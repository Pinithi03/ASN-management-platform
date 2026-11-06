"""
Tests for multi-language support on the backend:
language codes, PATCH /auth/me/preferences, coded errors and the welcome email.
No database or Keycloak needed — both are replaced with fakes.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1 import deps
from app.api.v1.endpoints import auth as auth_endpoints
from app.core.exceptions import CodedHTTPException, coded_http_exception_handler
from app.core.languages import normalise_language, to_keycloak_locale
from app.main import app
from app.models.enums import ROLE_PERMISSIONS, UserRole
from app.services.email_sender import render_supplier_welcome_email


# ---------------------------------------------------------------------------
# Language codes
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "raw, expected",
    [
        ("en", "en"), ("en-GB", "en"),
        ("it", "it"), ("it-IT", "it"),
        ("zh", "zh-CN"), ("zh-CN", "zh-CN"), ("zh_CN", "zh-CN"), ("zh-Hans", "zh-CN"),
        ("zh-Hant", None), ("fr", None), ("", None), (None, None),
    ],
)
def test_normalise_language(raw, expected):
    assert normalise_language(raw) == expected


def test_to_keycloak_locale():
    assert to_keycloak_locale("zh-CN") == "zh-Hans"
    assert to_keycloak_locale("it") == "it"
    assert to_keycloak_locale("en") == "en"


# ---------------------------------------------------------------------------
# PATCH /auth/me/preferences
# ---------------------------------------------------------------------------
def _user(role: UserRole) -> deps.CurrentUser:
    return deps.CurrentUser(
        keycloak_id="kc-123",
        role=role,
        supplier_id=uuid.uuid4() if role is UserRole.SUPPLIER else None,
        supplier_code="0000018194" if role is UserRole.SUPPLIER else None,
        permissions=frozenset(ROLE_PERMISSIONS[role.value]),
    )


@pytest.fixture
def fake_db():
    db = SimpleNamespace(flush=AsyncMock(), execute=AsyncMock())

    async def _get_db():
        yield db

    return db, _get_db


@pytest.fixture
async def api(fake_db):
    db, get_db = fake_db
    app.dependency_overrides[deps.get_db] = get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


def _login_as(role: UserRole):
    app.dependency_overrides[deps.get_current_user] = lambda: _user(role)


async def test_admin_saves_language_to_keycloak(api, monkeypatch):
    _login_as(UserRole.ADMIN)
    calls = []
    monkeypatch.setattr(auth_endpoints, "set_user_locale", lambda uid, loc: calls.append((uid, loc)) or True)
    monkeypatch.setattr(auth_endpoints, "_find_supplier", AsyncMock(return_value=None))

    resp = await api.patch("/api/v1/auth/me/preferences", json={"language": "zh-CN"})

    assert resp.status_code == 200
    assert resp.json() == {"language": "zh-CN"}
    assert calls == [("kc-123", "zh-Hans")]  # converted to Keycloak's code


async def test_supplier_language_is_stored_on_supplier(api, monkeypatch, fake_db):
    _login_as(UserRole.SUPPLIER)
    supplier = SimpleNamespace(preferred_language="en")
    monkeypatch.setattr(auth_endpoints, "set_user_locale", lambda uid, loc: True)
    monkeypatch.setattr(auth_endpoints, "_find_supplier", AsyncMock(return_value=supplier))

    resp = await api.patch("/api/v1/auth/me/preferences", json={"language": "it"})

    assert resp.status_code == 200
    assert supplier.preferred_language == "it"
    fake_db[0].flush.assert_awaited()


async def test_invalid_language_is_rejected(api, monkeypatch):
    _login_as(UserRole.SUPPLIER)
    monkeypatch.setattr(auth_endpoints, "set_user_locale", lambda uid, loc: pytest.fail("must not be called"))

    resp = await api.patch("/api/v1/auth/me/preferences", json={"language": "fr"})

    assert resp.status_code == 422


async def test_keycloak_failure_returns_coded_error(api, monkeypatch):
    _login_as(UserRole.SUPPLIER)
    supplier = SimpleNamespace(preferred_language="en")
    monkeypatch.setattr(auth_endpoints, "set_user_locale", lambda uid, loc: False)
    monkeypatch.setattr(auth_endpoints, "_find_supplier", AsyncMock(return_value=supplier))

    resp = await api.patch("/api/v1/auth/me/preferences", json={"language": "it"})

    assert resp.status_code == 502
    assert resp.json()["code"] == "LANGUAGE_SAVE_FAILED"
    assert supplier.preferred_language == "en"  # nothing saved when Keycloak fails


# ---------------------------------------------------------------------------
# Coded errors keep `detail` and add `code` / `params`
# ---------------------------------------------------------------------------
async def test_coded_error_response_shape():
    mini = FastAPI()
    mini.add_exception_handler(CodedHTTPException, coded_http_exception_handler)

    @mini.get("/boom")
    async def boom():
        raise CodedHTTPException(status_code=422, detail="Carton 2: bad", code="CARTON_QTY_INVALID", params={"carton": 2})

    async with AsyncClient(transport=ASGITransport(app=mini), base_url="http://test") as client:
        resp = await client.get("/boom")

    assert resp.status_code == 422
    assert resp.json() == {"detail": "Carton 2: bad", "code": "CARTON_QTY_INVALID", "params": {"carton": 2}}


# ---------------------------------------------------------------------------
# Welcome email language
# ---------------------------------------------------------------------------
def _render(language):
    return render_supplier_welcome_email(
        supplier_name="Coats Thread",
        supplier_code="0000018194",
        temporary_password="Tmp#Pass123",
        portal_link="https://portal.example",
        language=language,
    )


def test_welcome_email_english_default():
    subject, text, html = _render(None)
    assert subject == "Welcome to ASN Portal — Login Credentials for #0000018194"
    assert text.startswith("Dear Coats Thread,")
    assert "Log In to ASN Portal &rarr;" in html


@pytest.mark.parametrize(
    "language, subject_start, greeting",
    [
        ("it", "Benvenuto nel portale ASN", "Gentile Coats Thread,"),
        ("zh-CN", "欢迎使用 ASN 门户", "尊敬的 Coats Thread："),
        ("zh-Hans", "欢迎使用 ASN 门户", "尊敬的 Coats Thread："),
    ],
)
def test_welcome_email_translated(language, subject_start, greeting):
    subject, text, html = _render(language)
    assert subject.startswith(subject_start)
    assert text.startswith(greeting)
    assert greeting in html


@pytest.mark.parametrize("language", ["en", "it", "zh-CN"])
def test_welcome_email_keeps_credentials_as_data(language):
    subject, text, html = _render(language)
    for value in ("0000018194", "Tmp#Pass123", "https://portal.example"):
        assert value in text
        assert value in html


def test_welcome_email_unknown_language_falls_back_to_english():
    assert _render("fr")[0] == _render("en")[0]
