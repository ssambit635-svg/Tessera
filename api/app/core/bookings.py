"""Booking decisions: priority-aware, damage-aware, with generated reasons.

Strategy
  1. Sort requests by the dataset's own priority order (effective category, then
     submitted_at) - the same ordering the official validator uses.
  2. For each request, enumerate every room/time the validator would accept.
  3. Score each candidate by how much it would hurt the *teaching* timetable
     (event-only rooms and P10-P13 are free; classrooms/labs in P1-P9 are expensive).
  4. Approve the least-damaging in-window slot; else offer an alternative; else reject
     with a reason that names the real blocker.
  5. Return the room-periods and group-periods the timetable must leave free.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from .constraints import booking_room_ok, candidate_booking_slots, inside_window
from .dataset import CAT_WEIGHT, Dataset


def _pressure(ds: Dataset) -> dict[str, int]:
    """How many sessions could use each room - i.e. how valuable it is to teaching."""
    p: dict[str, int] = defaultdict(int)
    for s in ds.sessions.values():
        for rid in ds.feasible_rooms(s):
            p[rid] += 1
    return dict(p)


def _damage(ds: Dataset, req: dict, room_id: str, day: str, start: int, pressure: dict[str, int]) -> float:
    room = ds.rooms[room_id]
    dur = req["duration_periods"]
    per = list(range(start, start + dur))
    teaching = [p for p in per if p <= ds.last_period]
    if not teaching:
        return 0.0  # evening slot, no class can use it
    d = 100.0 * len(teaching)
    d += 8.0 * pressure.get(room_id, 0)
    if "lecture" in room.get("allowed_uses", []):
        d += 40.0  # a real teaching room
    if req.get("requested_room") == room_id:
        d -= 15.0  # respect the wish when it is cheap
    d += 0.5 * len(teaching) * abs(start - 5)  # mild preference for mid-day
    return d


def decide_bookings(ds: Dataset) -> dict[str, Any]:
    pressure = _pressure(ds)
    order = sorted(
        ds.requests.values(),
        key=lambda r: (ds.category_rank(ds.effective_category(r)), r["submitted_at"], r["id"]),
    )

    room_busy: dict[tuple, str] = {}          # (room, day, p) -> request_id
    grp_blocked: dict[tuple, str] = {}        # (group, day, p) -> request_id
    decisions: list[dict] = []
    details: dict[str, dict] = {}
    placed: dict[str, tuple] = {}

    def free(room_id: str, day: str, start: int, dur: int, req_id: str) -> bool:
        for p in range(start, start + dur):
            if (room_id, day, p) in room_busy:
                return False
        return True

    def feasible_candidates(req: dict, windows_only: bool):
        out = []
        for room in ds.rooms.values():
            if not booking_room_ok(ds, req, room):
                continue
            for day, start in candidate_booking_slots(ds, req, room["id"]):
                if windows_only and not inside_window(req, day, start):
                    continue
                if not free(room["id"], day, start, req["duration_periods"], req["id"]):
                    continue
                if any(grp_blocked.get((g, day, p)) for g in req.get("mandatory_for_groups", [])
                       for p in range(start, start + req["duration_periods"])):
                    continue
                out.append((_damage(ds, req, room["id"], day, start, pressure), room["id"], day, start))
        out.sort(key=lambda c: (c[0], c[2], c[3], c[1]))
        return out

    for req in order:
        rid = req["id"]
        cat = ds.effective_category(req)
        weight = CAT_WEIGHT[cat]
        dur = req["duration_periods"]

        if rid in ds.cancelled:
            decisions.append({
                "request_id": rid, "status": "rejected",
                "reason": "This request was withdrawn by the requester after submission; "
                          "it cannot be approved or offered an alternative.",
            })
            details[rid] = {"effective_category": cat, "weight": weight, "outcome": "cancelled"}
            continue

        cands = feasible_candidates(req, windows_only=True)
        if cands:
            _, room_id, day, start = cands[0]
            decisions.append({
                "request_id": rid, "status": "approved", "day": day,
                "start_period": start, "end_period": start + dur - 1, "room_id": room_id,
                "reason": f"Fits exactly inside the requested window ({day} P{start}-P{start + dur - 1} in "
                          f"{room_id}); venue meets type, capacity and feature needs; "
                          f"priority {cat} ({weight} pts) and no clash with classes or other bookings.",
            })
            for p in range(start, start + dur):
                room_busy[(room_id, day, p)] = rid
            for g in req.get("mandatory_for_groups", []):
                for p in range(start, start + dur):
                    grp_blocked[(g, day, p)] = rid
            placed[rid] = (room_id, day, start, start + dur - 1)
            details[rid] = {"effective_category": cat, "weight": weight, "outcome": "approved",
                            "violence": None}
            continue

        alts = feasible_candidates(req, windows_only=False)
        if alts:
            _, room_id, day, start = alts[0]
            reasons = _why_no_window(ds, req)
            decisions.append({
                "request_id": rid, "status": "alternative_offered", "day": day,
                "start_period": start, "end_period": start + dur - 1, "room_id": room_id,
                "reason": (f"The requested window cannot take a {dur}-period booking "
                           f"({reasons}); nearest workable slot is {day} "
                           f"P{start}-P{start + dur - 1} in {room_id} - offer it to the requester."),
            })
            for p in range(start, start + dur):
                room_busy[(room_id, day, p)] = rid
            for g in req.get("mandatory_for_groups", []):
                for p in range(start, start + dur):
                    grp_blocked[(g, day, p)] = rid
            placed[rid] = (room_id, day, start, start + dur - 1)
            details[rid] = {"effective_category": cat, "weight": weight, "outcome": "alternative"}
            continue

        decisions.append({
            "request_id": rid, "status": "rejected",
            "reason": _impossible_reason(ds, req),
        })
        details[rid] = {"effective_category": cat, "weight": weight, "outcome": "rejected"}

    # ------------------------------------------------------------------ reservations
    reserved_rooms = {k for k in room_busy if k[2] <= ds.last_period}
    blocked_groups = set(grp_blocked)

    return {
        "decisions": decisions,
        "details": details,
        "placed": placed,
        "reserved_rooms": reserved_rooms,
        "blocked_groups": blocked_groups,
    }


def _why_no_window(ds: Dataset, req: dict) -> str:
    bits = []
    for w in req["windows"]:
        span = w["to_period"] - w["from_period"] + 1
        if span < req["duration_periods"]:
            bits.append(f"{w['day']} P{w['from_period']}-P{w['to_period']} is shorter than the "
                        f"{req['duration_periods']} periods needed")
        elif w["to_period"] > ds.max_period:
            bits.append(f"{w['day']} P{w['from_period']}-P{w['to_period']} runs past the last booking "
                        f"period (P{ds.max_period}); events cannot use periods after P{ds.max_period}")
        else:
            bits.append(f"{w['day']} P{w['from_period']}-P{w['to_period']} is already taken by a "
                        f"higher-priority or earlier request")
    return "; ".join(bits) or "no requested window is usable"


def _impossible_reason(ds: Dataset, req: dict) -> str:
    big = max((r["capacity"] for r in ds.rooms.values()), default=0)
    if req["attendance"] > big:
        return (f"No venue can seat {req['attendance']}: the largest room on campus holds {big}. "
                f"Suggest splitting the event or moving it to a venue that is not in the dataset.")
    typed = [r for r in ds.rooms.values() if r["type"] in req["room_types"]]
    if not typed:
        return f"No room of type {req['room_types']} exists in this dataset."
    sized = [r for r in typed if r["capacity"] >= req["attendance"]]
    if not sized:
        best = max(typed, key=lambda r: r["capacity"])
        return (f"The largest {req['room_types'][0]} seats {best['capacity']}, "
                f"but the request needs {req['attendance']}.")
    feat = [r for r in sized if not (set(req.get("needs", [])) - ds.room_features(r))]
    if not feat:
        return (f"No room of type {req['room_types']} with capacity >= {req['attendance']} has "
                f"{sorted(set(req.get('needs', [])))}; nearest options miss "
                f"{sorted(set(req['needs']) - ds.room_features(sized[0]))}.")
    return ("Every room that could host this booking is already committed to classes or to a "
            "higher-priority request for the whole of Spectra week.")
