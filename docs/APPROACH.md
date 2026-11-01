# Tessera — the full approach to the CIT problem statement

This is the end-to-end plan: how the problem statement's rules and guidelines were turned into
engineering decisions, why each decision was made, what it is worth in marks, and how it is proved
correct. Every number in here was produced by running the organisers' `vendor/validator.py` and the
repository's own test suite — none of it is asserted by hand.

**Authority order** (used whenever two sources disagree):

1. `vendor/validator.py` — *"If this validator and your app disagree, the validator wins."*
2. `CrunchWeek_StarterPack/README.md` — the data model and the export format.
3. `Problem statement.pdf` — capabilities, roles, marks, disqualification.

**Evidence base for this document** (reproduced in §16):

| Check | Result |
| --- | --- |
| `validator.py` on `exports/schedule.json` | hard **0**, soft **3**, bookings **67.0**, exam soft **0**, inversions **0** |
| `validator.py` on `exports/schedule_after.json` (+ sample disruption, baseline) | hard **0**, soft **3**, **12** sessions moved (3 time, 9 room-only) |
| Timetable solver status | **OPTIMAL**, objective 3, 28.2 s |
| Repair solver status | **OPTIMAL**, 12 moves, 1.16 s |
| `api/tests` | **98 passed** |

---

## 1. Rule extraction — what is actually normative

The problem statement lists constraints in prose; the validator implements them in code, and the code
is stricter and more specific in six places. Reading the code, not the PDF, is step one of the
approach. `docs/RULES_MASTER.md` holds the full table; this is the contract each rule imposes on us.

### 1.1 Hard constraints (each violation = −3 of 25 marks)

| Rule | Normative statement | Implementation contract |
| --- | --- | --- |
| H1 | every session scheduled exactly once; no unknown ids, no duplicates | a judge's `add_session` must be **placed**, never dropped; export ids must round-trip the loaded dataset |
| H2 | faculty not in two places | occupancy per **period**, not per session (a 3 h lab occupies 3 slots) |
| H3 | group not in two places | **exemption:** sessions sharing a `basket_slot` may coincide — the group is busy once |
| H4 | room not double-booked | applies in the base week, the fest-week view, **and** exam slots |
| H5 | `size ≤ capacity` | exams count capacity at **half** (`capacity // 2`) |
| H6 | `room.type ∈ session.room_types` | labs are also excluded from teaching by `allowed_uses`; seminar halls / OAT never take classes |
| H7 / H8 | faculty / room unavailability | includes windows **added by a change file** |
| H9 | inside P1–P9, never crosses lunch, labs start at P2 or P6 | code test is `per[0] <= 5 < per[-1]` — so P6–P8 is legal, P1–P3 is not a lunch crossing |
| H10 | `needs_accessible` → `room.accessible` | 20 sessions in the public data, only 15 accessible rooms |
| H11 | one `basket_slot` → one day **and** one start period | plus 3 different rooms at that instant (sizes 109 / 97 / 89) |
| H12 | `max_hours_per_day` per faculty | sum of durations per (faculty, day); 4 h for all 40 |
| H13 | approved booking: fits **entirely inside one** window, no room overlap with a class or another booking, no clash with a `mandatory_for_groups` group, type/needs/capacity/unavailability all satisfied | the base timetable **is** week 7 — so bookings must be reserved *before* the timetable is solved |
| H14 | `fixed_slot` respected | unused in public data, but a change file can add one |
| B1 | one decision per request; status ∈ {approved, rejected, alternative_offered} | duplicate or unknown status = violation |
| B2 | `session_overrides` may only name an **approved** booking whose effective category is `institute_event` or higher | guest/department/club events may never displace a class |
| B3 | a cancelled request may not be approved or given an alternative | BR-04 |
| E1 | every exam once, day ∈ exam-week days, session ∈ {AM, PM} | a missing `exams` array in `schedule.json` = 41 unscheduled exams |
| E2 | exam rooms need `exam` in `allowed_uses` | labs are **not** exam-capable, contradicting the PDF's prose — validator wins |

**Golden UI rule that follows from all of it:** there is no force/override/"save anyway" button
anywhere. The kernel refuses, the UI explains. A judge cannot make the app emit an invalid schedule,
which is what protects the 25 marks when they poke at it.

