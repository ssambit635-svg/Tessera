"""End-to-end: dataset -> booking decisions -> timetable -> exams -> exports.

    python -m app.core.pipeline --data ../../vendor/cit_public.json --out ../../exports/schedule.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from .bookings import decide_bookings
from .constraints import validate
from .dataset import Dataset
from .disruption import apply_changes, load_disruption
from .repair import repair_or_refuse
from .exams import solve_exams
from .exam_staff import prepare_exam_schedule
from .export import build_schedule, write_schedule
from .solver import solve


# resilience ladder: keep every room's load low so a closure costs few moves, but never at
# the price of an invalid or much worse timetable - fall back to a looser cap if needed.
RESILIENCE_LADDER = [(3, 12), (4, 14), (None, None)]


def generate(ds: Dataset, time_limit: float = 120.0, workers: int = 1, seed: int = 20270131,
             team: str = "Voltryx", quiet: bool = False):
    bookings = decide_bookings(ds)
    log = {"bookings": {"approved": sum(1 for d in bookings["decisions"] if d["status"] == "approved"),
                        "alternatives": sum(1 for d in bookings["decisions"] if d["status"] == "alternative_offered"),
                        "rejected": sum(1 for d in bookings["decisions"] if d["status"] == "rejected"),
                        "reserved_room_periods": len(bookings["reserved_rooms"]),
                        "blocked_group_periods": len(bookings["blocked_groups"])}}
    if not quiet:
        print(f"[1/3] bookings: {log['bookings']}")

    tt = None
    for day_cap, week_cap in RESILIENCE_LADDER:
        tt = solve(ds, bookings["reserved_rooms"], bookings["blocked_groups"],
                   time_limit=time_limit, workers=workers, seed=seed,
                   room_day_cap=day_cap, room_week_cap=week_cap)
        if tt["assignment"]:
            tt["resilience"] = {"room_day_cap": day_cap, "room_week_cap": week_cap}
            break
        if not quiet:
            print(f"[2/3] caps day={day_cap} week={week_cap} -> {tt['status']}, relaxing")
    if not quiet:
        print(f"[2/3] timetable: {tt['status']} {tt['scheduled']}/{tt['expected']} "
              f"obj={tt['objective']} ({tt['wall_time']}s)")
    if not tt["assignment"]:
        raise RuntimeError(f"timetable solver returned {tt['status']} - cannot export an invalid plan")
    log["timetable"] = {k: tt[k] for k in ("status", "objective", "wall_time", "scheduled", "expected")}

    exams = solve_exams(ds)
    if len(exams["exams"]) != len(ds.exams):
        raise RuntimeError(f"exam scheduler failed: {exams.get('reason') or exams['status']}")
    if not quiet:
        print(f"[3/3] exams: {exams['status']} {len(exams['exams'])}/{len(ds.exams)} obj={exams['objective']}")
    log["exams"] = {k: exams[k] for k in ("status", "objective")}

    schedule = build_schedule(ds, tt["assignment"], bookings, exams, team=team)
    report = validate(ds, schedule)
    log["report"] = report
    return schedule, log


def generate_after(ds: Dataset, baseline_schedule: dict, changes: list[dict],
                   time_limit: float = 60.0, workers: int = 2, seed: int = 20270131,
                   team: str = "Voltryx", quiet: bool = False):
    """Apply a change file to a baseline schedule and repair it with the fewest moves."""
    from .constraints import to_assign

    ds_after, change_log = apply_changes(ds, changes)
    base_assign, _ = to_assign(baseline_schedule)
    result = repair_or_refuse(ds_after, base_assign, baseline_schedule,
                              time_limit=time_limit, workers=workers, seed=seed)

    log = {"changes": change_log, "repair": {k: v for k, v in result.items()
                                             if k in ("status", "moves", "forced", "objective",
                                                      "wall_time", "attempts", "new_sessions",
                                                      "dropped_sessions")},
           "moved": result.get("moved", [])}

    if result["status"] not in ("OPTIMAL", "FEASIBLE"):
        log["explanation"] = result.get("explanation")
        if not quiet:
            print(f"[repair] REFUSED - {result['status']}")
            for s in (result.get("explanation") or {}).get("suggestions", []):
                print(f"  suggestion: {s}")
        return None, ds_after, log

    exams, exam_error = prepare_exam_schedule(ds_after, baseline_schedule.get("exams", []))
    if exams is None:
        log["explanation"] = {"suggestions": [exam_error]}
        if not quiet:
            print(f"[repair] REFUSED - {exam_error}")
        return None, ds_after, log
    schedule = {
        "team": baseline_schedule.get("team", team),
        "dataset_id": ds_after.dataset_id,
        "sessions": [{"session_id": sid, "day": day, "start_period": p, "room_id": room}
                     for sid, (day, p, room) in sorted(result["assignment"].items())],
        "fest_week": baseline_schedule.get("fest_week", {"bookings": [], "session_overrides": []}),
        "exams": exams,
    }
    report = validate(ds_after, schedule, baseline=baseline_schedule)
    log["report"] = report
    if not quiet:
        print(f"[repair] {result['status']} - {result['moves']} session(s) moved "
              f"in {result['wall_time']}s (of {len(ds_after.sessions)} scheduled)")
        kinds = {}
        for mv in result["moved"]:
            kinds[mv["kind"]] = kinds.get(mv["kind"], 0) + 1
        print(f"[repair] move kinds: {kinds or 'none'}")
        print(f"[repair] hard violations after the change: {report['hard_violation_count']} "
              f"{report['hard_by_rule']}")
    return schedule, ds_after, log


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="../../vendor/cit_public.json")
    ap.add_argument("--out", default="../../exports/schedule.json")
    ap.add_argument("--team", default="Voltryx")
    ap.add_argument("--time-limit", type=float, default=120.0)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--seed", type=int, default=20270131)
    ap.add_argument("--report", default=None)
    ap.add_argument("--after", default=None, help="also write the repaired schedule after a disruption")
    ap.add_argument("--disruption", default=None, help="change file to apply")
    ap.add_argument("--baseline", default=None, help="use this schedule.json instead of generating one")
    ap.add_argument("--refresh-exams", action="store_true", help="reschedule exams in the supplied baseline")
    ap.add_argument("--repair-time-limit", type=float, default=60.0)
    a = ap.parse_args(argv)

    ds = Dataset.load(a.data)
    if a.baseline:
        with open(a.baseline, encoding="utf-8") as f:
            schedule = json.load(f)
        if a.refresh_exams:
            exams = solve_exams(ds)
            if len(exams["exams"]) != len(ds.exams):
                raise RuntimeError(f"exam scheduler failed: {exams.get('reason') or exams['status']}")
            schedule["exams"] = exams["exams"]
            write_schedule(schedule, a.out)
        log = {"report": validate(ds, schedule)}
    else:
        schedule, log = generate(ds, a.time_limit, a.workers, a.seed, a.team)
        write_schedule(schedule, a.out)

    rep = log["report"]
    print(f"\nwrote {a.out}")
    print(f"hard violations : {rep['hard_violation_count']} {rep['hard_by_rule']}")
    print(f"soft penalty    : {rep['soft_total']} {rep['soft_penalties']}")
    if "bookings" in rep:
        b = rep["bookings"]
        print(f"bookings        : score {b['booking_score']} / max {b['booking_score_max_if_all_approved']} "
              f"| approved {b['approved']} alt {b['alternatives']} rej {b['rejected']} "
              f"| inversions {len(b['priority_inversions'])}")
    print(f"exam soft       : {rep.get('exam_soft_penalty')}")
    if a.report:
        os.makedirs(os.path.dirname(os.path.abspath(a.report)), exist_ok=True)
        json.dump({"log": {k: v for k, v in log.items() if k != "report"}, "report": rep},
                  open(a.report, "w"), indent=2)
        print(f"report -> {a.report}")

    ok = rep["hard_violation_count"] == 0
    if a.after and a.disruption:
        after, ds_after, alog = generate_after(ds, schedule, load_disruption(a.disruption),
                                              time_limit=a.repair_time_limit,
                                              workers=a.workers, seed=a.seed, team=a.team)
        if after is None:
            print("refused: no valid repair exists for this change file")
            return 2
        write_schedule(after, a.after)
        arep = alog["report"]
        stab = arep.get("stability", {})
        print(f"\nwrote {a.after}")
        print(f"moved sessions  : {stab.get('sessions_moved')} "
              f"({stab.get('time_changed')} changed time, {stab.get('room_only_changed')} room only)")
        print(f"hard violations : {arep['hard_violation_count']} {arep['hard_by_rule']}")
        print(f"soft penalty    : {arep['soft_total']} {arep['soft_penalties']}")
        if a.report:
            base_rep = a.report.replace(".json", "-after.json")
            json.dump({"log": {k: v for k, v in alog.items() if k != "report"}, "report": arep},
                      open(base_rep, "w"), indent=2)
            print(f"report -> {base_rep}")
        ok = ok and arep["hard_violation_count"] == 0

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
