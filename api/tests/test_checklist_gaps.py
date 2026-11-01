"""Regression tests for core checklist findings."""
import json
from pathlib import Path

import pytest

# Reuse the isolated temporary database and scratch exports from the API tests.
from test_api import ROOT, client, login  # noqa: F401


@pytest.fixture(autouse=True)
def reset_demo(client):
    admin, _ = login(client, "admin")
    assert client.post("/api/admin/reset", headers=admin).status_code == 200
    # Clean up events even if a test fails before reset.
    def cancel_events():
        for event in client.get("/api/bookings/manual", headers=admin).json()["events"]:
            if event["status"] == "confirmed":
                assert client.delete(f"/api/bookings/manual/{event['id']}", headers=admin).status_code == 200
    cancel_events()
    yield
    cancel_events()
    assert client.post("/api/admin/reset", headers=admin).status_code == 200


def test_password_auth_and_faculty_account(client):
    bad = client.post("/api/auth/login", json={"email": "admin@cit.edu", "password": "wrong"})
    assert bad.status_code == 401 and "wrong email or password" in bad.json()["detail"]
    good = client.post("/api/auth/login", json={"email": "faculty@cit.edu", "password": "Tessera@2027"})
    assert good.status_code == 200
    user = good.json()["user"]
    assert user["role"] == "faculty" and user["faculty_id"]
    headers = {"Authorization": "Bearer " + good.json()["token"]}
    assert client.get("/api/auth/me", headers=headers).json()["user"]["id"] == user["id"]
    assert client.get("/api/timetable", headers={"Authorization": "Bearer invalid"}).status_code == 401


def test_dashboard_class_utilisation_matches_schedule(client):
    headers, _ = login(client, "admin")
    dashboard = client.get("/api/admin/dashboard", headers=headers).json()
    dataset = json.loads((Path(ROOT) / "vendor/cit_public.json").read_text())
    schedule = client.get("/api/admin/exports/schedule.json", headers=headers).json()
    durations = {s["id"]: s["duration"] for s in dataset["sessions"]}
    for row in dashboard["utilisation"]:
        rid = row["room_id"]
        entries = [s for s in schedule["sessions"] if s["room_id"] == rid]
        hours = sum(durations[s["session_id"]] for s in entries)
        teaching = [p["id"] for p in dataset["calendar"]["periods"] if p["teaching"]]
        closed = {(u["day"], p) for u in dataset["room_unavailability"] if u["room_id"] == rid for p in u["periods"]}
        available = {(d, p) for d in dataset["calendar"]["days"] for p in teaching} - closed
        occupied = {(s["day"], p) for s in entries
                    for p in range(s["start_period"], s["start_period"] + durations[s["session_id"]])}
        occupied |= {(b["day"], p) for b in schedule["fest_week"]["bookings"]
                     if b.get("status") in ("approved", "alternative_offered") and b.get("room_id") == rid
                     for p in range(b["start_period"], b["end_period"] + 1)}
        assert (row["sessions"], row["hours"]) == (len(entries), hours)
        assert row["available_periods"] == len(available)
        assert row["occupied_periods"] == len(occupied & available)
        expected = round(len(occupied & available) / len(available), 3) if available else 0
        assert row["utilisation"] == expected


def test_manual_booking_rejects_period_zero(client):
    headers, _ = login(client, "club")
    response = client.post("/api/bookings/manual", headers=headers, json={
        "attendance": 40, "duration_periods": 1,
        "windows": [{"day": "MON", "from_period": 0, "to_period": 0}]})
    assert response.status_code in (409, 422), response.json()


def test_manual_booking_does_not_silently_replace_named_room(client):
    headers, _ = login(client, "club")
    response = client.post("/api/bookings/manual", headers=headers, json={
        "attendance": 40, "duration_periods": 1, "room_id": "NO-SUCH-ROOM",
        "windows": [{"day": "MON", "from_period": 10, "to_period": 10}]})
    assert response.status_code in (409, 422), response.json()


def test_manual_events_do_not_double_book_mandatory_group(client):
    headers, _ = login(client, "club")
    body = {"attendance": 40, "duration_periods": 1, "mandatory_for_groups": ["Y1-A"],
            "windows": [{"day": "MON", "from_period": 10, "to_period": 10}]}
    first = client.post("/api/bookings/manual", headers=headers, json=body)
    assert first.status_code == 200, first.text
    second = client.post("/api/bookings/manual", headers=headers, json=body)
    assert second.status_code == 409, second.json()


