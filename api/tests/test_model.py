"""Property tests for the deterministic parts of the core."""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.bookings import decide_bookings  # noqa: E402
from app.core.dataset import Dataset  # noqa: E402
from app.core.solver import weekly_contact_hours  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


@pytest.fixture(scope="module")
def ds():
    return Dataset.load(os.path.join(ROOT, "vendor", "cit_public.json"))


def test_effective_category_only_goes_down(ds):
    club = {"role": "club", "requested_category": "institute_event", "submitted_at": "x"}
    assert ds.effective_category(club) == "club_event"
    fac = {"role": "faculty", "requested_category": "institute_event", "submitted_at": "x"}
    assert ds.effective_category(fac) == "guest_lecture"
    admin = {"role": "admin", "requested_category": "department_event", "submitted_at": "x"}
    assert ds.effective_category(admin) == "department_event"   # never raised


def test_outranks_uses_category_then_time(ds):
    early_club = {"role": "club", "requested_category": "club_event", "submitted_at": "2027-01-20T09:00"}
    late_club = {"role": "club", "requested_category": "club_event", "submitted_at": "2027-01-25T09:00"}
    dept = {"role": "department_coordinator", "requested_category": "department_event",
            "submitted_at": "2027-01-26T09:00"}
    assert ds.outranks(early_club, late_club)
    assert ds.outranks(dept, early_club)
    assert not ds.outranks(early_club, dept)


def test_every_session_has_a_legal_slot_and_room(ds):
    for s in ds.sessions.values():
        assert ds.time_slots(s), s["id"]
        assert ds.feasible_rooms(s), s["id"]


def test_lab_starts_and_lunch_rules(ds):
    for s in ds.sessions.values():
        for day, p, per in ds.time_slots(s):
            assert p >= 1 and per[-1] <= ds.last_period
            assert not (per[0] <= ds.lunch_after < per[-1])
            if s["kind"] == "lab":
                assert p in ds.lab_starts


def test_weekly_hours(ds):
    h = weekly_contact_hours(ds)
    assert all(v <= 21 for v in h.values())
    assert h["Y1-A"] == 21
    assert h["CE-3"] == 15          # basket sessions are counted once, not three times


def test_bookings_are_deterministic_and_respect_cancellations(ds):
    a = decide_bookings(ds)
    b = decide_bookings(ds)
    assert a["decisions"] == b["decisions"]
    cancelled = [d for d in a["decisions"] if d["request_id"] in ds.cancelled]
    assert all(d["status"] == "rejected" for d in cancelled)
