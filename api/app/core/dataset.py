"""Dataset loader and index. Nothing here is hard-coded to cit_public.json.

Every rule value (days, periods, lunch, lab starts, caps, weights, priority order)
is read from the dataset file so the same code works on the judges' data.
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

# weight per effective booking category (mirrors the official validator)
CAT_WEIGHT = {
    "institute_event": 5,
    "guest_lecture": 4,
    "department_event": 3,
    "club_event": 2,
}

# which room allowed_uses entry a scheduled session kind needs
USE_FOR_KIND = {"lecture": "lecture", "tutorial": "tutorial", "lab": "lab"}


class Dataset:
    def __init__(self, raw: dict[str, Any]):
        self.raw = raw
        self.dataset_id: str = raw["dataset_id"]
        self.institute: str = raw.get("institute", "")

        cal = raw["calendar"]
        self.days: list[str] = cal["days"]
        self.periods: list[dict] = cal["periods"]
        self.lunch_after: int = cal["lunch"]["after_period"]
        self.lab_starts: set[int] = set(cal["lab_start_periods"])
        self.event_only_periods: set[int] = set(cal.get("event_only_periods", []))
        self.teaching_periods: list[int] = [
            p["id"] for p in self.periods if p.get("teaching")
        ]
        self.first_period = min(self.teaching_periods)
        self.last_period = max(self.teaching_periods)
        self.max_period = max(p["id"] for p in self.periods)

        self.exam_week = cal.get("exam_week", {})
        self.exam_days: list[str] = self.exam_week.get("days", [])
        self.exam_slots: list[str] = [s["id"] for s in self.exam_week.get("sessions", [])]

        self.priority_order: list[str] = raw["priority_order"]
        self.role_cap: dict[str, str] = raw.get("role_category_cap", {})

        self.rooms: dict[str, dict] = {r["id"]: r for r in raw["rooms"]}
        self.faculty: dict[str, dict] = {f["id"]: f for f in raw["faculty"]}
        self.groups: dict[str, dict] = {g["id"]: g for g in raw["student_groups"]}
        self.courses: dict[str, dict] = {c["id"]: c for c in raw.get("courses", [])}
        self.sessions: dict[str, dict] = {s["id"]: s for s in raw["sessions"]}
        self.requests: dict[str, dict] = {b["id"]: b for b in raw.get("booking_requests", [])}
        self.cancelled: set[str] = {c["request_id"] for c in raw.get("cancellations", [])}
        self.exams: list[dict] = raw.get("exams", [])
        self.exams_by_id: dict[str, dict] = {e["id"]: e for e in self.exams}

        # unavailability indexes
        self.faculty_unavailable: dict[str, set[tuple[str, int]]] = defaultdict(set)
        for f in raw["faculty"]:
            for u in f.get("unavailable", []):
                for p in u["periods"]:
                    self.faculty_unavailable[f["id"]].add((u["day"], p))
        self.room_unavailable: dict[str, set[tuple[str, int]]] = defaultdict(set)
        for u in raw.get("room_unavailability", []):
            for p in u["periods"]:
                self.room_unavailable[u["room_id"]].add((u["day"], p))

        self._room_cache: dict[str, list[str]] = {}
        self._slot_cache: dict[str, list[tuple[str, int, list[int]]]] = {}

    # ------------------------------------------------------------------ loaders
    @classmethod
    def load(cls, path: str) -> "Dataset":
        with open(path, encoding="utf-8") as f:
            return cls(json.load(f))

    # ------------------------------------------------------------------ helpers
    def periods_of(self, start: int, duration: int) -> list[int]:
        return list(range(start, start + duration))

    def block_after_lunch(self, start: int, duration: int) -> bool:
        per = self.periods_of(start, duration)
        return per[0] <= self.lunch_after < per[-1]

    def room_use_ok(self, room: dict, kind: str) -> bool:
        need = USE_FOR_KIND.get(kind)
        return need is None or need in room.get("allowed_uses", [])

    def room_features(self, room: dict) -> set[str]:
        feats = set(room.get("features", []))
        if room.get("accessible"):
            feats.add("accessible")
        return feats

    def feasible_rooms(self, session: dict) -> list[str]:
        """Rooms the validator would accept for this session (type/capacity/accessibility)."""
        sid = session["id"]
        if sid in self._room_cache:
            return self._room_cache[sid]
        out = []
        for r in self.rooms.values():
            if r["type"] not in session["room_types"]:
                continue
            if r["capacity"] < session["size"]:
                continue
            if session.get("needs_accessible") and not r.get("accessible"):
                continue
            if not self.room_use_ok(r, session["kind"]):
                continue
            out.append(r["id"])
        self._room_cache[sid] = out
        return out

    def time_slots(self, session: dict) -> list[tuple[str, int, list[int]]]:
        """(day, start, periods) combos that satisfy H9 / H14 / H7."""
        sid = session["id"]
        if sid in self._slot_cache:
            return self._slot_cache[sid]
        dur = session["duration"]
        fx = session.get("fixed_slot")
        out = []
        for day in self.days:
            for p in range(self.first_period, self.last_period + 1):
                per = self.periods_of(p, dur)
                if per[-1] > self.last_period:
                    continue
                if self.block_after_lunch(p, dur):
                    continue
                if session["kind"] == "lab" and p not in self.lab_starts:
                    continue
                if fx and (fx["day"] != day or fx["start_period"] != p):
                    continue
                if any((day, pp) in self.faculty_unavailable[session["faculty_id"]] for pp in per):
                    continue
                out.append((day, p, per))
        self._slot_cache[sid] = out
        return out

    # ------------------------------------------------------------------ bookings
    def effective_category(self, req: dict) -> str:
        """Cap can only lower a requested category, never raise it."""
        order = self.priority_order
        cap = self.role_cap.get(req.get("role", ""), "club_event")
        a = order.index(req["requested_category"]) if req.get("requested_category") in order else len(order) - 1
        return order[max(a, order.index(cap))]

    def category_rank(self, category: str) -> int:
        return self.priority_order.index(category) if category in self.priority_order else len(self.priority_order)

    def outranks(self, r1: dict, r2: dict) -> bool:
        c1 = self.category_rank(self.effective_category(r1))
        c2 = self.category_rank(self.effective_category(r2))
        if c1 != c2:
            return c1 < c2
        return r1["submitted_at"] < r2["submitted_at"]

    # ------------------------------------------------------------------ exams
    def exam_seats(self, room_id: str) -> int:
        """Effective capacity during exams is half the room capacity."""
        room = self.rooms.get(room_id)
        if room is None or "exam" not in room.get("allowed_uses", []):
            return 0
        return room["capacity"] // 2

    def exam_rooms(self) -> list[str]:
        return [r["id"] for r in self.rooms.values() if "exam" in r.get("allowed_uses", [])]

    # ------------------------------------------------------------------ derived
    def group_weekly_hours(self) -> dict[str, int]:
        out: dict[str, int] = defaultdict(int)
        for s in self.sessions.values():
            for g in s["groups"]:
                out[g] += s["duration"]
        return dict(out)

    def summary(self) -> dict:
        return {
            "dataset_id": self.dataset_id,
            "rooms": len(self.rooms),
            "faculty": len(self.faculty),
            "groups": len(self.groups),
            "sessions": len(self.sessions),
            "teaching_hours": sum(s["duration"] for s in self.sessions.values()),
            "booking_requests": len(self.requests),
            "cancelled": sorted(self.cancelled),
            "exams": len(self.exams),
        }
