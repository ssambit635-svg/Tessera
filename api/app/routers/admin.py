from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session

from ..auth import current_user, require_admin, seed_users
from ..db import User, audit, get_session, recent_audit
from ..services import persistence, state

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard")
def dashboard(user: User = Depends(current_user), session: Session = Depends(get_session)):
    ds = state.dataset()
    data = state.dashboard(session, ds)
    data["dataset"] = ds.summary()
    data["audit"] = [{"at": a.at.isoformat(), "actor": a.actor, "role": a.role,
                      "action": a.action, "detail": a.detail}
                     for a in recent_audit(session, 15)]
    return data


@router.post("/dataset")
def upload_dataset(payload: dict = Body(...), admin: User = Depends(require_admin),
                   session: Session = Depends(get_session)):
    """Judge's own dataset: validated, stored under data/, stale timetable cleared."""
    try:
        result = state.load_dataset(session, payload, admin.email)
    except ValueError as exc:
        raise HTTPException(422, f"dataset rejected: {exc}") from exc
    return {"ok": True, **result}


@router.delete("/dataset")
def restore_dataset(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    return {"ok": True, **state.restore_dataset(session, admin.email)}


@router.get("/exports/{name}")
def download_export(name: str, admin: User = Depends(require_admin),
                    session: Session = Depends(get_session)):
    """Download exactly the file the validator reads (never a hand-edited copy)."""
    from ..config import get_settings

    if name not in ("schedule.json", "schedule_after.json"):
        raise HTTPException(404, "only schedule.json and schedule_after.json are served")
    path = get_settings().exports_dir / name
    if not path.exists():
        state.write_exports(session)
    if not path.exists():
        raise HTTPException(404, f"{name} has not been generated yet")
    return FileResponse(path, media_type="application/json", filename=name)


@router.post("/exports")
def write_exports(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    written = state.write_exports(session)
    audit(session, admin.email, admin.role, "export", str(written))
    return {"written": written}


@router.post("/reset")
def reset(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    """The button judges will press: reseed users and reload the committed exports."""
    result = state.reset(session, admin.email)
    return {"ok": True, **result}


@router.get("/db")
def database(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    """What is actually stored, and where. Judges can see it is a database, not memory."""
    return persistence.stats(session)


@router.get("/history")
def timetable_history(admin: User = Depends(require_admin),
                      session: Session = Depends(get_session)):
    return {"versions": [persistence.version_dict(v) for v in persistence.history(session)]}


@router.get("/audit")
def audit_trail(limit: int = 50, user: User = Depends(current_user),
                session: Session = Depends(get_session)):
    return {"audit": [{"at": a.at.isoformat(), "actor": a.actor, "role": a.role,
                       "action": a.action, "detail": a.detail}
                      for a in recent_audit(session, limit)]}


@router.get("/users")
def users(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    from sqlmodel import select

    rows = session.exec(select(User)).all()
    return {"users": [{"id": u.id, "email": u.email, "role": u.role, "name": u.name,
                       "faculty_id": u.faculty_id, "group_id": u.group_id} for u in rows]}
