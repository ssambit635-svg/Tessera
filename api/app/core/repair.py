"""Minimal-move repair after a disruption, with a real infeasibility explanation.

The judge's metric is `stability.sessions_moved`: every session whose day, start period or
room differs from the baseline. So the repair is a CP-SAT model whose primary objective is
exactly that count:

    minimise   10_000 x (sessions that differ from the baseline)  +  soft penalty

Because the weight of one move is far larger than any soft penalty, the solver only trades
soft points when it can do so without moving an extra session. If a move is forced, the
solver prefers a room-only change over a time change (both count as one move, but a room
swap costs the students nothing).

If the disruption cannot be absorbed, `explain()` runs a second model built from
*assumption literals* - one per session - and asks OR-Tools for the sufficient set of
assumptions that caused infeasibility. That answers the question the problem statement
asks ("say which constraints are in conflict") with a computed answer rather than a guess.
"""
from __future__ import annotations

from collections import defaultdict

from ortools.sat.python import cp_model

from .dataset import Dataset
from .solver import _soft_gaps

MOVE_WEIGHT = 10_000


# --------------------------------------------------------------------------- helpers
def reservations_from_schedule(ds: Dataset, schedule: dict) -> tuple[set[tuple], set[tuple]]:
    """Room-periods and group-periods already promised to Spectra-week bookings."""
    reserved_rooms: set[tuple] = set()
    blocked_groups: set[tuple] = set()
    for d in schedule.get("fest_week", {}).get("bookings", []):
        if d.get("status") not in ("approved", "alternative_offered"):
            continue
        room, day = d.get("room_id"), d.get("day")
        start, end = d.get("start_period"), d.get("end_period")
        if not room or not day or not isinstance(start, int) or not isinstance(end, int):
            continue
        req = ds.requests.get(d.get("request_id"), {})
        for p in range(start, end + 1):
            reserved_rooms.add((room, day, p))
            for g in req.get("mandatory_for_groups", []):
                blocked_groups.add((g, day, p))
    return reserved_rooms, blocked_groups


def session_issues(ds: Dataset, sid: str, day: str, start: int, room: str,
                   reserved_rooms: set[tuple] | None = None,
                   blocked_groups: set[tuple] | None = None) -> list[str]:
    """Everything wrong with one placement under the current dataset (empty = fine)."""
    reserved_rooms = reserved_rooms or set()
    blocked_groups = blocked_groups or set()
    s = ds.sessions.get(sid)
    if s is None:
        return ["session no longer exists"]
    out: list[str] = []
    if day not in ds.days:
        return [f"invalid day {day}"]
    per = ds.periods_of(start, s["duration"])
    if per[-1] > ds.last_period:
        out.append(f"runs past P{ds.last_period}")
    r = ds.rooms.get(room)
    if r is None:
        return out + [f"unknown room {room}"]
    if r["capacity"] < s["size"]:
        out.append(f"room capacity {r['capacity']} < {s['size']}")
    if r["type"] not in s["room_types"]:
        out.append(f"room type {r['type']} not allowed")
    if s.get("needs_accessible") and not r.get("accessible"):
        out.append("room is not accessible")
    if s["kind"] == "lab" and start not in ds.lab_starts:
        out.append(f"lab may not start at P{start}")
    if per[0] <= ds.lunch_after < per[-1]:
        out.append("crosses lunch")
    fx = s.get("fixed_slot")
    if fx and (fx["day"] != day or fx["start_period"] != start):
        out.append("violates its fixed slot")
    for p in per:
        if (day, p) in ds.faculty_unavailable[s["faculty_id"]]:
            out.append(f"faculty {s['faculty_id']} unavailable {day} P{p}")
            break
    for p in per:
        if (day, p) in ds.room_unavailable[room]:
            out.append(f"room {room} unavailable {day} P{p}")
            break
    for p in per:
        if (room, day, p) in reserved_rooms:
            out.append(f"{room} {day} P{p} reserved by an approved booking")
            break
    for g in s["groups"]:
        for p in per:
            if (g, day, p) in blocked_groups:
                out.append(f"group {g} busy {day} P{p} with a booked event")
                break
    return out


