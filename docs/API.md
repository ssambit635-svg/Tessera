# Tessera API — the whole backend, end to end

Base URL locally: `http://localhost:8000` · interactive docs: `/docs` · health: `/health`

Everything below is implemented and covered by `api/tests/test_api.py` (22 tests, real
dataset, real exports, no mocks). Validity is decided by `api/app/core/constraints.py`;
no endpoint asks a language model whether something is legal.

---

## 1. Roles and demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin (Dean's office) | `admin@cit.edu` | from `DEMO_PASSWORD` (`Tessera@2027` by default) |
| Admin #2 (approves admin #1) | `dean@cit.edu` | same |
| Department coordinator | `dept.cse@cit.edu` | same |
| Faculty | `faculty@cit.edu` | same |
| Club representative | `club@cit.edu` | same |

Two admins exist **on purpose**: the rules say nobody may approve their own request, so the
admin who previews a change cannot be the one who applies it.

```
POST /api/auth/login              {email, password}      -> {token, user, capabilities}
POST /api/auth/demo-login/{role}  ?email=dean@cit.edu     -> {token, ...}   (one-click)
GET  /api/auth/me                                        -> current user + capabilities
GET  /api/auth/accounts                                   -> the accounts above
```

Capabilities are enforced server-side, not in the UI:

| capability | admin | dept | faculty | club |
| --- | :-: | :-: | :-: | :-: |
| generate_timetable / validate | ✅ | | | |
| approve_change / export / reset_demo | ✅ | | | |
| preview change | ✅ | ✅ | | |
| book department room | | ✅ | | |
| submit booking request | | | | ✅ |
| use_ai | | | ✅ | ✅ |

## 2. Dataset and venues

```
GET /api/dataset/summary          counts, calendar, priority order, role caps, weights
GET /api/dataset/entities         every group, faculty and room (for pickers)
GET /api/dataset/rooms?q=&min_capacity=&needs=accessible&event_only=true
GET /api/dataset/rooms/{id}/availability   per-period free/busy with the reason
```

`availability` merges three sources of truth: classes, approved Spectra bookings and
maintenance windows — the same inputs the kernel uses, so what the judge sees is what will
be validated.

## 3. Timetable

```
GET  /api/timetable?view=group|faculty|room&id=Y1-A     grid payload for one entity
GET  /api/timetable/week                                every placement (heatmap / export preview)
GET  /api/timetable/validate                            hard violations + soft breakdown (GET or POST)
GET  /api/timetable/sessions/{session_id}               placement, rooms that fit, legal slots
POST /api/timetable/generate                            admin: re-solve (tens of seconds)
```

`/api/timetable/validate` on the committed exports returns:

```json
{"hard_violations": 0, "soft_total": 3,
 "soft_penalties": {"S1":0,"S2":0,"S3":0,"S4":3,"S5":0,"S6":0},
 "scheduled": 189, "expected": 189}
```

## 4. Spectra-week bookings

```
GET /api/bookings?status=approved        every request with its decision and reason
GET /api/bookings/{request_id}           full request, effective category, "why" chain
```

Each row exposes `requested_category` vs `effective_category` (the role cap), the weight it
is worth, and the machine-generated reason. Example — a club claiming an institute event:

```json
{"requested_category": "institute_event", "effective_category": "club_event",
 "category_note": "capped by role 'club' to club_event",
 "why": ["A club may claim at most 'club_event', so the request is scored as 'club_event'."]}
```

## 5. Exams

```
GET /api/exams?day=MON&session_id=AM    41 exams, day/session/rooms, seats at half capacity
```

## 6. Disruption: preview → approve → apply

```
POST /api/disruption/preview   {changes: [...]}        -> proposal (never applied)
POST /api/disruption/{id}/apply                        -> admin #2 only
POST /api/disruption/{id}/reject                       -> with a note
GET  /api/disruption/proposals[?status=pending]        -> queue, with can_i_approve
GET  /api/disruption/proposals/{id}                    -> the diff, without the payload
GET  /api/disruption/current                           -> is a repaired timetable in force?
```

All five change types are accepted (`faculty_unavailable`, `room_unavailable`,
`add_faculty`, `add_session`, `remove_session`). Unknown ids return **422**, never a silent
no-op. The preview response contains:

```json
{"status": "pending", "valid": true, "moves": 12, "broken_count": 12,
 "moved": [{"session_id": "CS203-L2", "kind": "day_changed",
            "before": {...}, "after": {...}}],
 "attempts": [{"strategy": "minimal-move, group day capped at 6 h", "status": "OPTIMAL"}],
 "report": {"hard_violation_count": 0, "stability": {"sessions_moved": 12}}}
```

and for an impossible change:

```json
{"status": "refused", "valid": false,
 "explanation": {"core_sessions": ["PH191-A-P1", "..."],
                 "suggestions": ["every lab_phy room is closed or reserved when 4 session(s) ..."]}}
```

Self-approval returns `403` with a message telling the judge which account to use instead.

## 7. AI layer (plain-language requests)

```
POST /api/ai/parse     {text, role?, allow_llm?}   -> draft + confidence + assumptions + checks
GET  /api/ai/status                                -> which provider is configured
GET  /api/ai/samples                               -> the organisers' practice requests
```

The response is a **draft**, never a decision:

```json
{"draft": {"attendance": 100, "duration_periods": 2,
           "windows": [{"day": "MON", "from_period": 10, "to_period": 11}],
           "needs": ["pa_system"], "room_types": ["seminar_hall"]},
 "confidence": {"attendance": 0.95, "window": 0.85},
 "assumptions": [{"field": "room_types", "value": ["seminar_hall"], "why": "..."}],
 "follow_up": null,
 "feasibility": {"ok": true, "candidate_rooms": ["SH-1", "SH-2"], "conflicts": []},
 "source": {"provider": "deterministic", "llm": null}}
```

Guarantees, all covered by tests:

* works with **no model configured** (`LLM_PROVIDER=none`) — same output;
* if a model is configured and fails, the response says so in `notes` and still parses;
* contradictory requests are caught against the dataset, e.g. SH-2 + "wheelchair accessible"
  → `conflicts: ["SH-2 does not have ['accessible']", "suggest instead: SH-1"]`;
* impossible requests name the rule that fails ("no venue seats 900; the largest room holds 800");
* missing essentials produce a `follow_up` question instead of a guess.

## 8. Admin / operations

```
GET  /api/admin/dashboard      counts, conflicts, soft breakdown, utilisation, risks, audit
POST /api/admin/exports        write exports/schedule.json (+ schedule_after.json)
POST /api/admin/reset          reseed users, reload committed exports, clear proposals
GET  /api/admin/audit          who did what
GET  /api/admin/users          seeded accounts
```

`reset` is the button judges press: it returns the app to the state the README describes in
one call.

## 9. Running it

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r api/requirements.txt
cp .env.example .env            # optional; defaults work
cd api && uvicorn app.main:app --reload --port 8000
# docs: http://localhost:8000/docs
```

`EXPORT_ON_BOOT`/`LOAD_COMMITTED_EXPORTS=true` loads `exports/schedule.json` at start-up, so
the app is usable immediately — generation is an explicit admin action, not a page-load cost.
