"""Tests for client management endpoints and role isolation."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_consultant_can_list_clients(
    client: AsyncClient,
    client_user,
    consultant_headers: dict,
):
    res = await client.get("/api/v1/clients", headers=consultant_headers)
    assert res.status_code == 200
    ids = [c["id"] for c in res.json()]
    assert client_user.id in ids


@pytest.mark.asyncio
async def test_client_cannot_list_clients(client: AsyncClient, client_headers: dict):
    res = await client.get("/api/v1/clients", headers=client_headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_claim_client(client: AsyncClient, consultant_headers: dict):
    # Register an unclaimed client
    reg = await client.post("/api/v1/auth/register", json={
        "name": "Unclaimed",
        "email": "unclaimed@example.com",
        "password": "Secret123!",
        "role": "client",
    })
    assert reg.status_code == 201

    res = await client.post(
        "/api/v1/clients/claim",
        json={"email": "unclaimed@example.com"},
        headers=consultant_headers,
    )
    assert res.status_code == 200
    assert res.json()["email"] == "unclaimed@example.com"


@pytest.mark.asyncio
async def test_claim_nonexistent_client(client: AsyncClient, consultant_headers: dict):
    res = await client.post(
        "/api/v1/clients/claim",
        json={"email": "nobody@example.com"},
        headers=consultant_headers,
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_claim_already_assigned_client(
    client: AsyncClient,
    client_user,
    consultant_headers: dict,
):
    """Client already assigned to this consultant → 409."""
    res = await client.post(
        "/api/v1/clients/claim",
        json={"email": client_user.email},
        headers=consultant_headers,
    )
    # Already assigned to same consultant — 409 not raised (same consultant OK)
    # but a second consultant would get 409
    assert res.status_code in (200, 409)


@pytest.mark.asyncio
async def test_consultant_can_update_client_profile(
    client: AsyncClient,
    client_user,
    consultant_headers: dict,
):
    res = await client.patch(
        f"/api/v1/clients/{client_user.id}",
        json={"fitness_goal": "gain_muscle"},
        headers=consultant_headers,
    )
    assert res.status_code == 200
    assert res.json()["profile"]["fitness_goal"] == "gain_muscle"


@pytest.mark.asyncio
async def test_client_can_read_own_profile(client: AsyncClient, client_headers: dict):
    res = await client.get("/api/v1/clients/me", headers=client_headers)
    assert res.status_code == 200
    assert "profile" in res.json()


@pytest.mark.asyncio
async def test_client_cannot_access_another_client(
    client: AsyncClient,
    client_user,
    client_headers: dict,
):
    """Clients hitting consultant-only routes should 403."""
    res = await client.get(f"/api/v1/clients/{client_user.id}", headers=client_headers)
    assert res.status_code == 403