def broken_sessions(ds: Dataset, baseline: dict[str, tuple], schedule: dict) -> dict[str, list[str]]:
    reserved_rooms, blocked_groups = reservations_from_schedule(ds, schedule)
    out = {}
    for sid, (day, start, room) in baseline.items():
        issues = session_issues(ds, sid, day, start, room, reserved_rooms, blocked_groups)
        if issues:
            out[sid] = issues
    return out


# --------------------------------------------------------------------------- model
def _build(ds: Dataset, baseline: dict[str, tuple], reserved_rooms: set[tuple],
           blocked_groups: set[tuple], enforce_s3: bool = True, soft_objective: bool = True,
           assumed: bool = False, use_hint: bool = False):
    m = cp_model.CpModel()
    occ_room = defaultdict(list)
    occ_fac = defaultdict(list)
    occ_grp = defaultdict(list)
    fac_day = defaultdict(list)
    hours_day = defaultdict(list)
    cost_terms: list = []

    baskets = sorted({s["basket_slot"] for s in ds.sessions.values() if s.get("basket_slot")})
    basket_members = {b: [s["id"] for s in ds.sessions.values() if s.get("basket_slot") == b] for b in baskets}
    basket_ids = {sid for b in baskets for sid in basket_members[b]}

    x: dict[tuple, cp_model.IntVar] = {}
    z: dict[tuple, cp_model.IntVar] = {}
    y: dict[tuple, cp_model.IntVar] = {}
    orig: dict[str, cp_model.IntVar] = {}
    assumption_of: dict[str, cp_model.IntVar] = {}

    def _require(vs, key):
        """Exactly one placement - enforced, or behind an assumption literal."""
        if not assumed:
            m.Add(sum(vs) == 1)
            return
        a = m.NewBoolVar(f"place__{key}")
        m.Add(sum(vs) == 1).OnlyEnforceIf(a)
        m.Add(sum(vs) == 0).OnlyEnforceIf(a.Not())
        assumption_of[key] = a

    def candidate_ok(s, day, per, room):
        for pp in per:
            if (day, pp) in ds.room_unavailable[room]:
                return False
            if (room, day, pp) in reserved_rooms:
                return False
            for g in s["groups"]:
                if (g, day, pp) in blocked_groups:
                    return False
        return True

    def add_cost(s, day, per, room, var):
        if not soft_objective:
            return
        before = baseline.get(s["id"])
        if before is not None and (day, before[1]) != before[:2]:
            cost_terms.append(var)                     # tie-break: keep the slot, swap the room
        r = ds.rooms[room]
        if r["capacity"] and s["size"] / r["capacity"] < 0.4:
            cost_terms.append(var)                     # S5
        if ds.last_period in per:
            cost_terms.append(var)                     # S6
        for pref in ds.faculty.get(s["faculty_id"], {}).get("preferences", []):
            if pref.get("type") != "avoid" or day not in pref.get("days", ds.days):
                continue
            hits = sum(1 for p in per if p in pref["periods"])
            if hits:
                cost_terms.append(2 * hits * var)      # S1

    for s in ds.sessions.values():
        if s["id"] in basket_ids:
            continue
        vs = []
        for day, p, per in ds.time_slots(s):
            for room in ds.feasible_rooms(s):
                if not candidate_ok(s, day, per, room):
                    continue
                v = m.NewBoolVar("")
                x[(s["id"], day, p, room)] = v
                vs.append(v)
                if baseline.get(s["id"]) == (day, p, room):
                    orig[s["id"]] = v
                for pp in per:
                    occ_room[(room, day, pp)].append(v)
                    occ_fac[(s["faculty_id"], day, pp)].append(v)
                    for g in s["groups"]:
                        occ_grp[(g, day, pp)].append(v)
                        hours_day[(g, day)].append(v)
                fac_day[(s["faculty_id"], day)].append(s["duration"] * v)
                add_cost(s, day, per, room, v)
        _require(vs, s["id"])

    for b in baskets:
        members = [ds.sessions[sid] for sid in basket_members[b]]
        groups_b = sorted({g for s in members for g in s["groups"]})
        dur = max(s["duration"] for s in members)
        starts = []
        for day, p, _ in ds.time_slots(members[0]):
            if not all(any(candidate_ok(s, day, ds.periods_of(p, s["duration"]), r)
                           for r in ds.feasible_rooms(s)) for s in members):
                continue
            yv = m.NewBoolVar("")
            y[(b, day, p)] = yv
            starts.append(yv)
            for pp in range(p, p + dur):
                for g in groups_b:
                    occ_grp[(g, day, pp)].append(yv)
            for s in members:
                per = ds.periods_of(p, s["duration"])
                zs = []
                for room in ds.feasible_rooms(s):
                    if not candidate_ok(s, day, per, room):
                        continue
                    zv = m.NewBoolVar("")
                    z[(s["id"], day, p, room)] = zv
                    zs.append(zv)
                    if baseline.get(s["id"]) == (day, p, room):
                        orig[s["id"]] = zv
                    for pp in per:
                        occ_room[(room, day, pp)].append(zv)
                        occ_fac[(s["faculty_id"], day, pp)].append(zv)
                    fac_day[(s["faculty_id"], day)].append(s["duration"] * zv)
                    add_cost(s, day, per, room, zv)
                m.Add(sum(zs) == yv)
        _require(starts, f"basket__{b}")

    for vs in occ_room.values():
        m.Add(sum(vs) <= 1)
    for vs in occ_fac.values():
        m.Add(sum(vs) <= 1)
    for vs in occ_grp.values():
        m.Add(sum(vs) <= 1)
    for (f, day), terms in fac_day.items():
        m.Add(sum(terms) <= ds.faculty[f].get("max_hours_per_day", 4))

    if enforce_s3:
        for (g, day), terms in hours_day.items():
            m.Add(sum(terms) <= 6)

    if soft_objective:
        # S2 (idle gaps) - the same encoding the generator uses
        _soft_gaps(m, ds, occ_grp, cost_terms, 6, None)
        # S4 (same lecture twice a day for a group)
        lect = defaultdict(list)
        for (sid, day, p, room), var in list(x.items()) + list(z.items()):
            sess = ds.sessions[sid]
            if sess["kind"] != "lecture":
                continue
            for g in sess["groups"]:
                lect[(g, sess["course_id"], day)].append(var)
        for _key, terms in lect.items():
            ex = m.NewIntVar(0, 10, "")
            m.Add(ex >= sum(terms) - 1)
            cost_terms.append(3 * ex)
        # S4 (same OE course twice on a day, across baskets)
        by_course = defaultdict(list)
        for b, members in basket_members.items():
            course = ds.sessions[members[0]]["course_id"]
            for (bb, day, p), yv in y.items():
                if bb == b:
                    by_course[(course, day)].append(yv)
        for _key, terms in by_course.items():
            if terms:
                ex = m.NewIntVar(0, 10, "")
                m.Add(ex >= sum(terms) - 1)
                cost_terms.append(3 * ex)

    if use_hint:
        # start the search from the baseline: moving as little as possible is the goal,
        # and an unguided solver happily returns a 19-move solution when 0 exists.
        for (sid, day, p, room), v in x.items():
            m.AddHint(v, 1 if baseline.get(sid) == (day, p, room) else 0)
        for (sid, day, p, room), v in z.items():
            m.AddHint(v, 1 if baseline.get(sid) == (day, p, room) else 0)
        for (b, day, p), v in y.items():
            mine = [sid for sid in basket_members.get(b, []) if baseline.get(sid)
                    and baseline[sid][:2] == (day, p)]
            m.AddHint(v, 1 if mine else 0)

    if assumed:
        m.AddAssumptions(list(assumption_of.values()))

    maps = {"x": x, "z": z, "y": y, "orig": orig, "baskets": baskets,
            "basket_members": basket_members, "assumption_of": assumption_of}
    return m, maps, cost_terms


