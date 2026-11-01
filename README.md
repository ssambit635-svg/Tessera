# Tessera

**Campus scheduling and venue management for Chilika Institute of Technology.**
Team **Voltryx** · Tech Zephyr 4.0 · dataset `cit-public-v1`

Tessera replaces a spreadsheet timetable and a WhatsApp booking queue with one system: it solves
the semester timetable, seats the midsem exams, decides the Spectra-week venue requests by the
institute's own priority order, and repairs the week when something changes — moving the fewest
sessions possible, showing exactly what changed, and waiting for an admin to approve. Every
number it shows is computed by its own rule kernel, never guessed by a language model.

| | |
| --- | --- |
| **Live app** | <https://tessera-web-yahp.onrender.com> |
| **API + Swagger** | <https://tessera-api-sgie.onrender.com/docs> · health: [`/health`](https://tessera-api-sgie.onrender.com/health) |
| **Video walkthrough (≤5 min)** | recorded — link pending upload (paste the unlisted YouTube/Drive URL here before submitting) |
| **Exports** | [`exports/schedule.json`](exports/schedule.json) · [`exports/schedule_after.json`](exports/schedule_after.json) |
| **Rules we answer to** | [`docs/RULES_MASTER.md`](docs/RULES_MASTER.md) · the organisers' validator, unmodified, in [`vendor/`](vendor) |

> The free Render instance sleeps after ~15 minutes idle. The first request takes up to a minute;
> the login screen says so while it waits instead of spinning silently.

---

## Demo accounts

Password for all five: **`Tessera@2027`** (also listed in [`.env.example`](.env.example)).
Every account is seeded on first boot and works on the live link.

| Role | Email | Can do |
| --- | --- | --- |
| **Admin — Dean's office** | `admin@cit.edu` | generate + validate the timetable, export, reset demo data, approve change proposals, manual events |
| **Admin — approver** | `dean@cit.edu` | approves the first admin's proposals (nobody may approve their own request) |
| **Department coordinator** | `dept.cse@cit.edu` | preview changes to CSE sessions, book department rooms |
| **Faculty** | `faculty@cit.edu` | own timetable, mark unavailability, ask the assistant for a move |
| **Club representative** | `club@cit.edu` | submit, track and cancel Spectra venue requests |

One-click login: `POST /api/auth/demo-login/{role}` (append `?email=dean@cit.edu` for the second
admin). The login screen renders every demo seat as a button, so a judge never types a password —
but still receives a real signed JWT.

**Reset to a clean state:** signed in as admin, open **Operations → "Reset the committed state"**.
That wipes the uploaded dataset, proposals, audit-trail rows and manual events and reloads the
committed exports. `POST /api/admin/reset` does the same thing from the API.

---

## What it does

1. **Timetable** — 189 sessions (lectures, tutorials, labs) placed across 27 rooms and 40 faculty
   with **0 hard violations**, in one CP-SAT model that also reserves the room-periods and
   group-periods promised to approved Spectra bookings.
2. **Midsem exams** — 41 papers on the exam calendar (`AM`/`PM`), multi-room seating at half
   capacity, **0 exam soft penalty**, no group sitting two papers at once.
3. **Plain-language requests** — an English/Hinglish sentence becomes a structured booking form
   that the user reviews and edits before submitting. Assumptions (like "kal" → tomorrow,
   "2 ghante" → 2 periods) are shown on the form, not hidden.
4. **Booking decisions** — approve / reject / alternative for all 25 Spectra requests by the
   published priority order, role-category caps and capacity, each with a written reason.
   Score **67/70**, **0 priority inversions**.
5. **Disruption repair** — faculty leave, closed room, added/removed session: propose the repair
   that moves the fewest sessions, show the diff, apply only after admin approval. When no repair
   exists, name the sessions that are in conflict and the data-derived ways out.
6. **Views** — timetable by student group, by faculty, by room; pending approvals; current
   conflicts; room utilisation, availability matrix and per-room booking history.
7. **AI assistant** — a faculty member asks in natural language for a change; the answer is either
   a validated alternative or a precise reason why not. The model reads the sentence; the rule
   kernel decides validity.
8. **Explanations** — every placed session carries the constraints it satisfies and why that slot;
   every booking carries its decision chain.
9. **Admin console** — load a dataset or change file in the starter-pack format (validated before
   it replaces anything), generate, validate, export `schedule.json` and `schedule_after.json`.
