/** Local, deterministic interpretation of a request typed in plain language.
 *
 * This is the *fallback* used when the scheduling API is not reachable. When it is reachable the
 * real `/api/ai/parse` endpoint is called instead and its draft, confidence and assumptions are
 * rendered untouched. This file never pretends to be the backend parser.
 */
import type { DayCode, Workspace } from "./types";
import { DAY_LONG } from "./format";

export interface LocalDraft {
  title: string | null;
  attendance: number | null;
  duration_periods: number | null;
  windows: { day: DayCode; from_period: number; to_period: number }[];
  needs: string[];
  room_types: string[];
  requested_room: string | null;
  requested_category: string | null;
  group_label: string | null;
  confidence: Record<string, number>;
  assumptions: { field: string; value: unknown; why: string }[];
  follow_up: string | null;
  source: string;
}

const FEATURE_WORDS: { words: string[]; feature: string; type?: string }[] = [
  { words: ["computer", "computers", "pc", "workstation", "coding", "software"], feature: "computers", type: "lab_cs" },
  { words: ["oscilloscope", "solder", "circuit", "electronics", "bench", "power"], feature: "power_benches", type: "lab_elec" },
  { words: ["projector", "slides", "presentation", "screen"], feature: "projector" },
  { words: ["sound", "pa", "speaker", "mic", "audio"], feature: "pa_system" },
  { words: ["stage", "performance", "dance", "drama"], feature: "stage" },
  { words: ["air conditioning", "air-conditioned", "ac ", " a/c"], feature: "ac" },
];

const TYPE_WORDS: { words: string[]; types: string[] }[] = [
  { words: ["computer lab", "computing lab", "coding lab"], types: ["lab_cs"] },
  { words: ["electronics lab", "electronics", "circuits"], types: ["lab_elec"] },
  { words: ["physics lab"], types: ["lab_phy"] },
  { words: ["civil lab"], types: ["lab_civil"] },
  { words: ["workshop", "makerspace", "fabrication"], types: ["workshop"] },
  { words: ["lab", "laboratory"], types: ["lab_cs", "lab_elec", "lab_phy", "lab_civil", "workshop"] },
  { words: ["seminar hall", "seminar"], types: ["seminar_hall"] },
  { words: ["auditorium", "main hall", "oat", "open air"], types: ["auditorium", "outdoor"] },
  { words: ["lecture hall", "lecture theatre"], types: ["lecture_hall"] },
  { words: ["classroom", "class room", "room"], types: ["classroom", "lecture_hall"] },
];

const CATEGORY_WORDS: { words: string[]; category: string }[] = [
  { words: ["inauguration", "institute", "convocation", "fest", "spectra"], category: "institute_event" },
  { words: ["guest lecture", "guest talk", "seminar by"], category: "guest_lecture" },
  { words: ["department", "dept", "workshop for"], category: "department_event" },
  { words: ["club", "society", "chapter", "team"], category: "club_event" },
];

function toPeriods(ws: Workspace, hour: number, minute = 0): number | null {
  const match = ws.calendar.periods.find((p) => {
    const [h, m] = p.start.split(":").map(Number);
    return h === hour && m === minute;
  });
  return match ? match.id : null;
}

function toEndPeriod(ws: Workspace, hour: number, minute = 0): number | null {
  const match = ws.calendar.periods.find((p) => {
    const [h, m] = p.end.split(":").map(Number);
    return h === hour && m === minute;
  });
  return match ? match.id : null;
}

