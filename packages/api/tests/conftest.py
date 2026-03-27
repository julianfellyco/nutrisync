"""
Shared test fixtures for NutriSync API.

Uses SQLite (async) for fast, portable tests — no external DB required.
Each test gets a fresh schema via transaction rollback.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from api.db.engine import Base, get_db
from api.db.models import ClientProfile, User
from api.main import app
from api.middleware.auth import create_access_token, hash_password

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    """Each test gets a session whose changes are rolled back after the test."""
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        async with session.begin():
            yield session
            await session.rollback()


@pytest_asyncio.fixture
async def client(engine):
    """Async HTTP test client wired to the FastAPI app with an in-memory DB."""
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            async with session.begin_nested():
                yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── User fixtures ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def consultant_user(db_session: AsyncSession) -> User:
    user = User(
        email="consultant@test.com",
        hashed_password=hash_password("Test1234!"),
        role="consultant",
        name="Test Consultant",
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def client_user(db_session: AsyncSession, consultant_user: User) -> User:
    user = User(
        email="client@test.com",
        hashed_password=hash_password("Test1234!"),
        role="client",
        name="Test Client",
    )
    db_session.add(user)
    await db_session.flush()

    profile = ClientProfile(
        user_id=user.id,
        assigned_consultant_id=consultant_user.id,
        fitness_goal="lose_weight",
        macro_targets={"calories": 2000, "protein_g": 150, "carbs_g": 200, "fat_g": 60},
    )
    db_session.add(profile)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
def consultant_token(consultant_user: User) -> str:
    return create_access_token(consultant_user.id, "consultant")


@pytest_asyncio.fixture
def client_token(client_user: User) -> str:
    return create_access_token(client_user.id, "client")


@pytest_asyncio.fixture
def consultant_headers(consultant_token: str) -> dict:
    return {"Authorization": f"Bearer {consultant_token}"}


@pytest_asyncio.fixture
def client_headers(client_token: str) -> dict:
    return {"Authorization": f"Bearer {client_token}"}
