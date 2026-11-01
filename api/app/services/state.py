"""Application state: the dataset, the current timetable, proposals and exports.

The baseline timetable and the repaired one are kept in the database (SQLite), so a
restart never loses what the last Admin generated, and `reset` can always fall back to the
committed exports.
"""
from __future__ import annotations

import json
import hashlib
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

from sqlmodel import Session

from ..config import get_settings
from ..core.bookings import decide_bookings
from ..core.constraints import check_timetable, soft_score, to_assign, validate
from ..core.dataset import Dataset
from ..core.disruption import apply_changes
from ..core.exams import solve_exams
from ..core.exam_staff import prepare_exam_schedule, invigilation_errors
from ..core.export import build_schedule, write_schedule
from ..core.repair import broken_sessions, repair_or_refuse, reservations_from_schedule
from ..core.solver import solve
from ..db import AppState, audit
from . import persistence

BASELINE_KEY = "schedule"
DATASET_KEY = "dataset_path"
AFTER_KEY = "schedule_after"
META_KEY = "meta"
ACTIVE_KEY = "active_schedule"
ACTIVE_DATASET_KEY = "active_dataset"
_lock = threading.Lock()
_dataset_cache: dict[str, Any] = {"path": None, "ds": None, "mtime": None}


def _stored_dataset_path() -> str | None:
    """An uploaded dataset lives next to the app, not in vendor/ (which is read-only)."""
    from ..db import get_engine
    from sqlmodel import Session as _Session

    try:
        with _Session(get_engine()) as session:
            value = AppState.get(session, DATASET_KEY)
    except Exception:  # database not ready yet (first import)
        return None
    return value if isinstance(value, str) and value else None


def dataset() -> Dataset:
    s = get_settings()
    path = _stored_dataset_path() or str(s.dataset_path)
    mtime = None
    try:
        mtime = Path_mtime(path)
    except OSError:
        pass
    from ..db import get_engine
    try:
        with Session(get_engine()) as session:
            row = session.get(AppState, ACTIVE_DATASET_KEY)
            active_raw = row.value if row else None
    except Exception:  # the database may not have been initialised yet
        active_raw = None
    cache_key = (path, mtime, active_raw)
    if _dataset_cache["ds"] is None or _dataset_cache.get("key") != cache_key:
        ds = Dataset(json.loads(active_raw)) if active_raw else Dataset.load(path)
        _dataset_cache.update(key=cache_key, ds=ds)
    return _dataset_cache["ds"]


def Path_mtime(path: str) -> float:
    import os

    return os.path.getmtime(path)


def invalidate_dataset() -> None:
    _dataset_cache["ds"] = None


@dataclass
class Snapshot:
    schedule: dict
    after: dict | None
    meta: dict


def bootstrap(session: Session) -> Snapshot:
    """Load the committed exports into the database the first time the app starts."""
    s = get_settings()
    schedule = AppState.get(session, BASELINE_KEY)
    after = AppState.get(session, AFTER_KEY)
    meta = AppState.get(session, META_KEY) or {}
    if schedule is None and s.load_committed_exports:
        path = s.exports_dir / "schedule.json"
        if path.exists():
            with open(path, encoding="utf-8") as f:
                schedule = json.load(f)
            AppState.put(session, BASELINE_KEY, schedule)
            after_path = s.exports_dir / "schedule_after.json"
            if after_path.exists():
                with open(after_path, encoding="utf-8") as f:
                    after = json.load(f)
                AppState.put(session, AFTER_KEY, after)
            meta = {"source": "committed exports", "loaded_at": time.time(),
                    "generated_at": None, "seed": s.solver_seed}
            AppState.put(session, META_KEY, meta)
    if schedule and persistence.active_version(session) is None:
        # first boot on this database: mirror the committed exports into the query tables
        persistence.sync_version(session, schedule, actor="system", source="committed exports",
                                 meta=meta, note="loaded from exports/ at start-up")
    return Snapshot(schedule=schedule or {}, after=after, meta=meta)


