from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..auth import current_user, require_admin, seed_users
from ..db import User, audit, get_session, recent_audit
from ..services import state

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
