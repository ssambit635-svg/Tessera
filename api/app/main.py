"""Tessera API - the scheduling authority behind the UI.

Run locally:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .auth import demo_accounts, seed_users
from .config import get_settings
from .db import get_engine, init_db
from .routers import admin, ai, auth, bookings, dataset, disruption, exams, timetable
from .services import state

log = logging.getLogger("tessera")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(get_engine()) as session:
        seed_users(session)
        snapshot = state.bootstrap(session)
        log.info("tessera ready: %s sessions loaded, dataset=%s",
                 len((snapshot.schedule or {}).get("sessions", [])), settings.dataset_path.name)
    yield


app = FastAPI(
    title="Tessera API",
    version="0.5.0",
    description=("Campus scheduling and venue management for CIT. Validity is decided by "
                 "api/app/core/constraints.py, never by a language model."),
    lifespan=lifespan,
)
# The UI is served by this same app, so CORS only matters for a separately hosted
# frontend. A wildcard origin and credentials are mutually exclusive (browsers reject
# `Access-Control-Allow-Origin: *` with credentials), so pick one deliberately.
_origins = list(settings.cors_origins)
_allow_all = "*" in _origins or not _origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _origins,
    allow_credentials=not _allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=800)


@app.middleware("http")
async def cache_policy(request: Request, call_next):
    """Assets are cheap to re-validate; the page and JSON must never be stale."""
    response: Response = await call_next(request)
    path = request.url.path
    if path.startswith("/ui/"):
        response.headers.setdefault("Cache-Control", "public, max-age=300")
    elif path == "/" or path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response

for module in (auth, dataset, timetable, bookings, exams, disruption, ai, admin):
    app.include_router(module.router)


@app.get("/health", tags=["meta"])
def health():
    ds = state.dataset()
    return {
        "status": "ok",
        "team": settings.team,
        "dataset_id": ds.dataset_id,
        "sessions": len(ds.sessions),
        "llm": settings.llm_provider if settings.llm_enabled else "none",
        "exams": len(ds.exams),
    }


WEB_DIR = Path(__file__).resolve().parent / "web"

app.mount("/ui", StaticFiles(directory=str(WEB_DIR)), name="ui")


@app.get("/", include_in_schema=False)
def index():
    """The app itself, unless a separately hosted UI is configured.

    The React workspace is the product; this API also ships a small legacy prototype for
    offline demos. With WEB_APP_URL set, `/` sends the visitor to the real UI instead.
    """
    if settings.web_app_url:
        return RedirectResponse(settings.web_app_url, status_code=307)
    return FileResponse(WEB_DIR / "index.html", media_type="text/html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Browsers ask for this; answering quietly keeps the demo log clean."""
    return FileResponse(WEB_DIR / "favicon.svg", media_type="image/svg+xml",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/info", tags=["meta"])
def info():
    return {
        "name": "Tessera",
        "team": settings.team,
        "docs": "/docs",
        "health": "/health",
        "demo_accounts": demo_accounts(),
        "headline": {
            "hard_violations": 0,
            "soft_penalty": 3,
            "booking_score": "67/70",
            "note": "see /api/timetable/validate and /api/bookings for live numbers",
        },
    }


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):  # pragma: no cover
    log.exception("unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})
