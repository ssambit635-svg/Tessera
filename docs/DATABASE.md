# Where Tessera keeps its data

Short answer: **there is no Supabase and no Firebase.** Tessera ships one container with a
**SQLite database file** next to the code, and the scheduling truth lives in two JSON files
that the organisers gave us / that our own exporter produced.

That is not a shortcut — it is what the rule book asks for
(`docs/RULES_MASTER.md`, section I):

> 🟠 Deploy one always-on container; **SQLite file persistence**; no in-memory-only state.

A hosted database (Supabase/Firebase) would add a second thing that can be down, needs a
network round-trip on every request, has its own free-tier sleeping rules, and adds nothing a
judge can see. SQLite gives us a real transactional database with zero moving parts.

---

## The three layers

| Layer | Lives where | Who writes it | Can a judge break it? |
| --- | --- | --- | --- |
| **Organisers' dataset** | `vendor/cit_public.json` (read-only) | nobody, ever | no — it is vendored and never patched |
| **Schedules (the scored artefact)** | `exports/schedule.json`, `exports/schedule_after.json` | only `core/export.py` | no — exports are generated, never hand-edited |
| **App state** | `tessera.db` (SQLite) | the API | yes — the Admin `reset` button rebuilds it |

`vendor/` and `exports/` are the evidence; the database is the working memory around them.

## What is actually inside `tessera.db`

| Table | What it holds | Why it exists |
| --- | --- | --- |
| `user` | 5 demo accounts, pbkdf2 password hashes, role, linked faculty/group | login without a third-party identity provider |
| `appstate` | the current timetable and the repaired timetable as JSON blobs + metadata (seed, solve time, soft score) | what the exporter writes and what survives a restart |
| `proposal` | every disruption preview, who asked, who decided, the diff, the reason | the approval step is auditable — nobody approves their own request |
| `auditlog` | who did what, when | "audit trail on screen = credibility" (rule book, section H) |
| `timetableversion` | one row per generation / committed load / applied repair | reproducibility: seed, status, hard/soft counts per version |
| `placement` | one row per class: version, session, day, period, room | you can query "what is in LH-1 on WED P6" |
| `examplacement` | one row per exam: version, exam, day, AM/PM, rooms | same, for the 41 midsems |
| `bookingrecord` | one row per Spectra request: status, slot, room, reason | same, for the 25 decisions |
| `adhoc_event` | manual events booked through the form (not part of the scored export) | the manual path must work with the LLM switched off |

The JSON blob stays authoritative **for the export** because it is byte-identical to what
`vendor/validator.py` reads. The four derived tables are rebuilt from it on every change, and
`api/tests/test_persistence.py` asserts they can never drift:

```
placement count == sum(version.sessions)
exam_placement  == sum(version.exams)
booking_record  == sum(version.bookings)
```

You can see the live numbers yourself:

```bash
curl -H "Authorization: Bearer $TOKEN" localhost:8000/api/admin/db
```

```json
{"engine": "sqlite",
 "url": "sqlite:////app/tessera.db",
 "file_bytes": 184320,
 "tables": {"users": 5, "app_state": 3, "proposals": 0, "audit_log": 0,
            "timetable_version": 1, "placement": 189, "exam_placement": 41,
            "booking_record": 25},
 "active_version": {"id": 1, "source": "committed exports", "sessions": 189,
                    "hard_violations": 0, "seed": 20270131}}
```

`GET /api/admin/history` lists the last 12 versions (older ones are pruned so the file cannot
grow without bound).

## Why it survives a restart

1. **Boot** — `init_db()` creates the tables, seeds the 5 accounts, and if there is no
   timetable in the database yet it loads `exports/schedule.json` and mirrors it. The app is
   usable in under a second, with no solving on page load.
2. **Generate** — an Admin re-solves; the new timetable replaces the blob, is mirrored as a
   new version, and is exported. The seed is stored, so the same input gives the same file.
3. **Disrupt** — a preview is computed *without touching state*; it is applied only after a
   second admin approves it, at which point `schedule_after` is stored, mirrored, and exported.
4. **Restart** — everything above is read back from the file. The committed exports are only
   a fallback for a brand-new database.
5. **Reset** — wipes app state and the mirror, reseeds users, reloads the committed exports.
   One call, and the demo is back to the README state.

## Render specifics (free plan)

Free instances have an **ephemeral** disk: a redeploy or a long sleep can throw the SQLite file
away. That is fine here, because the database is rebuildable by design:

* the dataset is vendored, so the input is never lost;
* the committed exports are in git, so boot always has a valid timetable;
* users are seeded on boot, so all 5 demo logins always work;
* only *in-session* proposals and audit rows are lost — the demo never depends on them existing
  before the judge's own clicks.

If the project ever moves to a paid host, `DATABASE_URL` can point at Postgres unchanged
(SQLModel/SQLAlchemy handle the dialect); nothing in `core/` knows or cares which database is
underneath. We did not add a managed database because the rule book explicitly asks for SQLite
file persistence and because a second network dependency is a second way to fail a demo.

## Uploading your own dataset (judges do this)

```
POST   /api/admin/dataset     raw dataset JSON  -> validated, stored in data/dataset.json,
                                                   stale timetable cleared
DELETE /api/admin/dataset     back to vendor/cit_public.json
POST   /api/timetable/generate  solve the uploaded dataset
```

`vendor/` is never written to. A dataset without `sessions` is rejected with `422` and a
readable message, before anything is stored. `data/` is gitignored.
