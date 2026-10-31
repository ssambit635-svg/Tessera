from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from ..auth import current_user
from ..core.constraints import booking_room_ok
from ..db import User, get_session
from ..services import state

router = APIRouter(prefix="/api/dataset", tags=["dataset"])


@router.get("/summary")
def summary(user: User = Depends(current_user)):
    ds = state.dataset()
    # Maintenance / declared-unavailable windows, flattened so the calendar can draw them.
    # This is real dataset data (room_unavailability), not a derived guess.
    maintenance = [
        {"room_id": room_id, "day": day, "period": period}
        for room_id, slots in ds.room_unavailable.items()
        for day, period in sorted(slots)
    ]
    return {"summary": ds.summary(), "calendar": ds.raw["calendar"],
            "priority_order": ds.priority_order, "role_category_cap": ds.role_cap,
            "maintenance": maintenance,
            "maintenance_count": len(maintenance),
            "soft_rule_labels": {
                "S1": "capacity slack - a room much bigger than the class",
                "S2": "room type preference",
                "S3": "faculty preference (preferred periods)",
                "S4": "a course repeats on the same day for a group",
                "S5": "idle gaps in a student's day",
                "S6": "use of the last period of the day",
            },
            "category_weights": {"institute_event": 5, "guest_lecture": 4,
                                 "department_event": 3, "club_event": 2}}


@router.get("/entities")
def entities(user: User = Depends(current_user)):
    return state.entities(state.dataset())


@router.get("/rooms")
def rooms(q: str = Query("", description="free-text search over id, name, type, features"),
          min_capacity: int = 0, needs: str = Query("", description="comma separated features"),
          event_only: bool = False, user: User = Depends(current_user)):
    ds = state.dataset()
    need_list = [n.strip() for n in needs.split(",") if n.strip()]
    query = q.lower().strip()
    out = []
    for room in ds.rooms.values():
        haystack = " ".join([room["id"], room.get("name", ""), room["type"],
                             " ".join(room.get("features", [])),
                             " ".join(room.get("allowed_uses", []))]).lower()
        if query and query not in haystack:
            continue
        if room["capacity"] < min_capacity:
            continue
        if need_list and set(need_list) - ds.room_features(room):
            continue
        if event_only and "event" not in room.get("allowed_uses", []):
            continue
        out.append({"id": room["id"], "name": room.get("name", room["id"]), "type": room["type"],
                    "capacity": room["capacity"], "building": room.get("building", ""),
                    "features": room["features"], "accessible": room["accessible"],
                    "allowed_uses": room.get("allowed_uses", [])})
    return {"count": len(out), "rooms": sorted(out, key=lambda r: r["id"])}


@router.get("/rooms/{room_id}/availability")
def room_availability(room_id: str, user: User = Depends(current_user),
                      session: Session = Depends(get_session)):
    ds = state.dataset()
    room = ds.rooms.get(room_id)
    if room is None:
        raise HTTPException(404, f"unknown room {room_id}")
    snap = state.current_schedule()
    busy = []
    for e in snap.get("sessions", []):
        if e["room_id"] != room_id:
            continue
        sess = ds.sessions.get(e["session_id"])
        if sess is None:
            continue
        busy.append({"session_id": e["session_id"], "day": e["day"],
                     "start_period": e["start_period"],
                     "end_period": e["start_period"] + sess["duration"] - 1,
                     "source": "class"})
    for d in (snap.get("fest_week") or {}).get("bookings", []):
        if d.get("room_id") != room_id or d.get("status") == "rejected":
            continue
        busy.append({"session_id": d["request_id"], "day": d.get("day"),
                     "start_period": d.get("start_period"), "end_period": d.get("end_period"),
                     "source": "booking"})
    from ..services import manual as manual_service

    for ev in manual_service.list_events(session, include_cancelled=False):
        if ev.room_id != room_id:
            continue
        busy.append({"session_id": ev.id, "day": ev.day, "start_period": ev.start_period,
                     "end_period": ev.end_period, "source": "event", "title": ev.title})
    free = []
    for day in ds.days:
        for p in ds.periods:
            if p["id"] > ds.max_period:
                continue
            taken = any(b["day"] == day and b["start_period"] <= p["id"] <= b["end_period"]
                        for b in busy)
            blocked = (day, p["id"]) in ds.room_unavailable[room_id]
            free.append({"day": day, "period": p["id"], "start": p["start"],
                         "free": not taken and not blocked, "blocked_reason":
                         "maintenance" if blocked else ("class" if taken else None)})
    return {"room": room, "busy": busy, "free_slots": free}
