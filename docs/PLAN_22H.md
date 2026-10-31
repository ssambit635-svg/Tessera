# 22-Hour War Plan — Tech Zephyr 4.0 (CIT Scheduling)

Clock starts at **H0 = now**. Deadline **H22**. Freeze at **H21.0** (no commits, no deploys after).
Everything below is ordered so that **the marks that can be lost forever (disqualification) are secured in the first 60 minutes**, and the marks that are cheapest per hour come next.

Companion docs: `docs/STRATEGY.md` (the why), `docs/RULES_MASTER.md` (the never-break list), `docs/SIMPLE_HINGLISH.md` (plain language).

---

## 0. The one promise that makes this work

**Contract-first, then parallel.** In Phase 0 we write the JSON shapes of every API endpoint into `docs/API_CONTRACT.md` and commit **mock responses** for all of them. From that moment:

- Frontend never waits for backend (it builds against mocks).
- Backend never waits for frontend (it tests with `curl` / pytest).
- Nobody types a field name differently, so integration on H15 is 30 minutes, not 3 hours.

If we skip this, we lose 4–6 hours to integration bugs. It is the single highest-leverage decision in the plan.

---

## 1. Lanes (who does what)

Four lanes. Map your names onto them at H0; if the team is smaller, merge as shown.

| Lane | Owns | Output | Never touches |
|---|---|---|---|
| **A — Solver / Core** | dataset loader, validity kernel, timetable generator, exams, soft-penalty optimiser, repair engine | `exports/schedule.json`, `exports/schedule_after.json`, pytest suite, CI green | UI files, prompt text |
| **B — AI / Bookings** | booking decisions + reasons, plain-language parser, follow-up questions, Hinglish, negotiation, explainability text | `/api/ai/*`, `/api/bookings/*`, prompt files, eval set | solver internals |
| **C — Frontend / UI** | all screens, 3 timetable views, booking form, approval diff, dashboard, mobile, loading/empty/error states | the thing judges look at (20 marks) | Python |
| **D — Integration / Deploy / Docs / QA** | deploy from H0, demo accounts, seed/reset, README, `.env.example`, `AI_USAGE.md`, `THIRD_PARTY.md`, validator runs, video, submission checklist | live link + repo hygiene (protects everything) | deep solver code |

Merge guidance:
- **2 people:** A+B (backend) and C+D (frontend+ops). A+B must finish kernel by H4 or we cut scope (§6).
- **3 people:** A, B+C, D.
- **4+: as above.** If 5+, add a "QA/shadow" who only tries to break the app as a judge would.
- **Me (agent):** I take Lane A end-to-end (kernel, generator, exams, repair, exports, CI) plus the contracts, docs and the eval set for Lane B. **You must own:** the LLM key, the deploy account, the video, and the final submission — I cannot do those.

---

## 2. Phase plan (hour by hour)

### Phase 0 — H0:00 → H1:00 · "Never get disqualified" (Lane D leads, everyone helps for 15 min)
- [ ] Create the **public** GitHub repo **now** (must be created after hackathon start; commit in small real steps from minute one, not one giant dump at the end).
- [ ] Monorepo skeleton: `api/`, `web/`, `exports/`, `docs/`, `prompts/`, `tests/`. `.gitignore`. `LICENSE` optional.
- [ ] **Deploy an empty but working app immediately** (`/health` returns 200, login page renders). Live link must be up and must stay up.
- [ ] `.env.example` with every var, no real keys.
- [ ] `AI_USAGE.md` + `THIRD_PARTY.md` skeletons, committed empty-but-honest (we fill them as we go — retro-writing them at H21 is how teams lose 10 marks).
- [ ] 4 demo accounts seeded: `admin`, `dept`, `faculty`, `club` + one-click login buttons.
- [ ] Copy the organisers' `validator.py` + `cit_public.json` into `vendor/` **read-only**; CI job runs the real validator on whatever `exports/` contains.
- [ ] Write `docs/API_CONTRACT.md` (≤ 1 page, see §3) and commit mocks.

