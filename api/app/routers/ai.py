from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..ai import budget as ai_budget
from ..ai import change as change_ai
from ..ai.parser import _today_name, _tomorrow, parse
from ..auth import current_user, require_admin, require_roles
from ..config import get_settings
from ..db import User, audit, get_session
from ..services import state

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ParseIn(BaseModel):
    text: str
    role: str | None = None
    allow_llm: bool = True


@router.post("/parse")
def parse_request(body: ParseIn, user: User = Depends(current_user)):
    """Free text (English or Hinglish) -> editable booking draft with confidence + checks."""
    ds = state.dataset()
    # The authenticated role, not a model/client-supplied field, determines the cap.
    role = user.role
    result = parse(body.text, ds, role=role, allow_llm=body.allow_llm)
    return {
        "draft": result.draft.model_dump(),
        "confidence": result.confidence,
        "assumptions": [a.model_dump() for a in result.assumptions],
        "follow_up": result.follow_up,
        "notes": result.notes,
        "warnings": result.warnings,
        "feasibility": result.feasibility,
        "source": result.source,
        "category_cap": {"requested": result.draft.requested_category,
                         "effective": ds.effective_category({"role": role,
                                                             "requested_category":
                                                             result.draft.requested_category or "club_event"})
                         if result.draft.requested_category else None},
    }


class ChangeIn(BaseModel):
    text: str
    faculty_id: str | None = None
    create_proposal: bool = True
    time_limit: int | None = None


@router.post("/change-request")
def change_request(body: ChangeIn,
                   user: User = Depends(require_roles("faculty", "admin",
                                                      "department_coordinator")),
                   session: Session = Depends(get_session)):
    """Faculty asks in plain language. The answer is a checked proposal, or the rule that stops it.

    The text is read here; whether the result is *allowed* is decided by `core/repair.py`, and
    even a valid repair stays `pending` until a different admin approves it.
    """
    ds = state.dataset()
    if user.role == "faculty" and body.faculty_id and body.faculty_id != user.faculty_id:
        raise HTTPException(403, "faculty may only request changes for their own account")
    faculty_id = body.faculty_id or user.faculty_id
    if not faculty_id:
        raise HTTPException(422, "no faculty_id on this account - pass ?faculty_id=... "
                                 "or sign in as a faculty user")
    if faculty_id not in ds.faculty:
        raise HTTPException(422, f"{faculty_id} is not a faculty member in this dataset")
    if user.role == "department_coordinator" and ds.faculty[faculty_id].get("department") != user.department:
        raise HTTPException(403, "coordinators may only request changes in their own department")

    parsed = change_ai.parse_change(body.text, ds, faculty_id,
                                    tomorrow=_tomorrow(ds), today=_today_name(ds))
    if user.role == "faculty" and parsed.get("intent") == "move_session":
        target_id = (parsed.get("target") or {}).get("session_id")
        target = ds.sessions.get(target_id)
        if target and target.get("faculty_id") != user.faculty_id:
            raise HTTPException(403, "faculty may only request changes to their own sessions")
    # `parsed["source"]` says who read the sentence (rule reader or the model); the
    # engine below still decides whether the change is legal.
    base = {"parsed": parsed, "summary": change_ai.summarise(parsed),
            "source": parsed.get("source", {"provider": "deterministic", "llm": None})}
    if parsed["missing"]:
        return {**base, "status": "needs_detail", "follow_up": parsed["missing"][0],
                "proposal_id": None, "valid": None,
                "missing": parsed["missing"]}

    if parsed["intent"] == "move_session":
        target = parsed["target"]
        result = state.preview_move(target["session_id"], target["day"],
                                    target["start_period"],
                                    time_limit=body.time_limit or 25)
        changes = []
    else:
        result = state.preview_disruption(parsed["changes"],
                                          time_limit=body.time_limit)
        changes = parsed["changes"]

    proposal_id = None
    if body.create_proposal:
        proposal = state.store_proposal(
            session, user, change_ai.summarise(parsed), changes, result,
            kind="timetable_change")
        proposal_id = proposal.id
        audit(session, user.email, user.role, "ai_change_request",
              f"{proposal_id}: {parsed['intent']} for {faculty_id}, status={proposal.status}")

    answer = _answer(parsed, result)
    return {**base, "status": result.get("status", "UNKNOWN"),
            "valid": result.get("valid", False), "proposal_id": proposal_id,
            "moves": result.get("moves"), "moved": result.get("moved"),
            "conflicts": result.get("conflicts"),
            "explanation": result.get("explanation"),
            "changed": {"broken_count": result.get("broken_count"),
                        "new_sessions": result.get("new_sessions"),
                        "dropped_sessions": result.get("dropped_sessions")},
            "answer": answer,
            "next": ("a different admin must approve this proposal"
                     if result.get("valid") else "no valid fix - see answer")}


