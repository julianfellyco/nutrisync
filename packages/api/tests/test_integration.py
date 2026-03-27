"""
Integration test: full flow from registration → login → log meal → AI chat.
Tests that all layers work together with a realistic request sequence.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient


def _ai_text_response(text: str):
    block = MagicMock()
    block.type = "text"
    block.text = text
    resp = MagicMock()
    resp.content = [block]
    return resp


@pytest.mark.asyncio
async def test_full_nutrition_logging_flow(client: AsyncClient):
    """
    1. Register consultant + client
    2. Consultant claims client
    3. Client logs a meal
    4. Consultant reads client logs
    5. Client chats with AI — reply references logged data
    """
    # Step 1 — Register consultant
    r = await client.post("/api/v1/auth/register", json={
        "name": "Dr Nutrition",
        "email": "drnutrition@clinic.com",
        "password": "Secret123!",
        "role": "consultant",
    })
    assert r.status_code == 201
    consultant_token = r.json()["access_token"]
    c_headers = {"Authorization": f"Bearer {consultant_token}"}

    # Step 2 — Register client
    r = await client.post("/api/v1/auth/register", json={
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "password": "Secret123!",
        "role": "client",
    })
    assert r.status_code == 201
    client_token = r.json()["access_token"]
    cl_headers = {"Authorization": f"Bearer {client_token}"}

    # Step 3 — Consultant claims client
    r = await client.post(
        "/api/v1/clients/claim",
        json={"email": "jane.doe@example.com"},
        headers=c_headers,
    )
    assert r.status_code == 200
    client_id = r.json()["id"]

    # Step 4 — Client logs a meal
    r = await client.post("/api/v1/logs", json={
        "log_type": "meal",
        "payload": {
            "name": "Salmon with quinoa",
            "calories": 520,
            "protein_g": 42,
            "carbs_g": 38,
            "fat_g": 18,
        },
    }, headers=cl_headers)
    assert r.status_code == 201

    # Step 5 — Consultant reads client logs
    r = await client.get(f"/api/v1/logs/client/{client_id}", headers=c_headers)
    assert r.status_code == 200
    logs = r.json()["data"]
    assert len(logs) == 1
    assert logs[0]["payload"]["name"] == "Salmon with quinoa"

    # Step 6 — Client chats with AI (mocked)
    mock_resp = _ai_text_response("Great choice! Salmon is excellent for omega-3s.")
    with (
        patch("api.routes.ai.client") as mock_ai,
        patch("api.routes.ai._check_rate_limit", new=AsyncMock()),
        patch("api.services.session_manager.trim_session", new=AsyncMock(
            return_value=([{"role": "user", "content": "How was my lunch?"}], 10)
        )),
    ):
        mock_ai.messages.create = AsyncMock(return_value=mock_resp)
        r = await client.post("/api/v1/ai/chat", json={
            "message": "How was my lunch?",
        }, headers=cl_headers)

    assert r.status_code == 200
    assert "salmon" in r.json()["reply"].lower()


@pytest.mark.asyncio
async def test_payload_validation_prevents_invalid_data(client: AsyncClient):
    """Ensure the validation layer stops bad data before it reaches the database."""
    r = await client.post("/api/v1/auth/register", json={
        "name": "Validator Test",
        "email": "validator@example.com",
        "password": "Secret123!",
        "role": "client",
    })
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Negative calories
    r = await client.post("/api/v1/logs", json={
        "log_type": "meal",
        "payload": {"name": "X", "calories": -1, "protein_g": 10, "carbs_g": 10, "fat_g": 5},
    }, headers=headers)
    assert r.status_code == 422

    # Unknown log type
    r = await client.post("/api/v1/logs", json={
        "log_type": "mood",
        "payload": {"feeling": "happy"},
    }, headers=headers)
    assert r.status_code == 422

    # Biometric with impossible heart rate
    r = await client.post("/api/v1/logs", json={
        "log_type": "biometric",
        "payload": {"avg_heart_rate": 500},
    }, headers=headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_role_isolation_end_to_end(client: AsyncClient):
    """Verify that a client cannot access another client's data regardless of endpoint."""
    # Register two clients and a consultant
    r1 = await client.post("/api/v1/auth/register", json={
        "name": "Client A", "email": "clienta@test.com",
        "password": "Secret123!", "role": "client",
    })
    token_a = r1.json()["access_token"]

    r2 = await client.post("/api/v1/auth/register", json={
        "name": "Client B", "email": "clientb@test.com",
        "password": "Secret123!", "role": "client",
    })
    client_b_id = (await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {r2.json()['access_token']}"},
    )).json()["id"]

    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Client A cannot read Client B's logs
    r = await client.get(f"/api/v1/logs/client/{client_b_id}", headers=headers_a)
    assert r.status_code == 403

    # Client A cannot update Client B's profile
    r = await client.patch(f"/api/v1/clients/{client_b_id}",
        json={"fitness_goal": "hack"}, headers=headers_a)
    assert r.status_code == 403