10. **Manual events** — authorised roles create one-off events; the same kernel checks them against
    every hard constraint before they are written.

---

## Verified numbers

Produced by this repo and reproducible with the organisers' own validator (`vendor/validator.py`,
unmodified):

| Metric | Result |
| --- | --- |
| Hard violations (timetable + bookings + exams) | **0** |
| Soft penalty S1–S6 | **3** — S1/S2/S3/S5/S6 are **0**, only S4 costs |
| Booking score | **67 / 70** — 22 approved, 1 alternative, 2 rejected, **0 priority inversions** |
| Exam soft penalty | **0** (41/41 papers placed, no cohort clashes, half-capacity rooms) |
| Solve time | ~35–45 s on 2 vCPU with OR-Tools CP-SAT, seed `20270131` |
| After `vendor/sample_disruption.json` | **12 sessions moved** (9 of them room-only), 0 hard violations, soft still 3 |
| Moves vs. the lower bound | **equal** to the number of sessions the change actually breaks |
| Change that breaks nothing | **0 moves**, ~2 s |
| Impossible change (e.g. only physics lab closed all week) | **refused, not exported** — with the conflicting sessions named |
| Backend tests | **98 passing** (`cd api && python -m pytest tests -q`) |

**Why soft = 3, not 0.** The only unavoidable penalty in this dataset: F08 is a visiting professor
available Tue/Thu only but teaches three CS204 lectures, so exactly one repeat costs 3 points.
**Why bookings = 67, not 70.** BR-09 asks for 1,200 seats and the largest room seats 800 (a
correct rejection, reasoned); BR-17 wants periods P13–P14, but events stop at P13, so it can only
be an alternative (half credit). 67 is the ceiling for this dataset, not a compromise.

---

## What is actually new here

Not "an AI timetable app". These seven things are the ones a judge can check in 90 seconds, and
most of them exist because we treated the rulebook as a specification instead of a suggestion.

1. **The validity kernel is pinned to the judges' own tool.** `api/app/core/constraints.py` is an
   independent re-implementation of every H/B/E/S rule, and `api/tests/test_model.py` fails the
   build the moment the kernel and `vendor/validator.py` disagree on a generated schedule. The app
   cannot tell a judge "0 violations" using rules the validator does not share.
2. **Repair optimises the judge's own metric — and proves it.** The repair model's objective is
   literally `10,000 × sessions_moved + soft_penalty`, so it can never trade an extra move for soft
   points. On the sample disruption the result equals the lower bound (the 12 sessions the change
   breaks), which is why "fewest moves" is a measured claim rather than a slogan.
