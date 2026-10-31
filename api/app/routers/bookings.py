from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..auth import current_user
from ..core.dataset import CAT_WEIGHT
from ..services import state

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


@router.get("")
def list_bookings(status: str | None = None, user: User = Depends(current_user)):
    ds = state.dataset()
    schedule = state.current_cached()
    decisions = (schedule.get("fest_week") or {}).get("bookings", [])
    by_id = {d["request_id"]: d for d in decisions}
    out = []
    for req in ds.requests.values():
        decision = by_id.get(req["id"], {"request_id": req["id"], "status": "undecided"})
        effective = ds.effective_category(req)
        item = {
            "request_id": req["id"],
            "title": req.get("title"),
            "requester": req.get("requester"),
            "role": req.get("role"),
            "submitted_at": req.get("submitted_at"),
            "requested_category": req.get("requested_category"),
            "effective_category": effective,
            "category_note": (None if effective == req.get("requested_category")
                              else f"capped by role '{req.get('role')}' to {effective}"),
            "weight": CAT_WEIGHT.get(effective, 0),
            "attendance": req.get("attendance"),
            "duration_periods": req.get("duration_periods"),
            "windows": req.get("windows"),
            "needs": req.get("needs"),
            "room_types": req.get("room_types"),
            "requested_room": req.get("requested_room"),
            "mandatory_for_groups": req.get("mandatory_for_groups"),
            "raw_text": req.get("raw_text"),
            "cancelled": req["id"] in ds.cancelled,
            "decision": decision,
        }
        if status and decision.get("status") != status:
            continue
        out.append(item)
    order = {c: i for i, c in enumerate(ds.priority_order)}
    out.sort(key=lambda x: (order.get(x["effective_category"], 99), x["submitted_at"] or ""))
    def _credit(item):
        weight = item["weight"]
        status = item["decision"].get("status")
        if status == "approved":
            return weight
        if status == "alternative_offered":
            return weight * 0.5
        return 0

    totals = {
        "score": sum(_credit(o) for o in out),
        "max": sum(o["weight"] for o in out if not o["cancelled"]),
        "approved": sum(1 for o in out if o["decision"].get("status") == "approved"),
        "alternatives": sum(1 for o in out if o["decision"].get("status") == "alternative_offered"),
        "rejected": sum(1 for o in out if o["decision"].get("status") == "rejected"),
        "cancelled": sum(1 for o in out if o["cancelled"]),
    }
    return {"count": len(out), "totals": totals, "bookings": out}


@router.get("/{request_id}")
def booking_detail(request_id: str, user: User = Depends(current_user)):
    ds = state.dataset()
    req = ds.requests.get(request_id)
    if req is None:
        raise HTTPException(404, f"unknown request {request_id}")
    schedule = state.current_cached()
    decision = next((d for d in (schedule.get("fest_week") or {}).get("bookings", [])
                     if d["request_id"] == request_id), None)
    effective = ds.effective_category(req)
    return {
        "request": req,
        "effective_category": effective,
        "weight": CAT_WEIGHT.get(effective, 0),
        "cancelled": request_id in ds.cancelled,
        "decision": decision,
        "why": _why(ds, req, decision, effective),
    }


def _why(ds, req, decision, effective) -> list[str]:
    """Plain-language reasoning built from the rules, not from a model."""
    reasons = []
    if req["id"] in ds.cancelled:
        reasons.append("This request was withdrawn after submission, so it cannot be approved.")
        return reasons
    if req.get("requested_category") != effective:
        reasons.append(f"A {req['role'].replace('_', ' ')} may claim at most "
                       f"'{ds.role_cap.get(req['role'], 'club_event')}', so the request is "
                       f"scored as '{effective}'.")
    biggest = max(r["capacity"] for r in ds.rooms.values())
    if req["attendance"] > biggest:
        reasons.append(f"{req['attendance']} people exceed the largest venue on campus ({biggest} seats).")
    if not decision:
        reasons.append("No decision has been recorded for this request yet.")
        return reasons
    if decision.get("status") == "approved":
        reasons.append(f"Placed at {decision['day']} P{decision['start_period']}-"
                       f"{decision['end_period']} in {decision['room_id']}, inside the requested window.")
    elif decision.get("status") == "alternative_offered":
        reasons.append("The requested window could not be kept; the closest valid slot was offered "
                       "(an alternative is worth half the category weight).")
    else:
        reasons.append("Rejected: no venue could satisfy the request.")
    reasons.append(decision.get("reason", ""))
    return [r for r in reasons if r]
