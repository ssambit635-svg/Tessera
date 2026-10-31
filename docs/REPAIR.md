# Rescheduling: minimal-move repair and the infeasibility explanation

Phase 4 of the plan. This is the code behind the 15 "rescheduling" marks:

| Sub-criterion | Marks | How this repo earns it |
| --- | --- | --- |
| No hard violations after the judge's change file | 6 | the repair reuses the same validity kernel; refused changes are never exported |
| Fewest sessions moved compared to other teams | 5 | the repair minimises exactly the validator's `sessions_moved` (CP-SAT, proven optimal) |
| Clear view of the changes + approval step | 4 | `moved[]` carries old → new, the kind of change and the reason; the API exposes preview/apply |

## The pipeline

```
change file ──> disruption.apply_changes ──> dataset' (strict: unknown ids raise)
                                     │
                       probe_zero_moves ──> 0 moves? done (seconds, proven)
                                     │ no
                             repair (CP-SAT) ──> optimal move set
                                     │ infeasible
                        explain (unsat core) ──> conflicting sessions + suggestions
```

## Why the move count is optimal, not just small

The objective is literally the metric the validator reports:

```
minimise   10_000 x (sessions whose day/start/room changed)  +  soft penalty
```

One move is worth 10,000 soft points, so the solver will never trade a session move for a
nicer room; but among equally-minimal solutions it prefers (a) room-only changes over time
changes and (b) a lower soft penalty. A second, lexicographic solve then locks the move
count and minimises the soft penalty of that specific move set, so a forced move does not
leave a permanent hole in a group's day.

Two behaviours that fall out of this and matter in the demo:

* a change that touches nothing (a session removed, a faculty member added, a room closed
  while empty) returns **0 moves in ~2 seconds** via `probe_zero_moves`;
* the result is verified with our kernel before export - a repair that cannot be validated
  is never written.

## Resilience in the timetable itself

`api/app/core/solver.py` caps how much work any single room carries:

* `room_day_cap = 3` - no room hosts more than three sessions in one day;
* `room_week_cap = 12` - no teaching room carries more than twelve sessions in the week.

The caps make the timetable **predictable under a closure**: instead of one unlucky room
holding 16 sessions (16 moves if it closes), the worst room holds ~12. The caps cost
nothing in soft score on this dataset (S1-S6 still 3) and the pipeline relaxes them
automatically if they ever make the model infeasible.

## When nothing can be repaired

`repair_or_refuse` tries, in order:

1. minimal moves with the 6 h group-day cap,
2. minimal moves with that cap relaxed,
3. `explain()` - and returns **no schedule at all** rather than a broken one.

`explain()` is the part no other team will have. It builds the same model with one
*assumption literal* per session ("this session may be placed") and asks OR-Tools for the
**sufficient assumption set for infeasibility** - a computed answer to "which constraints
are in conflict", not a guess. Closed physics lab for the week produces:

```json
{
  "core_sessions": ["PH191-A-P1","PH191-B-P1","PH191-C-P1","PH191-D-P1"],
  "details": [{"session_id": "PH191-A-P1",
               "problems": ["every room that fits (PHY-LAB) is closed or promised to a
                             booking whenever the session could run"]}],
  "suggestions": ["every lab_phy room is closed or reserved when 4 session(s) could run
                   (PH191-A-P1, ...); reopening one of ['PHY-LAB'] removes the conflict"]
}
```

Suggestions are generated from the data, never from a model: missing room types, faculty
with no usable window (with the three lightest-load substitutes), sessions that no room can
seat, and the fallback "freeing one period resolves it".

## Measured results (this dataset)

| Scenario | Result |
| --- | --- |
| `vendor/sample_disruption.json` (faculty leave + CR-102 closed all week + 1 added session) | **12 moved, 9 room-only, 0 hard violations, soft 3 (unchanged)** |
| session removed / faculty added / free added session | **0 moves, ~2 s** |
| one room closed for one day | 2 moves |
| PHY-LAB closed all week | refused, core = the four PH191 labs, suggestion names PHY-LAB |
| 6 random faculty/room/remove changes (stress test) | 6/6 clean, 0-2 moves each |

Every number is re-checked by `api/tests/test_repair.py` and by the official validator in
CI (`--disruption ... --baseline ...`), so a regression cannot slip through unnoticed.
