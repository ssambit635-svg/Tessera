# The 6-minute demo (and how to film it)

Judges get the README, the live link and four demo logins. This is the exact path that shows
everything the problem statement asks for, in the order that tells the story best. The video
must be ≤ 5 minutes, so rehearse this once and cut the pauses.

Login page: `http://<host>/` → pick a role (password `Tessera@2027` if you use the form).

---

## 0:00 — What this is (20 s)

> "CIT makes its timetable in spreadsheets and books rooms on WhatsApp. Week 7 — Spectra week —
> is where every clash lands. Tessera generates the semester timetable, decides all 25 Spectra
> requests with reasons, and repairs disruptions by moving as few classes as possible."

**Overview** is on screen: the four KPI cards read **189/189 scheduled · 0 hard violations ·
soft 3 · booking 67/70**, a miniature of the real week sits under them, and the *Campus venues*
strip shows the illustrated plates for AUD, LH-1, SH-1 and OAT. Say the numbers out loud; they
come from the organisers' validator, not from us. Drag the *Calendars* checkboxes in the left
rail once — classes, midsems, Spectra bookings and manual events are real layers.

## 0:20 — The timetable (60 s)

1. **Timetable** → **Group** → `Y1-A`.
2. Point at the grid: no double-bookings, labs only at P2–P4 or P6–P8, lunch never crossed.
3. Switch **Faculty → F01**, then **Room → AUD / SH-1** — same timetable, three lenses, and the
   room lens opens with the hall plate, seats, features and utilisation.
4. **Click any class.** The explain panel says why it sits there: room type/capacity/accessibility,
   faculty hours against the daily cap, the groups that are free, the soft trade-offs accepted,
   and five slots that would also work.

## 1:20 — Booking decisions (50 s)

**Bookings** tab.

* `BR-09` — 1,200 people asked for, largest venue is 800 → **rejected** with that reason.
* `BR-04` — cancelled by the requester → never approved.
* `BR-17` — window runs past P13 → **alternative offered** (half weight).
* A club asking for `institute_event` → capped to `club_event`.

Click one row: the **why-chain** shows the role cap, the capacity check and the placement.
Totals: **67.0 / 70**, zero priority inversions.

## 2:10 — Plain language, and the model is optional (70 s)

**Ask Tessera** → click two of the sample chips, then type the Hinglish one by hand:

```
seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye
```

Point at: attendance 100, 2 periods, **P10–P11**, `seminar_hall`, `pa_system`, the confidence
chips, and the explicit **assumption** ("‘6 baje’ on MON — the window is the rest of that day").
Then the SH-2 trap:

```
I want SH-2 on Friday at 10 am for a wheelchair-accessible poster session, 60 people.
```

→ SH-2 is not accessible; the card says so and offers **SH-1**. Hit **Check with the rules** →
fits / blocked comes from the kernel, not the model.

Now the killer line: **"the model reads, the code decides"** — `/api/ai/status` shows
`deterministic only` when no key is set, and the same request still parses. Try `1200 people`
→ it refuses with "no venue seats 1,200".

## 3:20 — A disruption, approved by a *different* admin (90 s)

**Changes** → **Load sample** → **Preview repair** (~30 s).

* "12 sessions move, 0 hard violations" — show the before → after list (time changes vs room-only).
* Point out the count is the *minimum* the solver could prove, and that the sample's faculty
  leave produces a repair, not a reshuffle.
* Press **Approve & apply** as `admin@cit.edu` → **403**: *"you cannot approve your own request"*.
  Sign out, sign in as `dean@cit.edu` (Admin, second approver) → approve → exports are rewritten.
* Back on **Admin** → `schedule_after.json` now downloads with the repaired timetable.

Also show a refusal: put `{"type":"room_unavailable","room_id":"LH-1","days":["MON","TUE","WED","THU","FRI"],"periods":[1,2,3,4,5,6,7,8,9]}`
in the box → preview → **refused**, with the constraints in conflict and the blocking sessions.

## 4:50 — Clean state, exports, and the numbers again (40 s)

**Admin** tab:

* **Reset demo data** → users reseeded, committed exports reloaded.
* **Write exports** → both files written by the app (never hand-edited).
* Download `schedule.json`, mention `python vendor/validator.py --data vendor/cit_public.json --schedule schedule.json`
  gives **hard 0, soft 3, bookings 67/70**.
* Phone view: the same page, responsive, one deploy (no npm, no CDN).

## 5:30 — close (15 s)

> "Everything you saw is in the repo: the kernel that decides validity, the solver, the repair
> engine, the API and this UI. The model is optional by design — switch it off and nothing breaks."

---

## Shot list (edit in this order)

| # | Screen | Must be visible |
| --- | --- | --- |
| 1 | Dashboard | 189/189 · hard 0 · soft 3 · 67/70 |
| 2 | Timetable group → click a class | explain panel with reasons + alternatives |
| 3 | Bookings | BR-09 rejected, BR-04 cancelled, BR-17 alternative |
| 4 | AI request | Hinglish parse + assumptions + SH-2 → SH-1 |
| 5 | Changes | diff list, then 403 on self-approval, then dean approves |
| 6 | Admin | reset, exports, download |
| 7 | Phone | one screen, readable grid |

## Before you record

```bash
python tools/check_secrets.py        # clean
cd api && python -m pytest tests -q  # 80 tests
python ../vendor/validator.py --data ../vendor/cit_public.json --schedule ../exports/schedule.json
```

Then reset the demo so the video starts from the state the README describes.
