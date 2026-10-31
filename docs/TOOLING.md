# TOOLING — verified in the sandbox, decided, ready

Status: **sandbox pre-flight done, nothing product-related started.** This file is what we build on.

---

## 1. What I actually verified here (not guessed)

| Check | Result |
|---|---|
| Python | 3.11.2 ✅ |
| Node / npm | v22.22.3 / 10.9.8 ✅ |
| CPU / RAM | 2 vCPU, 3 GB, 20 GB free — enough for CP-SAT on this dataset |
| pypi reachable | ✅ 200 |
| npm registry reachable | ✅ 200 |
| **`ortools` installs** | ✅ `ortools 9.15.6755`, 29.8 MB wheel, imports, CP-SAT solves |
| **CP-SAT solves the real dataset** | ✅ **189/189 sessions, OPTIMAL, 10.4 s on 2 cores** |
| **Official validator on that output** | ✅ **0 timetable hard violations**, only `E1 × 41` (exams intentionally not modelled in the probe) |
| Soft penalty of the raw feasible solution | 282 → *this is the headroom. Target 0.* |
| Groq API reachable from sandbox | ❌ blocked (`api.groq.com` 000) |
| Sarvam API reachable from sandbox | ❌ blocked (`api.sarvam.ai` 000) |

Reproduce: `pip install ortools && python tools/feasibility_probe.py`
(`tools/feasibility_probe.py` is a **probe**, not product code — it has no basket faculty constraint polish, no soft optimisation, no exams.)

### What this proves
1. The "189 sessions, 45 slots" puzzle is **not** the hard part. It is feasible and fast. Any team that fails this failed on engineering, not on science.
2. The 25 correctness marks are reachable **in one evening** if the kernel is right.
3. The 10 optimisation marks are where the field separates: our first feasible solution scores **282**; a good one scores **0**.
4. CP-SAT is deploy-friendly: single pip dependency, no native build, runs in 1 GB RAM.

### What this means for the AI layer
LLM endpoints are **blocked from this sandbox**, so I cannot call Groq/Sarvam from here. Therefore the AI layer will be built as:

```
web ──> /api/ai/parse ──> parser.py ──┬─> deterministic normalizer (always runs, testable here)
                                      ├─> LLMProvider (groq | sarvam | mock)  ← thin adapter
                                      └─> schema validator + dataset existence check
```
- I ship a **`mock` provider with recorded fixtures** so the whole pipeline is testable offline and in CI.
- You run the **live** key test (2 minutes: `curl` one request) and the judge-facing demo.
- **The deterministic parser is the primary path.** If the key dies mid-judging, the app must behave identically — this is explicitly tested by judges and worth marks.

---

## 2. Stack decision (deep enough to beat others, small enough for one dev in 18 productive hours)

### Recommended

| Layer | Choice | Why this specifically |
|---|---|---|
| UI | **Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui** | shadcn gives 20-marks-grade polish (tables, dialogs, badges, toasts, skeletons) without design work. Server components keep it fast. |
| Data fetching | **TanStack Query** | loading/empty/error states for free — that's literally part of the UI rubric |
| API | **FastAPI + Pydantic v2** | same language as the solver and the official validator; auto OpenAPI docs (a judge-friendly URL) |
| Solver | **OR-Tools CP-SAT** (verified) | generation, repair, exams, unsat cores — one engine, four problems |
| DB | **SQLite (file) + SQLModel**, on a Railway/Render volume | zero ops, survives restarts, reset = delete + reseed |
| Auth | **JWT + 4 seeded demo users**, role in claims, enforced server-side | "nobody approves their own request" must be server-side |
| LLM | **Groq** (structured extraction, 14k req/day) + **Sarvam** (Hinglish/Indic + voice ASR) behind one `LLMProvider` interface | two free tiers = no single point of death; declare both |
| Deploy | **two Railway services** (web, api) **or** Render free + keep-alive | see §4 risk |
| CI | GitHub Action: pytest → kernel → **official validator on `exports/`** | machine-proves 35 marks every commit |

### Deliberately rejected (and why)
- **LangChain / agent frameworks** — the AI task is "text → fixed JSON schema". Frameworks add latency, cost, and failure modes; a 200-line adapter is more reliable and easier to declare in `AI_USAGE.md`.
- **Postgres** — no query needs it; SQLite on a volume is one less failure point in a 22-hour build.
- **Docker Compose / k8s** — nothing to orchestrate.
- **Microservices beyond web+api** — solo dev, 22h, integration is the top risk.
- **GraphQL / tRPC** — the API is ~12 endpoints.
- **Custom design system / dark mode / animations** — 0 marks, real hours.

### Stack B (fallback if Next.js fights you)
FastAPI + **Jinja2 + HTMX + Tailwind**. One deployable, no CORS, no build step. Loses maybe 2–3 UI marks, saves 2–3 hours. **Decide at H2**, not at H14. My recommendation stays A.

---

## 3. LLM plan in detail (free tiers, two providers)

