# Prompts

Every prompt the product sends to a model lives here as a versioned file, referenced by id
from `api/app/ai/parser.py`. This folder exists because the rules require us to say where
our prompts are kept.

| File | Used by | Purpose |
| --- | --- | --- |
| `extract_booking.md` | `/api/ai/parse` | turn a free-text (English/Hinglish) venue request into the booking schema |
| `followup.md` | `/api/ai/parse` | ask the one question that is actually blocking a booking |
| `explain_decision.md` | `/api/ai/explain` | re-word a *given* reason chain; it may not invent new facts |

Rule that cannot be broken: no prompt asks the model whether a schedule or booking is
**valid**. Validity is decided by `api/app/core/constraints.py`.
