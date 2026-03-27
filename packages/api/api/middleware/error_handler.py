"""
Global exception handler middleware.

Logs unhandled errors with full structlog context (including request_id).
Returns sanitized JSON responses — no stack traces in production.
"""
from __future__ import annotations

import structlog
from fastapi import Request
from fastapi.responses import JSONResponse

log = structlog.get_logger()


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error(
        "unhandled_exception",
        method=request.method,
        path=request.url.path,
        exc_type=type(exc).__name__,
        exc=str(exc),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again later."},
    )