| Provider | Model | Use | Guard |
|---|---|---|---|
| **Groq** | `llama-3.3-70b-versatile` (primary, free tier ~1,000 req/day and 100K tokens/day); `llama-3.1-8b-instant` fallback (14,400 req/day) | request text → structured booking JSON; follow-up question generation; natural-language explanation wording | JSON mode + schema validation + repair pass; timeout 8 s; 1 retry |
| **Sarvam** | `sarvam-m` (chat) + Indic ASR | Hinglish/Hindi understanding; **voice booking request** (mic → text → form); answer back in Hinglish | same schema gate |
| **Deterministic** | our own rules + regex/normaliser | dates ("kal", "tomorrow", "after lunch"), times ("shaam 6 baje"), quantities ("2 ghante", "100 log"), room ids, needs synonyms, category caps | always available, never fails, is the fallback |

Hard rules for the adapter:
1. LLM output **never** touches the database or the schedule. It only fills a form.
2. Every field it returns is checked against the dataset (room ids, group ids, periods, capacity) before display.
3. `validity` is computed by `core/constraints.py` only — **never** asked of the model.
4. Failure = fall back to the manual form with a visible "AI unavailable, fill manually" banner, not an error page.
5. Every prompt stored in `prompts/` and referenced in `AI_USAGE.md`.

Cost control: ~1,000 req/day on the 70B model and 14,400 on the 8B fallback are far beyond judging needs (a demo day is tens of requests). No local/self-hosted models anywhere - the deployed app only needs outbound HTTPS. Cache identical prompts (hash → response) so the video/demo repeats cost nothing.

---

## 4. Deploy risk that can cost us the whole thing (read this twice)

| Host | Reality | Decision |
|---|---|---|
| **Railway** | $5 trial credit; then paid. Fast deploys, volumes, two services, good logs. | **Preferred if you're willing to pay $5**, or if a student credit is available. |
| **Render free** | Web service **sleeps after ~15 min idle** → first request takes 30–60 s. A judge opening the link may see a spinner/error and mark "link doesn't open a working app". | Usable **only** with a keep-alive ping every 10 min (cron-job.org / UptimeRobot free) **and** a skeleton loader. |
| **Fly.io** | free allowance, always-on small VM, needs CLI + card | good alternative |

Whatever we pick: **deploy a working `/health` at H0**, not at H19, and never let the free tier decide our fate in the last hour. Also: judge may open the link *before* the demo call — so the app must self-warm on boot (run generation at startup or serve a cached export).

---

## 5. Repo layout we'll create (Phase 0)

```
Tessera/
├─ api/            FastAPI: main.py, core/{dataset,constraints,solver,repair,bookings,exams,export}.py,
│                  ai/{parser,providers,normalizer}.py, routes/, tests/
├─ web/            Next.js app router: (auth), timetable, bookings, approvals, dashboard, ai
├─ exports/        schedule.json, schedule_after.json   ← generated only
├─ prompts/        extract.md, followup.md, explain.md  ← referenced by AI_USAGE.md
├─ vendor/         validator.py, cit_public.json, sample_disruption.json  (READ-ONLY)
├─ tools/          feasibility_probe.py, validator_check.sh
├─ docs/           STRATEGY, RULES_MASTER, PLAN_22H, PLAN_SOLO_22H, NOVELTY, API_CONTRACT
├─ AI_USAGE.md  THIRD_PARTY.md  README.md  .env.example  .gitignore
```

Env vars (`.env.example`):
```
DATABASE_URL=sqlite:///./tessera.db
JWT_SECRET=change-me
ADMIN_EMAIL / ADMIN_PASSWORD / DEMO_FACULTY_PASSWORD / DEMO_CLUB_PASSWORD / DEMO_DEPT_PASSWORD
LLM_PROVIDER=groq|sarvam|mock|none
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
SARVAM_API_KEY=
SARVAM_MODEL=sarvam-m
NEXT_PUBLIC_API_URL=http://localhost:8000
SOLVER_TIME_LIMIT=60
EXPORT_ON_BOOT=true
```

---

## 6. My commitments vs yours (solo reality)

**I do** (highest risk, most testable offline): kernel, generator, exams, soft-optimiser, repair engine, exports, CI, API scaffolding, deterministic parser, prompt files, eval fixtures, docs, and most of the UI components.

**You must do** (I physically can't):
1. Create/push the public GitHub repo + Railway/Render project.
2. Get the **Groq key** (and Sarvam if you want the voice demo) → paste in `.env` locally + host dashboard.
3. Click deploy, verify the live link on a phone.
4. Record the ≤5 min video.
5. Final judgement calls + submission form before H21.

**And one rule from the hackathon:** AI tools are allowed but must be **declared**. `AI_USAGE.md` will say: "Arena.ai Agent Mode (coding agent) used to build the solver, kernel, API and parts of the UI; prompts/transcripts kept in `docs/agent-log/`." That's worth 0 penalty if declared, −10 if hidden. We declare it.

---

## 7. Ready-to-start checklist (green when you say "start")

- [x] Python, Node, CP-SAT verified
- [x] Feasibility proven on the real dataset (189/189, 0 hard, 10 s)
- [x] Official validator works locally and is CI-ready
- [x] Stack chosen; fallback named; reject-list written
- [x] LLM provider plan + offline mock strategy
- [x] Env var list, repo layout, deploy risk documented
- [ ] Your GitHub push access + host choice (Railway $5 vs Render free + keep-alive)
- [ ] Groq key
- [ ] Your "start"
