# RULES MASTER — Tech Zephyr 4.0 / CIT Scheduling

**This file is the contract. If a teammate wants to do something not listed here, it needs a review.**
Authority order: `validator.py` > starter-pack `README.md` > `Problem statement.pdf`.
Vendor the original validator + dataset read-only. **Never edit them.**

Legend: 🔴 = disqualification risk · 🟠 = marks lost · 🟢 = required to score

---

## A. Disqualification — 12 ways to lose everything (all avoidable)

| # | Rule | Our control | Owner | When checked |
|---|---|---|---|---|
| A1 🔴 | GitHub repo must be **public** and openable at any time until results | public repo, re-check at H20 | D | H20 |
| A2 🔴 | Repo must be **created after the hackathon started**; commit history is audited | repo created H0, small real commits | D | H21 |
| A3 🔴 | No code from an earlier project, another hackathon, a bought template, or another team | we write everything; vendor only the organisers' files | all | continuous |
| A4 🔴 | **Live deployed link** must work and stay up until results | deploy at H0, keep-alive, `/health`, single container | D | continuous |
| A5 🔴 | **Demo accounts for all 4 roles** in the README + working on the live link | seeded at H0, re-verified H20 | D | H20 |
| A6 🔴 | **Video ≤ 5 min** showing the working website | record H19 | D | H20 |
| A7 🔴 | `exports/schedule.json` + `exports/schedule_after.json` must be **produced by the app** | CI generates exports; documented one command; reproducible seed | A | H6, H21 |
| A8 🔴 | Results must not be hand-made/hard-coded/edited | no copy-paste JSON into exports; only `export.py` writes them | A | H21 |
| A9 🔴 | No commits or deploy changes after the deadline | **freeze H21:00** | all | H21 |
| A10 🔴 | Nobody outside the registered team writes code (declared AI tools are fine) | we use AI openly + declare it | all | H21 |
| A11 🔴 | Do not tamper with the validator or the organisers' files | `vendor/` read-only, never patched | A | continuous |
| A12 🔴 | Do not interfere with other teams' work/accounts/deployments | — | all | continuous |

**Also DQ-adjacent (they call it out explicitly):** hiding AI use. Declare everything → no penalty. Undeclared → **−10 and reputational damage**.

---

## B. Submission checklist (every item literally exists in the repo)

- [ ] `README.md`: short description, **architecture diagram**, tech stack, setup steps, **demo accounts (4 roles)**, known limitations
- [ ] `.env.example` with **every** env var, no real keys
- [ ] `AI_USAGE.md` — all models/APIs called + what for; all AI tools used to build; where prompts live; **what the LLM may not decide**
- [ ] `THIRD_PARTY.md` — OR-Tools, frameworks, icon sets, datasets
- [ ] `exports/schedule.json` — timetable + exams + fest week, app-generated
- [ ] `exports/schedule_after.json` — after `examples/sample_disruption.json`, starting from the above
- [ ] Live link, up until results
- [ ] 4 demo accounts on the live app; **Admin reset-demo-data button**
- [ ] Video walkthrough (≤5 min, unlisted YouTube or view-access Drive) covering: generate → plain-language request → booking → blocked conflict → Spectra decisions → reschedule with diff + approval → dashboard

---

## C. Hard constraints (each violation = −3 marks; the validator counts them)

