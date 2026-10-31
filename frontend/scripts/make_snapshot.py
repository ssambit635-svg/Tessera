#!/usr/bin/env python3
"""Build `src/data/snapshot.json` — the read-only fixture the UI falls back to.

The backend is owned independently, so the frontend keeps a *snapshot* of real responses in
order to stay demonstrable when the API is not running (judging, screenshots, offline demo).
Nothing here writes to the backend: it only calls read endpoints and copies the dataset file
that already lives in the repository.

Usage:  python3 frontend/scripts/make_snapshot.py [--api http://127.0.0.1:8000]
        (or let it spin up the FastAPI test client, which needs `api/requirements.txt`)
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
FRONTEND = HERE.parent
REPO = FRONTEND.parent
API_DIR = REPO / "api"
OUT = FRONTEND / "src" / "data" / "snapshot.json"
DATASET = REPO / "vendor" / "cit_public.json"
SCHEDULE = REPO / "exports" / "schedule.json"

sys.path.insert(0, str(API_DIR))
os.environ.setdefault("LLM_PROVIDER", "none")


def client_for(api: str | None):
    if api:
        import httpx

        return httpx.Client(base_url=api, timeout=60), None

    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app), app


def gather(client) -> tuple:
    """Every read the UI needs, from whichever client we were given."""
    token = client.post("/api/auth/demo-login/admin").json()["token"]
    h = {"Authorization": f"Bearer {token}"}

    def get(path: str):
        r = client.get(path, headers=h)
        r.raise_for_status()
        return r.json()

    summary = get("/api/dataset/summary")
    entities = get("/api/dataset/entities")
    week = get("/api/timetable/week")
    bookings = get("/api/bookings")
    dashboard = get("/api/admin/dashboard")
    manual = get("/api/bookings/manual")
    accounts = client.get("/api/auth/accounts").json()
    ds = json.loads(DATASET.read_text(encoding="utf-8"))
    availability = {r["id"]: get(f"/api/dataset/rooms/{r['id']}/availability") for r in ds["rooms"]}
    return summary, entities, week, bookings, dashboard, manual, accounts, availability


def build(api: str | None) -> dict:
    ds = json.loads(DATASET.read_text(encoding="utf-8"))
    schedule = json.loads(SCHEDULE.read_text(encoding="utf-8"))

    if api:
        import httpx

        with httpx.Client(base_url=api, timeout=90) as c:
            responses = gather(c)
    else:
        from fastapi.testclient import TestClient
        from app.main import app

        with TestClient(app) as c:
            responses = gather(c)

    (summary, entities, week, bookings, dashboard, manual, accounts, availability) = responses

    courses = {c["id"]: c for c in ds["courses"]}
    rooms = {r["id"]: r for r in ds["rooms"]}
    faculty = {f["id"]: f for f in ds["faculty"]}
    groups = {g["id"]: g for g in ds["student_groups"]}

    def room_row(r: dict) -> dict:
        full = rooms.get(r["id"], {})
        return {
            "id": r["id"],
            "name": r.get("name") or full.get("name", r["id"]),
            "type": r.get("type") or full.get("type", "classroom"),
            "capacity": r.get("capacity") or full.get("capacity", 0),
            "building": r.get("building") or full.get("building", ""),
            "features": r.get("features") or full.get("features", []),
            "accessible": bool(r.get("accessible", full.get("accessible", False))),
            "allowedUses": full.get("allowed_uses", []),
            "availability": availability[r["id"]]["free_slots"],
            "busy": availability[r["id"]]["busy"],
        }

    room_rows = [room_row(r) for r in entities["rooms"]]

    session_rows = []
    faculty_sessions: dict[str, list[str]] = {f: [] for f in faculty}
    group_sessions: dict[str, list[str]] = {g: [] for g in groups}
    for e in week["entries"]:
        course = courses.get(e["course_id"], {})
        person = faculty.get(e["faculty_id"], {})
        session_rows.append({
            "id": e["session_id"],
            "courseId": e["course_id"],
            "courseTitle": course.get("title", e["course_id"]),
            "kind": e["kind"],
            "day": e["day"],
            "startPeriod": e["start_period"],
            "endPeriod": e["end_period"],
            "roomId": e["room_id"],
            "roomName": rooms.get(e["room_id"], {}).get("name", e["room_id"]),
            "building": rooms.get(e["room_id"], {}).get("building", ""),
            "facultyId": e["faculty_id"],
            "facultyName": person.get("name", e["faculty_id"]),
            "groupIds": e["groups"],
            "groupNames": [groups.get(g, {}).get("name", g) for g in e["groups"]],
            "size": e["size"],
            "department": course.get("department") or person.get("department") or "COMMON",
            "year": course.get("year"),
        })
        faculty_sessions.setdefault(e["faculty_id"], []).append(e["session_id"])
        for g in e["groups"]:
            group_sessions.setdefault(g, []).append(e["session_id"])

    faculty_rows = []
    for f in entities["faculty"]:
        full = faculty.get(f["id"], {})
        faculty_rows.append({
            "id": f["id"],
            "name": f["name"],
            "department": f["department"],
            "maxHoursPerDay": full.get("max_hours_per_day", 4),
            "needsAccessible": bool(full.get("needs_accessible")),
            "unavailable": full.get("unavailable", []),
            "preferences": full.get("preferences", []),
            "sessionIds": faculty_sessions.get(f["id"], []),
        })

    group_rows = []
    for g in entities["groups"]:
        full = groups.get(g["id"], {})
        group_rows.append({
            "id": g["id"],
            "name": g["name"],
            "year": g.get("year"),
            "department": g.get("department"),
            "size": g.get("size"),
            "needsAccessible": bool(full.get("needs_accessible")),
            "sessionIds": group_sessions.get(g["id"], []),
        })

    exam_courses = {e["id"]: e for e in ds["exams"]}
    exam_rows = []
    for e in schedule.get("exams", []):
        meta = exam_courses.get(e["exam_id"], {})
        exam_rows.append({
            "id": e["exam_id"],
            "courseIds": meta.get("course_ids", []),
            "courseTitles": [courses.get(c, {}).get("title", c) for c in meta.get("course_ids", [])],
            "groupIds": meta.get("groups", []),
            "groupNames": [groups.get(g, {}).get("name", g) for g in meta.get("groups", [])],
            "size": meta.get("size", 0),
            "durationHours": meta.get("duration_hours", 2),
            "day": e["day"],
            "slot": e["session"],
            "rooms": e["rooms"],
        })

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "datasetId": summary["summary"]["dataset_id"],
        "institute": ds["institute"],
        "team": schedule.get("team", "Voltryx"),
        "summary": summary["summary"],
        "calendar": {
            "days": week["days"],
            "periods": [{"id": p["id"], "start": p["start"], "end": p["end"],
                         "teaching": p.get("teaching", True)} for p in week["periods"]],
            "lunchAfterPeriod": week["lunch_after_period"],
            "lunch": summary["calendar"].get("lunch"),
            "labStartPeriods": summary["calendar"].get("lab_start_periods", []),
            "eventOnlyPeriods": summary["calendar"].get("event_only_periods", []),
            "festWeek": summary["calendar"].get("fest_week"),
            "examWeek": summary["calendar"].get("exam_week"),
        },
        "rooms": room_rows,
        "faculty": faculty_rows,
        "groups": group_rows,
        "courses": [{"id": c["id"], "title": c["title"], "department": c["department"],
                     "year": c["year"], "lectureHours": c["lecture_hours"],
                     "tutorialHours": c["tutorial_hours"], "labBlocks": c["lab_blocks"]}
                    for c in ds["courses"]],
        "sessions": session_rows,
        "bookings": bookings,
        "manualEvents": manual.get("events", []),
        "exams": exam_rows,
        "dashboard": {
            "counts": dashboard["counts"],
            "conflicts": dashboard["conflicts"],
            "soft": dashboard["soft"],
            "utilisation": dashboard["utilisation"],
            "busiestRooms": dashboard.get("busiest_rooms", []),
            "pendingProposals": dashboard.get("pending_proposals", 0),
            "risks": dashboard.get("risks", []),
        },
        "priorityOrder": summary.get("priority_order", []),
        "roleCategoryCap": summary.get("role_category_cap", {}),
        "demoAccounts": accounts.get("accounts", []),
        "unavailability": ds.get("room_unavailability", []),
        "cancellations": ds.get("cancellations", []),
    }


def main() -> None:
    api = None
    if "--api" in sys.argv:
        api = sys.argv[sys.argv.index("--api") + 1]
    payload = build(api)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(REPO)}  ({kb:.0f} KB, {len(payload['sessions'])} sessions, "
          f"{len(payload['rooms'])} rooms, {len(payload['bookings']['bookings'])} bookings)")


if __name__ == "__main__":
    main()
