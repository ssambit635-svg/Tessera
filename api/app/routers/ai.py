from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..ai.parser import parse
from ..auth import current_user, require_roles
from ..config import get_settings
from ..db import User
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
    role = body.role or user.role
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


@router.get("/status")
def ai_status(user: User = Depends(current_user)):
    s = get_settings()
    return {
        "provider": s.llm_provider,
        "enabled": s.llm_enabled,
        "model": s.groq_model if s.llm_enabled else None,
        "fallback_model": s.groq_fallback_model if s.llm_enabled else None,
        "note": ("deterministic parser only - the product behaves identically with no model"
                 if not s.llm_enabled else "the model reads requests; rules still decide validity"),
        "prompts": ["prompts/extract_booking.md", "prompts/followup.md", "prompts/explain_decision.md"],
    }


@router.get("/samples")
def samples(user: User = Depends(current_user)):
    """The organisers' practice requests, as test input for the parser."""
    from pathlib import Path

    path = Path(__file__).resolve().parents[3] / "vendor" / "sample_requests.md"
    if not path.exists():
        return {"samples": []}
    lines = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines()]
    items = [ln for ln in lines if ln[:2].strip().rstrip(".").isdigit()]
    return {"samples": items}
