from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..auth import current_user, require_admin
from ..config import get_settings
from ..core.constraints import check_exams, check_timetable, soft_score, to_assign
from ..core.dataset import Dataset
from ..db import User, audit, get_session
from ..services import state

router = APIRouter(prefix="/api/timetable", tags=["timetable"])


@router.get("")
def get_timetable(view: str = "group", id: str | None = None,
                  user: User = Depends(current_user)):
    """view = group | faculty | room. Without an id, the caller's own view is returned."""
    ds = state.dataset()
    if view not in {"group", "faculty", "room"}:
        raise HTTPException(400, "view must be group, faculty or room")
    entity = id
    if entity is None:
        if view == "faculty":
            entity = user.faculty_id or sorted(ds.faculty)[0]
        elif view == "group":
            entity = user.group_id or sorted(ds.groups)[0]
        else:
            entity = sorted(ds.rooms)[0]
    if view == "group" and entity not in ds.groups:
        raise HTTPException(404, f"unknown group {entity}")
    if view == "faculty" and entity not in ds.faculty:
        raise HTTPException(404, f"unknown faculty {entity}")
    if view == "room" and entity not in ds.rooms:
        raise HTTPException(404, f"unknown room {entity}")
    snap = state.current_cached()
    return state.grid(ds, snap, view, entity)


@router.get("/week")
def whole_week(user: User = Depends(current_user)):
    """Every placement in one payload - used by the timetable heatmap and exports preview."""
    ds = state.dataset()
    schedule = state.current_cached()
    rows = []
    for e in schedule.get("sessions", []):
        sess = ds.sessions.get(e["session_id"])
        if sess is None:
            continue
        rows.append({"session_id": e["session_id"], "course_id": sess["course_id"],
                     "kind": sess["kind"], "day": e["day"], "start_period": e["start_period"],
                     "end_period": e["start_period"] + sess["duration"] - 1,
                     "room_id": e["room_id"], "faculty_id": sess["faculty_id"],
                     "groups": sess["groups"], "size": sess["size"],
                     "basket_slot": sess.get("basket_slot")})
    rows.sort(key=lambda r: (ds.days.index(r["day"]) if r["day"] in ds.days else 99,
                             r["start_period"], r["room_id"]))
    return {"count": len(rows), "days": ds.days,
            "periods": [{"id": p["id"], "start": p["start"], "end": p["end"]} for p in ds.periods],
            "lunch_after_period": ds.lunch_after, "entries": rows}


class GenerateIn(BaseModel):
    time_limit: int | None = None
    workers: int | None = None
    seed: int | None = None


@router.post("/generate")
def generate(body: GenerateIn | None = None, admin: User = Depends(require_admin),
             session: Session = Depends(get_session)):
    s = get_settings()
    body = body or GenerateIn()
    try:
        result = state.generate(actor=admin.email, time_limit=body.time_limit,
                                workers=body.workers, seed=body.seed)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    state.save_baseline(session, result["schedule"], result["meta"], admin.email)
    state.write_exports(session)
    report = result["report"]
    return {
        "ok": report["hard_violation_count"] == 0,
        "meta": result["meta"],
        "hard_violations": report["hard_violation_count"],
        "hard_by_rule": report["hard_by_rule"],
        "soft_total": report["soft_total"],
        "soft_penalties": report["soft_penalties"],
        "bookings": report.get("bookings"),
        "seed": result["meta"]["seed"],
        "solve_seconds": result["meta"]["solve_seconds"],
    }


@router.get("/validate")
@router.post("/validate")
def validate_now(user: User = Depends(current_user)):
    ds = state.dataset()
    schedule = state.current_cached()
    assign, dup = to_assign(schedule)
    hard = check_timetable(ds, assign)
    soft, soft_total = soft_score(ds, assign)
    exam_hard, exam_soft = check_exams(ds, schedule.get("exams") or [])
    return {
        "dataset_id": ds.dataset_id,
        "hard_violations": len(hard) + len(exam_hard),
        "hard_by_rule": _by_rule(hard + exam_hard),
        "violations": (hard + exam_hard)[:25],
        "soft_total": soft_total,
        "soft_penalties": soft,
        "exam_soft_penalty": exam_soft,
        "duplicates": dup,
        "scheduled": sum(1 for sid in ds.sessions if sid in assign),
        "expected": len(ds.sessions),
    }


def _by_rule(violations):
    out = {}
    for v in violations:
        out[v["rule"]] = out.get(v["rule"], 0) + 1
    return out


@router.get("/sessions/{session_id}")
def session_detail(session_id: str, user: User = Depends(current_user)):
    ds = state.dataset()
    sess = ds.sessions.get(session_id)
    if sess is None:
        raise HTTPException(404, f"unknown session {session_id}")
    schedule = state.current_cached()
    placement = next((e for e in schedule.get("sessions", []) if e["session_id"] == session_id), None)
    return {"session": sess, "placement": placement,
            "rooms_that_fit": ds.feasible_rooms(sess),
            "legal_slots": [{"day": d, "start_period": p} for d, p, _per in ds.time_slots(sess)][:40]}
