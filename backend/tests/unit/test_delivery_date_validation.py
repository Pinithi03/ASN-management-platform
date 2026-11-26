"""Delivery date validation for shipment creation (no past dates)."""

from datetime import date, timedelta

import pytest

from app.api.v1.endpoints.shipments import parse_delivery_date
from app.core.exceptions import CodedHTTPException


def test_empty_returns_none():
    assert parse_delivery_date(None) is None
    assert parse_delivery_date("  ") is None


def test_today_and_future_are_accepted():
    today = date.today()
    assert parse_delivery_date(today.isoformat()) == today
    future = today + timedelta(days=30)
    assert parse_delivery_date(future.isoformat()) == future


def test_past_date_is_rejected_with_422():
    past = date.today() - timedelta(days=3)
    with pytest.raises(CodedHTTPException) as exc:
        parse_delivery_date(past.isoformat())
    assert exc.value.status_code == 422
    assert exc.value.code == "DELIVERY_DATE_PAST"


def test_invalid_format_is_rejected_with_422():
    with pytest.raises(CodedHTTPException) as exc:
        parse_delivery_date("31-02-2026")
    assert exc.value.status_code == 422
    assert exc.value.code == "DELIVERY_DATE_INVALID"