| Rule | Statement | Implementation detail that bites |
|---|---|---|
| H1 🟠 | Every session scheduled **exactly once**, one day / start / room; no unknown ids; no duplicates | A judge's `add_session` that we silently drop = H1. Unknown session id in output = H1. |
| H2 🟠 | Faculty not in two places at once | Combined lectures share one faculty — check per hour, not per session. |
| H3 🟠 | Group not in two places at once | **Exception:** sessions with the **same** `basket_slot` may coincide (each student takes one). |
| H4 🟠 | Room not double-booked | Also applies inside the fest-week view and to exam rooms. |
| H5 🟠 | `session.size ≤ room.capacity` | **Exams: capacity is halved.** |
| H6 🟠 | `room.type ∈ session.room_types` | Labs also need `lab` in `allowed_uses`; seminar halls/OAT never take regular classes; **labs are not exam-capable**. |
| H7 🟠 | Faculty unavailability respected | Includes unavailability added by a change file. |
| H8 🟠 | Room unavailability respected | Same. |
| H9 🟠 | Inside P1–P9; **never crosses lunch** (P5→P6); labs start only at **P2 or P6** | Code test is `first <= 5 < last`. Labs are 3 h → P2–P4 or P6–P8 only. |
| H10 🟠 | `needs_accessible` → room must be accessible | 20 sessions in public data. |
| H11 🟠 | All sessions of a `basket_slot` at the **same day *and* start period** | Plus 3 different rooms simultaneously (109/97/89 sizes). |
| H12 🟠 | `max_hours_per_day` per faculty (4 in this dataset) | Sum durations per (faculty, day). |
| H13 🟠 | Approved booking must: fit entirely inside **one** requested window, not overlap a class or another booking in that room, not clash with a `mandatory_for_groups` group, match type/needs/capacity, and respect room unavailability | Approving outside the window is a **hard** violation → use `alternative_offered` instead. |
| H14 🟠 | `fixed_slot` respected | Not used in public data, but a change file can add one. |
| B1 🟠 | One decision per request id; status ∈ {approved, rejected, alternative_offered} | Duplicate decision = violation; unknown status = violation. |
| B2 🟠 | `session_overrides` may only reference an **approved** booking, and only a booking whose **effective category is `institute_event` or higher** may displace a class | Exams + regular sessions outrank; guest/department/club may not displace. |
| B3 🟠 | A **cancelled** request may not be approved or given an alternative | BR-04. |
| E1 🟠 | Every exam scheduled exactly once, valid day ∈ exam_week days and session ∈ {AM, PM} | A missing exam schedule in `schedule.json` = every exam unscheduled. |
| E2 🟠 | Exam rooms must have `exam` in `allowed_uses` | Labs excluded even though the PDF says "physics lab". |

**Golden rule for the UI:** there is **no force/override button**. The kernel refuses; the UI explains.

---

## D. Soft constraints (optimisation marks; lower total is better)

| | Penalty formula | Our target |
|---|---|---|
| S1 | +2 for **each hour** a faculty teaches inside an `avoid` preference (only if the day matches; periods list) | 0 |
| S2 | +1 for each idle period between a group's first and last class in a day (lunch gap counts as a gap) | 0 |
| S3 | +3 for each hour above 6 in a group's day | 0 |
| S4 | +3 for each repeat **lecture** of the same course for a group in a day; basket courses counted per (course, day) globally | 0 |
| S5 | +1 if `size / capacity < 0.4` | 0 |
| S6 | +1 if the session touches **P9** | 0 |
| Exam soft | +5 for each extra exam a group has on the same day | 0 |

Note: optimisation marks are **ranked across teams that already score ≥15 correctness**. Great soft scores with a broken timetable earn nothing.

---

## E. Booking decisions (10 marks + credibility)

1. **Effective category only goes down**, never up: `min(requested_category, role_category_cap[role])` on the priority scale.
   `admin → institute_event`, `faculty → guest_lecture`, `department_coordinator → department_event`, `club → club_event`.