def _move_expression(ds, baseline, maps):
    """(linear expression for the number of moved sessions, unavoidable constant)."""
    orig = maps["orig"]
    movable = [sid for sid in ds.sessions if baseline.get(sid) is not None]
    present = [sid for sid in movable if sid in ds.sessions]
    expr = []
    forced = 0
    for sid in present:
        if sid in orig:
            expr.append(1 - orig[sid])
        else:
            forced += 1          # its old placement no longer exists
    return expr, forced


def probe_zero_moves(ds: Dataset, baseline: dict[str, tuple], schedule: dict,
                     time_limit: float = 10.0, workers: int = 2, seed: int = 20270131) -> dict | None:
    """Is the baseline still valid as-is? If so, the answer is 0 moves - proven, in seconds."""
    reserved_rooms, blocked_groups = reservations_from_schedule(ds, schedule)
    m, maps, _cost = _build(ds, baseline, reserved_rooms, blocked_groups,
                            enforce_s3=True, use_hint=True)
    expr, forced = _move_expression(ds, baseline, maps)
    if forced:
        return None                      # an old placement no longer exists
    m.Add(sum(expr) == 0)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = workers
    solver.parameters.random_seed = seed
    st = solver.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None
    assign = {}
    for (sid, day, p, room), v in maps["x"].items():
        if solver.Value(v):
            assign[sid] = (day, p, room)
    for (sid, day, p, room), v in maps["z"].items():
        if solver.Value(v):
            assign[sid] = (day, p, room)
    return {"status": "OPTIMAL", "assignment": assign, "moved": [], "moves": 0, "forced": 0,
            "new_sessions": sorted(sid for sid in assign if sid not in baseline),
            "dropped_sessions": sorted(sid for sid in baseline if sid not in ds.sessions),
            "objective": 0, "polished": False, "wall_time": round(solver.WallTime(), 2),
            "reserved_rooms": len(reserved_rooms), "blocked_group_periods": len(blocked_groups)}