3. **Infeasibility is answered, not shrugged at.** When a change cannot be absorbed, a second model
   built from *assumption literals* asks CP-SAT for an unsat core, and the admin is shown the
   conflicting sessions plus data-derived escapes ("remove the Monday block on F07", "substitute
   F12, free MON P3–P5"). The problem statement asks for exactly this; "No valid fix found" is not
   an answer we ship.
4. **Two admins by construction.** The rules say nobody may approve their own request, so the
   system seeds two admin seats, keeps the proposer on the proposal, and returns **403** on
   self-approval. This is enforced in the API, not just described in a doc.
5. **The LLM is a reader, never a judge.** Groq reads the raw sentence and fills a JSON form; the
   output is schema-checked, existence-checked against the dataset, then converted to a canonical
   sentence and **re-parsed by our deterministic parser**. It may rescue a sentence the rules could
   not read; it can never override one they could. With `LLM_PROVIDER=none` the product still works
   end to end — the manual form and the rule-based parser are the floor, not a fallback.
6. **A hard daily AI budget.** `POST /api/ai/parse` is metered in SQLite (calls reserved before the
   request, released on failure), so a judge hammering the assistant cannot drain the free tier and
   leave the next judge without a demo. `/api/ai/budget` shows what is left.
7. **Determinism as evidence.** Generate is seeded (`20270131`) and the seed is visible in the UI:
   reset → generate returns the identical timetable. It is the cheapest possible answer to "were
   these results made by hand?".

Everything else — the calendar views, the matrix, the shell, the report page — is deliberate
craft, not invention. The novelty is that the boring parts are *correct and checkable*.

---

## Architecture

```
                       ┌──────────────────────────── browser ────────────────────────────┐
                       │  React 18 + TypeScript + Vite (frontend/)                        │
                       │  landing · login · mosaic · overview · availability · people     │
                       │  bookings · approvals · exams · operations · intelligence ·      │
                       │  reports · departments · groups · locations · numbers            │
                       └───────────────▲─────────────────────────────┬───────────────────┘
                                       │ JSON over HTTPS             │ JWT (role-scoped)
┌──────────────────────────────────────┴─────────────────────────────▼───────────────────┐
│  FastAPI (api/app)                                                                     │
│                                                                                        │
│   routers/  auth · dataset · timetable · bookings · exams · disruption · ai · admin     │
│      │                                                                                 │
│      ├── core/constraints.py   ← the single validity authority (H1-H14, B1-B3, E1-E2,  │
│      │                            S1-S6). Every write goes through it.                  │
│      ├── core/solver.py        ← CP-SAT timetable, contiguous-block formulation        │
│      ├── core/exams.py         ← CP-SAT exam slots + multi-room seating                │
│      ├── core/bookings.py      ← priority order, role caps, damage-aware placement     │
│      ├── core/repair.py        ← minimal-move repair + unsat-core explanation          │
│      ├── core/export.py        ← the ONLY writer of exports/*.json                     │
│      └── ai/                   ← provider (Groq | none), parser, re-parse guard, budget│
│                                                                                        │
│   db.py  SQLite: users, dataset state, proposals, manual events, audit trail           │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ regenerated by the app
                                    exports/schedule.json
                                    exports/schedule_after.json
                                            │
                              vendor/validator.py  (organisers', unmodified)
```

Four decisions carry the design:

* **One joint model.** Approved Spectra bookings reserve room-periods *and* group-periods before
  classes are placed, so a booking can never land on top of a lecture (H13/B2). Bookings are not a
  post-pass bolted onto a finished timetable.
* **Contiguous blocks.** For every (group, day) the solver picks a start period and a length, and a
  session must fit inside its groups' blocks. Idle gaps (S2) and over-long days (S3) therefore
  become structurally impossible rather than traded off.
* **Hard only where provable.** "One lecture of a course per group per day" stays a *soft* rule
  because a hard version is infeasible for this catalogue — which is exactly where a naive model
  locks itself out of a solution.
* **One writer for exports.** Only `core/export.py` writes `exports/`, and CI re-runs the validator
  on the committed files, so a hand-edited result cannot survive a push.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18.3, TypeScript 5, Vite 6, React Router 6, hand-written CSS (no UI framework) |
| Backend | Python 3.11, FastAPI 0.115, Pydantic v2, Uvicorn |
| Solver | Google OR-Tools **CP-SAT** 9.15 (timetable, exams, minimal-move repair, unsat core) |
| Persistence | SQLite via SQLAlchemy (users, proposals, audit trail, AI budget, manual events) |
| AI | Groq `llama-3.3-70b-versatile` (fallback `llama-3.1-8b-instant`), optional and metered |
| Auth | JWT bearer tokens, four roles + a second admin approver |
| Tests | pytest (98 backend tests) + a jsdom smoke test that renders every route |
| Deploy | Render: one static site (`tessera-web`) + one web service (`tessera-api`) |

---

## Repository layout

```
frontend/          the app: public landing, sign-in, and the signed-in workspace
api/app/core/      dataset, constraint kernel, solver, bookings, exams, repair, export, pipeline
api/app/routers/   HTTP surface (30+ endpoints, documented in docs/API.md)
api/app/ai/        provider abstraction, Hinglish parser, budget guard, prompts loader
api/tests/         98 tests: kernel vs validator, exports, repair properties, AI contracts, API
exports/           schedule.json + schedule_after.json, both written by the app
vendor/            the organisers' validator, dataset and samples — unmodified, read-only
prompts/           every prompt the product sends, versioned with the code
docs/              rules master, strategy, API, database, repair design, novelty, demo script
tools/             key setup, feasibility probes, self-checks
render.yaml        the two-service blueprint (secrets are dashboard values, never in git)
```

---

## Quickstart

The app boots from the committed `exports/schedule.json`, so it is usable immediately; regenerating
the timetable is an explicit admin action, not a page-load cost.

**macOS / Linux**

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r api/requirements.txt
sh tools/setup_env.sh                 # copies .env.example -> .env (gitignored). Defaults work.
cd api && uvicorn app.main:app --reload --port 8000
#   http://localhost:8000/docs            interactive API
#   POST /api/auth/demo-login/admin       one-click demo login
```

```bash
cd frontend && npm ci && npm run dev   # http://localhost:5173
```

**Windows (PowerShell 5.1)**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r api\requirements.txt
Copy-Item .env.example .env
cd api
python -m uvicorn app.main:app --reload --port 8000
```

```powershell
cd frontend; npm ci; npm run dev
```

`python3` does not exist on Windows — use `python`, and note that PowerShell 5.1 has no `&&`.
The optional Groq key is never typed into a file by hand: `python tools\set_groq_key.py` asks for it
with hidden input and writes `.env` only.

---

## Regenerate the exports (what the judges check)

```bash
# 1. solve the dataset from scratch: timetable + bookings + exams
cd api
python -m app.core.pipeline --data ../vendor/cit_public.json \
       --out ../exports/schedule.json --workers 2 --time-limit 120

# 2. apply the sample disruption, repair with the fewest moves, export the repaired week
python -m app.core.pipeline --data ../vendor/cit_public.json \
       --out ../exports/schedule.json --after ../exports/schedule_after.json \
       --disruption ../vendor/sample_disruption.json --workers 2

# 3. check both files with the organisers' validator (from the repo root)
cd ..
python vendor/validator.py --data vendor/cit_public.json --schedule exports/schedule.json
python vendor/validator.py --data vendor/cit_public.json --schedule exports/schedule_after.json \
       --disruption vendor/sample_disruption.json --baseline exports/schedule.json
```

Expected output of step 3:

```
Hard violations: 0  {}
Soft penalty: 3  {'S1': 0, 'S2': 0, 'S3': 0, 'S4': 3, 'S5': 0, 'S6': 0}
Bookings: score 67.0 | approved 22, alternatives 1, rejected 2, priority inversions 0
Exam soft penalty: 0
```

In the app, the same four steps are buttons on **Operations**; every action is written to the audit
trail with the signed-in name on it.

---

## Requirement coverage

| # | Requirement (problem statement §2) | Where it lives |
| --- | --- | --- |
| 1 | Weekly timetable, no clashes | `core/solver.py`, **Mosaic / Availability / Groups / People** |
| 2 | Midsem exam schedule | `core/exams.py`, **Examinations** |
| 3 | Plain English/Hinglish request → editable booking | `ai/parser.py` + `POST /api/ai/parse`, **Bookings → new request** |
| 4 | Approve / reject / alternative + reason, by priority | `core/bookings.py`, **Bookings**, `/ledger` (public) |
| 5 | Disruptions: fewest moves, show the diff, admin approves, name conflicts when impossible | `core/repair.py`, **Approvals**, `/api/disruption/*` |
| 6 | Views by group / faculty / room, approvals, conflicts, utilisation | **Mosaic, Availability, People, Reports** |
| 7 | AI assistant for change requests, validated before applying | `ai/change.py`, **Intelligence**, `POST /api/ai/change-request` |
| 8 | Explain decisions | `GET /api/timetable/sessions/{id}/explain`, booking reasons, **Intelligence** |
| 9 | Admin loads dataset/change files, exports `schedule.json` | **Operations**, `POST /api/admin/dataset`, `POST /api/admin/exports` |
| 10 | Manual events under hard constraints | `POST /api/bookings/manual` (+ `/check` dry run), **Bookings → manual event** |

**Hard constraints** (H1–H14) are implemented once, in `core/constraints.py`, and reused by the
solver, the bookings engine, the repair model, the manual-event form and the validator-parity tests.
**Soft constraints** (S1–S6) are scored in the same place, so the number the UI shows is the number
the validator prints.

---

## Rulebook compliance

Section 6 (implementation rules) and Section 7 (submission), checked against this repo:

- [x] **AI declared** — [`AI_USAGE.md`](AI_USAGE.md): every call, every model, every build tool,
      where the prompts live (`prompts/`), and what the LLM may not decide.
- [x] **Third-party declared** — [`THIRD_PARTY.md`](THIRD_PARTY.md): OR-Tools, FastAPI, React, etc.,
      with licences and what each is used for.
- [x] **The LLM cannot decide validity** — parsed output is schema- and existence-checked, then
      re-parsed by our deterministic parser; the constraint kernel is the only authority.
- [x] **Works when the LLM is down** — `LLM_PROVIDER=none` is the default; the manual booking form
      and the rule parser are independent of any API key.
- [x] **Own API key, never committed** — the key lives in the Render dashboard; `.env.example`
      ships empty and `tools/set_groq_key.py` writes `.env` (gitignored).
- [x] **`.env.example` with every variable, no real keys** — [`.env.example`](.env.example).
- [x] **`exports/` with both files, generated by the app** — produced by `core/pipeline.py`
      (`export.py` is the only writer); validator output in [`docs/validation-report.json`](docs/validation-report.json).
- [x] **README with description, architecture diagram, tech stack, setup, demo accounts,
      limitations** — this file.
- [x] **Live deployed link that works** — <https://tessera-web-yahp.onrender.com>.
- [x] **Demo accounts for all four roles, working on the live link** — table above; one-click login.
- [x] **Admin can reset demo data** — Operations → "Reset the committed state".
- [ ] **Video walkthrough (unlisted YouTube / Drive, ≤5 min)** — recorded; the unlisted URL still
      has to be pasted into the table at the top of this README. Nothing else in the submission is
      waiting on it.
- [x] **Dataset used as given, nothing hard-coded from it** — the app loads `vendor/cit_public.json`
      at boot and accepts a new dataset through `POST /api/admin/dataset`.
- [x] **Validator not tampered with** — `vendor/` is read-only in practice and untouched in git
      history; our kernel is separate and tested *against* it.

Disqualification checks: repo public, live link up, demo accounts documented, exports app-generated
(never hand-edited — CI re-validates them), commit history created during the hackathon, no code
from another team, no dependency on the organisers' files being writable.

---

## Judging criteria — what to look at

| Criterion | Where to see it |
| --- | --- |
| Scheduling correctness (25) | Operations → generate → validate; `exports/schedule.json` |
| Rescheduling (15) | Approvals → apply `sample_disruption` → diff, move count, then approve |
| Optimisation (10) | Reports → soft penalty breakdown (S1–S6) |
| Use of AI (15) | Intelligence (ask in Hinglish), Bookings → request box, `/api/ai/budget` |
| Booking decisions (10) | Bookings / `/ledger` — every verdict carries its reason chain |
| Usability (10) | README → demo accounts → any screen in two clicks |
| UI and design (10) | The live app, laptop and phone widths |
| Code and docs (5) | This README, `docs/`, `AI_USAGE.md`, `THIRD_PARTY.md` |

---

## Known limitations

* **Soft penalty is 3, not 0.** F08's availability makes it impossible to place three CS204 lectures
  on two days. We keep the 3 and explain it rather than hide a hard violation to look perfect.
* **The solver takes ~35–45 s** on the free instance. Generation is an explicit admin action with a
  progress state; the app never blocks a page load on it.
* **Two periods (P10–P13) are event-only** and the dataset's own booking BR-17 asks for P14, so that
  request can only ever be an alternative. That is a dataset ceiling, not a bug.
* **Single-tenant by design.** One institution, one dataset at a time; loading a new dataset replaces
  the active one (after validation) instead of versioning several side by side.
* **The AI assistant is grounded, not general.** It answers from this dataset's sessions, rooms,
  faculty and requests; questions outside the workspace get "that is not in the workspace".
* **Free-tier cold start.** Render sleeps after ~15 minutes; the first request can take a minute and
  the UI says so instead of hanging.
* **Voice input** (Sarvam ASR) is wired but off by default — it needs its own key and is not part of
  the judged path, so the demo never depends on it.

---

## Documentation

[`docs/APPROACH.md`](docs/APPROACH.md) — **start here**: rules → design → proofs → gaps ·
[`docs/RULES_MASTER.md`](docs/RULES_MASTER.md) · [`docs/STRATEGY.md`](docs/STRATEGY.md)
· [`docs/API.md`](docs/API.md) · [`docs/REPAIR.md`](docs/REPAIR.md) · [`docs/DATABASE.md`](docs/DATABASE.md)
· [`docs/NOVELTY.md`](docs/NOVELTY.md) · [`docs/DEMO.md`](docs/DEMO.md) · [`AI_USAGE.md`](AI_USAGE.md)
· [`THIRD_PARTY.md`](THIRD_PARTY.md)

Built by **Team Voltryx** for **Tech Zephyr 4.0**. All numbers in this README are produced by this
repository; none of them were typed by hand.
