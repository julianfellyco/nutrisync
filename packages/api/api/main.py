from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.config import settings
from api.db.engine import engine
from api.middleware.error_handler import global_exception_handler
from api.middleware.request_id import RequestIDMiddleware
from api.routes import auth, logs, ai, clients, plans, insights
from api.ws import websocket_handler

log = structlog.get_logger()

_ALEMBIC_INI = Path(__file__).parent.parent / "alembic.ini"


def _run_migrations() -> None:
    """Run any pending Alembic migrations synchronously at startup."""
    cfg = Config(str(_ALEMBIC_INI))
    command.upgrade(cfg, "head")
    log.info("alembic.migrations.applied")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run in a thread so we don't block the event loop
    await asyncio.get_event_loop().run_in_executor(None, _run_migrations)
    log.info("nutrisync.api.started")
    yield
    await engine.dispose()


app = FastAPI(title="NutriSync API", version="0.1.0", lifespan=lifespan)

app.add_exception_handler(Exception, global_exception_handler)

# RequestIDMiddleware must be added before CORS so the ID is available throughout
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,    prefix="/api/v1")
app.include_router(logs.router,    prefix="/api/v1")
app.include_router(ai.router,      prefix="/api/v1")
app.include_router(clients.router,  prefix="/api/v1")
app.include_router(plans.router,    prefix="/api/v1")
app.include_router(insights.router, prefix="/api/v1")


@app.websocket("/ws")
async def ws_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    watch: str | None = Query(default=None),
):
    await websocket_handler(websocket, token, watch)


@app.get("/api/v1/health")
async def health():
    """
    Deep health check for container orchestration and uptime monitoring.
    Verifies database connectivity, Redis availability, and AI API reachability.
    Returns 200 only when all critical services are healthy.
    """
    import time
    checks: dict[str, dict] = {}
    healthy = True

    # ── Database ──────────────────────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        checks["database"] = {"status": "error", "detail": str(exc)}
        healthy = False

    # ── Redis ─────────────────────────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        from api.services.realtime import get_redis
        await get_redis().ping()
        checks["redis"] = {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        checks["redis"] = {"status": "error", "detail": str(exc)}
        healthy = False

    # ── Anthropic API ─────────────────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        import anthropic
        probe = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        await probe.models.list()
        checks["ai"] = {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        # Non-fatal — AI outage shouldn't take down health check
        checks["ai"] = {"status": "degraded", "detail": str(exc)}

    status_code = 200 if healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={"status": "ok" if healthy else "degraded", "checks": checks},
    )