def current(session: Session) -> Snapshot:
    schedule = AppState.get(session, BASELINE_KEY)
    if schedule is None:
        return bootstrap(session)
    return Snapshot(schedule=schedule, after=AppState.get(session, AFTER_KEY),
                    meta=AppState.get(session, META_KEY) or {})


# --------------------------------------------------------------------------- generation
def generate(actor: str = "system", time_limit: int | None = None,
             workers: int | None = None, seed: int | None = None) -> dict:
    """Regenerate the whole semester timetable. Slow (tens of seconds) by design."""
    s = get_settings()
    with _lock:
        ds = dataset()
        base_fingerprint = state_fingerprint(ds, current_schedule())
        started = time.time()
        bookings = decide_bookings(ds)
        from ..db import get_engine
        from .manual import as_dict, list_events
        with Session(get_engine()) as event_session:
            events = [as_dict(e) for e in list_events(event_session, include_cancelled=False)]
        for event in events:
            for period in range(event["start_period"], event["end_period"] + 1):
                bookings["reserved_rooms"].add((event["room_id"], event["day"], period))
                bookings["blocked_groups"].update((g, event["day"], period) for g in event["groups"])
        tt = None
        for day_cap, week_cap in ((3, 12), (4, 14), (None, None)):
            tt = solve(ds, bookings["reserved_rooms"], bookings["blocked_groups"],
                       time_limit=float(time_limit or s.solver_time_limit),
                       workers=workers or s.solver_workers,
                       seed=seed or s.solver_seed,
                       room_day_cap=day_cap, room_week_cap=week_cap)
            if tt["assignment"]:
                break
        if not tt["assignment"]:
            raise RuntimeError(f"solver returned {tt['status']}; the previous timetable was kept")
        exams = solve_exams(ds)
        if len(exams["exams"]) != len(ds.exams):
            raise RuntimeError(f"exam scheduler failed: {exams.get('reason') or exams['status']}")
        schedule = build_schedule(ds, tt["assignment"], bookings, exams, team=s.team)
        report = validate(ds, schedule)
        meta = {
            "source": "generated by the app",
            "generated_at": time.time(),
            "seed": seed or s.solver_seed,
            "solver_status": tt["status"],
            "solve_seconds": round(time.time() - started, 1),
            "resilience": tt.get("resilience"),
            "hard_violations": report["hard_violation_count"],
            "soft_total": report["soft_total"],
        }
        return {"schedule": schedule, "report": report, "meta": meta, "bookings": bookings,
                "base_fingerprint": base_fingerprint}


def save_baseline(session: Session, schedule: dict, meta: dict, actor: str) -> None:
    for key in (ACTIVE_KEY, AFTER_KEY):
        row = session.get(AppState, key)
        if row:
            session.delete(row)
    session.commit()
    AppState.put(session, BASELINE_KEY, schedule)
    AppState.put(session, META_KEY, meta)
    persistence.sync_version(session, schedule, actor=actor, source="generated by the app",
                             meta=meta, note=f"seed {meta.get('seed')}")
    audit(session, actor, "admin", "generate_timetable",
          f"{len(schedule.get('sessions', []))} sessions, soft {meta.get('soft_total')}")


def write_exports(session: Session, include_after: bool = True) -> dict:
    s = get_settings()
    s.exports_dir.mkdir(parents=True, exist_ok=True)
    snap = current(session)
    written = {}
    if snap.schedule:
        written["schedule.json"] = write_schedule(snap.schedule, str(s.exports_dir / "schedule.json"))
    if include_after and snap.after:
        written["schedule_after.json"] = write_schedule(snap.after, str(s.exports_dir / "schedule_after.json"))
    return written


