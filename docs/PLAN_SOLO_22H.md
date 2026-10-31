# Solo dev, 22 hours — the plan that actually finishes

Team **Voltryx** · Project **Tessera** · 1 developer + Arena agent (declared AI tool).
No lanes, no parallel work, no handoffs. **One queue. Strict gates. Ruthless cuts.**

The parallel plan in `docs/PLAN_22H.md` assumed 4 people. Ignore it. This one replaces it.

---

## 0. The three laws of a solo 22-hour build

1. **Deployed before done.** A working, ugly, half-featured app on a public URL at H1 beats a beautiful app on localhost at H21. Every hour after H1, the link must open.
2. **Never start a feature you can't finish in its timebox.** A half-finished approval screen scores 0; a finished simple one scores 4.
3. **Sleep 4 hours.** H12–H16. A 22-hour no-sleep build produces broken exports at H21 — that is 25 marks, not 3. This is not comfort, it's risk management.

Realistic capacity: **~17 productive hours** of the 22.

---

## 1. Division of labour (me vs you) — solo does not mean alone here

| I (agent) do | You do | Time |
|---|---|---|
| Kernel, generator, exams, soft optimiser, repair, exports, CI, API, deterministic parser, prompts, fixtures, docs, most UI components | Repo creation + push, host setup, **API keys**, deploy clicks, live testing on a phone, video, submission form | — |
| ~85% of the code | ~100% of the things that need an account or a physical action | — |

Rule: while I'm generating code blocks, you are **not** idle — you're doing repo/host/keys, then *reading* what I wrote, then testing the live app. Two things in parallel, always.

⚠️ Hackathon rule: AI tools are allowed **if declared**. `AI_USAGE.md` will declare Arena Agent Mode for code generation. Undeclared = −10 marks. We declare.

---

## 2. The schedule (H0 → H22, deadline H22, freeze H21:15)

### Block 1 — H0:00–H1:00 · Survive
- Public repo **now**, `main` branch, small commits from minute one.
- Skeleton: `api/`, `web/`, `exports/`, `docs/`, `prompts/`, `vendor/` (read-only copies of their validator + dataset), `tools/`.
- **Deploy the skeleton**: `/health` → 200, login page renders, on a public URL.
- `.env.example`, empty-but-honest `AI_USAGE.md`, `THIRD_PARTY.md`, `.gitignore`.
- 4 demo users seeded (`admin`, `dept`, `faculty`, `club`), one-click login buttons.

**Gate 1:** public link opens and one of the 4 logins works. *If not, stop everything.*

### Block 2 — H1:00–H3:30 · The 25 marks
- `core/dataset.py` — everything from the JSON, zero hard-coded ids.
- `core/constraints.py` — H1–H14 + B1–B3 + E1/E2, mirroring the validator's logic. API: `validate()`, `can_place()`, `diff()`.
- `core/solver.py` — CP-SAT (already proven: 189/189 in 10 s).
- `core/export.py` → `exports/schedule.json`, deterministic seed.
- CI: **official validator on every commit.**

**Gate 2:** `Hard violations: 0` (exams may still be missing → fix in Block 3).

### Block 3 — H3:30–H5:00 · Exams + bookings + soft penalty
- Exams: 41, Mon–Sat × AM/PM, group-colouring, **half-capacity** rooms, exam-capable rooms only → `exam_soft_penalty 0`.
- Bookings: priority greedy over the **reserved** room view → approve what fits, `alternative_offered` where the window fails, reject only what's impossible. Reasons auto-generated from constraint codes.
- Soft pass: S1 S2 S3 S4 S5 S6 → target `soft_total 0`.
- `exports/schedule_after.json` via the repair stub (proper repair in Block 5).

**Gate 3:** `0 hard · 71 bookings · 0 inversions · 0 exam penalty · soft ≤ 30`. Then `soft 0` if it lands in 30 min, else ship ≤30 and move on.

### Block 4 — H5:00–H8:00 · The product shell (this is where 20 marks live)
- Next.js: login → role landing → **3 timetable views** (group / faculty / room) as one component with a pivot selector.
- Booking request list: status chips, reason drawer, "Why?" on every row.
- Approvals queue: approve/reject with a visible diff.
- Dashboard: pending approvals, conflicts count, one utilisation number, exam week tab.
- Loading / empty / error states on every screen; mobile: day-accordion instead of a squeezed grid.

**Gate 4:** you, on your phone, on the live link, can find a room, read a timetable, approve something.

### Block 5 — H8:00–H11:00 · Rescheduling (15 marks)
- Repair engine, cascade: untouched → room swap → single move → ejection chain → pairwise swap → **refuse with named conflicting constraints**.
- `preview` (no apply) + `apply` (Admin approval required, server-side).
- Diff screen: old → new per session, "N sessions moved" badge, approve button.
- Test all 5 change types, including `add_session` with `fixed_slot` and an infeasible file.

**Gate 5:** judge-style change file → `0 hard violations`, moved count small, approval step visible.

### 😴 SLEEP — H11:00–H15:00 (4 h, hard stop, phone silent)

*Why here:* after the two heaviest algorithmic blocks, before the AI and polish work, which are easier to do tired. Everything is deployed and committed before you sleep.

