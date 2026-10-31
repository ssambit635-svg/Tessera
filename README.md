# Tessera — campus scheduling & venue management for CIT

Team **Voltryx** · Tech Zephyr 4.0 · dataset `cit-public-v1`

Tessera turns a spreadsheet-and-WhatsApp scheduling process into one platform: it
generates the semester timetable, schedules midsem exams, decides Spectra-week venue
requests by the institute's priority rules, and repairs the timetable when something
changes — moving as few sessions as possible and explaining every decision.

> **Status (in progress):** the scheduling core, the disruption/repair engine **and the full
> backend API** (roles, approvals, exports, reset, plain-language parsing) are complete and
> verified. The Next.js UI is next. Numbers below are produced by this repo and re-verified
> in CI on every push.

## Verified numbers

Checked with `vendor/validator.py` (the official validator, unmodified):

| Metric | Result |
| --- | --- |
| Hard violations (timetable + bookings + exams) | **0** |
| Soft penalty S1–S6 | **3** of which S2/S3/S5/S6 are **0** |
| Booking score | **67 / 70** (22 approved, 1 alternative, 2 rejected, **0 priority inversions**) |
| Exam soft penalty | **0** (41/41 exams, half-capacity rooms, no group clashes) |
| Timetable solve time | ~35-45 s on 2 vCPU (OR-Tools CP-SAT) |
| After `vendor/sample_disruption.json` | **12 sessions moved** (9 of them room-only), **0 hard violations**, soft still 3 |
| Move count vs the lower bound | **equal** - the number of sessions the change actually breaks (proven optimal) |
| Change that breaks nothing (session removed, faculty added, free added session) | **0 moves, ~2 s** |
| Impossible change (e.g. only physics lab closed for the week) | **refused, not exported** - with the conflicting sessions and data-derived suggestions |

**Why soft = 3 and not 0:** the only unavoidable penalty in this dataset. F08 is a visiting
professor available on Tuesday and Thursday only, but teaches three CS204 lectures; three
lectures cannot sit on two distinct days, so exactly one repeat costs 3 points. Everything
else is driven to zero by construction (see "How it works").

**Why bookings = 67 and not 70:** BR-09 asks for 1,200 seats and the largest room seats 800
(must be rejected), BR-17 requests periods P13–P14 and events may not run past P13 (so it
can only be an alternative, worth half). 67 is the ceiling for this dataset.

## How it works

```
dataset (JSON)                    ┌── constraints.py  ← the single validity authority
   │                              │     (H1-H14, B1-B3, E1-E2, S1-S6)
   ├─ bookings.py ────────────────┤
   │    priority order,           ├── solver.py      ← CP-SAT timetable (block model)
   │    damage-aware placement,   │
   │    reasons per decision      ├── exams.py       ← CP-SAT exam slots + rooms
   │                              └── export.py      ← the only writer of exports/
   └─ pipeline.py  →  exports/schedule.json  →  vendor/validator.py (CI)
```

Design choices that matter:

* **One joint model.** Approved Spectra bookings reserve room-periods and group-periods
  *before* classes are placed, so a booking can never land on top of a class (H13).
* **Contiguous-block formulation.** For every (group, day) the solver picks a start period
  and a length; a session must fit inside its groups' blocks. That makes the two biggest
  soft penalties — idle gaps (S2) and over-long days (S3) — structurally zero instead of
  something to be traded off.
* **Hard only where provable.** "One lecture of a course per group per day" (S4) is a hard
  constraint except for the F08 case above, where it is impossible; there it stays soft so
  the model never becomes infeasible.
* **Rescheduling is an optimisation, not a guess.** The repair minimises the exact number
  the validator reports (`sessions_moved`) with CP-SAT, then a second lexicographic solve
  minimises the soft penalty of that move set. A change that breaks nothing returns 0 moves
  in ~2 s; a change that cannot be absorbed is refused with a computed explanation (OR-Tools
  assumption literals + `SufficientAssumptionsForInfeasibility`) instead of a broken export.
  See `docs/REPAIR.md`.
* **The kernel is ours, the verdict is theirs.** `api/app/core/constraints.py` re-implements
  the rules so the app can validate thousands of candidates per second; `pytest` asserts
  that its verdict matches the official validator exactly.

## Quickstart

Two ways to use it: run the API, or regenerate the exports from scratch.

### 1. The API (this is what the app and the judges use)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r api/requirements.txt
cp .env.example .env          # optional: defaults work, no key needed

cd api
uvicorn app.main:app --reload --port 8000
#  http://localhost:8000/docs   interactive API
#  http://localhost:8000/health liveness
#  demo logins: POST /api/auth/demo-login/admin  (or /faculty, /club, /department_coordinator)
```

The app boots from the committed `exports/schedule.json`, so it is usable immediately;
regenerating the timetable is an explicit admin action, not a page-load cost.
Thirty-plus endpoints are documented in [`docs/API.md`](docs/API.md).

### 2. Regenerate both exports from the dataset

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r api/requirements.txt

# regenerate the timetable, bookings and exams from the dataset
cd api
python -m app.core.pipeline --data ../vendor/cit_public.json \
       --out ../exports/schedule.json --workers 2 --time-limit 120

# apply the sample disruption and repair it with the fewest moves, then export both files
python -m app.core.pipeline --data ../vendor/cit_public.json \
       --out ../exports/schedule.json --after ../exports/schedule_after.json \
       --disruption ../vendor/sample_disruption.json --workers 2

# verify with the organisers' validator (run from the repo root)
cd ..
python vendor/validator.py --data vendor/cit_public.json --schedule exports/schedule.json
python vendor/validator.py --data vendor/cit_public.json --schedule exports/schedule_after.json \
       --disruption vendor/sample_disruption.json --baseline exports/schedule.json

# tests
cd api && python -m pytest tests -q
```

