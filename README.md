# Tessera — campus scheduling & venue management for CIT

Team **Voltryx** · Tech Zephyr 4.0 · dataset `cit-public-v1`

Tessera turns a spreadsheet-and-WhatsApp scheduling process into one platform: it
generates the semester timetable, schedules midsem exams, decides Spectra-week venue
requests by the institute's priority rules, and repairs the timetable when something
changes — moving as few sessions as possible and explaining every decision.

> **Status (in progress):** the scheduling core **and the disruption/repair engine** are
> complete and verified against the organisers' own validator. API, UI and the AI layer are
> next. Numbers below are produced by the pipeline in this repo and re-verified in CI on
> every push.

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
- [ ] FastAPI endpoints, 4 roles, demo seed/reset
- [ ] plain-English / Hinglish request parsing with a deterministic fallback
- [ ] Next.js UI: timetable by group/faculty/room, approvals, dashboard, mobile

## Demo accounts

Seeded on first boot (see `.env.example`, password `Tessera@2027`):

| Role | Email |
| --- | --- |
| Admin (Dean's office) | `admin@cit.edu` |
| Department coordinator | `dept.cse@cit.edu` |
| Faculty | `faculty@cit.edu` |
| Club representative | `club@cit.edu` |

The login page has one-click buttons for all four. **The live application is not deployed
yet** — this README will carry the link as soon as the API and UI land.

## Known limitations

* OR-Tools multi-worker search is not bit-for-bit reproducible: a regeneration can pick a
  different (equally valid, equally low-penalty) timetable. Both committed exports are the
  reference, and CI re-validates every regeneration.
* The repair optimises the number of moved sessions, which is what the validator scores. It
  does not attempt to minimise how *disruptive* a move is to a student beyond preferring a
  room swap over a time change.
* The before/after approval flow exists in the engine (`preview` returns the diff, `apply`
  is a separate call) but its screens, like the rest of the UI, are still to come.
* Only the dataset in `vendor/` is supported so far; nothing is hard-coded to its ids, but
  alternative datasets have not been tested.
