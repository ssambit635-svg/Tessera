"""Phase 4: disruption handling, minimal-move repair, and the infeasibility explanation."""
import json
import os
import subprocess
import sys
import tempfile

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.constraints import validate  # noqa: E402
from app.core.dataset import Dataset  # noqa: E402
from app.core.disruption import apply_changes, load_disruption  # noqa: E402
from app.core.repair import (  # noqa: E402
    broken_sessions,
    probe_zero_moves,
    repair_or_refuse,
    reservations_from_schedule,
)

DATA = os.path.join(ROOT, "vendor", "cit_public.json")
SCHEDULE = os.path.join(ROOT, "exports", "schedule.json")
AFTER = os.path.join(ROOT, "exports", "schedule_after.json")
DISRUPTION = os.path.join(ROOT, "vendor", "sample_disruption.json")
VALIDATOR = os.path.join(ROOT, "vendor", "validator.py")

WEEK = list(range(1, 10))
ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI"]


@pytest.fixture(scope="module")
def ds():
    return Dataset.load(DATA)


@pytest.fixture(scope="module")
def schedule():
    with open(SCHEDULE, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def baseline(schedule):
    return {e["session_id"]: (e["day"], e["start_period"], e["room_id"])
            for e in schedule["sessions"]}


def _as_schedule(ds, result, base_schedule):
    return {
        "team": "Voltryx", "dataset_id": ds.dataset_id,
        "sessions": [{"session_id": sid, "day": d, "start_period": p, "room_id": r}
                     for sid, (d, p, r) in result["assignment"].items()],
        "fest_week": base_schedule.get("fest_week", {}),
        "exams": base_schedule.get("exams", []),
    }


def _official(schedule_path, extra=()):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "report.json")
        subprocess.run([sys.executable, VALIDATOR, "--data", DATA, "--schedule", schedule_path,
                        "--quiet", "--json", out, *extra], check=True, capture_output=True)
        with open(out, encoding="utf-8") as f:
            return json.load(f)


# ------------------------------------------------------------------ the committed export
def test_committed_schedule_after_is_valid(ds):
    rep = _official(AFTER, ["--disruption", DISRUPTION, "--baseline", SCHEDULE])
    assert rep["hard_violation_count"] == 0, rep["hard_violations"][:5]
    assert rep["stability"]["room_only_changed"] >= 1    # room swaps preferred over timetable churn
    assert rep["soft_total"] == 3                        # unchanged from the baseline


def test_committed_after_moves_exactly_its_lower_bound(ds, schedule):
    """The move count must equal the number of sessions the change actually broke - i.e.
    no cascade of extra rescheduling."""
    baseline = {e["session_id"]: (e["day"], e["start_period"], e["room_id"])
                for e in schedule["sessions"]}
    ds_after, _ = apply_changes(ds, load_disruption(DISRUPTION))
    broken = broken_sessions(ds_after, baseline, schedule)
    rep = _official(AFTER, ["--disruption", DISRUPTION, "--baseline", SCHEDULE])
    assert rep["stability"]["sessions_moved"] == len(broken)
    assert 0 < len(broken) <= 13


def test_committed_after_matches_our_kernel(ds, schedule):
    with open(AFTER, encoding="utf-8") as f:
        after = json.load(f)
    ds_after, _ = apply_changes(ds, load_disruption(DISRUPTION))
    ours = validate(ds_after, after, baseline=schedule)
    official = _official(AFTER, ["--disruption", DISRUPTION, "--baseline", SCHEDULE])
    assert ours["hard_by_rule"] == official["hard_by_rule"]
    assert ours["stability"]["sessions_moved"] == official["stability"]["sessions_moved"]


# ------------------------------------------------------------------ minimal-move repair
def test_sample_disruption_repairs_at_the_lower_bound(ds, schedule, baseline):
    ds_after, log = apply_changes(ds, load_disruption(DISRUPTION))
    broken = broken_sessions(ds_after, baseline, schedule)
    assert broken, "the sample disruption must break something"
    result = repair_or_refuse(ds_after, baseline, schedule, time_limit=40, workers=2)
    assert result["status"] == "OPTIMAL"
    # every broken session must move; nothing else may move
    assert result["moves"] == len(broken)
    after = _as_schedule(ds_after, result, schedule)
    rep = validate(ds_after, after, baseline=schedule)
    assert rep["hard_violation_count"] == 0
    assert rep["stability"]["sessions_moved"] == len(broken)


def test_unused_changes_move_nothing(ds, schedule, baseline):
    for changes in (
        [{"type": "remove_session", "session_id": "HS201-H2-L2"}],
        [{"type": "add_faculty", "faculty": {"id": "F41", "name": "New", "department": "CSE",
                                            "max_hours_per_day": 4, "unavailable": [],
                                            "preferences": []}}],
        [{"type": "add_session", "session": {
            "id": "NEW-1", "course_id": "CS202", "kind": "tutorial", "groups": ["CSE-2"],
            "faculty_id": "F06", "size": 80, "duration": 1,
            "room_types": ["classroom", "lecture_hall", "auditorium"]}}],
    ):
        ds_after, _ = apply_changes(ds, changes)
        result = repair_or_refuse(ds_after, baseline, schedule, time_limit=25, workers=2)
        assert result["moves"] == 0, changes
        after = _as_schedule(ds_after, result, schedule)
        assert validate(ds_after, after, baseline=schedule)["hard_violation_count"] == 0


