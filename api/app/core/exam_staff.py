"""Operational exam checks beyond the organiser's export validator.

The dataset has weekly room/faculty unavailable periods but no week-specific calendar.
We conservatively apply those restrictions to exam week by overlapping clock times. Each
exam room gets one invigilator (an explicit product assumption, not an organiser rule).
"""
from __future__ import annotations

from collections import defaultdict
from ortools.sat.python import cp_model
from .dataset import Dataset


def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def slot_minutes(ds: Dataset, slot: str) -> int:
    session = next((x for x in ds.exam_week.get("sessions", []) if x["id"] == slot), None)
    return _minutes(session["end"]) - _minutes(session["start"]) if session else 0


def exam_periods(ds: Dataset, slot: str) -> set[int]:
    session = next((x for x in ds.exam_week.get("sessions", []) if x["id"] == slot), None)
    if not session:
        return set()
    start, end = _minutes(session["start"]), _minutes(session["end"])
    return {p["id"] for p in ds.periods
            if _minutes(p["start"]) < end and start < _minutes(p["end"])}


def room_available(ds: Dataset, room: str, day: str, slot: str) -> bool:
    return not any((day, p) in ds.room_unavailable[room] for p in exam_periods(ds, slot))


def faculty_available(ds: Dataset, faculty: str, day: str, slot: str, room: str | None = None) -> bool:
    person = ds.faculty[faculty]
    return (not any((day, p) in ds.faculty_unavailable[faculty] for p in exam_periods(ds, slot))
            and (room is None or not person.get("needs_accessible") or ds.rooms[room].get("accessible")))


def room_restrictions(ds: Dataset, exams: list[dict]) -> list[str]:
    errors = []
    for exam in exams:
        for room in exam.get("rooms", []):
            if room in ds.rooms and not room_available(ds, room, exam.get("day"), exam.get("session")):
                errors.append(f"{exam.get('exam_id')}: {room} is unavailable on {exam.get('day')} {exam.get('session')}")
    return errors


def assign_invigilators(ds: Dataset, exams: list[dict], time_limit: float = 10) -> tuple[list[dict] | None, str | None]:
    """One suitable person per room, no overlapping duty or exceeding daily hours.

    Returns a copy of the placements with `invigilators` metadata, or a reason. The
    official validator ignores this additional field; it remains inspectable in the app.
    """
    if room_restrictions(ds, exams):
        return None, "; ".join(room_restrictions(ds, exams)[:3])
    slots = {s["id"]: s for s in ds.exam_week.get("sessions", [])}
    assignments = [(i, e, room) for i, e in enumerate(exams) for room in e.get("rooms", [])]
    model = cp_model.CpModel()
    variables = {}
    duties = defaultdict(list)
    daily = defaultdict(list)
    for i, exam, room in assignments:
        if exam.get("session") not in slots or room not in ds.rooms:
            return None, f"invalid exam slot or room for {exam.get('exam_id')}"
        if ds.exams_by_id[exam["exam_id"]]["duration_hours"] * 60 > slot_minutes(ds, exam["session"]):
            return None, f"{exam['exam_id']}: exam duration exceeds session length"
        choices = []
        for faculty in sorted(ds.faculty):
            if not faculty_available(ds, faculty, exam["day"], exam["session"], room):
                continue
            var = model.NewBoolVar(f"i_{i}_{room}_{faculty}")
            variables[i, room, faculty] = var
            choices.append(var)
            duties[faculty, exam["day"]].append((exam["session"], var))
            daily[faculty, exam["day"]].append((var, ds.exams_by_id[exam["exam_id"]]["duration_hours"]))
        if not choices:
            return None, f"no available invigilator for {exam['exam_id']} in {room}"
        model.Add(sum(choices) == 1)
    for (faculty, day), entries in duties.items():
        # Each distinct overlapping pair of sessions shares a constraint; the same
        # session always overlaps itself, even if teaching periods are missing.
        for slot in slots:
            simultaneous = [v for s, v in entries if s == slot]
            if simultaneous:
                model.Add(sum(simultaneous) <= 1)
        for index, first in enumerate(slots):
            a = slots[first]
            for second in list(slots)[index + 1:]:
                b = slots[second]
                if _minutes(a["start"]) < _minutes(b["end"]) and _minutes(b["start"]) < _minutes(a["end"]):
                    model.Add(sum(v for s, v in entries if s in (first, second)) <= 1)
        model.Add(sum(v * duration for v, duration in daily[faculty, day]) <=
                  ds.faculty[faculty].get("max_hours_per_day", 24))
    # Prefer balanced duties rather than repeatedly choosing the same faculty.
    max_duties = model.NewIntVar(0, len(assignments), "max_duties")
    for faculty in ds.faculty:
        model.Add(sum(v for (i, room, f), v in variables.items() if f == faculty) <= max_duties)
    model.Minimize(max_duties)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 1
    result = solver.Solve(model)
    if result not in (cp_model.FEASIBLE, cp_model.OPTIMAL):
        return None, f"could not assign invigilators ({solver.StatusName(result)})"
    output = [{**exam, "invigilators": []} for exam in exams]
    for (i, room, faculty), var in variables.items():
        if solver.Value(var):
            output[i]["invigilators"].append({"room_id": room, "faculty_id": faculty})
    for exam in output:
        exam["invigilators"].sort(key=lambda x: x["room_id"])
    return output, None


