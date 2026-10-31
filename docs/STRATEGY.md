# Tech Zephyr 4.0 — CIT Campus Scheduling: rules, scoring, and how to actually win

Source of truth, in order of authority:

1. `validator.py` (shipped in the starter pack) — "If this validator and your app disagree, the validator wins."
2. `CrunchWeek_StarterPack/README.md` — data + export format.
3. `Problem statement.pdf` — what the platform must do, roles, marks, disqualification.

Everything below is derived from those three, plus a field-by-field profile of `data/cit_public.json`.

---

## 1. What we are actually building

One web platform, four roles (Admin, Department coordinator, Faculty, Club rep), that does five things:

| # | Capability | Where it is scored |
|---|---|---|
| A | Generate a full weekly timetable (189 sessions, 243h) with **zero** hard violations | Scheduling correctness (25) |
| B | Schedule 41 midsem exams (Mon–Sat, AM/PM, half-capacity rooms) | Scheduling correctness (25) |
| C | Decide 25 Spectra-week booking requests: approve / reject / alternative + reason, by priority | Booking decisions (10) + correctness (25) |
| D | Parse plain English/Hinglish requests into an editable structured booking | Use of AI (15) |
| E | Absorb a change file (leave, room closed, session added) with the **fewest moved sessions**, show the diff, apply only after Admin approves | Rescheduling (15) |

Plus: 3 timetable views (group / faculty / room), dashboard with pending approvals, conflicts and room utilisation, an AI assistant for faculty, explanations for every decision, dataset load + export, and manual event scheduling by authorised roles.

**The whole thing is one optimisation problem, not five features.** Classes, bookings and exams compete for the same rooms. The teams that build five separate modules lose to the team that builds one validity kernel used by all of them.

---

## 2. The scoreboard, and what each line really demands

| Criterion | Marks | The real requirement |
|---|---|---|
| Scheduling correctness | 25 | `25 − 3 × hard_violations`, floor 0. Checked on **our** `exports/schedule.json` **and** on a timetable the judges generate **inside our app**. So: zero violations on the public dataset, and a solver that never crashes / never returns a partial answer on a fresh reset. |
| Rescheduling | 15 | 6 = no violations after their change file. 5 = fewest sessions moved (compared across teams). 4 = clear before/after diff + working Admin approval step. **9 of 15 marks are algorithmic: minimal-move repair.** |
| Optimisation | 10 | Lowest soft penalty (S1–S6), ranked only among teams with ≥15 correctness. |
| Use of AI | 15 | Same tricky request set on every app: vague timings, conditions ("compulsory for third years"), Hinglish/mixed, priority abuse (club asking for `institute_event`), and rule-bypass attempts. |
| Booking decisions | 10 | Booking score from the validator + rejections that come with reasons a human accepts. |
| Usability + dashboard | 10 | A judge who has never seen the app can find a room, read a timetable and approve a change **using only the README and demo accounts**. |
| UI and design | 10 | Judged on the live app: readable timetable grids, laptop + phone, loading/empty/error states. |
| Code and docs | 5 | README setup works, code organised, `AI_USAGE.md` + `THIRD_PARTY.md` complete. |

Note the "20–30% judgement" you mentioned: **UI 10 + usability 10 + docs 5 = 25 marks**, and they are the cheapest 25 on the sheet because they are fully under our control. But they are also the marks that most teams lose by shipping a solver demo with no product around it. The 65 marks that matter first are: correctness 25, rescheduling 15, optimisation 10, AI 15.

**Disqualification is all-or-nothing and 100% avoidable** — see §9.

---

## 3. The constraint book (as the validator actually implements it)

### Hard — every one costs 3 marks

| Rule | Meaning | The trap |
|---|---|---|
| H1 | every session scheduled exactly once; no unknown ids; no duplicate entries | A judge's `add_session` that we drop = H1 |
| H2 | faculty not in two places | combined lectures share one faculty |
| H3 | group not in two places | *except* same `basket_slot` (each student takes only one OE) |
| H4 | room not double-booked | |
| H5 | `size ≤ room.capacity` (half capacity for exams) | 3 sessions of size 180, one of size 360 |
| H6 | `room.type ∈ session.room_types` | physics lab only in `lab_phy`; labs must also have `lab` in `allowed_uses` |
| H7 / H8 | faculty / room unavailability | |
| H9 | inside P1–P9, never **crosses** lunch (P5→P6), labs start only at P2 or P6 | "may not span lunch" in code = `per[0] <= 5 < per[-1]`, so a lab P6–P8 is fine, P1–P3 is *not* |
| H10 | `needs_accessible` → `room.accessible` | 20 sessions |
| H11 | all sessions of one `basket_slot` at the same day **and start period** | also needs 3 different rooms at that instant |
| H12 | `max_hours_per_day` (4 for all 40 faculty) | |
| H13 | approved booking must not overlap a class or another booking in that room, must fit the window, must fit capacity/needs/type, and must not clash with a `mandatory_for_groups` group | the base timetable is week 7 too |
| H14 | `fixed_slot` respected | not used in the public data, but a judge's change file can add one |
| B2 | `session_overrides` may only name an **approved** booking, and only a booking of category `institute_event` or higher may displace a class | |
| B3 | a **cancelled** request may not be approved or offered an alternative | BR-04 |
| E1/E2 | every exam scheduled once, in a valid day/session, rooms must have `exam` in `allowed_uses` | labs are **not** exam-capable, even though the PDF says "physics lab" |