### 1.2 Soft constraints (the 10 optimisation marks, ranked among teams scoring ≥15 correctness)

| | Validator formula | Notes that bite |
| --- | --- | --- |
| S1 | `+2` per hour a faculty teaches inside an `avoid` preference (day must match) | preferences are soft, `unavailable` is hard — do not confuse them |
| S2 | `+1` per idle period between a group's first and last class of a day | gaps **across** lunch count; P5+P6 back-to-back is contiguous |
| S3 | `+3` per hour above 6 in a group's day | |
| S4 | `+3` per repeat lecture of the same course for a group in a day | only `kind == lecture` without a basket; basket repeats counted per (course, day) **globally** |
| S5 | `+1` if `size / capacity < 0.4` | prefer tight rooms |
| S6 | `+1` if the session touches P9 | |
| Exam soft | `+5` per extra exam a group sits on the same day | reported separately |

### 1.3 Booking scoring

```
effective_category = min(requested_category, role_category_cap[role])   # on priority_order; only ever lowers
priority           = (effective_category rank, submitted_at)            # ties → earlier submission
score             += CAT_WEIGHT[effective_category] × (1 if approved else 0.5)   # rejected = 0
CAT_WEIGHT         = {institute_event 5, guest_lecture 4, department_event 3, club_event 2}
```

`approved` **must** sit inside a requested window; anything outside must be `alternative_offered`
(half score) — approving outside the window is a hard violation, not a soft one. Both
`rejected` and `alternative_offered` must carry a human-readable `reason` (validator warns; judges
score the reason). **Priority inversions** — a rejected request that could have taken a slot held by a
lower-priority approved one — are printed by the validator and read as "wrong decision" even though
they are not hard violations. Target 0.

### 1.4 Process rules (§6/§7) and disqualification (§9) → engineering controls

Rules that are not about scheduling still cost marks or the whole submission, so each one gets a
control in the repo rather than a promise:

| Rule | Control |
| --- | --- |
| Declare all AI use, or lose 10 | `AI_USAGE.md` (models, purposes, build tools, prompt location, what the LLM may not decide) |
| LLM may not decide validity, or 0 for correctness | `core/constraints.py` is the only authority; every LLM output is schema- and existence-checked and then **re-parsed by our deterministic reader** (§9) |
| Manual form must work with the LLM down | `LLM_PROVIDER=none` is the `.env.example` default; CI smokes the API with no LLM configured and asserts 0 hard violations |
| Own keys, never committed | `tools/check_secrets.py` runs first in CI; `.env` is gitignored; `tools/set_groq_key.py` writes it locally |
| Open-source libs declared | `THIRD_PARTY.md` with licences and purpose |
| `exports/` must be app-generated | only `core/export.py` writes them; CI re-validates both files against the vendor validator on every push |
| Repo public, created during the hackathon, no post-deadline commits | branch discipline + a freeze time; nothing in the app depends on writable organiser files |
| Video ≤ 5 min showing the working site | `docs/DEMO.md` script; link belongs in the README (§15, gap G2) |

---

## 2. Decomposition — ten capabilities, five cores, one shell

The problem statement's §2 lists ten capabilities. The approach is to **not** build ten features:
classes, bookings and exams compete for the same 27 rooms, so they are one optimisation problem with
one validity kernel and five computational cores.

| §2 requirement | Core that solves it | Surface where a judge sees it |
| --- | --- | --- |
| 1 clash-free weekly timetable | A — CP-SAT generator | Mosaic Board, Availability, Groups, People |
| 2 midsem exams | C — exam scheduler | Examinations |
| 3 English/Hinglish request → editable booking | AI layer (§9) + B | Bookings → new request |
| 4 approve / reject / alternative + reason by priority | B — booking engine | Bookings, public `/ledger` |
| 5 changes: fewest moves, diff, admin approval, conflict naming | D — minimal-move repair + unsat-core explanation | Approvals, Ripple |
| 6 views by group / faculty / room, approvals, conflicts, utilisation | shell + kernel | Mosaic, People, Reports, Availability |
| 7 AI assistant for change requests, validated before applying | D + AI layer | Intelligence |
| 8 explain decisions | E — reason chains | "Why?" drawer, session explain endpoint |
| 9 admin loads dataset/change files, exports `schedule.json` | pipeline + export | Operations |
| 10 manual event scheduling under hard constraints | kernel-gated manual form | Bookings → manual event (+ `/check` dry run) |