# --------------------------------------------------------------------------- views
def grid(ds: Dataset, schedule: dict, view: str, entity_id: str | None) -> dict:
    """A timetable rendered for one group, one faculty member or one room."""
    entries = []
    for e in schedule.get("sessions", []):
        sess = ds.sessions.get(e["session_id"])
        if sess is None:
            continue
        if view == "group" and entity_id not in sess["groups"]:
            continue
        if view == "faculty" and sess["faculty_id"] != entity_id:
            continue
        if view == "room" and e["room_id"] != entity_id:
            continue
        entries.append({
            "session_id": e["session_id"],
            "course_id": sess["course_id"],
            "kind": sess["kind"],
            "duration": sess["duration"],
            "day": e["day"],
            "start_period": e["start_period"],
            "end_period": e["start_period"] + sess["duration"] - 1,
            "room_id": e["room_id"],
            "faculty_id": sess["faculty_id"],
            "groups": sess["groups"],
            "size": sess["size"],
            "basket_slot": sess.get("basket_slot"),
            "fixed_slot": sess.get("fixed_slot"),
        })
    entries.sort(key=lambda x: (ds.days.index(x["day"]) if x["day"] in ds.days else 99,
                                x["start_period"], x["room_id"]))
    return {
        "view": view,
        "entity_id": entity_id,
        "days": ds.days,
        "periods": ds.periods,
        "lunch_after_period": ds.lunch_after,
        "entries": entries,
    }


def entities(ds: Dataset) -> dict:
    return {
        "groups": [{"id": g, "name": ds.groups[g].get("name", g), "size": ds.groups[g]["size"],
                    "year": ds.groups[g].get("year"), "department": ds.groups[g].get("department")}
                   for g in sorted(ds.groups)],
        "faculty": [{"id": f, "name": ds.faculty[f].get("name", f),
                     "department": ds.faculty[f].get("department", "")} for f in sorted(ds.faculty)],
        "rooms": [{"id": r, "name": ds.rooms[r].get("name", r), "type": ds.rooms[r]["type"],
                   "capacity": ds.rooms[r]["capacity"], "accessible": ds.rooms[r]["accessible"],
                   "features": ds.rooms[r]["features"], "building": ds.rooms[r].get("building", "")}
                  for r in sorted(ds.rooms)],
    }


# --------------------------------------------------------------------------- disruption
def preview_disruption(changes: list[dict], baseline: dict | None = None,
                       time_limit: int | None = None,
                       pins: dict[str, tuple[str, int]] | None = None) -> dict:
    """Compute a repair proposal. Never mutates stored state."""
    s = get_settings()
    ds = dataset()
    base_schedule = baseline or current_schedule()
    base_assign, _ = to_assign(base_schedule)
    ds_after, change_log = apply_changes(ds, changes)
    from ..db import get_engine
    from .manual import as_dict, list_events
    with Session(get_engine()) as event_session:
        events = [as_dict(e) for e in list_events(event_session, include_cancelled=False)]
    solver_schedule = {**base_schedule, "_manual_events": events}
    broken = broken_sessions(ds_after, base_assign, solver_schedule)
    result = repair_or_refuse(ds_after, base_assign, solver_schedule,
                              time_limit=float(time_limit or s.repair_time_limit),
                              workers=s.solver_workers, seed=s.solver_seed, pins=pins)
    payload: dict[str, Any] = {
        "base_fingerprint": state_fingerprint(ds, base_schedule),
        "status": result["status"],
        "changes": change_log,
        "broken_before": {k: v[:3] for k, v in broken.items()},
        "broken_count": len(broken),
        "moves": result.get("moves"),
        "moved": result.get("moved", []),
        "new_sessions": result.get("new_sessions", []),
        "dropped_sessions": result.get("dropped_sessions", []),
        "attempts": result.get("attempts", []),
        "explanation": result.get("explanation"),
        "reserved_room_periods": len(reservations_from_schedule(ds_after, solver_schedule)[0]),
        "pins": ({k: {"day": v[0], "start_period": v[1]} for k, v in pins.items()} if pins else None),
    }
    if result["status"] in ("OPTIMAL", "FEASIBLE"):
        exams, exam_error = prepare_exam_schedule(ds_after, base_schedule.get("exams", []))
        if exams is None:
            payload["valid"] = False
            payload["status"] = "INFEASIBLE"
            payload["explanation"] = {"suggestions": [exam_error]}
            return payload
        schedule = {
            "team": base_schedule.get("team", s.team),
            "dataset_id": ds_after.dataset_id,
            "sessions": [{"session_id": sid, "day": d, "start_period": p, "room_id": r}
                         for sid, (d, p, r) in sorted(result["assignment"].items())],
            "fest_week": base_schedule.get("fest_week", {"bookings": [], "session_overrides": []}),
            "exams": exams,
        }
        report = validate(ds_after, schedule, baseline=base_schedule)
        payload["proposed_schedule"] = schedule
        payload["report"] = report
        payload["moves"] = report.get("stability", {}).get("sessions_moved")
        payload["valid"] = report["hard_violation_count"] == 0
    else:
        payload["valid"] = False
    return payload