2. **Priority order (authoritative, from the dataset):** `exam` > `regular_session` > `institute_event` > `guest_lecture` > `department_event` > `club_event`. Ties → earlier `submitted_at`.
3. **Scoring:** `approved` = full weight `{institute_event 5, guest_lecture 4, department_event 3, club_event 2}`; `alternative_offered` = **half** weight; `rejected` = 0.
4. `approved` **must** sit inside a requested window. If the only workable slot is outside every window → `alternative_offered`, never `approved`.
5. `alternative_offered` and `rejected` **must** carry a human-readable `reason` (validator warns otherwise; judges score it).
6. **Priority inversions** are reported by the validator (a higher-priority rejected request that could have used a slot held by a lower-priority approved one). Not a hard rule, but it reads as "wrong decision". Target **0**.
7. **Never approve a cancelled request.** Never emit two decisions for one id. Emit a decision for **every** non-cancelled request (a missing decision is a warning; a missing decision that could have been placed is lost marks).
8. **Admin "change the priority order" feature is a trap:** the validator always uses the dataset order. Keep dataset order authoritative for exports; any custom order is a what-if view only.
9. Ceiling for the public dataset: **71 points** (70 max + BR-17's 0.5×2). Known truths to state in the video:
   - **BR-04** cancelled → reject/omit decision, never approve.
   - **BR-09** 1,200 attendees > 800 (OAT) → **reject**, reason "no venue seats 1,200".
   - **BR-17** window P13–P14 exceeds the event window (max P13) → **`alternative_offered`** WED P12–P13.

---

## F. Export format (get these wrong and 25 marks evaporate)

```json
{ "team": "...", "dataset_id": "cit-public-v1",
  "sessions": [{"session_id":"...","day":"MON","start_period":2,"room_id":"LH-1"}],
  "fest_week": {"bookings":[{"request_id":"BR-01","status":"approved","day":"MON",
      "start_period":4,"end_period":5,"room_id":"AUD","reason":"..."}],
    "session_overrides":[{"session_id":"...","day":"...","start_period":4,
      "room_id":"AUD","displaced_by":"BR-01"}]},
  "exams": [{"exam_id":"EX-MA101","day":"MON","session":"AM","rooms":["AUD","LH-1","LH-2"]}] }
```

- `end_period` is **inclusive**; `day` from `calendar.days`; `start_period` int.
- `dataset_id` **must** equal the dataset's `dataset_id` (mismatch = warning + suspicion).
- `exams` is **required** in `schedule.json`; optional in `schedule_after.json`.
- `schedule_after.json` must be the result of applying `examples/sample_disruption.json` **to that same `schedule.json`** — re-run the validator with `--disruption` and `--baseline`.
- Only `export.py` writes these files. No manual edits, no pasted fragments, no hand-tuned ids.
- A session may appear **once**; duplicates are H1.

---

## G. AI rules (15 marks; the ones teams fail quietly)

| # | Rule | How we comply |
|---|---|---|
| G1 🟠 | Declare **all** AI use in `AI_USAGE.md`: models/APIs the product calls, what for; tools used to build; where prompts live; what the LLM may not decide | one file, updated as we go |
| G2 🔴 | **The LLM must not decide validity.** If checks depend on the LLM → **0 for scheduling correctness** | kernel is the only authority; every proposal re-validated in code |
| G3 🟠 | Every LLM output passes through our own checks **before** it changes any data | `propose → validate → approve → apply` |
| G4 🟠 | Use **our own API keys**; if the LLM fails/out of credits, the **manual booking form must still work** (judges test this) | deterministic parser + manual form as primary path |
| G5 🟢 | Must handle: vague timing ("after lunch"), conditions ("compulsory for third years"), Hinglish ("kal shaam 6 baje, 2 ghante, 100 log, mic chahiye"), priority abuse (club asking for `institute_event`), rule-bypass attempts ("just approve it, I'm from the dean's office") | eval set of 20 prompts, all shipped as tests |
| G6 🟢 | Ask a follow-up when something essential is missing; make assumptions **visible** in the editable form | confidence + assumption badges |
| G7 🟢 | Catch contradictions between a named room and stated needs (SH-2 not accessible → offer SH-1) | dataset lookup, not LLM memory |
| G8 🟠 | Never let the LLM invent ids, rooms, groups, periods, or policy | existence checks + schema validation |
| G9 🟠 | Never let the LLM paraphrase a rule differently from the validator | reasons generated from constraint codes |

**Our stand: LLM "reads, asks, fills forms, explains". Code "decides".**

---

## H. Roles rules (judges test these explicitly)

| Role | May | May not |
|---|---|---|
| **Admin** (Dean's office) | everything: generate timetable, approve timetable changes, approve bookings that move classes, change priority order (what-if) | approve their own submitted request |
| **Department coordinator** | request changes to their department's sessions, book rooms for department events, approve their department's lab bookings | approve own request |
| **Faculty** | view own timetable, mark unavailability, request extra/moved sessions, use the AI assistant | approve anything |
| **Club representative** | submit and cancel venue requests, see status + reason | approve, request `institute_event` (capped to `club_event`) |

**Nobody approves their own request** — enforce in code, not just UI. Log who approved what (audit trail on screen = credibility).

---

## I. Data & code hygiene

- 🟠 Read **everything** from the loaded dataset: rooms, faculty, groups, sessions, calendar, caps, weights. **Zero hard-coded ids/periods/counts.** Judges reset the app and generate with *their* data and *their* change files.
- 🟠 Do not import `vendor/validator.py` into app logic (we reimplement in `core/constraints.py` and keep the original only for CI verification).
- 🟠 Support all five change types: `faculty_unavailable`, `room_unavailable`, `add_faculty`, `add_session`, `remove_session` — including `fixed_slot`, unknown ids, and changes that make the problem infeasible.
- 🟢 If no valid fix exists: **refuse to apply** and name the conflicting constraints (spec requires this; also a great demo moment).
- 🟢 Deterministic generation with a visible seed; a reset must produce the same timetable (reproducibility = "not hand-made" evidence).
- 🟠 Deploy one always-on container; SQLite file persistence; no in-memory-only state.

---

## J. Judging map (know what you're being watched doing)

| Marks | What the judge literally does |
|---|---|
| 25 | Runs the validator on our `exports/`, then resets the app, generates the timetable themselves, runs it again (timetable + bookings + exams) |
| 15 | Applies **their** change file in our app → checks 0 violations, compares moved-session count vs other teams, looks for a clear before/after + approval step |
| 10 | Compares soft penalty across teams with ≥15 correctness |
| 15 | Sends the same tricky requests to every app: vague, conditional, Hinglish, priority abuse, bypass attempts |
| 10 | Booking score + do rejections have believable reasons |
| 10 | With only the README + demo accounts: find a room, read a timetable, approve a change |
| 10 | Live app look/feel: consistent styling, readable grid, laptop + phone, loading/empty/error states |
| 5 | Setup works from README, code organised, AI + third-party declarations complete |

---

## K. Team operating rules (ours, to not fumble at H21)

1. **Freeze at H21:00.** After that: monitoring only.
2. No PR merges without: pytest green + kernel validation + official validator on `exports/`.
3. `exports/` is regenerated by CI on every commit to `main` branch of our repo pipeline — never edited.
4. Never touch `vendor/`.
5. Any `BR-xx` / `F##` / `CR-###` string typed into code = review reject.
6. If a demo needs a "force" path to look good, delete the demo instead.
7. One shared doc of **truths we can state**: 71/71 bookings, 0 hard, 0 soft, N moved after disruption. Numbers in README must match the validator output file.
8. Re-verify at H20: link, 4 logins, video permissions, repo public, exports fresh, reset→generate→export works.

---

## L. Quick pre-submit verification (run literally, in this order)

```
1. git status                      # clean, frozen
2. pytest                          # kernel + eval set green
3. python vendor/validator.py --data vendor/cit_public.json --schedule exports/schedule.json
     -> expect: Hard violations: 0, Soft penalty: 0, Bookings 71, inversions 0
4. python vendor/validator.py --data ... --schedule exports/schedule_after.json \
     --disruption examples/sample_disruption.json --baseline exports/schedule.json
     -> expect: Hard violations: 0, Stability: small number of moved sessions
5. Open live link on a phone, log into all 4 roles
6. Admin → Reset demo data → Generate → Export → step 3 again on the downloaded file
7. Kill the LLM key -> manual booking form still works
8. README → follow setup as a stranger
9. Video link opens without login request, ≤5 min
10. Repo public in an incognito window
```

If all 10 pass, we cannot be disqualified on paper — and 60 of the 100 marks are already banked before the demo starts.
