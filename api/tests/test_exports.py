"""Guards the numbers we are judged on. Run: pytest -q"""
import json
import os
import subprocess
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.constraints import validate  # noqa: E402
from app.core.dataset import Dataset  # noqa: E402

DATA = os.path.join(ROOT, "vendor", "cit_public.json")
SCHEDULE = os.path.join(ROOT, "exports", "schedule.json")
VALIDATOR = os.path.join(ROOT, "vendor", "validator.py")


@pytest.fixture(scope="module")
def ds():
    return Dataset.load(DATA)


@pytest.fixture(scope="module")
def schedule():
    with open(SCHEDULE, encoding="utf-8") as f:
        return json.load(f)


def _official(tmpdir, args):
    out = os.path.join(str(tmpdir), "report.json")
    subprocess.run([sys.executable, VALIDATOR, "--data", DATA, "--schedule", SCHEDULE,
                    "--quiet", "--json", out, *args], check=True, capture_output=True)
    with open(out, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- the exported plan
def test_no_hard_violations(ds, schedule):
    rep = validate(ds, schedule)
    assert rep["hard_violation_count"] == 0, rep["hard_violations"][:5]


def test_soft_penalty_is_at_the_provable_minimum(ds, schedule):
    """3 is unavoidable: F08 is available on two days but teaches three CS204 lectures."""
    rep = validate(ds, schedule)
    assert rep["soft_penalties"]["S2"] == 0
    assert rep["soft_penalties"]["S3"] == 0
    assert rep["soft_penalties"]["S4"] <= 3
    assert rep["soft_total"] <= 3


def test_bookings(ds, schedule):
    b = validate(ds, schedule)["bookings"]
    assert b["approved"] >= 22
    assert b["priority_inversions"] == []
    assert b["booking_score"] >= 67
    decisions = {d["request_id"]: d for d in schedule["fest_week"]["bookings"]}
    assert decisions["BR-04"]["status"] == "rejected"                  # cancelled request
    assert decisions["BR-09"]["status"] == "rejected"                  # 1,200 > biggest room
    assert decisions["BR-17"]["status"] == "alternative_offered"       # window P13-P14 impossible


def test_every_exam_scheduled(ds, schedule):
    assert len(schedule["exams"]) == len(ds.exams)
    assert validate(ds, schedule)["exam_soft_penalty"] == 0


def test_every_session_scheduled_once(ds, schedule):
    ids = [s["session_id"] for s in schedule["sessions"]]
    assert len(ids) == len(set(ids)) == len(ds.sessions)


# ---------------------------------------------------------------- kernel vs organiser
def test_kernel_matches_official_validator(ds, schedule, tmp_path):
    ours = validate(ds, schedule)
    official = _official(tmp_path, [])
    assert ours["hard_by_rule"] == official["hard_by_rule"]
    assert ours["soft_penalties"] == official["soft_penalties"]
    assert ours["bookings"]["booking_score"] == official["bookings"]["booking_score"]


def test_kernel_catches_a_deliberate_break(ds, schedule):
    broken = json.loads(json.dumps(schedule))
    del broken["sessions"][0]
    assert validate(ds, broken)["hard_violation_count"] >= 1
