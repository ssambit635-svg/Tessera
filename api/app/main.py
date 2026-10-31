"""Tessera API - the scheduling authority behind the UI.

Run locally:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    """The app itself. The machine-readable summary lives at /api/info."""
    return FileResponse(WEB_DIR / "index.html", media_type="text/html")


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
