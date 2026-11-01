"""Midsem exam scheduler.

Rules (from the validator): every exam once, day in exam_week days, session in
{AM, PM}, rooms must allow exams, room capacity counts at HALF, a room can host one
exam per slot, a group can sit one exam per slot, and 5 soft points for every extra
exam a group has on the same day.
"""
from __future__ import annotations

from collections import defaultdict

from ortools.sat.python import cp_model

from .dataset import Dataset
from .exam_staff import assign_invigilators, faculty_available, room_available, slot_minutes


def solve_exams(ds: Dataset, time_limit: float = 60.0, seed: int = 20270131) -> dict:
    if not ds.exams:
        return {"status": "SKIPPED", "exams": [], "objective": 0}

    days = ds.exam_days
    slots = ds.exam_slots
    rooms = ds.exam_rooms()
    seats = {r: ds.exam_seats(r) for r in rooms}

    m = cp_model.CpModel()
    a = {}   # (exam, day, slot) -> bool
    b = {}   # (exam, room, day, slot) -> bool
    slot_vars = defaultdict(list)
    room_slot_vars = defaultdict(list)
    group_slot_vars = defaultdict(list)

    for e in ds.exams:
        eid = e["id"]
        vs = []
        for day in days:
            for slot in slots:
                v = m.NewBoolVar("")
                a[(eid, day, slot)] = v
                if e["duration_hours"] * 60 > slot_minutes(ds, slot):
                    m.Add(v == 0)
                vs.append(v)
                slot_vars[(day, slot)].append(v)
                for g in e["groups"]:
                    group_slot_vars[(g, day, slot)].append(v)
                for r in rooms:
                    bv = m.NewBoolVar("")
                    b[(eid, r, day, slot)] = bv
                    m.Add(bv <= v)
                    if not room_available(ds, r, day, slot):
                        m.Add(bv == 0)
                    room_slot_vars[(r, day, slot)].append(bv)
                m.Add(sum(b[(eid, r, day, slot)] * seats[r] for r in rooms) >= e["size"] * v)
        m.Add(sum(vs) == 1)

    for k, vs in room_slot_vars.items():
        m.Add(sum(vs) <= 1)
    for k, vs in group_slot_vars.items():
        m.Add(sum(vs) <= 1)

    # One invigilator per occupied room; accessibility can further restrict who can
    # supervise a non-accessible room. The full assignment is checked after solving.
    for day in days:
        for slot in slots:
            available = [f for f in ds.faculty if faculty_available(ds, f, day, slot)]
            usable_rooms = [b[(e["id"], r, day, slot)] for e in ds.exams for r in rooms]
            m.Add(sum(usable_rooms) <= len(available))
            non_accessible = [b[(e["id"], r, day, slot)] for e in ds.exams for r in rooms
                              if not ds.rooms[r].get("accessible")]
            m.Add(sum(non_accessible) <= sum(not ds.faculty[f].get("needs_accessible") for f in available))

    cost: list = []
    # 5 points per extra exam a group sits on the same day
    for g in ds.groups:
        for day in days:
            terms = [a[(e["id"], day, slot)] for e in ds.exams if g in e["groups"] for slot in slots]
            if not terms:
                continue
            cnt = m.NewIntVar(0, 12, "")
            m.Add(cnt == sum(terms))
            ex = m.NewIntVar(0, 12, "")
            m.Add(ex >= cnt - 1)
            cost.append(5 * ex)
    # keep rooms used per exam minimal (nicer output, no validator effect)
    cost.append(sum(b.values()))

    m.Minimize(sum(cost))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = seed
    st = solver.Solve(m)

    out = []
    if st in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for e in ds.exams:
            eid = e["id"]
            for day in days:
                for slot in slots:
                    if solver.Value(a[(eid, day, slot)]):
                        used = [r for r in rooms if solver.Value(b[(eid, r, day, slot)])]
                        out.append({"exam_id": eid, "day": day, "session": slot,
                                    "rooms": sorted(used)})
    if out:
        assigned, error = assign_invigilators(ds, out)
        if assigned is None:
            return {"status": "INFEASIBLE", "exams": [], "objective": None, "reason": error}
        out = assigned
    return {"status": solver.StatusName(st), "exams": out,
            "objective": int(solver.ObjectiveValue()) if out else None}