def repair(ds: Dataset, baseline: dict[str, tuple], schedule: dict,
           time_limit: float = 60.0, workers: int = 2, seed: int = 20270131,
           enforce_s3: bool = True, polish: bool = True,
           pins: dict[str, tuple[str, int]] | None = None) -> dict:
    """Minimal-move repair.

    `pins` forces a session onto a specific (day, start) while leaving the room to the
    solver - that is how a faculty "move my CS203 class to Wednesday P3" request is checked
    without inventing a session id (which the validator would reject).
    """
    reserved_rooms, blocked_groups = reservations_from_schedule(ds, schedule)
    m, maps, cost_terms = _build(ds, baseline, reserved_rooms, blocked_groups, enforce_s3,
                                 use_hint=True)
    pinned = {sid: tuple(pos) for sid, pos in (pins or {}).items() if sid in ds.sessions}
    for (sid, day, p, room), var in maps["x"].items():
        if sid in pinned and (day, p) != pinned[sid]:
            m.Add(var == 0)
    expr, forced = _move_expression(ds, baseline, maps)

    moves = sum(expr) + forced
    if cost_terms:
        m.Minimize(MOVE_WEIGHT * moves + sum(cost_terms))
    else:
        m.Minimize(MOVE_WEIGHT * moves)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = workers
    solver.parameters.random_seed = seed
    st = solver.Solve(m)
    status = solver.StatusName(st)

    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": status, "assignment": {}, "moved": [], "moves": None,
                "forced": forced, "wall_time": round(solver.WallTime(), 2)}

    # ---- phase 2 (lexicographic): locks the move count, then minimises the soft penalty
    # so a forced move does not leave a permanent hole in a group's day.
    polished = False
    import time as _time
    deadline = _time.time() + max(0.0, time_limit - solver.WallTime())
    if polish and cost_terms and deadline - _time.time() > 1.0:
        # exact move count of the phase-1 solution
        achieved = forced + sum(1 - solver.Value(v) for v in maps["orig"].values())
        m.Add(sum(expr) <= max(0, achieved - forced))
        m.ClearObjective()
        m.Minimize(sum(cost_terms))
        solver2 = cp_model.CpSolver()
        solver2.parameters.max_time_in_seconds = max(1.0, deadline - _time.time())
        solver2.parameters.num_search_workers = workers
        solver2.parameters.random_seed = seed
        st2 = solver2.Solve(m)
        if st2 in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            solver = solver2
            status = solver2.StatusName(st2)
            polished = True

    assign: dict[str, tuple] = {}
    for (sid, day, p, room), v in maps["x"].items():
        if solver.Value(v):
            assign[sid] = (day, p, room)
    for (sid, day, p, room), v in maps["z"].items():
        if solver.Value(v):
            assign[sid] = (day, p, room)

    moved = []
    for sid, (day, p, room) in sorted(assign.items()):
        before = baseline.get(sid)
        if before is None:
            continue
        if tuple(before) != (day, p, room):
            if before[:2] == (day, p):
                kind = "room_only"
            elif before[0] == day:
                kind = "period_changed"
            else:
                kind = "day_changed"
            moved.append({
                "session_id": sid,
                "kind": kind,
                "before": {"day": before[0], "start_period": before[1], "room_id": before[2]},
                "after": {"day": day, "start_period": p, "room_id": room},
            })

    return {
        "status": status,
        "assignment": assign,
        "moved": moved,
        "moves": len(moved),
        "forced": forced,
        "new_sessions": sorted(sid for sid in assign if sid not in baseline),
        "dropped_sessions": sorted(sid for sid in baseline if sid not in ds.sessions),
        "objective": None if polished else int(round(solver.ObjectiveValue())),
        "polished": polished,
        "wall_time": round(solver.WallTime(), 2),
        "reserved_rooms": len(reserved_rooms),
        "blocked_group_periods": len(blocked_groups),
    }