def store_proposal(session: Session, user, title: str, changes: list[dict], result: dict,
                   kind: str = "disruption"):
    """Queue a checked proposal. Status is `pending` only when the repair actually worked."""
    import uuid

    from ..db import Proposal

    proposal = Proposal(
        id=f"PR-{uuid.uuid4().hex[:8]}",
        kind=kind,
        title=title[:180],
        changes_json=json.dumps(changes),
        result_json=json.dumps(result),
        status="pending" if result.get("valid") else "refused",
        requested_by=getattr(user, "id", 0) or 0,
        requested_by_email=getattr(user, "email", "system"),
    )
    session.add(proposal)
    session.commit()
    return proposal


def move_conflicts(ds: Dataset, schedule: dict, session_id: str, day: str,
                   start_period: int) -> list[str]:
    """Fast, readable reasons a single session cannot sit at (day, start).

    This runs before any solve: a judge gets an instant answer instead of a 20 second stall,
    and the reason is a constraint, not a solver status.
    """
    sess = ds.sessions.get(session_id)
    if sess is None:
        return [f"{session_id} is not a session in this dataset"]
    problems: list[str] = []
    if day not in ds.days:
        return [f"{day} is not a teaching day (this dataset has {', '.join(ds.days)})"]
    end = start_period + sess["duration"] - 1
    if start_period < 1 or end > ds.max_period:
        problems.append(f"P{start_period} for {sess['duration']} period(s) runs outside the day")
    if start_period <= ds.lunch_after < end:
        problems.append(f"the session would cross lunch (after P{ds.lunch_after})")
    if sess["kind"] == "lab" and start_period not in (2, 6):
        problems.append("a 3-hour lab may only start at P2 or P6")

    spots = {(e["day"], e["start_period"], e["session_id"]) for e in schedule.get("sessions", [])}
    for e in schedule.get("sessions", []):
        other = ds.sessions.get(e["session_id"])
        if other is None or e["session_id"] == session_id:
            continue
        other_end = e["start_period"] + other["duration"] - 1
        if e["day"] != day or other_end < start_period or e["start_period"] > end:
            continue
        if other["faculty_id"] == sess["faculty_id"]:
            problems.append(f"{sess['faculty_id']} already teaches {other['course_id']} "
                            f"({other['id']}) at {day} P{e['start_period']}")
        shared = set(other["groups"]) & set(sess["groups"])
        same_basket = (sess.get("basket_slot") and sess.get("basket_slot") == other.get("basket_slot"))
        if shared and not same_basket:
            problems.append(f"{', '.join(sorted(shared))} already have {other['course_id']} "
                            f"({other['id']}) at {day} P{e['start_period']}")
    for pref in ds.faculty.get(sess["faculty_id"], {}).get("unavailable", []):
        if pref.get("day") != day:
            continue
        clash = sorted(set(range(start_period, end + 1)) & set(pref.get("periods") or []))
        if clash:
            problems.append(f"{sess['faculty_id']} is unavailable {day} P{clash[0]}")

    hours = sum(ds.sessions[e["session_id"]]["duration"] for e in schedule.get("sessions", [])
                if e["day"] == day and e["session_id"] in ds.sessions
                and ds.sessions[e["session_id"]]["faculty_id"] == sess["faculty_id"])
    cap = ds.faculty.get(sess["faculty_id"], {}).get("max_hours_per_day", 99)
    if hours + sess["duration"] > cap:
        problems.append(f"{sess['faculty_id']} would teach {hours + sess['duration']} h on {day} "
                        f"(daily limit {cap} h)")

    rooms = ds.feasible_rooms(sess)
    open_rooms = [r for r in rooms
                  if not any((day, p) in ds.room_unavailable[r] for p in range(start_period, end + 1))
                  and not any(e["room_id"] == r and e["day"] == day and e["session_id"] != session_id
                              and e["start_period"] <= end
                              and e["start_period"] + ds.sessions[e["session_id"]]["duration"] - 1 >= start_period
                              for e in schedule.get("sessions", []) if e["session_id"] in ds.sessions)]
    if not open_rooms:
        problems.append(f"no room of type {sess['room_types']} that seats {sess['size']} is free "
                        f"at {day} P{start_period}")
    return problems


