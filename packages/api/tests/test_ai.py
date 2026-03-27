"""Tests for AI chat endpoint — mocks Anthropic client."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient


def _make_mock_response(text: str):
    block = MagicMock()
    block.type = "text"
    block.text = text
    response = MagicMock()
    response.content = [block]
    return response


@pytest.mark.asyncio
async def test_chat_returns_reply(client: AsyncClient, client_headers: dict):
    mock_resp = _make_mock_response("Eat more protein!")

    with patch("api.routes.ai.client") as mock_client:
        mock_client.messages.create = AsyncMock(return_value=mock_resp)
        # Also mock rate limit Redis
        with patch("api.routes.ai._check_rate_limit", new=AsyncMock()):
            res = await client.post(
                "/api/v1/ai/chat",
                json={"message": "What should I eat?"},
                headers=client_headers,
            )

    assert res.status_code == 200
    body = res.json()
    assert "reply" in body
    assert "session_id" in body
    assert body["reply"] == "Eat more protein!"


@pytest.mark.asyncio
async def test_chat_session_continuity(client: AsyncClient, client_headers: dict):
    """Second message with session_id should continue the conversation."""
    mock_resp = _make_mock_response("Great question!")

    with (
        patch("api.routes.ai.client") as mock_client,
        patch("api.routes.ai._check_rate_limit", new=AsyncMock()),
    ):
        mock_client.messages.create = AsyncMock(return_value=mock_resp)
        r1 = await client.post(
            "/api/v1/ai/chat",
            json={"message": "Hello"},
            headers=client_headers,
        )
        session_id = r1.json()["session_id"]

        r2 = await client.post(
            "/api/v1/ai/chat",
            json={"message": "Follow-up question", "session_id": session_id},
            headers=client_headers,
        )

    assert r2.status_code == 200
    assert r2.json()["session_id"] == session_id


@pytest.mark.asyncio
async def test_on_behalf_of_rejected_for_client(
    client: AsyncClient,
    client_headers: dict,
    client_user,
):
    """Clients cannot use on_behalf_of_client_id."""
    with patch("api.routes.ai._check_rate_limit", new=AsyncMock()):
        res = await client.post(
            "/api/v1/ai/chat",
            json={
                "message": "Hi",
                "on_behalf_of_client_id": client_user.id,
            },
            headers=client_headers,
        )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_on_behalf_of_nonowned_client_rejected(
    client: AsyncClient,
    consultant_headers: dict,
):
    """Consultant cannot use on_behalf_of for a client they don't own."""
    with patch("api.routes.ai._check_rate_limit", new=AsyncMock()):
        res = await client.post(
            "/api/v1/ai/chat",
            json={
                "message": "Hi",
                "on_behalf_of_client_id": "nonexistent-client-id",
            },
            headers=consultant_headers,
        )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_message_too_long_rejected(client: AsyncClient, client_headers: dict):
    with patch("api.routes.ai._check_rate_limit", new=AsyncMock()):
        res = await client.post(
            "/api/v1/ai/chat",
            json={"message": "x" * 5000},  # exceeds 4000 char limit
            headers=client_headers,
        )
    assert res.status_code == 422
