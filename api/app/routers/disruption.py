from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import current_user, require_roles
from ..core.disruption import apply_changes
from ..core.exam_staff import invigilation_errors
from ..core.constraints import validate
from ..db import Proposal, User, audit, get_session, lock_writes
from ..services import manual, state

router = APIRouter(prefix="/api/disruption", tags=["disruption"])


class PreviewIn(BaseModel):
    changes: list[dict]
    title: str = "Timetable change"
    time_limit: int | None = None


class MoveIn(BaseModel):
    session_id: str
    day: str
    start_period: int
    time_limit: int | None = None
    title: str = ""


@router.post("/move")
def move_request(body: MoveIn,
                 user: User = Depends(require_roles("admin", "department_coordinator", "faculty")),
                 session: Session = Depends(get_session)):
    """One session, one target slot: checked instantly, then queued for a second admin.

    Faculty use this through the AI assistant ("move my CS203 class to Wednesday P3"); the
    session keeps its id, so the export stays valid.
    """
    ds = state.dataset()
    if body.session_id not in ds.sessions:
        raise HTTPException(404, f"unknown session {body.session_id}")
    if user.role == "faculty" and ds.sessions[body.session_id].get("faculty_id") != user.faculty_id:
        raise HTTPException(403, "faculty may only request changes to their own sessions")
    if user.role == "department_coordinator" and ds.faculty.get(
            ds.sessions[body.session_id].get("faculty_id"), {}).get("department") != user.department:
        raise HTTPException(403, "coordinators may only request changes to their own department")
    if body.day not in ds.days:
        raise HTTPException(422, f"{body.day} is not a teaching day ({', '.join(ds.days)})")
    result = state.preview_move(body.session_id, body.day, body.start_period,
                                time_limit=body.time_limit or 25)
    proposal = state.store_proposal(
        session, user, body.title or f"Move {body.session_id} to {body.day} P{body.start_period}",
        [], result, kind="timetable_change")
    audit(session, user.email, user.role, "move_request",
          f"{proposal.id}: {body.session_id} -> {body.day} P{body.start_period}, "
          f"status={result.get('status')}")
    return {
        "proposal_id": proposal.id,
        "status": proposal.status,
        "valid": result.get("valid", False),
        "session_id": body.session_id,
        "requested": {"day": body.day, "start_period": body.start_period},
        "moves": result.get("moves"),
        "moved": result.get("moved"),
        "conflicts": result.get("conflicts"),
        "explanation": result.get("explanation"),
        "report": result.get("report"),
        "next": ("a different admin must approve this proposal"
                 if result.get("valid") else "this slot breaks a hard constraint - see conflicts"),
    }


@router.get("/sample")
def sample(user: User = Depends(current_user)):
    """The change file shipped with the dataset, so the UI can load it in one click."""
    from ..config import get_settings

    for candidate in (get_settings().dataset_path.parent / "sample_disruption.json",
                      get_settings().dataset_path.parent / "examples" / "sample_disruption.json"):
        if candidate.exists():
            with open(candidate, encoding="utf-8") as fh:
                return {"file": candidate.name, "changes": json.load(fh).get("changes", [])}
    raise HTTPException(404, "no sample change file next to the dataset")


@router.post("/preview-file")
def preview_file(payload: dict = Body(...),
                 user: User = Depends(require_roles("admin", "department_coordinator")),
                 session: Session = Depends(get_session)):
    """Same as /preview but accepts a change file verbatim ({"changes": [...]})."""
    changes = payload.get("changes") if isinstance(payload, dict) else None
    if not isinstance(changes, list) or not changes:
        raise HTTPException(422, "the file must contain a non-empty 'changes' list")
    body = PreviewIn(changes=changes, title=payload.get("title") or "Uploaded change file")
    return preview(body, user, session)


@router.post("/preview")
def preview(body: PreviewIn, user: User = Depends(require_roles("admin", "department_coordinator")),
            session: Session = Depends(get_session)):
    """Compute the repair. Nothing is applied - the diff waits for a second admin."""
    if not body.changes:
        raise HTTPException(400, "no changes supplied")
    if user.role == "department_coordinator":
        ds = state.dataset()
        # Department coordinators can propose their department's sessions, but cannot
        # impose campus-wide room closures or modify other departments' staff.
        for change in body.changes:
            kind = change.get("type")
            if kind == "remove_session":
                item = ds.sessions.get(change.get("session_id"), {})
                fid = item.get("faculty_id")
            elif kind == "add_session":
                fid = (change.get("session") or {}).get("faculty_id")
            elif kind == "faculty_unavailable":
                fid = change.get("faculty_id")
            else:
                raise HTTPException(403, "this change requires an admin")
            if ds.faculty.get(fid, {}).get("department") != user.department:
                raise HTTPException(403, "coordinators may only change their own department")
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
    lock_writes(session)
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
    ds = state.dataset()
    current = state.current_schedule()
    if result.get("base_fingerprint") != state.state_fingerprint(ds, current):
        raise HTTPException(409, "the timetable or dataset changed since this proposal; preview it again")
    try:
        ds_after, _ = apply_changes(ds, json.loads(proposal.changes_json))
        report = validate(ds_after, schedule, baseline=current)
    except (ValueError, KeyError) as exc:
        raise HTTPException(409, f"proposal can no longer be applied: {exc}") from exc
    if report["hard_violation_count"] or invigilation_errors(ds_after, schedule.get("exams", [])):
        raise HTTPException(409, "proposal no longer satisfies the scheduling or exam staffing rules")
    # Bookings made after preview must not be displaced by the approved repair.
    events = manual.list_events(session, include_cancelled=False)
    conflicts = manual.conflicting_events(ds_after, schedule, events)
    if conflicts:
        raise HTTPException(409, f"proposal conflicts with confirmed event {conflicts[0][0]}; preview it again")
    written = state.apply_preview(
        session, schedule, user.email, dataset_after=ds_after,
        meta={"source": "disruption repair",
              "hard_violations": (result.get("report") or {}).get("hard_violation_count", 0),
              "soft_total": (result.get("report") or {}).get("soft_total", 0),
              "stability": (result.get("report") or {}).get("stability")})
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
    from ..db import AppState, get_engine
    from sqlmodel import Session as _S
    with _S(get_engine()) as s:
        after = AppState.get(s, state.ACTIVE_KEY)
    return {"has_repaired_timetable": bool(after),
            "sessions": len((after or {}).get("sessions", []))}