def preview_move(session_id: str, day: str, start_period: int,
                 time_limit: int | None = None) -> dict:
    """A single-session move request, checked fast first and then solved exactly."""
    ds = dataset()
    schedule = current_schedule()
    current = next((e for e in schedule.get("sessions", [])
                    if e["session_id"] == session_id), None)
    if current is None:
        return {"status": "REFUSED", "valid": False, "session_id": session_id,
                "conflicts": [f"{session_id} is not scheduled in the current timetable"]}
    if (current["day"], current["start_period"]) == (day, start_period):
        return {"status": "NO_CHANGE", "valid": True, "moves": 0, "moved": [],
                "conflicts": [], "session_id": session_id,
                "note": f"{session_id} is already at {day} P{start_period}"}
    conflicts = move_conflicts(ds, schedule, session_id, day, start_period)
    if conflicts:
        return {"status": "REFUSED", "valid": False, "session_id": session_id,
                "requested": {"day": day, "start_period": start_period},
                "conflicts": conflicts, "moves": None,
                "explanation": {"reason": "the requested slot breaks a hard constraint",
                                "suggestions": _slot_suggestions(ds, schedule, session_id)}}
    return preview_disruption([], time_limit=time_limit, pins={session_id: (day, start_period)})


def _slot_suggestions(ds: Dataset, schedule: dict, session_id: str, limit: int = 3) -> list[str]:
    """A few slots that would actually work, found by the fast check (no solving)."""
    out = []
    sess = ds.sessions.get(session_id)
    if sess is None:
        return out
    for day in ds.days:
        for start in range(1, ds.max_period + 1):
            if not move_conflicts(ds, schedule, session_id, day, start):
                out.append(f"{day} P{start}")
            if len(out) >= limit:
                return out
    return out


