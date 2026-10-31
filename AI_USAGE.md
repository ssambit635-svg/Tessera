# AI usage declaration

Required by the rules: list every model/API the product calls, every AI tool used to build
the project, where prompts live, and what the LLM is **not** allowed to decide.

## 1. AI inside the product

| Where | Model / API | What it does | What it may NOT do |
| --- | --- | --- | --- |
| `POST /api/ai/parse` (planned) | Groq `llama-3.3-70b-versatile` (primary; free tier ~1,000 req/day, ample for judging), `llama-3.1-8b-instant` as automatic fallback on 429/timeout | read an English/Hinglish venue request and fill the booking form (attendance, duration, day, window, needs, room type) | decide whether a booking is valid, invent room ids, change priority, approve anything |
| `POST /api/ai/parse` follow-up (planned) | same | ask the single question that blocks the booking | ask for information already present in the request |
| `POST /api/ai/explain` (planned) | same | re-word a reason chain that our rules engine already produced | create a new reason or a new fact |
| Voice request (optional) | Sarvam ASR | Hinglish speech → text before parsing | any scheduling decision |

Guarantees:

* **Validity is never decided by a model.** `api/app/core/constraints.py` (our own
  re-implementation of the organisers' rules) and the OR-Tools model are the only
  authorities. Every LLM output is schema-checked and existence-checked against the
  dataset before it is even displayed.
* **No local models.** The product never runs a model on the demo machine (no Ollama, no
  bundled weights); it calls one hosted API, and the deployed app needs no GPU.
* **The product works with the LLM switched off.** `LLM_PROVIDER=none` is the default in
  `.env.example`; the deterministic parser and the manual form produce the same structured
  booking. Judges are invited to set it to `none` and retry.
* Prompts live in `prompts/` and are versioned with the code.
* No request text or schedule data is sent anywhere except the chosen provider's API, and
  only the text of the request itself.

## 2. AI used to build the project

| Tool | Used for | Parts of the repo |
| --- | --- | --- |
| Arena.ai **Agent Mode** (coding agent) | pair-programming the whole backend: dataset loader, validity kernel, CP-SAT timetable generator, booking engine, exam scheduler, tests, CI, docs | `api/app/core/*`, `api/tests/*`, `tools/*`, `.github/workflows/ci.yml`, `docs/*` |
| (add any editor assistants used by the team, e.g. Copilot / Cursor / ChatGPT, and which files they touched) | | |

All AI-generated code is reviewed, run and tested by the team; the numbers in the README
come from the organisers' own `vendor/validator.py`, which is executed in CI on every push.

## 3. What the LLM is not allowed to decide (short version)

1. Whether a session placement is legal.
2. Whether a booking can be approved.
3. Who wins a room when two requests collide (the dataset's priority order decides).
4. Any number that appears in `exports/*.json`.