export function localParse(text: string, ws: Workspace): LocalDraft {
  const lower = ` ${text.toLowerCase()} `;
  const assumptions: LocalDraft["assumptions"] = [];
  const confidence: Record<string, number> = {};

  const capacityMatch =
    lower.match(/(\d{2,4})\s*(?:people|persons|students|attendees|seats|pax)/) ??
    lower.match(/(?:capacity|seats?|for)\s*(?:of\s*)?(\d{2,4})/);
  const attendance = capacityMatch ? Number(capacityMatch[1]) : null;
  confidence.attendance = attendance ? 0.92 : 0.2;

  const dayWords = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  let day: DayCode | null = null;
  for (const word of dayWords) {
    if (lower.includes(word)) {
      day = word.slice(0, 3).toUpperCase() as DayCode;
      break;
    }
  }
  if (!day && lower.includes("tomorrow")) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    const code = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][next.getDay()];
    day = (ws.calendar.days.includes(code as DayCode) ? code : ws.calendar.days[0]) as DayCode;
    assumptions.push({ field: "day", value: day, why: `"tomorrow" resolves to ${DAY_LONG[day]}` });
  }
  if (!day) {
    day = ws.calendar.days[1] ?? ws.calendar.days[0];
    assumptions.push({ field: "day", value: day, why: "No day named — used the next teaching day" });
  }
  confidence.day = dayWords.some((w) => lower.includes(w)) ? 0.95 : 0.4;

  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|until|till|–|-|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  let fromPeriod: number | null = null;
  let toPeriod: number | null = null;
  if (timeMatch) {
    const startHourRaw = Number(timeMatch[1]);
    const startMeridiem = timeMatch[3];
    const endHourRaw = Number(timeMatch[4]);
    const endMeridiem = timeMatch[6];
    const startHour = startMeridiem === "pm" && startHourRaw < 12 ? startHourRaw + 12 : startHourRaw;
    const endHour = (endMeridiem ?? startMeridiem) === "pm" && endHourRaw < 12 ? endHourRaw + 12 : endHourRaw;
    fromPeriod = toPeriods(ws, startHour, Number(timeMatch[2] ?? 0));
    toPeriod = toEndPeriod(ws, endHour, Number(timeMatch[5] ?? 0));
    confidence.window = fromPeriod && toPeriod ? 0.9 : 0.45;
  }
  if (!fromPeriod || !toPeriod) {
    fromPeriod = 2;
    toPeriod = 4;
    assumptions.push({
      field: "windows",
      value: "P2–P4",
      why: "No time range recognised — assumed the mid-morning window",
    });
    confidence.window = 0.35;
  }
  const duration = Math.max(1, (toPeriod as number) - (fromPeriod as number) + 1);

  const needs: string[] = [];
  const typeSet = new Set<string>();
  for (const entry of FEATURE_WORDS) {
    if (entry.words.some((word) => lower.includes(word))) {
      needs.push(entry.feature);
      if (entry.type) typeSet.add(entry.type);
    }
  }
  for (const entry of TYPE_WORDS) {
    if (entry.words.some((word) => lower.includes(word))) {
      entry.types.forEach((t) => typeSet.add(t));
      break;
    }
  }
  if (!typeSet.size) {
    typeSet.add("classroom");
    typeSet.add("lecture_hall");
    assumptions.push({ field: "room_types", value: "classroom / lecture hall", why: "No venue type named" });
  }
  confidence.needs = needs.length ? 0.85 : 0.3;

  let category = "club_event";
  for (const entry of CATEGORY_WORDS) {
    if (entry.words.some((word) => lower.includes(word))) {
      category = entry.category;
      break;
    }
  }

  const groupMatch = text.match(/\bfor (?:the )?([A-Z][\w&\s]{2,40}?(?:club|society|team|chapter|group|association|department))\b/i);
  const groupLabel = groupMatch ? groupMatch[1].trim() : null;

  const titleSource = text.split(/[.?!]/)[0]?.trim() ?? text;
  const title = titleSource.length > 2 ? titleSource.slice(0, 72) : null;

  return {
    title,
    attendance,
    duration_periods: duration,
    windows: [{ day, from_period: fromPeriod, to_period: toPeriod }],
    needs: [...new Set(needs)],
    room_types: [...typeSet],
    requested_room: null,
    requested_category: category,
    group_label: groupLabel,
    confidence,
    assumptions,
    follow_up: attendance ? null : "How many people should the room seat?",
    source: "local heuristic (frontend fallback)",
  };
}