def _answer(parsed: dict, result: dict) -> str:
    """Plain-language outcome, written from the parsed intent and the solver's finding."""
    if result.get("valid"):
        moves = result.get("moves")
        moved = result.get("moved") or []
        first = moved[0] if moved else None
        detail = ""
        if first:
            after = first.get("after") or {}
            detail = (f" {first['session_id']} moves to {after.get('day')} "
                      f"P{after.get('start_period')} in {after.get('room_id')}.")
        return (f"Yes - this works. {moves} session(s) would move and nothing breaks a hard "
                f"rule.{detail} It is waiting for a second admin to approve.")
    conflicts = result.get("conflicts") or []
    if conflicts:
        return ("I cannot do this: " + "; ".join(conflicts[:3]) +
                ". Try a different slot - the suggestions below keep every rule intact.")
    explanation = result.get("explanation") or {}
    core = explanation.get("core_sessions") or []
    suggestions = explanation.get("suggestions") or []
    if core or suggestions:
        return ("No valid repair exists. Conflicts: " + "; ".join(suggestions[:2] or core[:3]))
    return "No valid timetable exists for this request under the current rules."


@router.post("/selftest")
def selftest(admin: User = Depends(require_admin)):
    """One real call to the provider, so a judge can see whether the key works."""
    from ..ai import providers

    provider = providers.get_provider()
    if not provider.available():
        return {"ok": False, "provider": provider.name,
                "reason": "no key configured - set LLM_PROVIDER=groq and GROQ_API_KEY, "
                          "or keep using the deterministic parser (same endpoints, no model)"}
    result = {"provider": provider.name, **provider.selftest()}
    result["reason"] = result.get("reason") or result.get("error") or ""
    result["budget"] = ai_budget.snapshot()
    return result


@router.get("/status")
def ai_status(user: User = Depends(current_user)):
    from ..ai import providers

    s = get_settings()
    return {
        "provider": s.llm_provider,
        "mode": "llm-assisted" if s.llm_enabled else "deterministic only",
        "prompt_file": "prompts/extract_booking.md",
        "endpoint": s.groq_base_url,
        "stats": providers.STATS.as_dict(),
        "budget": ai_budget.snapshot(),
        "free_tier_note": ("Groq free tier is about 1,000 requests/day on the 70B model and "
                           "14,400 on the 8B; the 8B is the automatic fallback."),
        "how_to_enable": ("put GROQ_API_KEY=... in .env and set LLM_PROVIDER=groq, then "
                          "POST /api/ai/selftest"),
        "enabled": s.llm_enabled,
        "model": s.groq_model if s.llm_enabled else None,
        "daily_limit": ai_budget.snapshot()["daily_limit"],
        "fallback_model": s.groq_fallback_model if s.llm_enabled else None,
        "readers": {"booking_request": "prompts/extract_booking.md",
                    "faculty_change": "prompts/change_request.md"},
        "models": {"primary": s.groq_model, "fallback": s.groq_fallback_model},
        "change_reader": ("model reads, rules re-parse" if s.llm_enabled
                          else "deterministic reader only"),
        "note": ("deterministic parser only - the product behaves identically with no model"
                 if not s.llm_enabled else "the model reads requests; rules still decide validity"),
        "prompts": ["prompts/extract_booking.md", "prompts/change_request.md",
                    "prompts/explain_decision.md"],
    }


@router.post("/budget/reset")
def reset_budget(admin: User = Depends(require_admin)):
    """Forget today's provider counters (never touches the key itself)."""
    return ai_budget.reset_today()


@router.get("/budget")
def budget_status(user: User = Depends(current_user)):
    """How much of the free tier we have spent today - shown in the admin panel."""
    return ai_budget.snapshot()


@router.get("/samples")
def samples(user: User = Depends(current_user)):
    """The organisers' practice requests, as test input for the parser."""
    from pathlib import Path

    path = Path(__file__).resolve().parents[3] / "vendor" / "sample_requests.md"
    if not path.exists():
        return {"samples": []}
    lines = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines()]
    items = []
    for line in lines:
        if re.match(r"^\d+[.)]\s+", line):
            items.append({"text": re.sub(r"^\d+[.)]\s+", "", line),
                          "source": "vendor/sample_requests.md"})
    return {"count": len(items), "samples": items}
