# Core functionality test report

Date: 2026-11-01. Updated after the fixes below. Tested locally against `cit-public-v1`, using the contract in
`docs/RULES_MASTER.md` (which gives the organiser's validator precedence). This report
is evidence of specific tests, not a guarantee for every input or deployment.

**Legend:** PASS = demonstrated for the stated scope; PARTIAL = evidence exists but
not the complete claim; FAIL = reproduced counterexample; NOT TESTED = no adequate
check. A validator pass is not proof of checks the validator does not implement.

## Results

### 1. Authentication

- PASS — Admin can log in and log out: live local frontend smoke exercises sign-in and
  sign-out; password login is also exercised. Logout revokes the presented token in
  SQLite, and a separate active token remains valid. Client-side sign-out also clears state;
  if the API is unreachable it cannot revoke the server token until expiry.
- PASS — Faculty can access their account: password login and `/api/auth/me` identify
  the faculty user and faculty ID.
- PASS — Invalid credentials produce a 401 and understandable error; frontend smoke
  also exercises an incorrect password.
- PARTIAL — Missing/invalid bearer tokens are rejected on protected API routes and
  faculty/club are denied selected admin actions. The app intentionally exposes
  passwordless demo login, including admin; it is not a production authentication
  boundary. `DEMO_LOGIN_ENABLED=false` disables that endpoint for non-demo deployments.
  Browser-level direct navigation for every role was not exhaustively tested.

### 2. Timetable generation

Fresh generation into a temporary directory produced 189/189 sessions, then the
unmodified organiser validator reported zero hard violations. The committed baseline
also passed. The following are PASS for this dataset and the organiser's rules:

- PASS — Every session scheduled exactly once.
- PASS — No simultaneous faculty assignments.
- PASS — No simultaneous student-group assignments, **except** the rulebook's
  permitted simultaneous sessions sharing a basket slot.
- PASS — No simultaneous room allocations covered by the validator.
- PASS — Room capacity and type.
- PASS — Lunch and fixed-slot constraints (fixed-slot change also covered by repair tests).
- PASS — Three-hour labs use the permitted P2 or P6 starts.

### 3. Examination scheduling

- PASS — 41/41 exams scheduled in both fresh and committed baseline exports.
- PASS — No overlapping exams for a group, per organiser validator.
- PASS — Half-capacity seating, per organiser validator.
- PASS — Each exam-capable room has one invigilator; assignments satisfy faculty
  unavailability, accessibility and non-overlap, including daily-hour limits. The API
  and exam view expose assignments. One invigilator per room is a product assumption,
  not a quantity specified in the organiser dataset.
- PASS — The generator applies room maintenance and faculty unavailability to exam
  sessions by clock-time overlap; the after-export is checked against the disruption too.
  The organiser validator does not itself check these operational constraints. Since the
  dataset has no week-specific unavailability, applying weekly restrictions to exam week
  is conservative and should be confirmed with the organisers.

### 4. Venue booking

- PASS — A valid manual booking can be submitted, confirmed and cancelled via API.
- PASS — Tested English example extracts expected attendance, day and periods.
- PASS — Tested Hinglish example extracts expected attendance, time and duration.
  These are examples, not exhaustive language coverage.
- PASS — Manual booking rejects invalid calendar periods and an unavailable or unknown
  explicitly requested room rather than silently substituting it. Confirmed manual events
  and scored bookings are also checked for mandatory-group conflicts. Regression tests
  cover the previously reproduced counterexamples.
- PARTIAL — Scored dataset decisions respect category caps and show zero priority
  inversions; the manual-event path caps category but confirms sequentially, not via a
  demonstrated priority queue/preemption. Priority ordering for competing new manual
  requests is not proven.
- PASS — Tested impossible and rejected scored requests provide readable reasons.

### 5. Rescheduling

- PASS — Sample faculty unavailability results in a validator-clean repair.
- PASS — Sample room closure results in a validator-clean repair; an impossible
  all-week laboratory closure is refused.
- PASS — Sample repair moved 12 existing sessions, equal to the calculated lower
  bound; a new session is also added. A no-impact change requires zero moves.
- PASS — Preview returns a diff before approval.
- PASS — Apply requires an admin other than the proposer; self-approval is rejected.
- PASS — Infeasible and stale repairs are refused. The solver reserves confirmed manual
  events during preview and apply revalidates against bookings made after preview.
  SQLite serializes booking/apply check-and-write; concurrent same-room requests were tested.
  Exhaustive multi-process stress testing remains outstanding.
- FIXED — Approved repairs now become the active timetable, with the changed dataset
  persisted alongside it; the original baseline remains available for the baseline export.
  The test verifies changed placements, the added session, validation, dashboard counts,
  rejection of a stale proposal and protection of a new manual booking.

### 6. AI assistant

- PASS — A vague change request asks for details.
- PASS — A booking missing essential information produces follow-up questions. The
  frontend no longer silently substitutes missing attendance/duration and allows mandatory
  groups to be reviewed and sent to the API; offline and local-live UI smoke checks pass.
- PARTIAL — Role category caps and model-output filtering are tested; scored bookings
  show zero priority inversions. The new manual-booking priority queue behavior is not
  established, and no real external LLM was called.
- PARTIAL — Deterministic parsing, identifier filtering, repair validation and model
  failure paths are tested separately with mocked providers. The entire path from a
  real model response to an applied change was not tested.
- PASS — A simulated provider 429 falls back during parsing, followed by a successful
  manual booking; `LLM_PROVIDER=none` also works. A real external outage was not tested.

### 7. Exports and dashboard

- PASS — Baseline export is accepted by the organiser validator, contains all 189
  sessions and 41 exams, and has no warnings. No separate formal JSON Schema was found.
- PARTIAL — The sample approved repair is written to `schedule_after.json`, and the
  committed and freshly generated after-exports validate against their baseline and
  disruption. A regression test compares an approved changed placement in the current
  timetable with the after export; complete equivalence in every scenario is not established.
- PASS — Group, faculty and room timetable API views return entries; frontend route
  smoke renders in snapshot and live local modes. The approved sample repair appears in
  the current timetable, including the added session.
- PASS — Dashboard utilisation uses distinct occupied Spectra-week teaching periods
  from classes, scored bookings and manual events, divided by teaching periods available
  after maintenance. It excludes exam week and evening periods, and labels that scope.
- PASS — Dashboard counts pending proposals through preview and rejection and includes
  timetable, scored booking, exam operational and manual-event conflict checks.

## Test runs and reproduction

- `cd api && ../.venv/bin/python -m pytest tests -q`: **115 passed**; one third-party
  deprecation warning. Regression tests cover original counterexamples, exam staffing,
  token revocation, role spoofing, simultaneous booking, and approval state.
- `cd frontend && npm run build`: passed, with a >500 kB bundle warning.
  `npm run smoke` and `npm run smoke -- --live` passed (jsdom, not a real browser;
  live mode used a locally running API with isolated database/exports).
- The organiser validator reported **0 hard violations**, soft penalty **3**, booking
  score **67/70**, zero priority inversions and exam soft penalty **0** for the refreshed
  committed baseline and after-exports. The after-export moved **12 existing sessions**
  (3 time changes, 9 room-only). Both were written by the app pipeline; vendor files
  were not changed. Operational exam checks also pass independently.
- A real Chromium smoke attempt could not start because the sandbox lacks `libnspr4.so`;
  mobile/browser rendering and the deployed site still need independent verification.

The rulebook's quick-check expectation of soft 0 and booking 71 differs from the
observed 3 and 67/70; the repository README also documents those observed values.
## Needs attention before claiming judge readiness

1. Higher-priority *new manual* requests do not yet enter a priority queue or receive an
   approved preemption workflow; confirmed events remain protected. Scored dataset booking
   decisions do follow the published ordering, with zero inversions on the public dataset.
2. The demo walkthrough URL in the README is still missing. The deployed frontend/API,
   demo accounts, mobile rendering, a real third-party AI call, and the judges' private
   datasets have not been verified from this environment. GitHub reports the repo is public.
3. Confirm whether the organiser intends weekly maintenance/faculty restrictions to apply
   to the distinct exam week and how many invigilators per room are required. The app uses
   the conservative one-per-room policy described above.
4. The optional model call and arbitrary solver inputs are not exhaustively verified; a
   10/10 judging outcome cannot be guaranteed. Default passwordless demo login is deliberate
   for judging and should be disabled, with demo passwords replaced, outside the demo.