## Repository layout

```
api/app/core/      dataset, constraints (validity kernel), solver, bookings, exams, export, pipeline
api/tests/         kernel-vs-official agreement, export quality, model property tests
exports/           schedule.json, schedule_after.json (app-generated; only export.py writes them)
vendor/            the organisers' validator + dataset + samples, unmodified and read-only
docs/              strategy, rules master, 22-hour plan, novelty, validation report
prompts/           every prompt the product sends, versioned
tools/             feasibility probe, self-check helpers
```

## Roadmap

- [x] dataset loader, validity kernel, CP-SAT timetable, exams, booking decisions, exports
- [x] CI: tests + official validator on every push, plus a regeneration job
- [x] minimal-move repair engine, change-file support, infeasibility explanation,
      `exports/schedule_after.json`
- [x] backend API: 4 roles + second admin, 30+ endpoints, demo seed/reset, audit trail
- [x] plain-English / Hinglish request parsing with a deterministic parser (works with no model)
- [x] optional LLM reader behind `LLM_PROVIDER=groq` (the app behaves identically without it)
- [x] faculty change requests in plain language -> checked proposal -> second-admin approval
- [x] "why is this class here?" explanations built from the constraint codes
- [ ] Next.js UI: timetable by group/faculty/room, approvals, dashboard, mobile
- [ ] deploy + video

## Demo accounts

Seeded on first boot (see `.env.example`; password `Tessera@2027`):

| Role | Email | Can |
| --- | --- | --- |
| Admin (Dean's office) | `admin@cit.edu` | everything: generate, validate, export, reset, approve |
| **Admin #2 (approver)** | `dean@cit.edu` | approves the first admin's change proposals |
| Department coordinator | `dept.cse@cit.edu` | preview changes, book department rooms |
| Faculty | `faculty@cit.edu` | own timetable, AI requests |
| Club representative | `club@cit.edu` | submit and track venue requests |

Two admins exist **on purpose**: the rules say nobody may approve their own request, so the
admin who previews a change cannot be the one who applies it. That rule is enforced in the
API (a self-approval attempt returns `403`).

One-click login: `POST /api/auth/demo-login/{role}` (add `?email=dean@cit.edu` for the second
admin). **The live application is not deployed yet** — this README will carry the link as soon
as the UI lands.

## Backend architecture

```
api/app/
  main.py            app factory, CORS, lifespan (seed users + load exports)
  config.py          every setting from the environment (.env is gitignored)
  db.py              SQLite: users, schedule state, proposals, audit log
  services/persistence.py  normalised mirror of the timetable (versions, placements,
                           exams, booking decisions) - queryable, never authoritative
  auth.py            JWT, role capabilities, demo seed, "no self-approval"
  core/              dataset, constraints kernel, solver, bookings, exams, repair, export, pipeline
  routers/           auth, dataset, timetable, bookings, exams, disruption, ai, admin
  ai/                normalizer + parser (deterministic), providers (Groq adapter, off by default)
```

Design rules enforced in code:

* **Validity is never a model decision.** `/api/ai/parse` returns a *draft* with confidence,
  assumptions and rule-based feasibility; the kernel decides what is legal.
* **Nothing is applied without an explicit approval** — `preview` stores a proposal,
  `apply` requires a different admin, and the audit log records both.
* **The product works with no LLM at all** (`LLM_PROVIDER=none` is the default), which is the
  state the tests and CI run in.

## Where the data lives

No Supabase, no Firebase: one SQLite file in the container, exactly as
`docs/RULES_MASTER.md` asks ("small, always-on container; SQLite file persistence; no
in-memory-only state"). The organisers' dataset stays read-only in `vendor/`, the scored
schedules are the two files in `exports/`, and everything else — users, proposals, audit rows,
timetable versions — lives in `tessera.db`. Full detail, including why a restart cannot lose
the timetable: [`docs/DATABASE.md`](docs/DATABASE.md).

## Known limitations

* OR-Tools multi-worker search is not bit-for-bit reproducible: a regeneration can pick a
  different (equally valid, equally low-penalty) timetable. Both committed exports are the
  reference, and CI re-validates every regeneration.
* The repair optimises the number of moved sessions, which is what the validator scores. It
  does not attempt to minimise how *disruptive* a move is to a student beyond preferring a
  room swap over a time change.
* The before/after approval flow exists end to end in the API (`preview` -> `apply`), but its
  screens, like the rest of the UI, are still to come.
* The LLM reader (`api/app/ai/providers.py`) is implemented and tested against a mocked
  transport, but the deployed demo runs with `LLM_PROVIDER=none` until a key is added;
  `POST /api/ai/selftest` is the one-click check once it is.
* Generation takes ~40 s on 2 cores. The API serves the committed exports instantly and only
  re-solves when an admin asks it to.
* Only the dataset in `vendor/` is supported so far; nothing is hard-coded to its ids, but
  alternative datasets have not been tested.