---

## 3. Architecture

```
React/Vite workspace (role-aware UI, offline snapshot fallback)
        │  same-origin /api  (Vite proxy in dev; one service in prod)
        ▼
FastAPI ── routers: auth · dataset · timetable · bookings · exams · disruption · ai · admin
        │           (RBAC: require_roles / require_admin; four-eyes on approvals)
        ▼
services/state.py ── single in-memory + SQLite-backed workspace state, audit trail
        ▼
core/  dataset.py      load + index + derived caps (never hard-code dataset values)
       constraints.py  VALIDITY KERNEL — H1–H14, B1–B3, E1–E2, S1–S6 (single authority)
       solver.py       A: CP-SAT timetable (block model)
       bookings.py     B: priority + damage-aware decisions, reason chains
       exams.py        C: CP-SAT half-capacity exam packing
       repair.py       D: probe-zero → minimal-move CP-SAT → unsat-core explanation
       disruption.py   change-file application (strict: unknown ids raise)
       export.py       the only writer of exports/*.json
       pipeline.py     dataset → bookings → timetable → exams → export → validate
        ▲
ai/    normalizer.py   deterministic reader (always runs, no key needed)
       parser.py       booking draft: rules first, LLM merged only where rules found nothing
       change.py       second reader that re-parses the LLM's canonical sentence
       providers.py    Groq client: temp 0, json_object, 12 s timeout, 1 retry, 8b fallback
       budget.py       daily/per-minute budget so a judge's loop cannot exhaust the key
```

Three properties this shape buys:

1. **One kernel, many callers.** The solver, the booking engine, the repair model, the manual-event
   form and the API validators all call `constraints.py`. A rule fixed once is fixed everywhere, and
   the number the UI shows is the number the validator prints.
2. **Reservations flow forward.** Booking decisions are computed *first* and handed to the timetable
   solver as hard reservations (`reserved_rooms`, `blocked_groups`). This is what makes H13
   structural instead of something to clean up later, and it is why we can ship **zero
   `session_overrides`** — fewer moving parts, fewer B2/H13 chances.
3. **The vendor files are read-only.** `vendor/validator.py` and `vendor/cit_public.json` are never
   imported by application logic and never edited (tampering is a DQ trigger). Our kernel is an
   independent re-implementation, checked against theirs (§13).

---

## 4. Core A — timetable generation

**Model.** For every (student group, day) CP-SAT chooses a *contiguous block*: a start period and a
length. Every session a group attends that day must lie fully inside the block, and the block lengths
across the week must sum to the group's real contact hours.

That single modelling choice makes the two biggest soft penalties **structurally zero** rather than
merely penalised:

* **S2** (idle period between classes) — a block has no holes by construction.
* **S3** (> 6 h in a day) — a block is never longer than `max_hours_per_day`.

What is left to optimise is the genuine trade-off: **S1** (faculty avoid-preferences, 2/hour),
**S5** (undersized rooms), **S6** (P9). **S4** is imposed as a *hard* constraint wherever it is
provably satisfiable (`feasible_gc`: the course's lectures can be spread over enough distinct days
given faculty availability) and stays soft otherwise — which is exactly the F08 case in §12.

**Candidate enumeration.** A boolean `x[session, day, start, room]` is created only for combinations
that already pass every *unary* hard rule (room type, capacity, accessibility, lab start, lunch,
fixed slot, room unavailability, fest-week reservations). Pruning at enumeration time keeps the model
small enough to solve to proven optimality instead of heuristically.

**Elective baskets.** For each `basket_slot` a single `y[basket, day, start]` picks the shared time
(H11), and per-member `z[session, day, start, room]` variables pick distinct rooms with
`sum(z) == y`. Group occupancy is registered once from `y`, which encodes the H3 exemption directly
in the model instead of post-filtering it.

**Hard resource caps.** `sum ≤ 1` over room-, faculty- and group-occupancy per (day, period), plus
`sum(durations) ≤ max_hours_per_day` per (faculty, day) (H12).