### Soft — the 10 optimisation marks (lower is better)

| | Penalty | Our target |
|---|---|---|
| S1 | 2 per hour inside a faculty `avoid` preference | 0 — avoidable: only ~5 faculty have prefs, mostly "no P1" / "no P9" / "Friday afternoons" |
| S2 | 1 per idle period between a group's first and last class of the day | 0 — 21 h/week per group means each day can be one contiguous block |
| S3 | 3 per hour a group has >6 h in a day | 0 |
| S4 | 3 per repeat lecture of the same course for a group in a day (basket courses counted per course/day) | 0 |
| S5 | 1 per session using <40% of room capacity | 0 — pick tight rooms |
| S6 | 1 per session in P9 | 0 |

All 14 groups have exactly **21 hours/week** and none has a fixed slot. 21 hours over 5 days = 4+4+4+4+5 or 5+4+4+4+4, all contiguous, no P9, max 6 h/day. So **soft total 0 is achievable**, and any team above ~10 is beatable on quality. Exams add a separate `exam_soft_penalty` (5 per extra exam a group has on one day) that is reported separately — target 0 too.

### Booking scoring

`score += CAT_WEIGHT[effective_category] × (1 if approved else 0.5)`; rejected = 0.
`CAT_WEIGHT = {institute_event: 5, guest_lecture: 4, department_event: 3, club_event: 2}`.

`effective_category` **can only lower** a request: a club asking for `institute_event` is still a `club_event` (cap table), faculty asking for `institute_event` becomes `guest_lecture`, admin caps at `institute_event`. Priority = category, then earlier `submitted_at`.

I computed the ceiling for the public dataset: **max achievable booking score = 70** (all 24 non-cancelled requests, none downgraded). Every one of them is individually placeable except BR-09 and BR-17:

- **BR-09** "Valorant LAN finals, 1,200 people" — largest event room is OAT with 800. **Must be rejected**, reason: no venue seats 1,200.
- **BR-17** "Night sky watch, WED P13–P14" — the window ends at period 14, and no booking may use a period >13. A 2-period booking can never fit inside P13–P14, so it can never be `approved`. **But it can be `alternative_offered` at WED P12–P13** (verified: validator scores it 1.0 with no violation, because alternatives are allowed outside the window and score 0.5×). Reason: "requested 9–11 pm is outside the event window; OAT offered 8–10 pm". So the practical ceiling is **70 + 1 = 71 points against a max of 70**.
- Therefore **BR-09 is the only request that is impossible in every form** (no room for 1,200), and **BR-04 is cancelled**.
- **BR-04** — cancelled; decisions for it must be `rejected`/absent, never approved.
- BR-10 (photo exhibition, 9 periods, FRI P1–P9, needs accessible → only SH-1) looks scary but is free: seminar halls never take regular classes.
- BR-18 (CE-3, TUE/THU P6–P9, civil lab/workshop) steals a lab slot: MECH-WS has **7 lab sessions for 10 possible starts**, CIVIL-LAB has 3 → put BR-18 in CIVIL-LAB.
- BR-05e / BR-15 / BR-16 all want OAT on Friday evening → BR-16 (admin, institute_event, 4 periods) wins OAT P10–P13; BR-15 moves to AUD; BR-05e moves to SH-2. That sequence is exactly the priority order, and it is checkable.

**A 70/70 booking score with 0 priority inversions should be our stated target.**

---

## 4. The validator quirks that most teams won't notice

These are the places where "obviously correct" designs silently lose marks:

1. **The base timetable is also week 7.** `check_bookings` builds `week = base + overrides` and runs the *full* timetable check on it, then treats every class sitting in a room as busy. So an approved booking that lands on a class = H13. We must generate the class timetable *around* approved bookings from the start (reserve room-periods), not fix it afterwards.
2. **`alternative_offered` scores 0.5 × weight and may sit outside the window; `approved` outside the window is a hard violation.** So when a request cannot fit its window, offer an alternative (never "approve anyway"), and only reject when nothing at all fits.
3. **Priority inversions are checked only against rejected requests** — each inversion printed is a credibility hit with the judge even though it is not a hard rule. Being fully approved makes inversions impossible.
4. **`session_overrides` are expensive and risky**: every override re-runs the timetable check in the fest-week view, and only `institute_event`+ may displace a class. If our base schedule already avoids booking slots, we ship **zero overrides** — fewer moving parts, fewer H13/B2 chances.
5. **Admin "can change the priority order" is a trap.** The validator always uses the dataset's `priority_order`. If a demo lets an Admin re-order priorities and then exports decisions, our decisions can become "inversions" against the validator. Keep the dataset order authoritative for export; present any custom order as a what-if only.
6. **`role_category_cap` lowers, never raises.** Our AI layer must apply the cap *before* negotiating ("a club cannot request an institute event — it will be handled as a club event, do you want to continue?").
7. **S2 counts gaps across the whole P1–P9 span per group per day**, including a gap that straddles lunch, but a class on P5 and P6 together is contiguous.
8. **S4 counts lectures only** (kind == lecture, no basket); basket repeats are counted per (course, day) globally — so two groups' OE301 at different times on the same day is *also* penalised.
9. **Exams: no interaction with the timetable** (different week), but room capacity halves, exam rooms need `exam` in `allowed_uses`, groups can't be in two exams in one slot, and each extra exam per group per day is a 5-point soft hit. There are 41 exams and 12 slots — 0 exam penalty is achievable and it is a free differentiator.
10. **`--baseline` changes what is optional**: after a disruption, `exams` is optional in `schedule_after.json`; in `schedule.json` a missing exam schedule counts every exam unscheduled (41 × H1-shaped damage). Never omit it.
11. **`stability.sessions_moved` counts a session if *any* of day/start/room changed.** A room-only change still counts as "moved". So minimal-move repair must prefer: no change → room swap at the same time → single move → chain/Kempe exchange.
12. **The judges reset the app, generate the timetable themselves, and apply their own change files.** Anything hard-coded to `cit_public.json` values (room ids, ids, counts) is a 25-mark risk. Everything must be read from the loaded dataset.

---

## 5. How to win — the six things that separate 1st from 8th

Marks 1–6 are parity: every serious team will get near-zero hard violations. The winning margin lives here:

### 5.1 A real validity kernel, in our own code (protects 25 + 15 + 10)
One Python module (`app/core/constraints.py`) that is the single authority: `validate(schedule, dataset) -> violations`, `can_place(session, day, period, room)`, `diff(before, after)`. The validator's logic is reimplemented (not imported from a modified copy — never edit their file) so that we can call it per-candidate-move thousands of times. Every UI action, every LLM proposal, every manual booking goes through it. The LLM **never** decides validity — that rule is worth 0 on scheduling correctness if broken.

### 5.2 One joint solver, not three
Generate in this order, and treat each stage as a reservation for the next:

1. **Reserve** room-periods for the bookings that can only go one way (BR-01 AUD MON P4–5, BR-03 AUD WED, BR-10 SH-1 FRI all day, BR-11/16 OAT, BR-20 AUD FRI P4–5, BR-18 CIVIL-LAB) and the group-free constraints (`BR-08` ECE-3 THU P8, `BR-13/19` P9).
2. **Timetable**: CP-SAT / ILP. Baskets pre-assigned to one (day, start) triple, labs to {P2, P6}, big rooms contended (LH-1, LH-2, AUD for the 180/150/170/360 sessions). Objective: hard = 0, then S1–S6.
3. **Bookings**: greedy by (effective category, submitted_at) over the *reserved* view, then alternatives for leftovers, then rejections with generated reasons.
4. **Exams**: 12 slots, greedy/graph-colouring on group overlap, rooms packed to ≥ size at half capacity, minimise same-day exams per group.

If OR-Tools is not available/deployable, a hand-rolled min-conflicts + Kempe-chain search on this dataset size (189 sessions, 45 slots, 17 general rooms) converges in seconds. Recommendation: **OR-Tools CP-SAT for generation (offline/queued), our own local search for live repair** — and always cache the generated schedule so the live demo never times out.

### 5.3 Minimal-move repair (worth up to 9 of 15)
A deterministic cascade, stopping at the first success:

- Level 0: the change doesn't touch any placed session (e.g. room closed but empty) → 0 moves.
- Level 1: **room swap only**, same day/period (still counts as moved, but only 1 session).
- Level 2: single session → any free (day, period, room).
- Level 3: move the minimum set — bounded BFS / ejection chain, preferring sessions whose move does not violate S-constraints.
- Level 4: adjacent swap (two sessions exchange slots = 2 moves).
- If nothing works: **do not apply**. Show which constraints conflict (spec requires this), with the culprits named.

Ship it with a hard guarantee: repair is validated by the kernel *before* the approval screen, and the approve screen shows *only* the delta (before/after, moves count, new soft penalty). That is the 4 marks for "clear view + proper approval" and it doubles as the demo moment for the video.

### 5.4 The AI layer: a parser + negotiator, never a judge (15 marks)
Design it as **tool-calling with a schema**, and make it fail soft:

- 3 stages: `extract` (text → JSON form + confidence per field) → `resolve` (relative dates: "kal", "tomorrow", "after lunch" → periods; Hinglish numbers: "2 ghante", "100 log"; assert against the dataset) → `negotiate` (follow-up questions when attendance/window/day is missing).
- **Deterministic pre/post processors** around the LLM: regex/normaliser for dates, times and Devanagari-transliterated words, and a post-check that every room id / group id / period exists. The LLM is allowed to *propose*, the kernel *disposes*.
- Deliberate conflict handling (the sample file names them): named room not accessible → propose SH-1 and say why; size > any room → say no and offer the largest; club asking for `institute_event` → explain the cap; request overlapping a class → show the class and offer the next free window; "book the auditorium for 3 hours at 3 AM" → refuse with the calendar.
- Confidence + "assumption made" badges on the editable form (request 8 in `sample_requests.md` is graded on exactly this).
- API-key-less mode: manual form must produce the same structured object. Judges will test with credits exhausted. Add a deterministic rule-based parser fallback so the AI demo never dies.

### 5.5 Explainability as a product feature (feeds booking 10, AI 15, usability 10)
Every decision object carries a **machine-generated reason chain**, not prose the LLM invents: which constraint fired, which competing request outranked it, which alternative slots existed. Store it and show it in a "Why?" drawer. "Why is CS101 at 8 AM?" → "F01's only free window for CSE-2 without a gap was P1; P1 costs 0 in our objective because F01 has no avoid-preference; the other 1,000 candidates violated H3/H5." That is a demo-winning answer and it cannot be hallucinated.

### 5.6 Judge-proof demo (protects 10 + 10 + 5, and disqualification)
- 4 demo accounts (admin / dept / faculty / club) seeded, one-click login buttons on the login page, listed in the README.
- Admin **"Reset demo data"** button that re-seeds, re-generates and re-exports deterministically (fixed seed) — the single most valuable button for a judge under time pressure.
- Everything (timetable, bookings, exams, disruption) available from one dashboard, with deep links.
- Empty/loading/error states designed before the happy path.
- Deployed link that stays up; `/health` endpoint; SQLite or file-based storage so the free tier can't lose state.

---

## 6. Dataset profile & known tightness (use these, they will bite)

- 27 rooms, 40 faculty, 14 groups, 62 courses, 189 sessions (153 lectures, 9 tutorials, 27 three-hour labs), 25 booking requests (1 cancelled), 41 exams.
- Every group has exactly 21 h/week → the day-shape problem decides S2/S3.
- **Single-room bottlenecks**: PHY-LAB (4 sessions), MECH-WS (7 lab sessions but only 7 workshops-type rooms = 1 room × 10 lab starts), CIVIL-LAB (3), AUD (the only room for `ID101-ALL-L1` at size 360 and for 450-attendance institute events).
- **Lab starts are {P2, P6} only** → 10 lab slots/week/room. MECH-WS is 70% full before any booking.
- Sessions of 180 need LH-1/LH-2 (200) or AUD; 170 → same; 150 → LH-1/LH-2/AUD; 109/97 baskets need three rooms ≥109 simultaneously (LH-1, LH-2, LH-3/AUD set).
- Unavailability to design around: **F37** (dean) is nearly fully booked out — only P3–P5 available on Mon/Wed/Fri, none Tue/Thu; **F08** (visiting) Tue/Thu only; **F21** no Fridays; **F01/F09/F14/F25/F31** unavailable WED P6–P9; **F36** MON P1–P3. **LH-4** closed all of THU; **CR-103** closed FRI P6–P9.
- Faculty daily cap 4 h with max load 9 h/week — fine, but the fixed-unavailable blocks make some faculty's windows tight.
- 20 sessions need accessible rooms; only 15 rooms are accessible.
- Exam rooms: 19 rooms are exam-capable, 1,210 half-capacity seats per slot; largest exam is 360 (needs AUD+LH-1+LH-2, or equivalent 4+ rooms). Labs are **not** exam-capable.