def test_applied_proposal_is_visible_in_timetable_view(client):
    admin, _ = login(client, "admin")
    dean, _ = login(client, "admin", email="dean@cit.edu")
    changes = json.loads((Path(ROOT) / "vendor/sample_disruption.json").read_text())["changes"]
    response = client.post("/api/disruption/preview", headers=admin,
                           json={"changes": changes, "title": "check view", "time_limit": 30})
    assert response.status_code == 200 and response.json()["valid"], response.text
    proposal = response.json()
    assert proposal["moved"]
    other = client.post("/api/disruption/preview", headers=admin,
                        json={"changes": changes, "title": "stale proposal", "time_limit": 30})
    assert other.status_code == 200 and other.json()["valid"], other.text
    # A booking made after preview must not be displaced by the approved repair.
    dataset = json.loads((Path(ROOT) / "vendor/cit_public.json").read_text())
    sessions = {row["id"]: row for row in dataset["sessions"]}
    event = None
    for moved in proposal["moved"]:
        after_slot = moved["after"]
        duration = sessions[moved["session_id"]]["duration"]
        request = {"attendance": 1, "duration_periods": duration, "room_id": after_slot["room_id"],
                   "windows": [{"day": after_slot["day"], "from_period": after_slot["start_period"],
                                "to_period": after_slot["start_period"] + duration - 1}]}
        created = client.post("/api/bookings/manual", headers=admin, json=request)
        if created.status_code == 200:
            event = created.json()["created"]
            break
    assert event, "expected a free baseline slot targeted by the repair"
    blocked = client.post(f"/api/disruption/{proposal['proposal_id']}/apply", headers=dean)
    assert blocked.status_code == 409 and event["id"] in blocked.json()["detail"]
    assert client.delete(f"/api/bookings/manual/{event['id']}", headers=admin).status_code == 200
    applied = client.post(f"/api/disruption/{proposal['proposal_id']}/apply", headers=dean)
    assert applied.status_code == 200, applied.text
    after = client.get("/api/admin/exports/schedule_after.json", headers=admin).json()
    sid = proposal["moved"][0]["session_id"]
    expected = next(s for s in after["sessions"] if s["session_id"] == sid)
    week = client.get("/api/timetable/week", headers=admin).json()["entries"]
    shown = next(s for s in week if s["session_id"] == sid)
    assert (shown["day"], shown["start_period"], shown["room_id"]) == (expected["day"], expected["start_period"], expected["room_id"])
    assert len(week) == 190
    assert any(row["session_id"] == "CS202-T2" for row in week)
    assert client.get("/api/timetable/validate", headers=admin).json()["hard_violations"] == 0
    assert client.get("/api/admin/dashboard", headers=admin).json()["counts"]["scheduled"] == 190
    stale = client.post(f"/api/disruption/{other.json()['proposal_id']}/apply", headers=dean)
    assert stale.status_code == 409 and "preview it again" in stale.json()["detail"]


def test_reset_clears_confirmed_manual_events(client):
    admin, _ = login(client, "admin")
    event = client.post("/api/bookings/manual", headers=admin, json={
        "attendance": 10, "duration_periods": 1,
        "windows": [{"day": "MON", "from_period": 10, "to_period": 10}]})
    assert event.status_code == 200, event.text
    assert client.post("/api/admin/reset", headers=admin).status_code == 200
    assert client.get("/api/bookings/manual", headers=admin).json()["count"] == 0