### Block 6 — H15:00–H17:30 · AI layer (15 marks)
- `extract → resolve → negotiate` pipeline, strict JSON schema + dataset existence checks.
- Deterministic normaliser first (dates, "kal", "shaam 6 baje", "2 ghante", "100 log"), LLM second, schema gate last.
- Editable form with confidence + "assumption made" badges; follow-up question UI.
- **Kill the key and demo it** — manual form must work identically.
- Voice input (Sarvam ASR) only if Block 6 finished by H17:00. It's the demo's wow moment, not a marks requirement.

**Gate 6:** all 8 `sample_requests.md` produce sane forms or a smart follow-up; dead-key test passes.

### Block 7 — H17:30–H19:00 · Polish + explainability
- "Why this slot?" on timetable cells (constraint provenance, generated not invented).
- Counterfactual: "what if F07 is on leave Thursday?" → preview only (reuses repair, 20 lines).
- Empty-state copy, one consistent colour system, mobile pass.

### Block 8 — H19:00–H20:15 · Docs + video
- README: description, architecture diagram, stack, setup, **4 demo accounts**, known limitations, "regenerate exports" command.
- `AI_USAGE.md` + `THIRD_PARTY.md` final.
- **Video ≤5 min**, unlisted, recorded in one take with a shot list:

| Shot | Time | Shows |
|---|---|---|
| 1 | 0:00 | Login as Admin, dashboard |
| 2 | 0:40 | Generate timetable → 0 violations badge |
| 3 | 1:30 | Timetable by group / faculty / room, "Why?" tooltip |
| 4 | 2:10 | Club asks in Hinglish → structured form → edited → conflict blocked with reason |
| 5 | 3:10 | Spectra decisions: 71/71, one rejection reason, one alternative |
| 6 | 4:00 | Change file → 2 sessions moved → diff → Admin approves |
| 7 | 4:40 | Export files, validator output, reset button |

### Block 9 — H20:15–H21:15 · Freeze drill (do it literally, in order)
1. Admin → **Reset demo data** → Generate → Export.
2. Run the official validator on the downloaded exports → `0 / 0 / 71 / 0`.
3. Kill `GROQ_API_KEY` → manual booking still works.
4. Phone, incognito, 4 logins.
5. Repo public, video link opens without login.
6. **`git freeze` at H21:15.** No commits, no redeploy after.

### H21:15–H22:00 · Buffer
Submission form, link re-check, monitoring. Nothing new. Ever.

---

## 3. The cut list (pre-decided, so you don't negotiate with yourself at 2 AM)

Cut in this order the moment you're 20 minutes behind:

1. Voice input (Sarvam ASR)
2. Manual event scheduling screen
3. Counterfactual "what-if" simulator
4. Charts beyond one utilisation bar
5. Dark mode, animations, onboarding tour
6. Multi-language UI toggle
7. Sarvam (keep Groq + deterministic parser)
8. Faculty "request a change by chat" (keep the booking form)

**Never cut, in any scenario:** exports generated by the app · 0-hard-violation timetable · exams · booking reasons · approval step · demo accounts · reset button · README · video · `AI_USAGE.md`.

---

## 4. Solo-specific risks (and the mitigation you must actually perform)

| Risk | Why it kills us | Mitigation |
|---|---|---|
| **Integration at H20** | You're the only integrator | Commit a fake-data mock for every screen at H5; wire real endpoints as they land |
| **Free host cold start** | Judge sees a spinner, marks "link broken" | Keep-alive ping every 10 min + skeleton loader + `/health` warm-up |
| **API key dead / out of credit** | Judges test exactly this | Deterministic parser is the primary path; dead-key test at Gate 6 |
| **Solver too slow after reset** | Judge waits, app times out | 60 s limit, cached last-good schedule, export-on-boot |
| **Sleep deprivation bug at H21** | Broken export = 25 marks | Sleep block; freeze drill is scripted, not improvised |
| **Scope creep** ("ek aur feature") | Classic solo failure | The cut list above is the contract |
| **Undeclared AI** | −10 | `AI_USAGE.md` updated as we go |

---

## 5. What "winning" looks like numerically

| Metric | Below-average team | Us |
|---|---|---|
| Hard violations | 3–8 (−9 to −24) | **0** |
| Soft penalty | 80–250 | **0–30** |
| Bookings | 40–55 | **71 / 71** |
| Priority inversions | 2–5 | **0** |
| Sessions moved after change | 6–12 | **2–4**, proven minimal-ish |
| AI on tricky requests | breaks / hallucinates | blocks with a reason, asks follow-up |
| Demo | works on localhost | works on a phone, 4 logins, reset button |

If we hit those numbers, we are not competing for a finish — we're competing for first.

---

## 6. Start conditions (say "start" and I begin Block 1 immediately)

1. Repo push access ready (you create **public** repo `Tessera`, I fill it).
2. Host picked: **Railway ($5)** or **Render free + keep-alive** (I'll ship a `render.yaml` + ping setup either way).
3. Groq key ready (or tell me "mock first, key in the morning" — that works too).
4. Sleep block acknowledged: H11–H15. Non-negotiable.