**Gate 0:** link opens, 4 logins work, `/health` green, CI runs. If this isn't done by H1, drop everything else until it is.

### Phase 1 — H1:00 → H4:00 · Keep the app alive while you work (Lane D, ~10 min)
- [ ] Keep-alive ping (cron/uptime monitor) so the free tier never sleeps during judging.
- [ ] Seed + reset endpoint + Admin "Reset demo data" button (**judges will press this**).
- [ ] SQLite (file) persistence; no in-memory state that dies on restart.

### Phase 1 — H1:00 → H4:00 · Core (Lanes A + B)
**A: validity kernel → generator.** Order matters:
1. `core/dataset.py` — load, index by id, effective capacity, allowed_uses, caps. No hard-coded ids anywhere.
2. `core/constraints.py` — reimplement H1–H14 + B1–B3 + E1/E2 **from the validator's logic** (not from a modified copy). API: `validate(schedule) -> violations`, `can_place(...)`, `diff(before, after)`.
3. `core/solver.py` — hard-first, then soft. Baskets pre-assigned to one (day, start); labs to {P2, P6}; big-room sessions first (360/180/170/150).
4. `export.py` → `exports/schedule.json`, machine-generated, deterministic seed.
5. **Run the official validator in CI. Gate: `hard_violation_count == 0`.** Nothing else in Lane A until green.

**B (parallel, against mocks):**
6. `core/bookings.py` — greedy by (effective category, submitted_at) over the **reserved** room view; then alternatives; then rejections with generated reasons. Target **71/71, 0 inversions**.
7. Booking reason templates: which constraint fired, who outranked you, what slots existed.

**Gate 1 (H4):** `exports/schedule.json` with 0 hard violations, committed by the app, CI green.

### Phase 2 — H4:00 → H6:00 · The rest of correctness (25 marks)
- [ ] **A:** exams — 41 exams, 12 slots (Mon–Sat × AM/PM), group-colouring, rooms ≥ size at **half capacity**, exam-capable rooms only (labs excluded), minimise same-day exams per group → `exam_soft_penalty == 0`.
- [ ] **A:** `session_overrides` decision: target **zero overrides** (base schedule already avoids booking slots). Document why.
- [ ] **B:** finish all 25 booking decisions, including the traps: BR-04 cancelled → never approved; BR-09 → reject (1,200 > 800); BR-17 → `alternative_offered` P12–P13 (not reject).
- [ ] **D:** first full validator run on the committed exports, report saved to `docs/validation-report.json`.

**Gate 2 (H6):** validator shows **0 hard violations, 71 bookings, 0 inversions, 0 exam penalty, 0 overrides.**

### Phase 3 — H6:00 → H8:00 · Optimisation (10 marks, ranked vs other teams)
- [ ] S1: no faculty inside an `avoid` preference.
- [ ] S2/S3: every group's day is one contiguous block, ≤ 6 h/day (21 h/week → 4/4/4/4/5).
- [ ] S4: no repeat lecture of the same course per group per day; no OE course twice per day.
- [ ] S5: pick the tightest fitting room (< 40% utilisation costs 1).
- [ ] S6: no P9 classes.
- [ ] **Gate 3: `soft_total == 0`**, locked by a regression test so later features can't silently ruin it.

### Phase 4 — H8:00 → H12:00 · Rescheduling (15 marks)
- [ ] **A:** repair engine, deterministic cascade: (0) untouched → (1) room swap same slot → (2) single move → (3) bounded ejection chain → (4) pairwise swap → (5) **refuse with the conflicting constraints named**.
- [ ] **A:** `POST /api/disruption/preview` → returns diff **without applying**; `POST /api/disruption/apply` requires Admin approval token.
- [ ] **A:** `exports/schedule_after.json` from `examples/sample_disruption.json`, verified with `--baseline`.
- [ ] **C (parallel):** diff screen — before/after, moved-count badge, per-session old→new, approve/reject buttons, "nothing can be fixed, here's why" state.
- [ ] **D:** upload arbitrary change files (all 5 change types), including judge-style adversarial ones.