def state_fingerprint(ds: Dataset, schedule: dict) -> str:
    """Detect proposals prepared against a timetable or dataset that has since changed."""
    payload = json.dumps([ds.raw, schedule], sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def current_cached() -> dict:
    """The timetable currently in force, read without a request-scoped session."""
    return current_schedule()


def current_schedule() -> dict:
    """Read the approved active timetable, falling back to the baseline."""
    from ..db import get_engine
    from sqlmodel import Session as _Session

    with _Session(get_engine()) as session:
        return AppState.get(session, ACTIVE_KEY) or AppState.get(session, BASELINE_KEY) or {}


def apply_preview(session: Session, schedule_after: dict, actor: str,
                  meta: dict | None = None, dataset_after: Dataset | None = None) -> dict:
    # Keep baseline for schedule.json; the approved repair is the live view and after export.
    # Store the changed dataset alongside it so added/removed sessions and closures survive restart.
    for key, value in ((AFTER_KEY, schedule_after), (ACTIVE_KEY, schedule_after),
                       (ACTIVE_DATASET_KEY, dataset_after.raw if dataset_after else dataset().raw)):
        row = session.get(AppState, key)
        if row:
            row.value = json.dumps(value)
        else:
            row = AppState(key=key, value=json.dumps(value))
        session.add(row)
    session.commit()
    invalidate_dataset()
    persistence.sync_version(session, schedule_after, actor=actor, source="disruption repair",
                             meta=meta or {}, note="repaired timetable applied after approval")
    written = write_exports(session, include_after=True)
    audit(session, actor, "admin", "apply_disruption",
          f"{len(schedule_after.get('sessions', []))} sessions in the repaired timetable")
    return written


def load_dataset(session: Session, payload: dict, actor: str) -> dict:
    """Accept a judge's own dataset: validate it, store it, and clear the stale timetable.

    `vendor/` is never written to - the upload goes to `data/dataset.json`, which is gitignored.
    """
    import tempfile

    s = get_settings()
    if not isinstance(payload, dict) or "sessions" not in payload:
        raise ValueError("a dataset needs at least 'sessions'; see vendor/cit_public.json")
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
        json.dump(payload, fh)
        tmp = fh.name
    try:
        probe = Dataset.load(tmp)          # raises ValueError with a readable message
    finally:
        os.unlink(tmp)

    target = s.data_dir / "dataset.json"
    s.data_dir.mkdir(parents=True, exist_ok=True)
    tmp_target = str(target) + ".tmp"
    with open(tmp_target, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)
    os.replace(tmp_target, target)

    AppState.put(session, DATASET_KEY, str(target))
    for key in (BASELINE_KEY, AFTER_KEY, ACTIVE_KEY, ACTIVE_DATASET_KEY):
        row = session.get(AppState, key)
        if row:
            session.delete(row)
    session.commit()
    persistence.wipe(session)
    AppState.put(session, META_KEY, {
        "source": "uploaded dataset - no timetable generated yet",
        "dataset_id": probe.dataset_id,
        "uploaded_at": time.time(),
    })
    invalidate_dataset()
    audit(session, actor, "admin", "load_dataset",
          f"{probe.dataset_id}: {len(probe.sessions)} sessions, {len(probe.rooms)} rooms")
    return {"dataset_id": probe.dataset_id, "summary": probe.summary(),
            "stored_at": str(target),
            "next": "POST /api/timetable/generate to solve this dataset"}


def restore_dataset(session: Session, actor: str) -> dict:
    row = session.get(AppState, DATASET_KEY)
    if row:
        session.delete(row)
        session.commit()
    for key in (BASELINE_KEY, AFTER_KEY, META_KEY, ACTIVE_KEY, ACTIVE_DATASET_KEY):
        row = session.get(AppState, key)
        if row:
            session.delete(row)
    session.commit()
    persistence.wipe(session)
    invalidate_dataset()
    snap = bootstrap(session)
    ds = dataset()
    audit(session, actor, "admin", "restore_dataset", "back to vendor/cit_public.json")
    return {"dataset_id": ds.dataset_id, "sessions": len(snap.schedule.get("sessions", []))}


def snapshot_dataset_id(snap: Snapshot) -> str:
    return ((snap.schedule or {}).get("dataset_id")
            or (snap.meta or {}).get("dataset_id") or "")


def reset(session: Session, actor: str) -> dict:
    """Reset demo data: reseed users, reload the committed exports, clear proposals."""
    from ..auth import seed_users
    from ..db import Proposal
    from .manual import AdhocEvent
    from sqlmodel import delete, select

    session.exec(delete(AdhocEvent))
    for row in session.exec(select(Proposal)).all():
        session.delete(row)
    session.exec(delete(AppState))
    session.commit()
    persistence.wipe(session)
    users = seed_users(session)
    invalidate_dataset()
    snap = bootstrap(session)
    audit(session, actor, "admin", "reset_demo", "database reseeded from the committed exports")
    return {"users": len(users), "sessions": len(snap.schedule.get("sessions", [])),
            "after": bool(snap.after)}


# --------------------------------------------------------------------------- analytics
def dashboard(session: Session, ds: Dataset) -> dict:
    snap = current(session)
    schedule = AppState.get(session, ACTIVE_KEY) or snap.schedule or {}
    assign, _dup = to_assign(schedule)
    from . import manual
    report = validate(ds, schedule)
    hard = list(report["hard_violations"])
    hard.extend({"rule": "EXAM-OPERATIONS", "detail": text}
                for text in invigilation_errors(ds, schedule.get("exams") or []))
    events = manual.list_events(session, include_cancelled=False)
    hard.extend({"rule": "MANUAL", "detail": f"{event_id}: {reason}"}
                for event_id, reason in manual.conflicting_events(ds, schedule, events))
    soft, soft_total = soft_score(ds, assign)
    usage = {r: {"sessions": 0, "hours": 0} for r in ds.rooms}
    for e in schedule.get("sessions", []):
        sess = ds.sessions.get(e["session_id"])
        if sess is None:
            continue
        usage[e["room_id"]]["sessions"] += 1
        usage[e["room_id"]]["hours"] += sess["duration"]
    occupancy = manual.occupancy(ds, schedule, events)
    utilisation = []
    for room, values in usage.items():
        available = {(day, period) for day in ds.days for period in ds.teaching_periods
                     if (day, period) not in ds.room_unavailable[room]}
        occupied = sum((day, period, room) in occupancy for day, period in available)
        utilisation.append({"room_id": room, **values, "occupied_periods": occupied,
                            "available_periods": len(available),
                            "utilisation": round(occupied / len(available), 3) if available else 0})
    busiest = sorted(utilisation, key=lambda x: -x["sessions"])[:3]
    decisions = (schedule.get("fest_week") or {}).get("bookings", [])
    return {
        "counts": {
            "sessions": len(ds.sessions),
            "scheduled": sum(1 for sid in ds.sessions if sid in assign),
            "exams": len(ds.exams),
            "bookings": len(decisions),
            "approved": sum(1 for d in decisions if d.get("status") == "approved"),
            "alternatives": sum(1 for d in decisions if d.get("status") == "alternative_offered"),
            "rejected": sum(1 for d in decisions if d.get("status") == "rejected"),
        },
        "conflicts": {"hard": len(hard), "by_rule": _count_by_rule(hard)},
        "soft": {"total": soft_total, "breakdown": soft},
        "utilisation": sorted(utilisation, key=lambda x: -x["utilisation"]),
        "utilisation_basis": "Spectra-week occupied teaching periods / teaching periods available after maintenance; excludes exam week and evening periods",
        "busiest_rooms": busiest,
        "pending_proposals": _pending_count(session),
        "meta": snap.meta,
        "risks": _risks(ds, utilisation),
    }


def _count_by_rule(violations: list[dict]) -> dict:
    out: dict[str, int] = {}
    for v in violations:
        out[v["rule"]] = out.get(v["rule"], 0) + 1
    return out


def _pending_count(session: Session) -> int:
    from ..db import Proposal
    from sqlmodel import select

    return len(session.exec(select(Proposal).where(Proposal.status == "pending")).all())


def _risks(ds: Dataset, utilisation: list[dict]) -> list[str]:
    out = []
    hard_pressed = [u for u in utilisation if u["sessions"] >= 12 and u["room_id"] in
                    [r for r in ds.rooms if "lab" in ds.rooms[r].get("allowed_uses", [])]]
    for u in hard_pressed[:3]:
        out.append(f"{u['room_id']} carries {u['sessions']} sessions - it is the lab bottleneck "
                   f"for Spectra week")
    squeezed = [f for f in ds.faculty
                if sum(1 for s in ds.sessions.values() if s["faculty_id"] == f) >= 8]
    if squeezed:
        out.append(f"{', '.join(sorted(squeezed)[:4])} are at or above 8 teaching hours this week")
    if any(ds.room_unavailable.values()):
        out.append("maintenance windows are already reserved: "
                   + ", ".join(sorted({r for r, s in ds.room_unavailable.items() if s})))
    return out