The README says a zero-violation solution exists. Our job is to prove it in code, not find it by hand.

---

## 7. Recommended architecture (small, boring, deployable)

```
web (Next.js/React + Tailwind)  ──HTTP──>  api (FastAPI)
   timetable grids, dashboards,             ├── core/dataset.py     load + index + caps
   booking forms, approval diffs            ├── core/constraints.py validity kernel (single authority)
   role-aware UI                            ├── core/solver.py      CP-SAT generate + local-search repair
                                            ├── core/bookings.py    priority, alternatives, reasons
                                            ├── core/exams.py       slot colouring
                                            ├── ai/parser.py        LLM + deterministic fallbacks
                                            ├── ai/narrator.py      reason chains -> prose
                                            └── export.py           schedule.json / schedule_after.json
storage: SQLite (or JSON snapshot) + seed/reset endpoint
```
- Python API is the right call: the validator is Python, we can run it in CI on every export, and the solver lives next to the kernel.
- CI job: generate → run the **official** `validator.py` → fail the build if `hard_violation_count > 0` or `soft_total > 0`. This machine-checks our 35 marks on every commit, and it also proves the exports are app-produced.
- Deterministic seed + single "Generate" action → reproducibility for the judges' reset test.

---

## 8. Build order (max marks per hour)

1. **Kernel + dataset loader + official validator in CI** (nothing else matters until this is trusted).
2. **Generator** → `exports/schedule.json` with 0 hard violations. (25 marks, in the bank.)
3. **Exams** (free, 0-penalty) → part of correctness.
4. **Bookings** (greedy by priority + reasons) → 70/70, 0 inversions. (10 marks.)
5. **Soft-penalty pass** (contiguous days, tight rooms, no P9, no repeats) → 10 marks, plus it improves every demo.
6. **Repair engine + diff + approval** → 15 marks.
7. **AI layer** (schema-first, deterministic fallbacks) → 15 marks.
8. **UI/dashboard polish, mobile, states** → 20 marks.
9. **README, `AI_USAGE.md`, `THIRD_PARTY.md`, `.env.example`, video, deploy hardening** → 5 + protects everything.

Do not start with UI. Do not leave the video and the demo reset button to the last hour.

---

## 9. Disqualification checklist (all 100% avoidable)

- [ ] Repo public and created after the hackathon start; commit history shows real progression.
- [ ] No code from an earlier project, another hackathon, a template marketplace, or another team.
- [ ] Live link is up **until results**, opens a working app, demo accounts work.
- [ ] Demo accounts for all four roles in the README; Admin reset button exists.
- [ ] Video (≤5 min) shows: generate, plain-language → booking, blocked conflict, Spectra decisions, reschedule with diff + approval, dashboard.
- [ ] `exports/schedule.json` and `exports/schedule_after.json` generated by the app (documented one-command regeneration, and reproducible).
- [ ] `AI_USAGE.md`: every model/API called and why, every AI tool used to build it, where prompts live, and explicitly **what the LLM is not allowed to decide**.
- [ ] `THIRD_PARTY.md`: OR-Tools etc.
- [ ] `.env.example` with no real keys.
- [ ] No commits after the deadline; app frozen after submission.
- [ ] Never modify the organisers' `validator.py` or dataset (tampering = instant DQ). Vendor the original file read-only.
- [ ] Priority rules never bypassed silently (no self-approval, cap respected) — that's both the AI test and the roles test.

---

## 10. Open decisions I need from you

1. **Deadline / time left** (and team size + who does UI vs backend) — determines whether we do CP-SAT or a hand-rolled solver, and how much of the AI layer is LLM vs deterministic.
2. **LLM provider + key availability** (OpenAI / Gemini / Groq / local). Affects the parser design and whether we ship a deterministic fallback as the *primary* path.
3. **Deployment target** (Render / Railway / Fly / Vercel + separate API host) — free tier must survive 24–72 h idle, so I'd choose a single always-on container.
4. **Stack confirmation** (Next.js + FastAPI recommended) or anything your team is faster in.

Once those are answered, the next concrete step is §8 step 1–2: repo skeleton, dataset loader, validity kernel, and a generator that produces a 0-violation `exports/schedule.json` — verifiable with the official validator in CI.
