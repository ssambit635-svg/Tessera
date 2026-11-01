from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import current_user
from ..core.exam_staff import invigilation_errors
from ..services import state

router = APIRouter(prefix="/api/exams", tags=["exams"])


@router.get("")
def exams(day: str | None = None, session_id: str | None = None,
          user=Depends(current_user)):
    ds = state.dataset()
    schedule = state.current_cached()
    placed = {e["exam_id"]: e for e in schedule.get("exams", [])}
    rows = []
    for exam in ds.exams:
        placement = placed.get(exam["id"])
        row = {
            "exam_id": exam["id"],
            "course_ids": exam["course_ids"],
            "groups": exam["groups"],
            "size": exam["size"],
            "duration_hours": exam["duration_hours"],
            "day": (placement or {}).get("day"),
            "session": (placement or {}).get("session"),
            "rooms": (placement or {}).get("rooms", []),
            "invigilators": (placement or {}).get("invigilators", []),
            "seats": sum(ds.exam_seats(r) for r in (placement or {}).get("rooms", [])),
        }
        if day and row["day"] != day:
            continue
        if session_id and row["session"] != session_id:
            continue
        rows.append(row)
    return {
        "exam_week": ds.exam_week,
        "staffing_assumption": "One available invigilator per room; weekly unavailability is conservatively applied to exam week.",
        "operational_errors": invigilation_errors(ds, list(placed.values())),
        "count": len(rows),
        "unscheduled": [r["exam_id"] for r in rows if r["day"] is None],
        "exams": rows,
    }
