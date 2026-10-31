"""Deterministic understanding of a venue request (English and Hinglish).

This module is the fallback that must always work: the product behaves identically when
the LLM is disabled, rate-limited or out of credits. It never decides validity - it only
produces a draft, with an explicit confidence value and a list of stated assumptions.
"""
from __future__ import annotations

import re

WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"]
WEEKDAY_WORDS = {
    "MON": ["mon", "monday", "somvar", "somwar", "somvaar"],
    "TUE": ["tue", "tues", "tuesday", "mangalvar", "mangalwar"],
    "WED": ["wed", "weds", "wednesday", "budhvar", "budhwar"],
    "THU": ["thu", "thur", "thurs", "thursday", "guruvar", "guruwar", "brihaspativar"],
    "FRI": ["fri", "friday", "shukravar", "shukrawar"],
    "SAT": ["sat", "saturday", "shanivar"],
}
RELATIVE_DAYS = {
    "tomorrow": ["tomorrow", "kal", "kall"],
    "today": ["today", "aaj", "aj"],
    "day after tomorrow": ["day after tomorrow", "parso", "parson"],
}
NEED_WORDS = {
    "projector": ["projector", "projecter", "screen", "presentation"],
    "pa_system": ["mic", "mike", "pa system", "pa_system", "sound system", "speaker", "audio", "mic chahiye"],
    "stage": ["stage", "staging", "performance"],
    "computers": ["computer", "computers", "lab with computers", "desktop", "coding", "hackathon", "lan"],
    "accessible": ["wheelchair", "accessible", "disabled", "divyang", "ramp"],
    "power_benches": ["power bench", "power supply", "soldering", "electronics bench"],
    "ac": ["ac", "air conditioned", "air-conditioned"],
}
ROOM_TYPE_WORDS = [
    ("auditorium", ["auditorium", "auditoriam", "main hall"]),
    ("outdoor", ["open air", "open-air", "outdoor", "ground", "amphitheatre", "amphitheater", "maidan"]),
    ("seminar_hall", ["seminar hall", "seminar", "seminar hall"]),
    ("lab_cs", ["computer lab", "cs lab", "coding lab", "lab with computers"]),
    ("lab_elec", ["electronics lab", "electrical lab", "elec lab"]),
    ("lab_phy", ["physics lab", "phy lab"]),
    ("lab_civil", ["civil lab", "concrete lab"]),
    ("workshop", ["workshop", "mech workshop", "machine shop"]),
    ("lecture_hall", ["lecture hall", "lecture theatre", "lt "]),
    ("classroom", ["classroom", "class room", "room"]),
]
CATEGORY_WORDS = [
    ("institute_event", ["institute event", "convocation", "inauguration", "closing ceremony",
                         "spectra main", "institute-level", "institute level"]),
    ("guest_lecture", ["guest lecture", "guest talk", "industry speaker", "founder talk",
                       "keynote", "expert talk", "seminar by"]),
    ("department_event", ["department event", "farewell", "alumni", "pre-placement",
                          "orientation", "department-level", "dept event"]),
    ("club_event", ["club", "society", "rehearsal", "competition", "quiz", "workshop for students"]),
]
GROUP_WORDS = {
    "Y1": ["first year", "1st year", "fy", "first-year"],
    "Y2": ["second year", "2nd year", "sy", "second-year"],
    "Y3": ["third year", "3rd year", "ty", "third-year"],
}
BRANCH_WORDS = {
    "CSE": ["cse", "computer science", "comp sci", "cs "],
    "ECE": ["ece", "electronics and communication", "electronics"],
    "EE": ["ee", "electrical"],
    "ME": ["me", "mechanical"],
    "CE": ["ce", "civil"],
}
HINDI_NUMBERS = {
    "ek": 1, "do": 2, "teen": 3, "tin": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5,
    "chhah": 6, "chah": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
    "bees": 20, "tees": 30, "pachas": 50, "sau": 100,
}
VAGUE_MARKERS = ["maybe", "around", "about", "approx", "approximately", "something like",
                 "kuch", "lagbhag", "kareeb", "someone", "any", "koi bhi", "anywhere"]


def _has(text: str, term: str) -> bool:
    """Substring match for phrases, word-boundary match for short tokens like "ac"."""
    term = term.strip()
    if not term:
        return False
    if len(term) <= 3 or " " not in term:
        return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None
    return term in text


def _norm(text: str) -> str:
    text = text.lower()
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _word_number(word: str) -> int | None:
    if word.isdigit():
        return int(word)
    return HINDI_NUMBERS.get(word)