# --------------------------------------------------------------------------- diagnosis
def _diagnose_session(ds: Dataset, sid: str, reserved_rooms: set[tuple],
                      blocked_groups: set[tuple]) -> dict:
    s = ds.sessions[sid]
    slots = ds.time_slots(s)
    rooms = ds.feasible_rooms(s)
    open_rooms = [r for r in rooms
                  if any((r, day, p) not in reserved_rooms and (day, p) not in ds.room_unavailable[r]
                         for day, p, _per in slots)]
    out = {
        "session_id": sid,
        "faculty_id": s["faculty_id"],
        "groups": s["groups"],
        "kind": s["kind"],
        "duration": s["duration"],
        "rooms_that_fit": rooms,
        "open_rooms": open_rooms,
        "possible_slots": len(slots),
        "problems": [],
    }
    if not slots:
        if s.get("fixed_slot"):
            out["problems"].append(
                f"its fixed slot {s['fixed_slot']['day']} P{s['fixed_slot']['start_period']} "
                f"is not usable (faculty or room unavailable)")
        else:
            out["problems"].append(
                f"{s['faculty_id']} has no free window long enough ({s['duration']} periods) "
                f"for this session in the whole week")
    if not rooms:
        out["problems"].append(
            f"no room satisfies type {s['room_types']}, capacity >= {s['size']}"
            + (", accessibility" if s.get("needs_accessible") else ""))
    elif not open_rooms:
        out["problems"].append(
            f"every room that fits ({', '.join(rooms)}) is closed or promised to a booking "
            f"whenever the session could run")
    if not out["problems"]:
        out["problems"].append("no free slot once classes, bookings and the daily faculty cap are applied")
    return out


def explain(ds: Dataset, baseline: dict[str, tuple], schedule: dict,
            time_limit: float = 45.0, workers: int = 1) -> dict:
    """Compute a sufficient set of sessions whose simultaneous scheduling is impossible."""
    reserved_rooms, blocked_groups = reservations_from_schedule(ds, schedule)

    # 1. sessions that have no legal placement at all - always part of the answer
    hopeless = {sid: _diagnose_session(ds, sid, reserved_rooms, blocked_groups)
                for sid in ds.sessions}
    hopeless = {k: v for k, v in hopeless.items() if not v["open_rooms"] or not v["possible_slots"]}

    # 2. ask OR-Tools for a sufficient infeasibility assumption set
    core_ids: list[str] = []
    try:
        m, maps, _cost = _build(ds, baseline, reserved_rooms, blocked_groups,
                                enforce_s3=False, soft_objective=False, assumed=True)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit
        solver.parameters.num_search_workers = workers
        st = solver.Solve(m)
        if solver.StatusName(st) == "INFEASIBLE":
            idx = solver.SufficientAssumptionsForInfeasibility()
            by_index = list(maps["assumption_of"].items())
            core_ids = sorted({by_index[i][0].replace("basket__", "") for i in idx})
    except Exception:            # diagnosis must never take the app down
        core_ids = []

    core = sorted(set(core_ids) | set(hopeless))
    details = [_diagnose_session(ds, sid, reserved_rooms, blocked_groups)
               for sid in core if sid in ds.sessions]
    return {
        "feasible": False,
        "core_sessions": core,
        "core_size": len(core),
        "details": details,
        "suggestions": _suggestions(ds, details),
    }