**Gate 4 (H12):** judge-style change file → 0 hard violations after apply, moved count minimal, approval step visible.

### Phase 5 — H12:00 → H15:00 · AI layer (15 marks)
- [ ] **B:** three-stage pipeline `extract → resolve → negotiate`, tool-calling with a strict JSON schema.
- [ ] **B:** deterministic pre/post processors (dates, "kal", "shaam 6 baje", "2 ghante", "100 log", numbers in words, Devanagari transliteration) + validation that every id/period exists.
- [ ] **B:** the graded scenarios from `examples/sample_requests.md` + our own eval set (§5).
- [ ] **B:** **manual form works with the LLM completely dead** (kill the key and demo it — judges test this).
- [ ] **C:** editable form with per-field confidence + "assumption made" badges + follow-up question UI.
- [ ] **A:** every AI proposal passes through `constraints.py` before touching data. **LLM never decides validity.**
- [ ] **B:** explainability cards ("why rejected", "why 8 AM") from the reason chains, not LLM prose.

**Gate 5 (H15):** 8/8 sample requests produce sane forms or a smart follow-up; kill-key test passes.

### Phase 6 — H15:00 → H19:00 · The 20 UI/usability marks (Lane C leads, D assists)
- [ ] Login with role-based landing.
- [ ] Timetable by **group / faculty / room** — readable grid, colour by course, sticky headers, mobile fallback (accordion/day list, not a squeezed table).
- [ ] Booking request list with status chips + reason drawer + "Why?" everywhere.
- [ ] Approvals queue (bookings + disruptions), one-click approve with diff.
- [ ] Dashboard: pending approvals, current conflicts, room utilisation, exam week view.
- [ ] Loading / empty / error states on **every** screen (judges notice these; they're cheap).
- [ ] Admin: load dataset, load change file, export JSON, reset demo.

**Gate 6 (H19):** a stranger with only the README completes: find a room → read a timetable → approve a change. Test it on a phone, on the live link.

### Phase 7 — H19:00 → H20:30 · Docs + video (5 marks + protects 20)
- [ ] README: description, architecture diagram, stack, setup, **4 demo accounts**, known limitations, one-command regeneration of `exports/`.
- [ ] `AI_USAGE.md` final: every model/API + use, every build tool, where prompts live, **what the LLM is not allowed to decide**.
- [ ] `THIRD_PARTY.md` final (OR-Tools, Next.js, etc.).
- [ ] Video ≤ 5 min, unlisted: generate → plain-language booking → blocked conflict → Spectra decisions → reschedule + diff + approval → dashboard. Record at H19, not H21.
- [ ] Screenshot pass: nothing broken on the live link.

### Phase 8 — H20:30 → H21:00 · Freeze
- [ ] Final validator run on committed exports; paste output into README.
- [ ] Reset demo data → generate → export → verify (the exact sequence judges will do).
- [ ] Kill LLM key → manual flow still works.
- [ ] **Git freeze at H21:00.** No commits, no redeploys after. Only monitoring.

### Buffer — H21:00 → H22:00
Submission form, link check, repo public check, video link permission check, demo accounts re-verified. Sleep/rotate for whoever is on monitoring.

---

## 3. API contract (write at H0, 45 minutes, saves hours)

```
GET  /health                          -> {status:"ok"}
POST /auth/login {role}               -> {token, user}
GET  /dataset/summary                 -> counts, calendar, caps
POST /timetable/generate {seed}       -> {job_id} | {sessions:[...]}
GET  /timetable?view=group|faculty|room
POST /timetable/validate              -> {hard:[], soft:{...}}
GET  /bookings                        -> decisions + reasons + priority info
POST /bookings/decision               -> {request_id,status,day,start_period,end_period,room_id,reason}
POST /ai/parse {text}                 -> {form:{...}, confidence:{...}, follow_up:null|"..."}
POST /ai/propose-change {text}        -> {proposal_id, moves:[...], valid:bool}
GET  /disruption/preview (file)       -> {moves:[...], hard:[], refused?:{conflicts:[]}}
POST /disruption/apply {proposal_id, approved_by}
GET  /exams                           -> slots + rooms
POST /exports                         -> writes exports/*.json (app-generated only)
POST /admin/reset                     -> re-seed + regenerate, deterministic
```

Rule: **every response that changes state is accompanied by the validator's own verdict.** If our kernel says invalid, the endpoint refuses — the UI has no "force" button.

---

## 4. Gates summary (do not slip past a red gate)

| Gate | Hour | Must be true | If red |
|---|---|---|---|
| 0 | H1 | Public repo, live link, 4 logins, `/health` | Stop all work; fix it. DQ risk. |
| 1 | H4 | 0 hard violations in `exports/schedule.json` | Cut exams/bookings to stubs, go all-in on solver. |
| 2 | H6 | + exams 0 penalty, bookings 71, 0 inversions | Ship bookings without the soft-est alternatives; keep 0 hard. |
| 3 | H8 | `soft_total == 0` | Freeze at whatever soft we have; move on. |
| 4 | H12 | Repair: 0 violations after change, minimal moves, approval UI | Ship room-swap + single-move levels only. |
| 5 | H15 | 8/8 sample requests sane; dead-key fallback works | Ship deterministic parser as primary; LLM becomes optional garnish. |
| 6 | H19 | Stranger can find room / read timetable / approve | Cut manual event scheduling, cut anything non-scored. |
| — | H21 | Frozen | Only monitoring. |

---

## 5. Cut list (decide now, in this order — this is how we finish)

Cut first, in order, when behind:
1. Manual event scheduling screen (nice, not scored directly).
2. Second/third "what-if" priority order demo.
3. Rich analytics/utilisation charts (keep a single utilisation number).
4. Dark mode, animations, onboarding tour.
5. Multi-language UI toggle.
6. LLM streaming / chat history.
7. Extra AI models / provider fallback.

**Never cut:** exports, validator-clean timetable, exams, booking reasons, approval step, demo accounts, reset button, README, video, `AI_USAGE.md`.

---

## 6. Our own AI/AI-adjacent risk register

| Risk | Mitigation | Owner |
|---|---|---|
| LLM key dead / out of credits during judging | deterministic fallback is the primary path; demo it deliberately in the video | B |
| LLM hallucinates a room/group id | schema + existence check before use; kernel rejects | A+B |
| Judge thinks LLM decides validity | show a UI badge "validated by rules engine" on every AI proposal; state it in README + AI_USAGE | C+D |
| Solver too slow on judge's reset | precomputed seed + cache + hard timeout that returns last good schedule | A |
| OR-Tools install blows up the deploy | single container, pin version; fallback local-search solver behind a flag | A+D |
| Free tier sleeps / cold start | keep-alive ping, `/health`, lazy-load nothing on first paint | D |
| Judge's change file is adversarial (add_session with fixed_slot) | test all 5 change types, incl. fixed_slot and unknown ids | A+D |
| Someone commits after deadline | H21 freeze; announce loudly in team chat | all |

---

## 7. Working agreements

- One branch, small commits, real messages — commit history is audited for "made by hand" suspicion; a clean app-generated export pipeline in CI is our defence.
- Every PR must pass: pytest + kernel validation + official validator on `exports/`.
- No one edits `vendor/validator.py` or the dataset. Ever.
- Any new room id / group id / faculty id typed into code = review reject (hard-coding is a DQ-adjacent smell).
- Daily 10-minute stand-up at H4, H8, H12, H16, H19: what's green, what's red, do we need to cut.
- The person on Lane D is the "judge" in the final hour: they follow the README literally, on the live link, on a phone.

---

## 8. What I need from you, right now (before "start")

1. **Names → lanes** (or team size, and I'll merge lanes).
2. **LLM provider + key** (Groq/Gemini/OpenAI) — and whether the free tier can take ~200 test calls tonight.
3. **Deploy accounts** ready (Render/Railway/Fly + a GitHub org/repo we can push to).
4. **Stack confirm** — Next.js + FastAPI, or tell me if your team is faster in something else.
5. **Say "start"** when Phase 0 should begin. Until then I do not write product code.
