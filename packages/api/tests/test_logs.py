"""Tests for health log endpoints — creation, listing, payload validation, access control."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


VALID_MEAL = {
    "log_type": "meal",
    "payload": {
        "name": "Grilled chicken",
        "calories": 350,
        "protein_g": 45,
        "carbs_g": 10,
        "fat_g": 12,
    },
}

VALID_ACTIVITY = {
    "log_type": "activity",
    "payload": {
        "type": "running",
        "duration_min": 30,
        "steps": 4000,
        "avg_heart_rate": 145,
    },
}

VALID_BIOMETRIC = {
    "log_type": "biometric",
    "payload": {
        "weight_kg": 72.5,
        "steps": 8000,
    },
}


@pytest.mark.asyncio
async def test_create_meal_log(client: AsyncClient, client_headers: dict):
    res = await client.post("/api/v1/logs", json=VALID_MEAL, headers=client_headers)
    assert res.status_code == 201
    assert "id" in res.json()


@pytest.mark.asyncio
async def test_create_activity_log(client: AsyncClient, client_headers: dict):
    res = await client.post("/api/v1/logs", json=VALID_ACTIVITY, headers=client_headers)
    assert res.status_code == 201


@pytest.mark.asyncio
async def test_create_biometric_log(client: AsyncClient, client_headers: dict):
    res = await client.post("/api/v1/logs", json=VALID_BIOMETRIC, headers=client_headers)
    assert res.status_code == 201


@pytest.mark.asyncio
async def test_invalid_log_type_rejected(client: AsyncClient, client_headers: dict):
    res = await client.post("/api/v1/logs", json={
        "log_type": "sleep",
        "payload": {"hours": 8},
    }, headers=client_headers)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_meal_payload_out_of_range_rejected(client: AsyncClient, client_headers: dict):
    """Calories > 10000 should fail validation."""
    res = await client.post("/api/v1/logs", json={
        "log_type": "meal",
        "payload": {
            "name": "Impossible meal",
            "calories": 99999,  # exceeds 10000 limit
            "protein_g": 10,
            "carbs_g": 10,
            "fat_g": 5,
        },
    }, headers=client_headers)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_list_own_logs(client: AsyncClient, client_headers: dict):
    await client.post("/api/v1/logs", json=VALID_MEAL, headers=client_headers)
    res = await client.get("/api/v1/logs?days=7", headers=client_headers)
    assert res.status_code == 200
    body = res.json()
    assert "data" in body
    assert "has_more" in body
    assert isinstance(body["data"], list)


@pytest.mark.asyncio
async def test_pagination_limit(client: AsyncClient, client_headers: dict):
    # Create 3 logs
    for _ in range(3):
        await client.post("/api/v1/logs", json=VALID_MEAL, headers=client_headers)
    res = await client.get("/api/v1/logs?days=7&limit=2", headers=client_headers)
    assert res.status_code == 200
    body = res.json()
    assert len(body["data"]) <= 2


@pytest.mark.asyncio
async def test_consultant_can_read_client_logs(
    client: AsyncClient,
    client_user,
    client_headers: dict,
    consultant_headers: dict,
):
    await client.post("/api/v1/logs", json=VALID_MEAL, headers=client_headers)
    res = await client.get(
        f"/api/v1/logs/client/{client_user.id}",
        headers=consultant_headers,
    )
    assert res.status_code == 200
    assert "data" in res.json()


@pytest.mark.asyncio
async def test_consultant_cannot_read_nonowned_client_logs(
    client: AsyncClient,
    consultant_headers: dict,
):
    """A random user ID should 403, not 404, to avoid user enumeration."""
    res = await client.get(
        "/api/v1/logs/client/nonexistent-id-abc",
        headers=consultant_headers,
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_log_creation_blocked(client: AsyncClient):
    res = await client.post("/api/v1/logs", json=VALID_MEAL)
    assert res.status_code == 403