**Resilience ladder.** Because the rescheduling marks are measured as *sessions moved after a judge
closes a room*, the base timetable is built to survive closures: no room carries more than
`room_day_cap = 3` sessions in a day or `room_week_cap = 12` in the week (a minimax on the worst
room). The pipeline tries `(3, 12) → (4, 14) → (no caps)` and takes the first feasible rung, so
resilience is never bought with validity. On the public dataset the caps cost **nothing** in soft
score.

**Fallback.** If the block model is ever infeasible (an adversarial change file), `tight=False` drops
the block structure and puts S2/S3 back into the objective via `_soft_gaps` (prefix/suffix-OR gap
detection). We still export something valid instead of nothing — and the pipeline raises rather than
writing a partial schedule, because a partial schedule is H1 damage on every missing session.

**Determinism.** Fixed seed (`SOLVER_SEED`), fixed worker count, fixed time limit. Judges reset the
app and regenerate; the same numbers must come out, or the exports look hand-made.

---

## 5. Core B — Spectra-week booking decisions

Order of operations, mirroring the validator's own ordering so our decisions and its score agree:

1. Sort by `(effective_category rank, submitted_at, id)` — the dataset's `priority_order`, with the
   role cap applied first (a club asking for `institute_event` is handled as a `club_event`, and the
   UI says so before negotiating).
2. Cancelled requests (BR-04) are decided as `rejected` with the withdrawal reason and can never be
   approved (B3).
3. For each request, enumerate every room/time the validator would accept: `event` in
   `allowed_uses`, type match, `capacity ≥ attendance`, all `needs` present (with `accessible`
   treated as a feature), not room-unavailable, and not already busy.
4. Score each feasible candidate by **damage to teaching** rather than by convenience: evening
   periods (P10–P13) and event-only rooms cost 0; a teaching room in P1–P9 costs
   `100 × teaching_periods + 8 × room_pressure + 40`, discounted by 15 if it is the requester's
   wished room. `room_pressure` counts how many sessions could use that room, so the engine does not
   hand the auditorium to a club when a lecture needs it.
5. Approve the least-damaging **in-window** slot. If only out-of-window slots exist →
   `alternative_offered` (never `approved`). If nothing exists → `rejected`.
6. Every non-approval carries a generated **reason chain** naming the real blocker (capacity ceiling,
   window outside P1–P13, outranked request with its id and category, missing feature).
7. Return `reserved_rooms` / `blocked_groups` to Core A so the timetable is solved around the
   decisions.

Because everything placeable is placed, **priority inversions are impossible by construction** — an
inversion needs a rejected request, and we only reject when no room/time exists at all.

---

## 6. Core C — exam scheduling

A second CP-SAT model, independent of the teaching week: `a[exam, day, slot]` (exactly one) and
`b[exam, room, day, slot] ≤ a`, with `Σ seats[room] × b ≥ size × a` where `seats = capacity // 2`
(H5 for exams, E2 for room eligibility). Room-per-slot ≤ 1 (H4) and group-per-slot ≤ 1 (H3). The
objective minimises extra same-day exams per group (the 5-point exam soft penalty). Result on the
public dataset: **41/41 exams, exam soft penalty 0**.

---

## 7. Core D — disruption handling and minimal-move repair

This is where 9 of the 15 rescheduling marks are algorithmic, so the objective is literally the
metric the validator reports:

```
minimise   10_000 × (sessions whose day/start/room differ from the baseline)  +  soft penalty
```

One move is worth 10,000 soft points, so a move is never traded for a nicer room; among equally
minimal solutions the solver prefers **room-only** changes over time changes (both count as one move,
but a room swap costs students nothing), then a lower soft penalty. A second lexicographic pass locks
the move count and minimises soft cost *within* that move set, so a forced move does not leave a
permanent hole in a group's day.

Cascade, stopping at the first success:

1. **`probe_zero_moves`** — if the change touches nothing placed (session removed, faculty added,
   room closed while empty) return 0 moves in ~2 s.
2. **Strict repair** — minimal moves with the 6 h group-day cap enforced.
3. **Relaxed repair** — same objective, cap relaxed (a judge's change file may make S3 unsatisfiable;
   S3 is soft, so we may spend it, and we say so).
4. **Refuse + explain** — no schedule is written at all.

Change-file application is strict: unknown ids raise rather than being silently ignored, because a
dropped `add_session` is an H1 violation in the export.