def find_attendance(text: str) -> tuple[int | None, str | None]:
    patterns = [
        r"(\d{2,4})\s*(?:people|persons|students|log|logon|participants|attendees|pax|seats)",
        r"(?:for|about|around|approx\.?|approximately|nearly|lagbhag|kareeb)\s*(\d{2,4})",
        r"(\d{2,4})\s*(?:ki|ka)\s*(?:attendance|strength)",
        r"(\d{2,4})\s*(?:se|se zyada)",
    ]
    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            return int(m.group(1)), m.group(0)
    return None, None


def find_duration(text: str) -> tuple[int | None, str | None]:
    patterns = [
        r"(\d+)\s*(?:-|\s)?\s*(?:hour|hours|hr|hrs|ghante|ghanta|ghante ka)",
        r"(\d+)\s*(?:-|\s)?\s*(?:period|periods|slot|slots)",
        r"(?:ek|do|teen|char|paanch)\s*(?:ghante|ghanta)",
    ]
    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            if m.group(1).isdigit():
                return int(m.group(1)), m.group(0)
            value = _word_number(m.group(1))
            if value:
                return value, m.group(0)
    return None, None


def _to_24h(hour: int, meridiem: str | None, *, evening_bias: bool) -> int:
    meridiem = (meridiem or "").lower()
    if meridiem in {"pm", "p.m", "p.m.", "shaam", "sham", "evening", "raat", "night"}:
        return hour if hour == 12 else hour + 12
    if meridiem in {"am", "a.m", "a.m.", "subah", "morning"}:
        return 0 if hour == 12 else hour
    if evening_bias and 1 <= hour <= 9:
        return hour + 12
    if 1 <= hour <= 8:
        return hour + 12
    return hour


def clock_to_period(hour24: int, periods: list[dict]) -> int | None:
    """Map a wall-clock hour to the period that starts at it (or the next one)."""
    for p in periods:
        start = int(p["start"].split(":")[0])
        if start == hour24:
            return p["id"]
    for p in periods:
        start = int(p["start"].split(":")[0])
        if start >= hour24:
            return p["id"]
    return None


def find_time_window(text: str, periods: list[dict], default_evening: bool = False):
    """Return (start_period, end_period, evidence) or (None, None, None)."""
    # explicit period notation: "P3", "p 3", "period 3", "3rd period", "P6-P8"
    m = re.search(r"\bp\s?(\d{1,2})\s*(?:-|to|se|till|until)\s*p?\s?(\d{1,2})\b", text)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if 1 <= a <= 13 and a <= b <= 13:
            return a, b, m.group(0)
    m = re.search(r"(?:\bp\s?(\d{1,2})\b|period\s+(\d{1,2})\b|(\d{1,2})(?:st|nd|rd|th)?\s+period)", text)
    if m:
        period = int(next(g for g in m.groups() if g))
        if 1 <= period <= 13:
            return period, None, m.group(0)
    # "6 to 8 pm", "6-8pm", "6 se 8 baje", "6 baje se 8 baje tak"
    m = re.search(r"(\d{1,2})\s*(?:to|-|se|till|until)\s*(\d{1,2})\s*(am|pm|a\.m|p\.m)?", text)
    if m:
        h1, h2 = int(m.group(1)), int(m.group(2))
        mer = m.group(3)
        bias = default_evening or "pm" in text or "evening" in text or "shaam" in text
        start24 = _to_24h(h1, mer, evening_bias=bias)
        end24 = _to_24h(h2, mer, evening_bias=bias or True)
        if end24 <= start24:
            end24 = start24 + 1
        s = clock_to_period(start24, periods)
        e = clock_to_period(end24, periods)
        if s and e and e > s:
            return s, e - 1, m.group(0)
    # "6 baje", "at 10 am", "3 pm"
    m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m|p\.m|baje|bje)", text)
    if m:
        hour = int(m.group(1))
        mer = m.group(3)
        if mer in {"baje", "bje"}:
            mer = "pm" if (hour <= 9 and ("shaam" in text or "evening" in text or default_evening)) else None
        start24 = _to_24h(hour, mer, evening_bias=default_evening)
        s = clock_to_period(start24, periods)
        if s:
            return s, None, m.group(0)
    # vague parts of the day
    vague = [("after lunch", 6), ("lunch ke baad", 6), ("dopahar", 6), ("afternoon", 6),
             ("shaam", 10), ("evening", 10), ("night", 11), ("raat", 11),
             ("morning", 1), ("subah", 1), ("full day", 1)]
    for word, period in vague:
        if word in text:
            return period, None, word
    return None, None, None


