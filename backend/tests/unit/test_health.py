"""
Unit tests for health endpoints.
"""

import pytest


@pytest.mark.anyio
async def test_health_check(client):
    """Test basic health check endpoint."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "ans-backend"
    assert data["version"] == "0.1.0"