def test_added_session_with_fixed_slot_lands_there(ds, schedule, baseline):
    changes = [{"type": "add_session", "session": {
        "id": "NEW-2", "course_id": "CS202", "kind": "tutorial", "groups": ["CSE-2"],
        "faculty_id": "F06", "size": 80, "duration": 1,
        "room_types": ["classroom", "lecture_hall", "auditorium"],
        "fixed_slot": {"day": "TUE", "start_period": 3}}}]
    ds_after, _ = apply_changes(ds, changes)
    result = repair_or_refuse(ds_after, baseline, schedule, time_limit=25, workers=2)
    day, start, _room = result["assignment"]["NEW-2"]
    assert (day, start) == ("TUE", 3)
    after = _as_schedule(ds_after, result, schedule)
    assert validate(ds_after, after, baseline=schedule)["hard_violation_count"] == 0


def test_removed_sessions_disappear_from_the_export(ds, schedule, baseline):
    ds_after, _ = apply_changes(ds, [{"type": "remove_session", "session_id": "CE303-L1"}])
    result = repair_or_refuse(ds_after, baseline, schedule, time_limit=20, workers=2)
    assert "CE303-L1" not in result["assignment"]
    assert result["dropped_sessions"] == ["CE303-L1"]


def test_repair_is_stable_across_runs(ds, schedule, baseline):
    """The move count must not depend on solver luck; the exact slot may differ between
    equally-optimal solutions (CP-SAT is time-bounded, not bit-reproducible)."""
    ds_after, _ = apply_changes(ds, load_disruption(DISRUPTION))
    runs = [repair_or_refuse(ds_after, baseline, schedule, time_limit=30, workers=2)
            for _ in range(2)]
    assert runs[0]["moves"] == runs[1]["moves"]
    for run in runs:
        after = _as_schedule(ds_after, run, schedule)
        assert validate(ds_after, after, baseline=schedule)["hard_violation_count"] == 0


def test_bookings_stay_reserved(ds, schedule, baseline):
    """A repair may not move a class into a room-period promised to an approved booking."""
    reserved, blocked = reservations_from_schedule(ds, schedule)
    assert reserved, "the baseline schedule has approved bookings"
    ds_after, _ = apply_changes(ds, load_disruption(DISRUPTION))
    result = repair_or_refuse(ds_after, baseline, schedule, time_limit=30, workers=2)
    for sid, (day, start, room) in result["assignment"].items():
        s = ds_after.sessions[sid]
        for p in range(start, start + s["duration"]):
            assert (room, day, p) not in reserved, f"{sid} landed on booking slot {room} {day} P{p}"


# ------------------------------------------------------------------ infeasibility
def test_impossible_change_is_refused_with_a_core(ds, schedule, baseline):
    changes = [{"type": "room_unavailable", "room_id": "PHY-LAB", "days": ALL_DAYS,
                "periods": WEEK, "reason": "lab closed for the term"}]
    ds_after, _ = apply_changes(ds, changes)
    result = repair_or_refuse(ds_after, baseline, schedule, time_limit=20, workers=2)
    assert result["status"] == "INFEASIBLE"
    assert result["assignment"] == {}                      # never export a broken timetable
    core = result["explanation"]["core_sessions"]
    assert set(core) >= {"PH191-A-P1", "PH191-B-P1", "PH191-C-P1", "PH191-D-P1"}
    assert result["explanation"]["suggestions"]
    assert any("PHY-LAB" in s for s in result["explanation"]["suggestions"])


def test_explanation_names_a_missing_room_type(ds, schedule, baseline):
    changes = [{"type": "room_unavailable", "room_id": "MECH-WS", "days": ALL_DAYS,
                "periods": WEEK, "reason": "workshop closed"}]
    ds_after, _ = apply_changes(ds, changes)
    result = repair_or_refuse(ds_after, baseline, schedule, time_limit=20, workers=2)
    assert result["status"] == "INFEASIBLE"
    details = {d["session_id"]: d for d in result["explanation"]["details"]}
    assert any(sid.startswith("WS101") or sid.startswith("ME29") for sid in details)


# ------------------------------------------------------------------ change-file hygiene
def test_unknown_ids_are_rejected_loudly(ds):
    with pytest.raises(ValueError):
        apply_changes(ds, [{"type": "faculty_unavailable", "faculty_id": "F99",
                            "days": ["MON"], "periods": [1]}])
    with pytest.raises(ValueError):
        apply_changes(ds, [{"type": "room_unavailable", "room_id": "NOPE",
                            "days": ["MON"], "periods": [1]}])
    with pytest.raises(ValueError):
        apply_changes(ds, [{"type": "remove_session", "session_id": "NOPE"}])
    with pytest.raises(ValueError):
        apply_changes(ds, [{"type": "teleport_room", "room_id": "AUD"}])


def test_duplicate_ids_are_rejected(ds):
    with pytest.raises(ValueError):
        apply_changes(ds, [{"type": "add_session", "session": json.loads(
            json.dumps(ds.sessions[[*ds.sessions][0]]))}])


def test_probe_zero_moves_returns_none_when_something_is_broken(ds, schedule, baseline):
    ds_after, _ = apply_changes(ds, load_disruption(DISRUPTION))
    assert probe_zero_moves(ds_after, baseline, schedule, time_limit=8, workers=2) is None