**The infeasibility explanation.** `explain()` rebuilds the model with one *assumption literal* per
session ("this session may be placed") and asks OR-Tools for the **sufficient assumption set for
infeasibility** — a computed answer to the problem statement's "say which constraints are in
conflict", naming the actual sessions and the binding constraints, plus suggestions. No other layer
guesses at this, and the LLM never authors it.

**Approval step.** Repair results are *proposals*: `POST /api/disruption/preview[-file]` computes and
stores one, `POST /api/disruption/{id}/apply` (admin) commits it, `POST /api/disruption/{id}/reject`
discards it. Nothing reaches the dataset or the export without an admin who did not author it
(four-eyes, §10). The proposal payload carries `moved[]` with before → after, the kind of change
(`room_only` / `period_changed` / `day_changed`), the reason, the move count, the new soft penalty and
the validation report — which is the 4 marks for "clear view + proper approval".

---

## 8. Core E — explainability

Every decision object carries a machine-generated **reason chain**: which rule fired, which competing
request outranked it (with id and category), which alternatives existed and why they were worse, and
what the cost would have been. `GET /api/timetable/sessions/{id}/explain` answers "why is this class
at 8 AM?" from the candidate set the solver actually saw. The LLM may *re-word* a chain that already
exists (`prompts/explain_decision.md`); it may not create a new reason or a new fact. This is why
explanations cannot hallucinate and why the same feature feeds three criteria: booking decisions (10),
use of AI (15), usability (10).

---

## 9. The AI layer — a parser and negotiator, never a judge

The rules are explicit: if validity depends on an LLM we score **0** for scheduling correctness, and
undeclared AI use costs 10. So the layer is designed as *rules first, model second, gate always*:

1. **Deterministic normaliser** (`ai/normalizer.py`) always runs: Hinglish and English tokens,
   relative days ("kal", "tomorrow"), "after lunch", Hindi/English numerals ("2 ghante", "100 log"),
   period ↔ clock-time conversion, department and society names.
2. **Optional LLM extraction** merged **only into fields the rules left empty** — the model can rescue
   a sentence the rules could not read, never override one they could.
3. **Schema + existence gate**: every room id, group id, faculty id, category and period is checked
   against the loaded dataset; invented ids are dropped, not corrected.
4. **Feasibility from the kernel**, never from the model: the draft arrives with the real conflicts,
   the effective category after the role cap, and the free alternatives.
5. **Explicit assumptions**, not silent defaults: anything guessed is returned as an
   `{field, value, why}` assumption and rendered as an editable badge, so the user checks and edits
   before submitting (requirement 3).
6. **Second reader for change requests** (`ai/change.py`): the model's JSON is converted to a
   canonical sentence and **re-parsed by the deterministic reader**. A disagreeing model cannot
   override a clear sentence, and an invented course code disappears because the canonical sentence
   does not re-parse. Proven by `api/tests/test_change_llm.py` and `test_llm.py`.
7. **Failure mode is a feature**: `temperature=0`, `response_format=json_object`, 12 s timeout, one
   retry, `llama-3.1-8b-instant` fallback on 429/5xx, and a daily/per-minute budget
   (`/api/ai/budget`) so a judge's loop cannot exhaust the key mid-demo. With `LLM_PROVIDER=none` the
   rule parser and the manual form produce the same structured booking — CI asserts this.

**Adversarial playbook** (the same tricky set is tried on every app, worth 15 marks):

| Judge's move | Our response |
| --- | --- |
| Vague timing ("next week sometime", "evening") | one blocking follow-up question; assumption badge if still absent; never a silent default |
| Conditions ("compulsory for third years") | mapped to `mandatory_for_groups` and enforced as H13 group-free checks |
| Priority abuse (club claims `institute_event`) | cap applied before negotiation, explained: "handled as a club event — continue?" |
| Hinglish / mixed script | deterministic normaliser handles it with no key at all |
| Rule-bypass ("approve it anyway", "ignore the clash", "3 AM in the auditorium") | refused by the kernel with the calendar/rule cited; no override control exists in the UI |
| Impossible request (1,200 people, 800-seat campus) | rejected with the real ceiling named and a constructive suggestion |

---

## 10. Roles, approvals, manual scheduling

