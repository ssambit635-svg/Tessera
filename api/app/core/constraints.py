"""Validity kernel - the single authority for "is this allowed".

This is a re-implementation of the official validator's rules (H1-H14, B1-B3, E1-E2,
S1-S6) so the app can call it thousands of times without importing the organisers'
file. `tools/selfcheck.py` asserts our verdict agrees with `vendor/validator.py`.

Nothing in the UI, the solver, or the AI layer is allowed to overrule this module.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from .dataset import CAT_WEIGHT, Dataset


# --------------------------------------------------------------------------- timetable
def check_timetable(ds: Dataset, assign: dict[str, tuple], label: str = "timetable"):
    """assign: session_id -> (day, start_period, room_id)."""
    V: list[dict] = []

    def v(rule: str, detail: str):
        V.append({"rule": rule, "where": label, "detail": detail})

    room_occ: dict[tuple, list[str]] = defaultdict(list)
    fac_occ: dict[tuple, list[str]] = defaultdict(list)
    grp_occ: dict[tuple, set[str]] = defaultdict(set)
    fac_day: dict[tuple, int] = defaultdict(int)
    basket_time: dict[str, set] = defaultdict(set)

    for sid in ds.sessions:
        if sid not in assign:
            v("H1", f"Session {sid} is not scheduled")

    for sid, (day, start, rid) in assign.items():
        s = ds.sessions.get(sid)
        if s is None:
            v("H1", f"Unknown session id {sid}")
            continue
        if day not in ds.days:
            v("H1", f"{sid}: invalid day {day}")
            continue
        if not isinstance(start, int) or start < 1 or start + s["duration"] - 1 > ds.last_period:
            v("H9", f"{sid}: start period {start} with duration {s['duration']} runs outside P1-P{ds.last_period}")
            continue
        r = ds.rooms.get(rid)
        if r is None:
            v("H1", f"{sid}: unknown room {rid}")
            continue
        per = ds.periods_of(start, s["duration"])
        if per[0] <= ds.lunch_after < per[-1]:
            v("H9", f"{sid}: crosses lunch ({day} P{per[0]}-P{per[-1]})")
        if s["kind"] == "lab" and start not in ds.lab_starts:
            v("H9", f"{sid}: lab must start at one of {sorted(ds.lab_starts)}, starts at P{start}")
        fx = s.get("fixed_slot")
        if fx and (fx["day"] != day or fx["start_period"] != start):
            v("H14", f"{sid}: fixed at {fx['day']} P{fx['start_period']}, placed at {day} P{start}")
        if r["capacity"] < s["size"]:
            v("H5", f"{sid}: size {s['size']} > {rid} capacity {r['capacity']}")
        if r["type"] not in s["room_types"]:
            v("H6", f"{sid}: needs {s['room_types']}, {rid} is {r['type']}")
        if s.get("needs_accessible") and not r.get("accessible"):
            v("H10", f"{sid}: needs an accessible room, {rid} is not")
        f = s["faculty_id"]
        key = s.get("basket_slot") or sid
        for p in per:
            room_occ[(rid, day, p)].append(sid)
            fac_occ[(f, day, p)].append(sid)
            for g in s["groups"]:
                grp_occ[(g, day, p)].add(key)
            if (day, p) in ds.faculty_unavailable[f]:
                v("H7", f"{sid}: {f} unavailable {day} P{p}")
            if (day, p) in ds.room_unavailable[rid]:
                v("H8", f"{sid}: {rid} unavailable {day} P{p}")
        fac_day[(f, day)] += s["duration"]
        if s.get("basket_slot"):
            basket_time[s["basket_slot"]].add((day, start))

    for (rid, day, p), sids in room_occ.items():
        if len(sids) > 1:
            v("H4", f"{rid} double-booked {day} P{p}: {', '.join(sorted(sids))}")
    for (f, day, p), sids in fac_occ.items():
        if len(sids) > 1:
            v("H2", f"{f} double-booked {day} P{p}: {', '.join(sorted(sids))}")
    for (g, day, p), keys in grp_occ.items():
        if len(keys) > 1:
            v("H3", f"Group {g} double-booked {day} P{p}: {', '.join(sorted(keys))}")
    for b, times in basket_time.items():
        if len(times) > 1:
            v("H11", f"Basket {b} sessions are not at the same time: {sorted(times)}")
    for (f, day), h in fac_day.items():
        mx = ds.faculty[f].get("max_hours_per_day", 4)
        if h > mx:
            v("H12", f"{f} teaches {h} hours on {day} (max {mx})")
    return V


def soft_score(ds: Dataset, assign: dict[str, tuple]) -> tuple[dict[str, int], int]:
    pen: dict[str, int] = defaultdict(int)
    grp_day: dict[tuple, set] = defaultdict(set)
    grp_hours: dict[tuple, int] = defaultdict(int)
    grp_course: dict[tuple, int] = defaultdict(int)
    seen_basket: set = set()

    for sid, (day, start, rid) in assign.items():
        s = ds.sessions.get(sid)
        r = ds.rooms.get(rid)
        if s is None or r is None or day not in ds.days:
            continue
        per = ds.periods_of(start, s["duration"])
        for pref in ds.faculty.get(s["faculty_id"], {}).get("preferences", []):
            if pref.get("type") == "avoid" and day in pref.get("days", ds.days):
                pen["S1"] += 2 * sum(1 for p in per if p in pref["periods"])
        if r["capacity"] and s["size"] / r["capacity"] < 0.4:
            pen["S5"] += 1
        if ds.last_period in per:
            pen["S6"] += 1
        for g in s["groups"]:
            for p in per:
                grp_day[(g, day)].add(p)
            if s.get("basket_slot"):
                if (g, s["basket_slot"]) in seen_basket:
                    continue
                seen_basket.add((g, s["basket_slot"]))
            grp_hours[(g, day)] += s["duration"]
            if s["kind"] == "lecture" and not s.get("basket_slot"):
                grp_course[(g, day, s["course_id"])] += 1

    for (g, day), ps in grp_day.items():
        pen["S2"] += sum(1 for p in range(min(ps), max(ps) + 1) if p not in ps)
    for k, h in grp_hours.items():
        if h > 6:
            pen["S3"] += 3 * (h - 6)
    for k, c in grp_course.items():
        if c > 1:
            pen["S4"] += 3 * (c - 1)

    bc: dict[tuple, int] = defaultdict(int)
    for sid, (day, start, rid) in assign.items():
        s = ds.sessions.get(sid)
        if s and s.get("basket_slot"):
            bc[(s["course_id"], day)] += 1
    for k, c in bc.items():
        if c > 1:
            pen["S4"] += 3 * (c - 1)

    for k in ("S1", "S2", "S3", "S4", "S5", "S6"):
        pen.setdefault(k, 0)
    return dict(sorted(pen.items())), sum(pen.values())


# --------------------------------------------------------------------------- bookings
def booking_room_ok(ds: Dataset, req: dict, room: dict) -> bool:
    """Everything the validator demands of a booked room, except time windows."""
    if "event" not in room.get("allowed_uses", []):
        return False
    if room["type"] not in req["room_types"]:
        return False
    if room["capacity"] < req["attendance"]:
        return False
    return not (set(req.get("needs", [])) - ds.room_features(room))


def candidate_booking_slots(ds: Dataset, req: dict, room_id: str) -> list[tuple[str, int]]:
    """All (day, start) where this request fits `room_id` for its duration."""
    dur = req["duration_periods"]
    out = []
    for day in ds.days:
        for start in range(1, ds.max_period + 1):
            end = start + dur - 1
            if end > ds.max_period:
                continue
            if any((day, p) in ds.room_unavailable[room_id] for p in range(start, end + 1)):
                continue
            out.append((day, start))
    return out


def inside_window(req: dict, day: str, start: int) -> bool:
    end = start + req["duration_periods"] - 1
    return any(w["day"] == day and w["from_period"] <= start and end <= w["to_period"] for w in req["windows"])


def check_bookings(ds: Dataset, base: dict[str, tuple], fest: dict):
    V: list[dict] = []
    W: list[str] = []
    overrides = fest.get("session_overrides", [])
    decisions = fest.get("bookings", [])

    dec_by: dict[str, dict] = {}
    for d in decisions:
        rid = d.get("request_id")
        if rid in dec_by:
            V.append({"rule": "B1", "where": "fest_week", "detail": f"Two decisions for {rid}"})
        dec_by[rid] = d

    # week-7 view: base timetable + overrides
    week = dict(base)
    for o in overrides:
        sid = o.get("session_id")
        if sid not in ds.sessions:
            V.append({"rule": "B2", "where": "fest_week", "detail": f"Override for unknown session {sid}"})
            continue
        disp = dec_by.get(o.get("displaced_by"))
        req = ds.requests.get(o.get("displaced_by"))
        if not req or not disp or disp.get("status") != "approved":
            V.append({"rule": "B2", "where": "fest_week", "detail":
                      f"Override of {sid} names {o.get('displaced_by')}, which is not an approved booking"})
        elif ds.category_rank(ds.effective_category(req)) > ds.category_rank("institute_event"):
            V.append({"rule": "B2", "where": "fest_week", "detail":
                      f"{o['displaced_by']} ({ds.effective_category(req)}) is not allowed to displace a regular session"})
        week[sid] = (o["day"], o["start_period"], o["room_id"])

    V += check_timetable(ds, week, label="fest_week")

    room_busy: dict[tuple, list[str]] = defaultdict(list)
    for sid, (day, start, rid) in week.items():
        s = ds.sessions.get(sid)
        if s:
            for p in ds.periods_of(start, s["duration"]):
                room_busy[(rid, day, p)].append(sid)
    grp_busy: dict[tuple, list[str]] = defaultdict(list)
    for sid, (day, start, rid) in week.items():
        s = ds.sessions.get(sid)
        if s:
            for p in ds.periods_of(start, s["duration"]):
                for g in s["groups"]:
                    grp_busy[(g, day, p)].append(sid)

    score = 0.0
    max_score = 0
    placed: dict[str, tuple] = {}
    for rid_, req in ds.requests.items():
        if rid_ not in ds.cancelled:
            max_score += CAT_WEIGHT[ds.effective_category(req)]

    for req_id, req in ds.requests.items():
        d = dec_by.get(req_id)
        if d is None:
            W.append(f"No decision for {req_id}")
            continue
        st = d.get("status")
        if req_id in ds.cancelled:
            if st in ("approved", "alternative_offered"):
                V.append({"rule": "B3", "where": "fest_week", "detail": f"{req_id} was cancelled but is {st}"})
            continue
        if st not in ("approved", "rejected", "alternative_offered"):
            V.append({"rule": "B1", "where": "fest_week", "detail": f"{req_id}: unknown status {st}"})
            continue
        if st in ("rejected", "alternative_offered") and not str(d.get("reason", "")).strip():
            W.append(f"{req_id}: {st} without a reason")
        if st == "rejected":
            continue

        ok = True

        def bad(msg):
            nonlocal ok
            ok = False
            V.append({"rule": "H13", "where": "fest_week", "detail": f"{req_id}: {msg}"})

        room = ds.rooms.get(d.get("room_id"))
        day, a, b = d.get("day"), d.get("start_period"), d.get("end_period")
        if room is None:
            bad(f"unknown room {d.get('room_id')}")
            continue
        if day not in ds.days or not isinstance(a, int) or not isinstance(b, int) or a < 1 or b > ds.max_period or b < a:
            bad(f"invalid time {day} P{a}-P{b}")
            continue
        if b - a + 1 != req["duration_periods"]:
            bad(f"booked {b - a + 1} periods, request needs {req['duration_periods']}")
        if "event" not in room.get("allowed_uses", []):
            bad(f"{room['id']} cannot host events")
        if room["type"] not in req["room_types"]:
            bad(f"{room['id']} ({room['type']}) is not one of {req['room_types']}")
        if room["capacity"] < req["attendance"]:
            bad(f"{room['id']} seats {room['capacity']}, request needs {req['attendance']}")
        miss = set(req.get("needs", [])) - ds.room_features(room)
        if miss:
            bad(f"{room['id']} lacks {sorted(miss)}")
        if st == "approved" and not inside_window(req, day, a):
            bad(f"approved at {day} P{a}-P{b}, outside the requested windows (use alternative_offered)")
        for p in range(a, b + 1):
            if (day, p) in ds.room_unavailable[room["id"]]:
                bad(f"{room['id']} unavailable {day} P{p}")
            if room_busy[(room["id"], day, p)]:
                bad(f"{room['id']} {day} P{p} already used by {', '.join(room_busy[(room['id'], day, p)])}")
            for g in req.get("mandatory_for_groups", []):
                if grp_busy.get((g, day, p)):
                    bad(f"mandatory for {g}, who have class {day} P{p}")
        if ok:
            for p in range(a, b + 1):
                room_busy[(room["id"], day, p)].append(req_id)
            placed[req_id] = (room["id"], day, a, b)
            score += CAT_WEIGHT[ds.effective_category(req)] * (1 if st == "approved" else 0.5)

    # priority inversions: a higher-priority rejected request that could have used a
    # slot held by a lower-priority approved one.
    inversions: list[str] = []
    for req_id, req in ds.requests.items():
        d = dec_by.get(req_id)
        if req_id in ds.cancelled or not d or d.get("status") != "rejected":
            continue
        for other_id, (rid, day, a, b) in placed.items():
            other = ds.requests[other_id]
            if dec_by[other_id].get("status") != "approved" or not ds.outranks(req, other):
                continue
            room = ds.rooms[rid]
            if not booking_room_ok(ds, req, room):
                continue
            for w in req["windows"]:
                if w["day"] != day:
                    continue
                for s0 in range(w["from_period"], w["to_period"] - req["duration_periods"] + 2):
                    per = list(range(s0, s0 + req["duration_periods"]))
                    if per[-1] > ds.max_period or not any(a <= p <= b for p in per):
                        continue
                    clash = False
                    for p in per:
                        if (day, p) in ds.room_unavailable[rid]:
                            clash = True
                        if [x for x in room_busy[(rid, day, p)] if x != other_id]:
                            clash = True
                        for g in req.get("mandatory_for_groups", []):
                            if grp_busy.get((g, day, p)):
                                clash = True
                    if not clash:
                        inversions.append(
                            f"{req_id} rejected, but {other_id} (lower priority) holds {rid} {day} P{a}-P{b}")
                        break
                else:
                    continue
                break

    stats = {
        "booking_score": score,
        "booking_score_max_if_all_approved": max_score,
        "approved": sum(1 for x in decisions if x.get("status") == "approved"),
        "alternatives": sum(1 for x in decisions if x.get("status") == "alternative_offered"),
        "rejected": sum(1 for x in decisions if x.get("status") == "rejected"),
        "session_overrides": len(overrides),
        "priority_inversions": inversions,
    }
    return V, W, stats


# --------------------------------------------------------------------------- exams
def check_exams(ds: Dataset, exams_out: list[dict]) -> tuple[list[dict], int]:
    V: list[dict] = []
    pen = 0
    if not ds.exams:
        return V, pen
    cal_days = ds.exam_days
    sess_ids = set(ds.exam_slots)
    room_use: dict[tuple, list[str]] = defaultdict(list)
    grp_use: dict[tuple, list[str]] = defaultdict(list)
    grp_day: dict[tuple, set] = defaultdict(set)
    seen: set[str] = set()

    for e in exams_out:
        eid = e.get("exam_id")
        if eid not in ds.exams_by_id:
            V.append({"rule": "E1", "where": "exams", "detail": f"Unknown exam {eid}"})
            continue
        if eid in seen:
            V.append({"rule": "E1", "where": "exams", "detail": f"{eid} scheduled twice"})
        seen.add(eid)
        if e.get("day") not in cal_days or e.get("session") not in sess_ids:
            V.append({"rule": "E1", "where": "exams", "detail": f"{eid}: invalid slot"})
            continue
        seats = 0
        for rid in e.get("rooms", []):
            r = ds.rooms.get(rid)
            if r is None or "exam" not in r.get("allowed_uses", []):
                V.append({"rule": "E2", "where": "exams", "detail": f"{eid}: {rid} cannot host exams"})
                continue
            seats += r["capacity"] // 2
            room_use[(rid, e["day"], e["session"])].append(eid)
        ex = ds.exams_by_id[eid]
        if seats < ex["size"]:
            V.append({"rule": "H5", "where": "exams",
                      "detail": f"{eid}: {seats} seats at half capacity for {ex['size']} students"})
        for g in ex["groups"]:
            grp_use[(g, e["day"], e["session"])].append(eid)
            grp_day[(g, e["day"])].add(eid)

    for eid in ds.exams_by_id:
        if eid not in seen:
            V.append({"rule": "E1", "where": "exams", "detail": f"{eid} not scheduled"})
    for k, v in room_use.items():
        if len(v) > 1:
            V.append({"rule": "H4", "where": "exams", "detail": f"{k[0]} has {v} in {k[1]} {k[2]}"})
    for k, v in grp_use.items():
        if len(v) > 1:
            V.append({"rule": "H3", "where": "exams", "detail": f"Group {k[0]} has {v} in {k[1]} {k[2]}"})
    for k, v in grp_day.items():
        if len(v) > 1:
            pen += 5 * (len(v) - 1)
    return V, pen


# --------------------------------------------------------------------------- top level
def to_assign(schedule: dict) -> tuple[dict[str, tuple], list[str]]:
    out: dict[str, tuple] = {}
    dup: list[str] = []
    for e in schedule.get("sessions", []):
        sid = e.get("session_id")
        if sid in out:
            dup.append(sid)
        out[sid] = (e.get("day"), e.get("start_period"), e.get("room_id"))
    return out, dup


def diff(before: dict[str, tuple], after: dict[str, tuple], ds: Dataset) -> dict:
    moved = [sid for sid in after if sid in before and sid in ds.sessions and tuple(after[sid]) != tuple(before[sid])]
    return {
        "sessions_moved": len(moved),
        "time_changed": sum(1 for s in moved if after[s][:2] != before[s][:2]),
        "room_only_changed": sum(1 for s in moved if after[s][:2] == before[s][:2]),
        "moved_ids": sorted(moved),
    }


def validate(ds: Dataset, schedule: dict, baseline: dict | None = None) -> dict:
    report: dict[str, Any] = {
        "dataset_id": ds.dataset_id,
        "schedule_dataset_id": schedule.get("dataset_id"),
        "team": schedule.get("team"),
        "warnings": [],
    }
    assign, dup = to_assign(schedule)
    hard = check_timetable(ds, assign)
    for d in dup:
        hard.append({"rule": "H1", "where": "timetable", "detail": f"Session {d} appears more than once"})

    soft, soft_total = soft_score(ds, assign)
    report["soft_penalties"] = soft
    report["soft_total"] = soft_total

    if "fest_week" in schedule:
        bv, bw, bstats = check_bookings(ds, assign, schedule["fest_week"])
        hard += bv
        report["warnings"] += bw
        report["bookings"] = bstats

    if ds.exams and (baseline is None or schedule.get("exams")):
        ev, epen = check_exams(ds, schedule.get("exams") or [])
        hard += ev
        report["exam_soft_penalty"] = epen

    if baseline is not None:
        b, _ = to_assign(baseline)
        report["stability"] = diff(b, assign, ds)

    seen, uniq = set(), []
    for x in hard:
        k = (x["rule"], x["detail"])
        if k not in seen:
            seen.add(k)
            uniq.append(x)

    report["hard_violations"] = uniq
    report["hard_violation_count"] = len(uniq)
    by_rule: dict[str, int] = {}
    for x in uniq:
        by_rule[x["rule"]] = by_rule.get(x["rule"], 0) + 1
    report["hard_by_rule"] = by_rule
    return report
