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

## Files

| File | Used by | What the model is asked to do |
| --- | --- | --- |
| `extract_booking.md` | `POST /api/ai/parse` | read a venue request into the booking form |
| `change_request.md` | `POST /api/ai/change-request` | read a faculty message into a change intent |
| `explain_decision.md` | explain endpoints | re-word a reason our rules already produced |

`api/app/ai/providers.py` loads `extract_booking.md` at runtime, so editing the file changes
the prompt without touching Python. Every response is still schema-checked and
existence-checked against the dataset before it is shown.