def find_days(text: str, days: list[str], tomorrow: str | None = None,
              today: str | None = None) -> list[str]:
    """Every teaching day the text names, in the order it names them.

    "our club meets every Monday and Wednesday" is two windows, not one - getting this wrong
    silently books a club into a single day and loses the other meeting.
    """
    hits: list[tuple[int, str]] = []
    for canonical, words in WEEKDAY_WORDS.items():
        if canonical not in days:
            continue
        for word in words:
            for m in re.finditer(rf"\b{re.escape(word)}\b", text):
                hits.append((m.start(), canonical))
    resolved_tomorrow = tomorrow or (days[(days.index(today) + 1) % len(days)] if today in days
                                     else days[0])
    for canonical, words in RELATIVE_DAYS.items():
        for word in words:
            for m in re.finditer(rf"\b{re.escape(word)}\b", text):
                if canonical == "today":
                    hits.append((m.start(), today if today in days else days[0]))
                elif canonical == "tomorrow":
                    hits.append((m.start(), resolved_tomorrow))
                else:
                    base = today if today in days else days[0]
                    index = days.index(resolved_tomorrow)
                    hits.append((m.start(), days[(index + 1) % len(days)]))
    out: list[str] = []
    for _pos, day in sorted(hits):
        if day not in out:
            out.append(day)
    return out


def find_day(text: str, days: list[str], tomorrow: str | None = None):
    for canonical, words in WEEKDAY_WORDS.items():
        for word in words:
            if re.search(rf"\b{re.escape(word)}\b", text):
                if canonical in days:
                    return canonical, word
    for canonical, words in RELATIVE_DAYS.items():
        for word in words:
            if re.search(rf"\b{re.escape(word)}\b", text):
                if canonical == "today":
                    return days[0], word
                if canonical == "tomorrow" and tomorrow:
                    return tomorrow, word
                if canonical == "day after tomorrow" and tomorrow and len(days) > 2:
                    return days[(days.index(tomorrow) + 1) % len(days)], word
    return None, None


def find_needs(text: str) -> list[str]:
    found = []
    for need, words in NEED_WORDS.items():
        if any(_has(text, w) for w in words):
            found.append(need)
    return sorted(set(found))


def find_room_types(text: str) -> list[str]:
    found = []
    for room_type, words in ROOM_TYPE_WORDS:
        if any(_has(text, w) for w in words):
            found.append(room_type)
    # a generic "room" should not narrow the types if something specific was named
    if "classroom" in found and any(t != "classroom" for t in found):
        found = [t for t in found if t != "classroom"]
    if "computers" in find_needs(text) and "lab_cs" not in found:
        found = [t for t in found if not t.startswith("lab_")] + ["lab_cs"]
    return found


def find_category(text: str) -> str | None:
    for category, words in CATEGORY_WORDS:
        if any(_has(text, w) for w in words):
            return category
    return None


def find_groups(text: str, ds) -> list[str]:
    out = []
    year = None
    for y, words in GROUP_WORDS.items():
        if any(_has(text, w) for w in words):
            year = y
            break
    branch = None
    for b, words in BRANCH_WORDS.items():
        if any(_has(text, w) for w in words):
            branch = b
            break
    if year == "Y1":
        # Year 1 sections are A-D, only addressable by section letter
        m = re.search(r"\b(?:section|sec)\s*([a-d])\b", text)
        if m:
            out.append(f"Y1-{m.group(1).upper()}")
        elif _has(text, "all"):
            out.extend(g for g in ds.groups if g.startswith("Y1"))
    elif year in {"Y2", "Y3"} and branch:
        candidate = f"{branch}-{year[1]}"
        if candidate in ds.groups:
            out.append(candidate)
    if not out:
        for gid, group in ds.groups.items():
            name = (group.get("name") or "").lower()
            if name and _has(text, name):
                out.append(gid)
    return out


def find_room_mention(text: str, ds) -> str | None:
    for rid in ds.rooms:
        if re.search(rf"\b{re.escape(rid.lower())}\b", text):
            return rid
    for rid, room in ds.rooms.items():
        name = (room.get("name") or "").lower()
        if name and len(name) > 3 and name in text:
            return rid
    return None


def find_compulsory(text: str) -> bool:
    return any(w in text for w in ["compulsory", "mandatory", "zaroori", "sab attendance",
                                   "attendance mandatory", "must attend"])


def vague_fields(raw: str) -> list[str]:
    return [m for m in VAGUE_MARKERS if m in raw]
