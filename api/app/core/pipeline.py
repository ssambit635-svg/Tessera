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
from .exams import solve_exams
from .export import build_schedule, write_schedule
from .solver import solve


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

    tt = solve(ds, bookings["reserved_rooms"], bookings["blocked_groups"],
               time_limit=time_limit, workers=workers, seed=seed)
    if not quiet:
        print(f"[2/3] timetable: {tt['status']} {tt['scheduled']}/{tt['expected']} "
              f"obj={tt['objective']} ({tt['wall_time']}s)")
    if not tt["assignment"]:
        raise RuntimeError(f"timetable solver returned {tt['status']} - cannot export an invalid plan")
    log["timetable"] = {k: tt[k] for k in ("status", "objective", "wall_time", "scheduled", "expected")}

    exams = solve_exams(ds)
    if not quiet:
        print(f"[3/3] exams: {exams['status']} {len(exams['exams'])}/{len(ds.exams)} obj={exams['objective']}")
    log["exams"] = {k: exams[k] for k in ("status", "objective")}

    schedule = build_schedule(ds, tt["assignment"], bookings, exams, team=team)
    report = validate(ds, schedule)
    log["report"] = report
    return schedule, log


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="../../vendor/cit_public.json")
    ap.add_argument("--out", default="../../exports/schedule.json")
    ap.add_argument("--team", default="Voltryx")
    ap.add_argument("--time-limit", type=float, default=120.0)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--seed", type=int, default=20270131)
    ap.add_argument("--report", default=None)
    a = ap.parse_args(argv)

    ds = Dataset.load(a.data)
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
    return 0 if rep["hard_violation_count"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