def invigilation_errors(ds: Dataset, exams: list[dict]) -> list[str]:
    errors = room_restrictions(ds, exams)
    uses = defaultdict(list)
    daily = defaultdict(int)
    slots = {s["id"]: s for s in ds.exam_week.get("sessions", [])}
    for exam in exams:
        duration = ds.exams_by_id.get(exam.get("exam_id"), {}).get("duration_hours", 0)
        if duration * 60 > slot_minutes(ds, exam.get("session")):
            errors.append(f"{exam.get('exam_id')}: exam duration exceeds session length")
        rooms = exam.get("rooms", [])
        people = exam.get("invigilators", [])
        if sorted(x.get("room_id") for x in people) != sorted(rooms):
            errors.append(f"{exam.get('exam_id')}: needs exactly one invigilator per room")
        for item in people:
            faculty, room, day, slot = item.get("faculty_id"), item.get("room_id"), exam.get("day"), exam.get("session")
            if faculty not in ds.faculty or room not in ds.rooms or slot not in slots:
                errors.append(f"{exam.get('exam_id')}: unknown invigilator, room or slot")
                continue
            if not faculty_available(ds, faculty, day, slot, room):
                errors.append(f"{exam.get('exam_id')}: {faculty} unavailable or room inaccessible")
            for old_slot in uses[faculty, day]:
                a, b = slots[slot], slots[old_slot]
                if _minutes(a["start"]) < _minutes(b["end"]) and _minutes(b["start"]) < _minutes(a["end"]):
                    errors.append(f"{faculty}: overlapping invigilation on {day}")
            uses[faculty, day].append(slot)
            daily[faculty, day] += ds.exams_by_id.get(exam.get("exam_id"), {}).get("duration_hours", 0)
    for (faculty, day), hours in daily.items():
        if hours > ds.faculty[faculty].get("max_hours_per_day", 24):
            errors.append(f"{faculty}: invigilation exceeds daily hours on {day}")
    return errors


def prepare_exam_schedule(ds: Dataset, exams: list[dict], time_limit: float = 20) -> tuple[list[dict] | None, str | None]:
    """Keep existing rooms/times where possible; re-solve only for unavailable rooms."""
    if not ds.exams:
        return [], None
    if not room_restrictions(ds, exams) and len(exams) == len(ds.exams):
        assigned, error = assign_invigilators(ds, exams)
        if assigned is not None:
            return assigned, None
    from .exams import solve_exams
    result = solve_exams(ds, time_limit=time_limit)
    if len(result["exams"]) != len(ds.exams):
        return None, result.get("reason") or f"exam scheduling {result['status']}"
    return result["exams"], None