def test_role_caps_and_ownership_are_enforced_server_side(client):
    club, _ = login(client, "club")
    faculty, faculty_user = login(client, "faculty")
    data = client.get("/api/timetable/week", headers=faculty).json()["entries"]
    other = next(row for row in data if row["faculty_id"] != faculty_user["user"]["faculty_id"])
    attempt = client.post("/api/disruption/move", headers=faculty, json={
        "session_id": other["session_id"], "day": other["day"], "start_period": other["start_period"]})
    assert attempt.status_code == 403
    impersonation = client.post("/api/ai/change-request", headers=faculty, json={
        "faculty_id": other["faculty_id"], "text": "I can't come on Monday P2"})
    assert impersonation.status_code == 403
    parsed = client.post("/api/ai/parse", headers=club, json={
        "role": "admin", "text": "institute event on Monday at 6 pm for 30 people"}).json()
    assert parsed["category_cap"]["requested"] == "institute_event"
    assert parsed["category_cap"]["effective"] == "club_event"
    created = client.post("/api/bookings/manual", headers=club, json={"attendance": 10,
        "duration_periods": 1, "windows": [{"day": "MON", "from_period": 10, "to_period": 10}]})
    assert created.status_code == 200
    assert client.delete(f"/api/bookings/manual/{created.json()['created']['id']}", headers=faculty).status_code == 403


def test_pending_approval_count_tracks_proposal_state(client):
    admin, _ = login(client, "admin")
    dean, _ = login(client, "admin", email="dean@cit.edu")
    before = client.get("/api/admin/dashboard", headers=admin).json()
    assert before["pending_proposals"] == 0
    proposal = client.post("/api/disruption/preview", headers=admin, json={
        "changes": [{"type": "add_faculty", "faculty": {"id": "TEST-FACULTY", "name": "New",
                     "department": "CSE", "max_hours_per_day": 4, "unavailable": [], "preferences": []}}],
        "time_limit": 20})
    assert proposal.status_code == 200 and proposal.json()["valid"], proposal.text
    assert client.get("/api/admin/dashboard", headers=admin).json()["pending_proposals"] == 1
    assert client.post(f"/api/disruption/{proposal.json()['proposal_id']}/reject", headers=dean).status_code == 200
    assert client.get("/api/admin/dashboard", headers=admin).json()["pending_proposals"] == 0


def test_manual_booking_works_after_provider_failure(client, monkeypatch):
    from app.ai import parser as parser_module
    from app.ai.providers import GroqProvider
    from app.config import reset_settings_cache
    from test_llm import fake_transport
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_key_not_real")
    reset_settings_cache()
    monkeypatch.setattr(parser_module, "get_provider", lambda: GroqProvider(transport=fake_transport(status=429)))
    club, _ = login(client, "club")
    response = client.post("/api/ai/parse", headers=club, json={
        "text": "Need a room for 30 people on Monday 6 to 7 pm"})
    assert response.status_code == 200, response.text
    assert response.json()["source"]["llm"] is None
    assert any("AI reader unavailable" in warning for warning in response.json()["warnings"])
    booking = client.post("/api/bookings/manual", headers=club, json={"attendance": 30,
        "duration_periods": 1, "windows": [{"day": "MON", "from_period": 10, "to_period": 10}]})
    assert booking.status_code == 200 and booking.json()["created"]["status"] == "confirmed"
    monkeypatch.undo()
    reset_settings_cache()


def test_logout_revokes_only_the_presented_token(client):
    first, _ = login(client, "admin")
    second, _ = login(client, "admin")
    assert first != second
    assert client.post("/api/auth/logout", headers=first).status_code == 200
    assert client.get("/api/auth/me", headers=first).status_code == 401
    assert client.get("/api/auth/me", headers=second).status_code == 200


def test_demo_login_can_be_disabled(client, monkeypatch):
    from app.config import reset_settings_cache
    with monkeypatch.context() as patch:
        patch.setenv("DEMO_LOGIN_ENABLED", "false")
        reset_settings_cache()
        assert client.post("/api/auth/demo-login/admin").status_code == 403
        assert client.post("/api/auth/login", json={"email": "admin@cit.edu", "password": "Tessera@2027"}).status_code == 200
    reset_settings_cache()


def test_concurrent_manual_requests_cannot_both_claim_same_room(client):
    from concurrent.futures import ThreadPoolExecutor
    headers, _ = login(client, "club")
    body = {"attendance": 10, "room_id": "SH-1", "duration_periods": 1,
            "windows": [{"day": "MON", "from_period": 13, "to_period": 13}]}
    check = client.post("/api/bookings/manual/check", headers=headers, json=body).json()
    assert check["ok"], check
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post("/api/bookings/manual", headers=headers, json=body), range(2)))
    assert sorted(r.status_code for r in results) == [200, 409], [r.text for r in results]