def _suggestions(ds: Dataset, sessions: list[dict]) -> list[str]:
    """Concrete, data-derived ways out - the counterpart of 'no valid fix found'."""
    out: list[str] = []
    fac_missing = {s["faculty_id"] for s in sessions if s["possible_slots"] == 0}
    for fid in sorted(fac_missing):
        free = []
        for other in ds.faculty.values():
            if other["id"] == fid:
                continue
            load = sum(1 for s in ds.sessions.values() if s["faculty_id"] == other["id"])
            free.append((load, other["id"], other.get("department", "")))
        free.sort()
        picks = ", ".join(f"{i} ({load} sessions, {dept})" for load, i, dept in free[:3])
        out.append(f"{fid} has no usable window at all; possible substitutes with the lightest load: {picks}")

    closed_types = defaultdict(list)
    for s in sessions:
        if s["rooms_that_fit"] and not s["open_rooms"]:
            for r in s["rooms_that_fit"]:
                closed_types[ds.rooms[r]["type"]].append(s["session_id"])
    for rtype, sids in closed_types.items():
        all_rooms = [r for r in ds.rooms.values() if r["type"] == rtype]
        out.append(f"every {rtype} room is closed or reserved when {len(set(sids))} session(s) could run "
                   f"({', '.join(sorted(set(sids))[:4])}); reopening one of "
                   f"{[r['id'] for r in all_rooms]} removes the conflict")

    too_big = [s for s in sessions if not s["rooms_that_fit"]]
    if too_big:
        out.append("some sessions have no room that fits their type, size or accessibility need; "
                   "either relax the requirement for this week or add a suitable room to the dataset")

    if not out:
        out.append("the sessions above compete for the same faculty, room or group slots; "
                   "freeing one period in the change file, or allowing one session to move a week, "
                   "resolves it")
    return out


def repair_or_refuse(ds: Dataset, baseline: dict[str, tuple], schedule: dict,
                     time_limit: float = 60.0, workers: int = 2, seed: int = 20270131,
                     pins: dict[str, tuple[str, int]] | None = None) -> dict:
    """Try strict repair, then relaxed repair, then explain why nothing can be done."""
    attempts = []
    zero = None if pins else probe_zero_moves(ds, baseline, schedule,
                                             time_limit=min(12.0, time_limit / 4),
                                             workers=workers, seed=seed)
    if zero is not None:
        zero["attempts"] = [{"strategy": "no change needed", "status": "OPTIMAL", "moves": 0}]
        return zero

    result = repair(ds, baseline, schedule, time_limit=time_limit, workers=workers, seed=seed,
                    enforce_s3=True, pins=pins)
    attempts.append({"strategy": "minimal-move, group day capped at 6 h", "status": result["status"],
                     "moves": result["moves"]})
    if result["status"] in ("OPTIMAL", "FEASIBLE"):
        result["attempts"] = attempts
        return result

    result = repair(ds, baseline, schedule, time_limit=time_limit, workers=workers, seed=seed,
                    enforce_s3=False, pins=pins)
    attempts.append({"strategy": "minimal-move, 6 h cap relaxed", "status": result["status"],
                     "moves": result["moves"]})
    if result["status"] in ("OPTIMAL", "FEASIBLE"):
        result["attempts"] = attempts
        return result

    explanation = explain(ds, baseline, schedule, time_limit=max(20.0, time_limit / 2), workers=1)
    return {
        "status": "INFEASIBLE",
        "assignment": {},
        "moved": [],
        "moves": None,
        "attempts": attempts,
        "explanation": explanation,
    }
