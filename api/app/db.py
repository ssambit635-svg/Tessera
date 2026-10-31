"""SQLite persistence: users, the current schedule state, proposals and an audit trail."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, Session, SQLModel, create_engine, select

from .config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str = Field(default="")
    role: str = Field(index=True)          # admin | department_coordinator | faculty | club
    password_hash: str = Field(default="")
    department: str = Field(default="")
    faculty_id: str = Field(default="")    # link to the dataset faculty id, for faculty users
    group_id: str = Field(default="")      # link to a student group, for dept coordinators
    created_at: datetime = Field(default_factory=utcnow)


class AppState(SQLModel, table=True):
    """One row per named blob of application state (schedule, schedule_after, meta)."""
    key: str = Field(primary_key=True)
    value: str = Field(sa_column=Column(Text))
    updated_at: datetime = Field(default_factory=utcnow)

    @staticmethod
    def get(session: Session, key: str):
        row = session.get(AppState, key)
        return json.loads(row.value) if row else None

    @staticmethod
    def put(session: Session, key: str, value) -> None:
        payload = json.dumps(value)
        row = session.get(AppState, key)
        if row:
            row.value = payload
            row.updated_at = utcnow()
        else:
            row = AppState(key=key, value=payload)
        session.add(row)
        session.commit()


class Proposal(SQLModel, table=True):
    """A disruption preview waiting for approval. Never applied without a second admin."""
    id: str = Field(primary_key=True)
    kind: str = Field(default="disruption")      # disruption | timetable_change
    title: str = Field(default="")
    changes_json: str = Field(sa_column=Column(Text), default="[]")
    result_json: str = Field(sa_column=Column(Text), default="{}")
    status: str = Field(default="pending")       # pending | applied | rejected | refused
    requested_by: int = Field(default=0)
    requested_by_email: str = Field(default="")
    decided_by: int = Field(default=0)
    decided_by_email: str = Field(default="")
    decision_note: str = Field(default="")
    created_at: datetime = Field(default_factory=utcnow)
    decided_at: Optional[datetime] = Field(default=None)


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    at: datetime = Field(default_factory=utcnow, index=True)
    actor: str = Field(default="")
    role: str = Field(default="")
    action: str = Field(default="")
    detail: str = Field(default="", sa_column=Column(Text))


_settings = None
_engine = None


def get_engine():
    global _engine, _settings
    s = get_settings()
    if _engine is None or _settings is not s:
        is_sqlite = s.database_url.startswith("sqlite")
        connect_args = {"check_same_thread": False} if is_sqlite else {}
        _engine = create_engine(s.database_url, connect_args=connect_args)
        if is_sqlite:
            # WAL keeps reads working while an admin generation writes; busy_timeout stops
            # "database is locked" during a 40 second solve.
            from sqlalchemy import event

            @event.listens_for(_engine, "connect")
            def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - driver level
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA synchronous=NORMAL")
                cur.execute("PRAGMA busy_timeout=15000")
                cur.close()
        _settings = s
    return _engine


def init_db() -> None:
    # import for the side effect of registering the derived timetable tables
    from .services import manual, persistence  # noqa: F401

    SQLModel.metadata.create_all(get_engine())


def get_session():
    with Session(get_engine()) as session:
        yield session


def audit(session: Session, actor: str, role: str, action: str, detail: str = "") -> None:
    session.add(AuditLog(actor=actor, role=role, action=action, detail=detail))
    session.commit()


def recent_audit(session: Session, limit: int = 50) -> list[AuditLog]:
    return list(session.exec(select(AuditLog).order_by(AuditLog.at.desc()).limit(limit)))


def reset_engine_cache() -> None:
    global _engine, _settings
    _engine = None
    _settings = None