Four roles with fixed capability sets (`api/app/auth.py`), enforced server-side by `require_roles`,
never by hiding buttons alone:

| Role | Capabilities |
| --- | --- |
| Admin (Dean's office) | load dataset, generate, validate, export, reset demo data, approve proposals and any booking that moves a class, manual events, view all |
| Department coordinator | request changes to own department's sessions, book department rooms, approve bookings of own department's labs |
| Faculty | own timetable, mark unavailability, request extra/moved sessions |
| Club representative | submit, track, cancel venue requests; see status and reason |

**Nobody approves their own request** — enforced by comparing the proposal author with the approver,
which is why two admin seats are seeded (`admin@cit.edu`, `dean@cit.edu`). Every state change writes
an audit row (`/api/admin/audit`), so the approval story is inspectable rather than claimed.

**Manual events** (requirement 10) go through `POST /api/bookings/manual/check` (dry run that returns
the exact rule verdicts) before `POST /api/bookings/manual`, and both are kernel-gated: a manual event
that would break a hard constraint cannot be created by any role, including admin.

---

## 11. The product shell — 20 marks that are fully under our control

Usability (10) + UI (10) are judged on the live app by someone who has never seen it, using only the
README and demo accounts. Approach:

* **Two clicks from the README to any answer**: one-click demo login buttons per role on the login
  screen (a judge never types a password but still gets a real signed JWT); find a room (Discovery /
  Availability), read a timetable (Mosaic by group / faculty / room), approve a change (Approvals).
* **Dashboard first**: Overview carries pending approvals, current conflicts and room utilisation —
  the three things §2.6 names — with deep links into each.
* **States designed before the happy path**: loading, empty and error states on every data surface;
  cold-start on the free tier says "warming up" instead of hanging; generation is an explicit admin
  action with progress, so no page load ever blocks on a 30 s solve.
* **Readable grids and responsive layout**: period-accurate timetable grids, laptop and phone widths,
  consistent styling; the public `/ledger` shows every booking verdict with its reason for a
  logged-out judge.
* **Offline snapshot** (`frontend/src/data/snapshot.json`) so the workspace renders even if the API is
  asleep, and the frontend CI smokes every route headlessly.

---

## 12. Scoring maths — the proven floor and the proven ceiling

Two numbers in older planning docs are wrong, and they matter because they send a teammate chasing
marks that do not exist. Both were recomputed from the validator's own code and data:

### Soft penalty: the floor is **3**, and we are at it

`S4` charges `+3` per repeat lecture of the same course for a group in a day. Faculty **F08**
(Prof. Vikram Rao, visiting) teaches exactly `CS204-L1/L2/L3`, all lectures, all for group `CSE-2`,
and is **fully unavailable MON, WED and FRI**. Only TUE and THU remain, so by pigeonhole at least two
of the three lectures share a day: `S4 ≥ 3 × (2 − 1) = 3`. Since S1, S2, S3, S5, S6 are all
non-negative, **soft_total ≥ 3 for any legal schedule of this dataset**. Our export scores
`{S1 0, S2 0, S3 0, S4 3, S5 0, S6 0}` = 3, and the solver returns **OPTIMAL** with objective 3.
The timetable is provably soft-optimal — this is the floor, not a shortfall. (Faculty assignment is
given in the dataset, so reassigning F08 is not available to us.)

> Correction: `docs/STRATEGY.md` §3 says "soft total 0 is achievable". It is not.

### Booking score: the ceiling is **67.0**, and we are at it

The validator's `max_score` sums `CAT_WEIGHT` over **non-cancelled** requests = **70** (BR-04 is
excluded). Three of those points are unwinnable:

| Request | Why it cannot be won | Points |
| --- | --- | --- |
| BR-04 | cancelled → B3 forbids approve/alternative | excluded from the 70 already |
| BR-09 | 1,200 attendees; largest venue on campus is OAT at 800 → no legal placement exists | −2 |
| BR-17 | only window is WED **P13–P14**; `MAX_PERIOD = 13`, so a 2-period booking can never fit inside it → `approved` is impossible, `alternative_offered` (WED P12–P13) scores 0.5 × 2 | −1 |

`70 − 2 − 1 = ` **67.0**. Our export scores exactly **67.0** (22 approved, 1 alternative, 2 rejected,
**0 priority inversions**).

