"""Writes schedule.json in the official export format.

This module is the ONLY writer of files in exports/ - the app-generated guarantee.
"""
from __future__ import annotations

import json
import os


def build_schedule(ds, assignment: dict, booking_result: dict, exam_result: dict,
                   team: str = "Voltryx") -> dict:
    sessions = [
        {"session_id": sid, "day": day, "start_period": p, "room_id": room}
        for sid, (day, p, room) in sorted(assignment.items())
    ]
    return {
        "team": team,
        "dataset_id": ds.dataset_id,
        "sessions": sessions,
        "fest_week": {
            "bookings": booking_result["decisions"],
            "session_overrides": [],
        },
        "exams": exam_result.get("exams", []),
    }


def write_schedule(schedule: dict, path: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(schedule, f, indent=2)
    return path
