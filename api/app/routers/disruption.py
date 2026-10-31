from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import current_user, require_roles
from ..db import Proposal, User, audit, get_session
from ..services import state

router = APIRouter(prefix="/api/disruption", tags=["disruption"])


class PreviewIn(BaseModel):
    changes: list[dict]
    title: str = "Timetable change"
    time_limit: int | None = None


@router.post("/preview")
def preview(body: PreviewIn, user: User = Depends(require_roles("admin", "department_coordinator")),
            session: Session = Depends(get_session)):
    """Compute the repair. Nothing is applied - the diff waits for a second admin."""
    if not body.changes:
        raise HTTPException(400, "no changes supplied")
    try:
        result = state.preview_disruption(body.changes, time_limit=body.time_limit)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    proposal = Proposal(
        id=f"PR-{uuid.uuid4().hex[:8]}",
        kind="disruption",
        title=body.title,
        changes_json=json.dumps(body.changes),
        result_json=json.dumps(result),
        status="pending" if result.get("valid") else "refused",
        requested_by=user.id or 0,
        requested_by_email=user.email,
    )
    session.add(proposal)
    session.commit()
    audit(session, user.email, user.role, "preview_disruption",
          f"{proposal.id}: {len(body.changes)} change(s), moves={result.get('moves')}")

    return {
        "proposal_id": proposal.id,
        "status": proposal.status,
        "valid": result.get("valid", False),
        "moves": result.get("moves"),
        "broken_count": result.get("broken_count"),
        "broken_before": result.get("broken_before"),
        "moved": result.get("moved"),
        "new_sessions": result.get("new_sessions"),
        "dropped_sessions": result.get("dropped_sessions"),
        "attempts": result.get("attempts"),
        "report": result.get("report"),
        "explanation": result.get("explanation"),
        "changes": result.get("changes"),
        "next": ("an admin other than the requester must approve this proposal"
                 if result.get("valid") else "no valid repair exists - see explanation"),
    }


@router.post("/{proposal_id}/apply")
def apply(proposal_id: str, user: User = Depends(require_roles("admin")),
          session: Session = Depends(get_session)):
    proposal = session.get(Proposal, proposal_id)
    if proposal is None:
        raise HTTPException(404, f"unknown proposal {proposal_id}")
    if proposal.status != "pending":
        raise HTTPException(409, f"proposal is {proposal.status}, not pending")
    if proposal.requested_by == (user.id or 0):
        # hackathon rule: nobody approves their own request
        raise HTTPException(403, "you cannot approve your own request - sign in as the second "
                                 "admin (dean@cit.edu) to approve it")
    result = json.loads(proposal.result_json)
    schedule = result.get("proposed_schedule")
    if not schedule:
        raise HTTPException(409, "this proposal has no valid schedule to apply")
    written = state.apply_preview(session, schedule, user.email)
    proposal.status = "applied"
    proposal.decided_by = user.id or 0
    proposal.decided_by_email = user.email
    proposal.decided_at = datetime.now(timezone.utc)
    session.add(proposal)
    session.commit()
    return {"ok": True, "proposal_id": proposal_id, "written": written,
            "moves": result.get("moves"), "report": result.get("report")}


@router.post("/{proposal_id}/reject")
def reject(proposal_id: str, note: str = "", user: User = Depends(require_roles("admin")),
           session: Session = Depends(get_session)):
    proposal = session.get(Proposal, proposal_id)
    if proposal is None:
        raise HTTPException(404, f"unknown proposal {proposal_id}")
    proposal.status = "rejected"
    proposal.decided_by = user.id or 0
    proposal.decided_by_email = user.email
    proposal.decision_note = note
    proposal.decided_at = datetime.now(timezone.utc)
    session.add(proposal)
    session.commit()
    audit(session, user.email, user.role, "reject_proposal", f"{proposal_id}: {note}")
    return {"ok": True, "proposal_id": proposal_id, "status": proposal.status}


@router.get("/proposals")
def proposals(status: str | None = None, user: User = Depends(current_user),
              session: Session = Depends(get_session)):
    rows = session.exec(select(Proposal).order_by(Proposal.created_at.desc())).all()
    out = []
    for row in rows:
        if status and row.status != status:
            continue
        result = json.loads(row.result_json or "{}")
        out.append({
            "id": row.id, "title": row.title, "status": row.status,
            "requested_by": row.requested_by_email, "decided_by": row.decided_by_email,
            "created_at": row.created_at.isoformat(), "moves": result.get("moves"),
            "valid": result.get("valid"), "changes": json.loads(row.changes_json or "[]"),
            "can_i_approve": (user.role == "admin" and row.status == "pending"
                              and row.requested_by != (user.id or 0)),
        })
    return {"count": len(out), "proposals": out}


@router.get("/proposals/{proposal_id}")
def proposal_detail(proposal_id: str, user: User = Depends(current_user),
                    session: Session = Depends(get_session)):
    row = session.get(Proposal, proposal_id)
    if row is None:
        raise HTTPException(404, f"unknown proposal {proposal_id}")
    result = json.loads(row.result_json or "{}")
    result.pop("proposed_schedule", None)
    return {"id": row.id, "title": row.title, "status": row.status,
            "requested_by": row.requested_by_email, "decided_by": row.decided_by_email,
            "changes": json.loads(row.changes_json or "[]"), "result": result}


@router.get("/current")
def current_after(user: User = Depends(current_user)):
    """The repaired timetable currently in force (if any)."""
    snap = state.current(session) if False else None
    from ..db import AppState, get_engine
    from sqlmodel import Session as _S
    with _S(get_engine()) as s:
        after = AppState.get(s, "schedule_after")
    return {"has_repaired_timetable": bool(after),
            "sessions": len((after or {}).get("sessions", []))}
