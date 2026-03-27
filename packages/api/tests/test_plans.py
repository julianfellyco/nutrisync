"""Tests for meal/workout plan endpoints."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

SAMPLE_CONTENT = {
    "days": [
        {
            "id": "day-1",
            "label": "Monday",
            "items": [
                {
                    "id": "item-1",
                    "time": "08:00",
                    "title": "Oatmeal",
                    "detail": "With banana",
                    "macros": {"calories": 350, "protein_g": 10, "carbs_g": 60, "fat_g": 6},
                }
            ],
        }
    ]
}


@pytest.mark.asyncio
async def test_consultant_can_create_plan(
    client: AsyncClient,
    client_user,
    consultant_headers: dict,
):
    res = await client.post(
        "/api/v1/plans",
        json={
            "client_id": client_user.id,
            "plan_type": "meal",
            "valid_from": "2026-03-01",
            "valid_to": "2026-03-31",
            "content": SAMPLE_CONTENT,
        },
        headers=consultant_headers,
    )
    assert res.status_code == 201
    assert res.json()["plan_type"] == "meal"


@pytest.mark.asyncio
async def test_client_cannot_create_plan(client: AsyncClient, client_user, client_headers: dict):
    res = await client.post(
        "/api/v1/plans",
        json={
            "client_id": client_user.id,
            "plan_type": "meal",
            "valid_from": "2026-03-01",
            "valid_to": "2026-03-31",
            "content": SAMPLE_CONTENT,
        },
        headers=client_headers,
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_consultant_can_list_plans(
    client: AsyncClient,
    client_user,
    consultant_headers: dict,
):
    # Create a plan first
    await client.post(
        "/api/v1/plans",
        json={
            "client_id": client_user.id,
            "plan_type": "meal",
            "valid_from": "2026-03-01",
            "valid_to": "2026-03-31",
            "content": SAMPLE_CONTENT,
        },
        headers=consultant_headers,
    )

    res = await client.get(
        f"/api/v1/plans?client_id={client_user.id}",
        headers=consultant_headers,
    )
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) >= 1


@pytest.mark.asyncio
async def test_consultant_cannot_create_plan_for_nonowned_client(
    client: AsyncClient,
    consultant_headers: dict,
):
    res = await client.post(
        "/api/v1/plans",
        json={
            "client_id": "nonexistent-client",
            "plan_type": "meal",
            "valid_from": "2026-03-01",
            "valid_to": "2026-03-31",
            "content": SAMPLE_CONTENT,
        },
        headers=consultant_headers,
    )
    assert res.status_code in (403, 404)


@pytest.mark.asyncio
async def test_plan_update(
    client: AsyncClient,
    client_user,
    consultant_headers: dict,
):
    create_res = await client.post(
        "/api/v1/plans",
        json={
            "client_id": client_user.id,
            "plan_type": "meal",
            "valid_from": "2026-03-01",
            "valid_to": "2026-03-31",
            "content": SAMPLE_CONTENT,
        },
        headers=consultant_headers,
    )
    plan_id = create_res.json()["id"]

    update_res = await client.patch(
        f"/api/v1/plans/{plan_id}",
        json={"valid_to": "2026-04-30"},
        headers=consultant_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["valid_to"] == "2026-04-30"
