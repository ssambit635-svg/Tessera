# Third-party software

Every library, solver and asset the project uses, what it is used for, and its licence.

## Solver / backend

| Package | Version | Used for | Licence |
| --- | --- | --- | --- |
| OR-Tools (`ortools`) | 9.15.6755 | CP-SAT: timetable generation, exam scheduling, minimal-move repair | Apache-2.0 |
| FastAPI | 0.115.6 | HTTP API | MIT |
| Uvicorn | 0.34.0 | ASGI server | BSD-3-Clause |
| Pydantic | 2.10.4 | request/response schemas | MIT |
| SQLModel | 0.0.22 | persistence layer (SQLite) | MIT |
| PyJWT | 2.10.1 | session tokens for the four roles | MIT |
| httpx | 0.28.1 | LLM provider calls | BSD-3-Clause |
| pytest | 8.3.4 | test suite | MIT |

## Frontend

| Package | Used for | Licence |
| --- | --- | --- |
| Next.js 15 | app shell, routing | MIT |
| React 19 | UI | MIT |
| Tailwind CSS | styling | MIT |
| shadcn/ui (components copied into the repo) | dialogs, tables, badges, toasts, skeletons | MIT |
| TanStack Query | data fetching, loading/empty/error states | MIT |
| lucide-react | icons | ISC |

## Data / assets

| Item | Source | Notes |
| --- | --- | --- |
| `vendor/cit_public.json` | official Crunch Week starter pack | organisers' dataset, unmodified |
| `vendor/validator.py` | official Crunch Week starter pack | organisers' validator, unmodified, used read-only for verification |
| `vendor/sample_disruption.json`, `vendor/sample_requests.md` | official starter pack | unmodified |
| Fonts | system font stack | no external font licence |

We do **not** modify, wrap or re-license the organisers' files. `vendor/` is read-only in the repo and the validator is never imported by application logic - `api/app/core/constraints.py` is our own re-implementation, and `tools/selfcheck.py` + CI compare the two verdicts.