> Correction: `docs/RULES_MASTER.md` E9 and `docs/STRATEGY.md` §3 stated a ceiling of 71 ("70 max +
> BR-17's 0.5×2"). That double-counts BR-17 (its 2 points are already inside the 70) and forgets
> BR-09. The reachable ceiling is 67.0. Both files are now corrected; the hour-by-hour plans
> (`PLAN_22H.md`, `PLAN_SOLO_22H.md`, `SIMPLE_HINGLISH.md`) still quote 71 as a historical target and
> are superseded by this section. `README.md` already carried the correct numbers.

### Rescheduling: 12 moves is proven optimal for the sample disruption

Repair returns **OPTIMAL** with `moves = 12` (3 time-changed, 9 room-only) in 1.16 s, and the
post-disruption schedule validates at **0 hard violations** and soft 3. Because the objective is
exactly the validator's `sessions_moved` and CP-SAT proved it optimal, no strategy can move fewer
sessions for this change file. The room-only bias (9 of 12) is deliberate: those cost students
nothing.

### Where the marks are

| Criterion | Marks | Our position | Remaining headroom |
| --- | --- | --- | --- |
| Scheduling correctness | 25 | 0 hard on both exports; 98 tests; kernel-gated UI; no override path | protect against a judge's *fresh* generation on the free tier (timeout, workers=1) |
| Rescheduling | 15 | 0 violations, proven-minimal moves, diff + four-eyes approval | keep repair under the request timeout for adversarial change files |
| Optimisation | 10 | **at the proven floor (3)** | none — say so, with the proof, in the demo |
| Use of AI | 15 | rules-first, gated, budgeted, keyless-mode proven | polish the adversarial answers' wording |
| Booking decisions | 10 | **at the proven ceiling (67.0)**, 0 inversions, reasons on every non-approval | none |
| Usability + dashboard | 10 | two-click paths, reset button, public ledger | judge walkthrough rehearsal |
| UI and design | 10 | responsive, states designed, offline snapshot | phone-width QA pass |
| Code and docs | 5 | README, `docs/*`, AI + third-party declarations | close gaps G1–G4 below |

---

## 13. Verification loop — how "correct" is proved, not asserted

1. **Kernel ↔ validator parity.** `core/constraints.py` is an independent re-implementation of the
   organisers' rules so it can be called thousands of times per solve. Parity must be *tested*, not
   assumed: a self-check should run both verdicts over the same schedules (base, fest-week view,
   post-disruption, plus deliberately broken variants) and fail on any disagreement. **This is gap G1
   — `tools/selfcheck.py` is referenced by `constraints.py` and `THIRD_PARTY.md` but does not exist
   yet.**
2. **CI on every push** (`.github/workflows/ci.yml`): secrets scan → install → 98 tests → the
   **vendor validator** run on both committed exports → **fail on any hard violation** → API smoke
   with `LLM_PROVIDER=none` asserting 0 hard violations and 22 approved bookings → frontend
   typecheck (no `any`), production build, headless route smoke.
3. **Determinism.** Fixed solver seed and the committed exports regenerated by one command; CI
   re-validates what is committed, so a hand-edited export cannot survive a push.
4. **Judge simulation.** Reset demo data → generate in-app → validate → apply a *new* change file →
   inspect the diff → approve with the second admin → export → validate again. Run before every
   deploy, and as the video script.

---

## 14. Deployment and submission

* **Two services, one blueprint** (`render.yaml`): `tessera-api` (FastAPI + OR-Tools, free tier,
  Singapore, `/health` check, `SOLVER_WORKERS=1`) and `tessera-web` (static Vite build). The UI and
  the solver scale separately, and the browser only ever talks to one origin.
* **Ephemeral filesystem handled**: `LOAD_COMMITTED_EXPORTS=true` rebuilds SQLite and `./exports` from
  the committed bundle on every boot, so a restart loses nothing that matters; an external ping every
  ~10 min keeps the free instance warm.
* **Secrets**: `JWT_SECRET` generated by the platform, `GROQ_API_KEY` in the dashboard only,
  `.env.example` ships every variable with no real values.
* **Submission artefacts**: public repo, README (description, architecture diagram, tech stack, setup,
  five demo accounts, known limitations), `.env.example`, `AI_USAGE.md`, `THIRD_PARTY.md`,
  `exports/schedule.json`, `exports/schedule_after.json`, live link up until results, ≤5 min video.
* **Freeze**: no commits and no deploy changes after the deadline; re-check repo visibility, live link
  and all five logins on freeze day.

---

## 15. Gap register — what is left, in priority order

| # | Gap | Why it matters | Fix | Effort |
| --- | --- | --- | --- | --- |
| **G1** | `tools/selfcheck.py` does not exist, yet `core/constraints.py` and `THIRD_PARTY.md` claim it (and CI) compare our kernel with the vendor validator | docs claim a verification that is not there (code & docs 5); and kernel drift is the one failure that silently costs 25 + 15 + 10 | write `tools/selfcheck.py`: run both verdicts over base / fest-week / post-disruption / deliberately-broken schedules, diff by rule, exit non-zero; add a CI step | 1–2 h |
| **G2** | The video is recorded (`Recording 2026-11-01 025959.mp4`, 20 MB, committed to the repo) but no unlisted YouTube/Drive link is in the README | **DQ trigger** if no video link is submitted; a 20 MB binary in git also bloats the repo judges clone | upload unlisted, paste the link in the README table, `git rm --cached` the mp4 (and the stray screenshot) | 30 min |
| **G3** | Stray tracked files: `wappalyzer_raycast-com.csv`, `Screenshot 2026-10-31 214306.png`, and `CrunchWeek_StarterPack (1)/` which duplicates `vendor/` | unrelated files read as sloppiness (code & docs); duplicated organiser data invites "which copy is authoritative?" | delete the CSV/screenshot; keep one vendored copy of the starter pack under `vendor/` | 15 min |
| **G4** | ~~Stale targets in `docs/STRATEGY.md` and `docs/RULES_MASTER.md` E9~~ — **done**: both now carry the §12 proofs (floor 3, ceiling 67.0). The historical plans (`PLAN_22H.md`, `PLAN_SOLO_22H.md`, `SIMPLE_HINGLISH.md`) still quote 71 | a teammate burns hours chasing 4 phantom points and a soft score that cannot exist | nothing further unless a plan doc is revived — then port the §12 numbers | — |
| **G5** | Judge-side generation on a free instance takes ~28–45 s (limit 120 s, 1 worker) | correctness is also scored on the timetable *they* generate in our app | keep generation async with progress, surface the solver status/objective, and warm the instance before the demo; verify a fresh reset→generate→validate cycle end-to-end on the deployed link | 1 h |
| **G6** | Adversarial change files are only exercised against `sample_disruption.json` in CI | 6 of the rescheduling marks depend on *their* file, which may add `fixed_slot` sessions or close a lab all week | add a fixture set (fixed-slot add, full-week lab closure, faculty full-week leave, remove+add pair) and assert refuse-with-explanation where no repair exists | 2 h |

Nothing in the current exports is blocked by these; G1–G4 are hygiene and honesty items that protect
marks already earned.

---

## 16. Reproduce every number in this document

```bash
# from the repository root
pip install -r api/requirements.txt

# 1. generate the timetable + booking decisions + exams, then repair after the sample disruption
cd api && python -m app.core.pipeline \
  --data ../vendor/cit_public.json --out ../exports/schedule.json \
  --after ../exports/schedule_after.json --disruption ../vendor/sample_disruption.json \
  --report ../docs/validation-report.json --workers 1 && cd ..

# 2. the organisers' verdict on both files
python vendor/validator.py --data vendor/cit_public.json --schedule exports/schedule.json
python vendor/validator.py --data vendor/cit_public.json --schedule exports/schedule_after.json \
       --disruption vendor/sample_disruption.json --baseline exports/schedule.json

# 3. the test suite (98 tests: kernel, exports, repair, API, LLM contracts, UI)
cd api && python -m pytest tests -q
```

Related docs: [`RULES_MASTER.md`](RULES_MASTER.md) (the rule contract) · [`STRATEGY.md`](STRATEGY.md)
(scoring analysis) · [`REPAIR.md`](REPAIR.md) (Core D in detail) · [`API.md`](API.md) ·
[`DEMO.md`](DEMO.md) · [`../AI_USAGE.md`](../AI_USAGE.md) · [`../THIRD_PARTY.md`](../THIRD_PARTY.md).
