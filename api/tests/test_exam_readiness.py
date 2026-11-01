"""Operational exam readiness is stricter than the organiser validator."""
import copy
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.dataset import Dataset
from app.core.disruption import apply_changes
from app.core.exam_staff import exam_periods, invigilation_errors, prepare_exam_schedule

ROOT = Path(__file__).resolve().parents[2]


def test_app_generated_exports_have_safe_room_and_faculty_assignments():
    ds = Dataset.load(str(ROOT / "vendor/cit_public.json"))
    before = json.loads((ROOT / "exports/schedule.json").read_text())
    after = json.loads((ROOT / "exports/schedule_after.json").read_text())
    changes = json.loads((ROOT / "vendor/sample_disruption.json").read_text())["changes"]
    ds_after, _ = apply_changes(ds, changes)
    assert exam_periods(ds, "AM") == {2, 3, 4}
    assert exam_periods(ds, "PM") == {6, 7}
    for data, schedule in ((ds, before), (ds_after, after)):
        exams = schedule["exams"]
        assert len(exams) == len(data.exams)
        assert all(len(e["invigilators"]) == len(e["rooms"]) for e in exams)
        assert invigilation_errors(data, exams) == []


def test_detects_missing_duplicate_and_unavailable_staff_and_rooms():
    ds = Dataset.load(str(ROOT / "vendor/cit_public.json"))
    exams = json.loads((ROOT / "exports/schedule.json").read_text())["exams"]
    missing = copy.deepcopy(exams)
    missing[0]["invigilators"] = []
    assert any("one invigilator" in e for e in invigilation_errors(ds, missing))
    changed = copy.deepcopy(exams)
    exam = next(e for e in changed if len(e["invigilators"]) >= 2)
    exam["invigilators"][1]["faculty_id"] = exam["invigilators"][0]["faculty_id"]
    assert any("overlapping" in e for e in invigilation_errors(ds, changed))
    room_change, _ = apply_changes(ds, [{"type": "room_unavailable", "room_id": exams[0]["rooms"][0],
        "days": [exams[0]["day"]], "periods": sorted(exam_periods(ds, exams[0]["session"]))}])
    assert any("unavailable" in e for e in invigilation_errors(room_change, exams))
    faculty = exams[0]["invigilators"][0]["faculty_id"]
    fac_change, _ = apply_changes(ds, [{"type": "faculty_unavailable", "faculty_id": faculty,
        "days": [exams[0]["day"]], "periods": sorted(exam_periods(ds, exams[0]["session"]))}])
    assert any(faculty in e for e in invigilation_errors(fac_change, exams))
    repaired, error = prepare_exam_schedule(fac_change, exams)
    assert error is None and invigilation_errors(fac_change, repaired) == []


def test_scheduling_refuses_when_no_invigilator_is_available():
    from app.core.exams import solve_exams
    original = json.loads((ROOT / "vendor/cit_public.json").read_text())
    original["faculty"] = []
    result = solve_exams(Dataset(original), time_limit=2)
    assert result["exams"] == []
    assert result["status"] in ("INFEASIBLE", "UNKNOWN")


def test_confirmed_manual_bookings_are_reserved_by_repair_kernel():
    from app.core.repair import reservations_from_schedule
    ds = Dataset.load(str(ROOT / "vendor/cit_public.json"))
    schedule = {"fest_week": {"bookings": []}, "_manual_events": [
        {"status": "confirmed", "room_id": "LH-1", "day": "MON", "start_period": 2,
         "end_period": 3, "groups": ["Y1-A"]},
        {"status": "cancelled", "room_id": "LH-2", "day": "MON", "start_period": 2,
         "end_period": 3, "groups": ["Y1-B"]}]}
    rooms, groups = reservations_from_schedule(ds, schedule)
    assert ("LH-1", "MON", 2) in rooms and ("LH-1", "MON", 3) in rooms
    assert ("Y1-A", "MON", 2) in groups and ("Y1-A", "MON", 3) in groups
    assert ("LH-2", "MON", 2) not in rooms and ("Y1-B", "MON", 2) not in groups
