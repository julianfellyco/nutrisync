"""Tests for authentication endpoints."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_consultant(client: AsyncClient):
    res = await client.post("/api/v1/auth/register", json={
        "name": "Dr Smith",
        "email": "drsmith@clinic.com",
        "password": "Secret123!",
        "role": "consultant",
    })
    assert res.status_code == 201
    body = res.json()
    assert "access_token" in body
    assert "refresh_token" in body


@pytest.mark.asyncio
async def test_register_client(client: AsyncClient):
    res = await client.post("/api/v1/auth/register", json={
        "name": "Alice",
        "email": "alice@example.com",
        "password": "Secret123!",
        "role": "client",
    })
    assert res.status_code == 201


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {
        "name": "Bob",
        "email": "bob@example.com",
        "password": "Secret123!",
        "role": "client",
    }
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_register_invalid_role(client: AsyncClient):
    res = await client.post("/api/v1/auth/register", json={
        "name": "Admin",
        "email": "admin@example.com",
        "password": "Secret123!",
        "role": "admin",
    })
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "name": "Jane",
        "email": "jane@example.com",
        "password": "Secret123!",
        "role": "client",
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "jane@example.com",
        "password": "Secret123!",
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "name": "Jane",
        "email": "jane2@example.com",
        "password": "Secret123!",
        "role": "client",
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "jane2@example.com",
        "password": "wrongpassword",
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_user(client: AsyncClient, consultant_headers: dict):
    res = await client.get("/api/v1/auth/me", headers=consultant_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "consultant"
    assert "email" in body


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 403  # HTTPBearer returns 403 when missing


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient):
    reg = await client.post("/api/v1/auth/register", json={
        "name": "Refresh Test",
        "email": "refresh@example.com",
        "password": "Secret123!",
        "role": "client",
    })
    refresh_token = reg.json()["refresh_token"]
    res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert res.status_code == 200
    assert "access_token" in res.json()


@pytest.mark.asyncio
async def test_refresh_with_access_token_rejected(client: AsyncClient):
    reg = await client.post("/api/v1/auth/register", json={
        "name": "Bad Refresh",
        "email": "badrefresh@example.com",
        "password": "Secret123!",
        "role": "client",
    })
    # Using access_token as refresh_token should fail
    access_token = reg.json()["access_token"]
    res = await client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
    assert res.status_code == 401
