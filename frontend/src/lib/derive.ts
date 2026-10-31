/** Everything the interface computes from the workspace.
 *
 * IMPORTANT BOUNDARY: these functions power *interface behaviour* — previews, filters,
 * availability strips, drag-and-drop feedback. They are deliberately labelled in the UI as
 * a local rule check. When the API is reachable, the authoritative verdict for a proposed
 * move always comes from the backend (`/api/disruption/move`); the local result is only the
 * instant preview that makes dragging feel alive.
 */
import type {
  Booking,
  DayCode,
  Faculty,
  Room,
  SessionEntry,
  StudentGroup,
  Workspace,
} from "./types";
import { DAY_ORDER } from "./format";

export type Tone = "lime" | "violet" | "sky" | "sage" | "coral" | "sand";

export const DEPT_TONE: Record<string, Tone> = {
  CSE: "sky",
  ECE: "violet",
  EE: "sage",
  ME: "sand",
  CE: "sand",
  MA: "lime",
  PH: "coral",
  COMMON: "lime",
};

export function toneForDepartment(department: string | undefined): Tone {
  if (!department) return "sky";
  return DEPT_TONE[department] ?? "sky";
}

export function roomById(ws: Workspace): Map<string, Room> {
  return new Map(ws.rooms.map((r) => [r.id, r]));
}

export function facultyById(ws: Workspace): Map<string, Faculty> {
  return new Map(ws.faculty.map((f) => [f.id, f]));
}

export function groupById(ws: Workspace): Map<string, StudentGroup> {
  return new Map(ws.groups.map((g) => [g.id, g]));
}

export function sessionById(ws: Workspace): Map<string, SessionEntry> {
  return new Map(ws.sessions.map((s) => [s.id, s]));
}

export function periodsFor(ws: Workspace, mode: "day" | "all" = "day") {
  return ws.calendar.periods.filter((p) => (mode === "all" ? true : p.teaching || p.id <= 13));
}

export function sessionsOn(ws: Workspace, day: DayCode): SessionEntry[] {
  return ws.sessions.filter((s) => s.day === day);
}

export function groupsFor(ws: Workspace, session: SessionEntry): StudentGroup[] {
  const byId = groupById(ws);
  return session.groupIds.map((id) => byId.get(id)).filter(Boolean) as StudentGroup[];
}

/* ------------------------------------------------------------------ occupancy */

export type CellState = "free" | "class" | "booking" | "blocked" | "event-only" | "closed";

export interface Occupancy {
  state: CellState;
  label: string;
  detail: string;
}

const CLOSED: Occupancy = {
  state: "closed",
  label: "No teaching",
  detail: "Teaching week runs Monday to Friday",
};

function bookingCell(ws: Workspace, roomId: string, day: DayCode, period: number): Occupancy | null {
  for (const b of ws.bookings.bookings) {
    const d = b.decision;
    if (!d || d.status === "rejected" || !d.day || d.room_id !== roomId) continue;
    if (d.day !== day || d.start_period == null || d.end_period == null) continue;
    if (period >= d.start_period && period <= d.end_period) {
      return {
        state: "booking",
        label: b.title,
        detail: `${b.requester} · ${b.effective_category.replace(/_/g, " ")} · ${d.status.replace(/_/g, " ")}`,
      };
    }
  }
  return null;
}

export function roomOccupancy(ws: Workspace, room: Room, day: DayCode, period: number): Occupancy {
  if (!ws.calendar.days.includes(day)) return CLOSED;

  const slot = room.availability.find((a) => a.day === day && a.period === period);
  const maintenance = ws.unavailability.find(
    (u) => u.room_id === room.id && u.day === day && u.periods.includes(period),
  );
  if (maintenance) {
    return { state: "blocked", label: "Unavailable", detail: maintenance.reason };
  }
  if (slot?.blocked_reason) {
    return { state: "blocked", label: "Unavailable", detail: slot.blocked_reason };
  }

  // Prefer the published busy list when we have it; otherwise read the timetable we already
  // hold (live mode derives occupancy that way instead of spending 27 round-trips).
  const busy =
    room.busy.find((b) => b.day === day && period >= b.start_period && period <= b.end_period) ??
    (room.busy.length
      ? undefined
      : (() => {
          const session = ws.sessions.find(
            (s) => s.roomId === room.id && s.day === day && period >= s.startPeriod && period <= s.endPeriod,
          );
          return session
            ? {
                day: session.day,
                start_period: session.startPeriod,
                end_period: session.endPeriod,
                session_id: session.id,
                source: "session" as const,
              }
            : undefined;
        })());
  if (busy) {
    if (busy.source === "booking") {
      const booking = ws.bookings.bookings.find((b) => b.request_id === busy.session_id);
      return {
        state: "booking",
        label: booking?.title ?? busy.session_id,
        detail: booking ? `${booking.requester} · ${booking.effective_category.replace(/_/g, " ")}` : "Venue booking",
      };
    }
    const session = ws.sessions.find((s) => s.id === busy.session_id);
    if (session) {
      return {
        state: "class",
        label: session.courseTitle,
        detail: `${session.courseId} · ${session.facultyName} · ${session.groupNames.join(", ")}`,
      };
    }
    return { state: "class", label: busy.session_id, detail: "Scheduled session" };
  }

  const booking = bookingCell(ws, room.id, day, period);
  if (booking) return booking;

  if (ws.calendar.eventOnlyPeriods.includes(period)) {
    return {
      state: "event-only",
      label: "Event window",
      detail: "Evenings are reserved for institute events, not classes",
    };
  }

  if (slot && !slot.free) {
    return { state: "blocked", label: "Unavailable", detail: slot.blocked_reason ?? "Not bookable" };
  }

  return {
    state: "free",
    label: "Available",
    detail: `${room.name} is free at ${periodTime(ws, period)?.start ?? ""}`,
  };
}

export function periodTime(ws: Workspace, id: number) {
  return ws.calendar.periods.find((p) => p.id === id);
}

export function periodSpan(ws: Workspace, start: number, end: number): string {
  const from = periodTime(ws, start);
  const to = periodTime(ws, end);
  if (!from || !to) return "";
  return `${from.start} – ${to.end}`;
}

export type StripState = "class" | "free" | "unavailable" | "preference" | "closed";

export function facultyStrip(ws: Workspace, facultyId: string): Map<string, StripState> {
  const faculty = facultyById(ws).get(facultyId);
  const out = new Map<string, StripState>();
  for (const day of DAY_ORDER) {
    for (let p = 1; p <= ws.calendar.periods.length; p += 1) {
      const key = `${day}-${p}`;
      if (!ws.calendar.days.includes(day)) {
        out.set(key, "closed");
        continue;
      }
      const un = faculty?.unavailable.find((u) => u.day === day && u.periods.includes(p));
      if (un) {
        out.set(key, "unavailable");
        continue;
      }
      const cls = ws.sessions.some(
        (s) => s.facultyId === facultyId && s.day === day && p >= s.startPeriod && p <= s.endPeriod,
      );
      if (cls) {
        out.set(key, "class");
        continue;
      }
      const pref = faculty?.preferences.some(
        (pref) => pref.days.includes(day) && pref.periods.includes(p) && pref.type === "avoid",
      );
      out.set(key, pref ? "preference" : "free");
    }
  }
  return out;
}

export function groupStrip(ws: Workspace, groupId: string): Map<string, StripState> {
  const out = new Map<string, StripState>();
  for (const day of DAY_ORDER) {
    for (let p = 1; p <= ws.calendar.periods.length; p += 1) {
      const key = `${day}-${p}`;
      if (!ws.calendar.days.includes(day)) {
        out.set(key, "closed");
        continue;
      }
      const busy = ws.sessions.some(
        (s) => s.groupIds.includes(groupId) && s.day === day && p >= s.startPeriod && p <= s.endPeriod,
      );
      out.set(key, busy ? "class" : "free");
    }
  }
  return out;
}

export interface FacultySummary {
  hours: number;
  days: number;
  freePeriods: number;
  utilisation: number;
  next?: SessionEntry;
  classes: SessionEntry[];
}

export function facultySummary(ws: Workspace, facultyId: string): FacultySummary {
  const classes = ws.sessions.filter((s) => s.facultyId === facultyId);
  const hours = classes.reduce((sum, s) => sum + (s.endPeriod - s.startPeriod + 1), 0);
  const days = new Set(classes.map((s) => s.day)).size;
  const capacity = ws.calendar.days.length * ws.calendar.periods.filter((p) => p.teaching).length;
  const freePeriods = Math.max(0, capacity - hours);
  return {
    hours,
    days,
    freePeriods,
    utilisation: capacity ? Math.min(1, hours / capacity) : 0,
    next: classes[0],
    classes,
  };
}

export function groupSummary(ws: Workspace, groupId: string) {
  const classes = ws.sessions.filter((s) => s.groupIds.includes(groupId));
  const hours = classes.reduce((sum, s) => sum + (s.endPeriod - s.startPeriod + 1), 0);
  return { classes, hours };
}

export function roomSummary(ws: Workspace, roomId: string) {
  const classes = ws.sessions.filter((s) => s.roomId === roomId);
  const hours = classes.reduce((sum, s) => sum + (s.endPeriod - s.startPeriod + 1), 0);
  const bookings = ws.bookings.bookings.filter(
    (b) => b.decision?.room_id === roomId && b.decision.status !== "rejected",
  );
  return { classes, hours, bookings };
}

/* ------------------------------------------------------------------ moves */

export type CheckStatus = "pass" | "warn" | "fail";

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface MoveTarget {
  day: DayCode;
  startPeriod: number;
  roomId?: string;
}

export interface MoveImpact {
  sessionsModified: number;
  peopleAffected: number;
  studentsAffected: number;
  resourcesAffected: number;
  conflictsIntroduced: number;
  conflictsResolved: number;
  facultyPreserved: boolean;
  resourcePreserved: boolean;
  remaining: string[];
}

export interface MoveValidation {
  state: "valid" | "warning" | "invalid";
  checks: Check[];
  impact: MoveImpact;
  from: { day: DayCode; startPeriod: number; endPeriod: number; roomId: string; roomName: string };
  to: { day: DayCode; startPeriod: number; endPeriod: number; roomId: string; roomName: string };
  session: SessionEntry;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

const LECTURE_ROOM_TYPES = ["classroom", "lecture_hall", "auditorium", "seminar_hall"];
const LAB_ROOM_TYPES = ["lab_cs", "lab_elec", "lab_phy", "lab_civil", "workshop"];

export function roomFitsKind(room: Room, session: SessionEntry): boolean {
  if (session.kind === "lab") return LAB_ROOM_TYPES.includes(room.type);
  return LECTURE_ROOM_TYPES.includes(room.type) || session.kind === "event";
}

export function needsAccessible(ws: Workspace, session: SessionEntry): boolean {
  const faculty = facultyById(ws).get(session.facultyId);
  const groups = groupsFor(ws, session);
  return Boolean(faculty?.needsAccessible) || groups.some((g) => g.needsAccessible);
}

export function validateMove(ws: Workspace, sessionId: string, target: MoveTarget): MoveValidation {
  const session = sessionById(ws).get(sessionId);
  if (!session) throw new Error(`unknown session ${sessionId}`);
  const roomId = target.roomId ?? session.roomId;
  const room = roomById(ws).get(roomId) ?? ws.rooms[0];
  const duration = session.endPeriod - session.startPeriod + 1;
  const startPeriod = target.startPeriod;
  const endPeriod = startPeriod + duration - 1;
  const day = target.day;
  const checks: Check[] = [];

  const clash = ws.sessions.find(
    (s) =>
      s.id !== session.id &&
      s.day === day &&
      s.roomId === roomId &&
      overlaps(startPeriod, endPeriod, s.startPeriod, s.endPeriod),
  );
  checks.push({
    id: "room",
    label: "Venue free",
    status: clash ? "fail" : "pass",
    detail: clash
      ? `${room.name} is occupied by ${clash.courseId} · ${clash.groupNames.join(", ")}`
      : `${room.name} is free for the whole block`,
  });

  checks.push({
    id: "capacity",
    label: "Room capacity",
    status: room.capacity < session.size ? "fail" : room.capacity - session.size < 5 ? "warn" : "pass",
    detail:
      room.capacity < session.size
        ? `Seats ${room.capacity}, needs ${session.size}`
        : `Seats ${room.capacity} for ${session.size} students${
            room.capacity - session.size < 5 ? " — at capacity" : ""
          }`,
  });

  checks.push({
    id: "type",
    label: "Venue suitability",
    status: roomFitsKind(room, session) ? "pass" : "fail",
    detail: roomFitsKind(room, session)
      ? `${room.type.replace(/_/g, " ")} is valid for a ${session.kind}`
      : `A ${session.kind} cannot be held in a ${room.type.replace(/_/g, " ")}`,
  });

  const accessible = needsAccessible(ws, session);
  checks.push({
    id: "access",
    label: "Accessibility",
    status: !accessible || room.accessible ? "pass" : "fail",
    detail: accessible
      ? room.accessible
        ? "Step-free access confirmed"
        : `${room.building} has no step-free access`
      : "No accessibility requirement on this session",
  });

  const windowIssue = ws.calendar.eventOnlyPeriods.includes(startPeriod) ||
    ws.calendar.eventOnlyPeriods.some((p) => p >= startPeriod && p <= endPeriod);
  checks.push({
    id: "window",
    label: "Teaching window",
    status: windowIssue ? "fail" : "pass",
    detail: windowIssue
      ? "Evening periods are reserved for institute events"
      : `${periodSpan(ws, startPeriod, endPeriod)} sits inside teaching hours`,
  });

  const faculty = facultyById(ws).get(session.facultyId);
  const unavailable = faculty?.unavailable.find((u) => u.day === day && u.periods.some((p) => p >= startPeriod && p <= endPeriod));
  checks.push({
    id: "faculty-window",
    label: "Faculty availability",
    status: unavailable ? "fail" : "pass",
    detail: unavailable
      ? `${session.facultyName} is unavailable (${unavailable.reason})`
      : `${session.facultyName} has no declared block at this time`,
  });

  const facultyClash = ws.sessions.find(
    (s) =>
      s.id !== session.id &&
      s.facultyId === session.facultyId &&
      s.day === day &&
      overlaps(startPeriod, endPeriod, s.startPeriod, s.endPeriod),
  );
  checks.push({
    id: "faculty-clash",
    label: "No faculty clash",
    status: facultyClash ? "fail" : "pass",
    detail: facultyClash
      ? `Already teaching ${facultyClash.courseId} in ${facultyClash.roomName}`
      : "Faculty timetable is clear at this time",
  });

  const groupClash = ws.sessions.find(
    (s) =>
      s.id !== session.id &&
      s.day === day &&
      s.groupIds.some((g) => session.groupIds.includes(g)) &&
      overlaps(startPeriod, endPeriod, s.startPeriod, s.endPeriod),
  );
  checks.push({
    id: "group-clash",
    label: "Student groups free",
    status: groupClash ? "fail" : "pass",
    detail: groupClash
      ? `${session.groupNames.join(", ")} already have ${groupClash.courseId}`
      : `${session.groupNames.join(", ")} have no overlapping class`,
  });

  const maintenance = ws.unavailability.find(
    (u) => u.room_id === roomId && u.day === day && u.periods.some((p) => p >= startPeriod && p <= endPeriod),
  );
  if (maintenance) {
    checks.push({
      id: "maintenance",
      label: "No maintenance window",
      status: "fail",
      detail: maintenance.reason,
    });
  }

  const hoursThatDay = ws.sessions
    .filter((s) => s.facultyId === session.facultyId && s.day === day && s.id !== session.id)
    .reduce((sum, s) => sum + (s.endPeriod - s.startPeriod + 1), 0);
  if (faculty) {
    checks.push({
      id: "load",
      label: "Faculty daily load",
      status: hoursThatDay + duration > faculty.maxHoursPerDay ? "warn" : "pass",
      detail:
        hoursThatDay + duration > faculty.maxHoursPerDay
          ? `${hoursThatDay + duration} h would exceed the ${faculty.maxHoursPerDay} h daily cap`
          : `${hoursThatDay + duration} of ${faculty.maxHoursPerDay} h used that day`,
    });
  }

  const bookingClash = ws.bookings.bookings.find((b) => {
    const d = b.decision;
    return (
      d && d.status !== "rejected" && d.room_id === roomId && d.day === day &&
      d.start_period != null && d.end_period != null &&
      overlaps(startPeriod, endPeriod, d.start_period, d.end_period)
    );
  });

  if (bookingClash) {
    checks.push({
      id: "booking-clash",
      label: "No venue booking",
      status: "fail",
      detail: `${bookingClash.title} is booked in ${room.name} at that time`,
    });
  }

  const finalFails = checks.filter((c) => c.status === "fail");
  const facultyPreserved = !["faculty-window", "faculty-clash"].some((id) =>
    finalFails.some((c) => c.id === id),
  );
  const resourcePreserved = !["room", "type", "capacity", "maintenance", "booking-clash"].some((id) =>
    finalFails.some((c) => c.id === id),
  );

  const groups = groupsFor(ws, session);
  const students = groups.reduce((sum, g) => sum + (g.size ?? 0), 0);
  const resources = new Set<string>([session.roomId, roomId]);
  const people = new Set<string>([session.facultyId]);
  groups.forEach((g) => people.add(g.id));

  const alreadyBlocked = detectPlacementIssues(ws, session);
  const unresolvedHere = finalFails.map((c) => c.detail);

  return {
    state: finalFails.length
      ? "invalid"
      : checks.some((c) => c.status === "warn")
        ? "warning"
        : "valid",
    checks,
    impact: {
      sessionsModified: 1,
      peopleAffected: people.size,
      studentsAffected: students,
      resourcesAffected: resources.size,
      conflictsIntroduced: finalFails.length,
      conflictsResolved: alreadyBlocked.filter((issue) => !unresolvedHere.includes(issue)).length,
      facultyPreserved,
      resourcePreserved,
      remaining: unresolvedHere,
    },
    from: {
      day: session.day,
      startPeriod: session.startPeriod,
      endPeriod: session.endPeriod,
      roomId: session.roomId,
      roomName: session.roomName,
    },
    to: { day, startPeriod, endPeriod, roomId, roomName: room.name },
    session,
  };
}

/** Soft check of the current placement — only used to report "resolved" conflicts. */
export function detectPlacementIssues(ws: Workspace, session: SessionEntry): string[] {
  const issues: string[] = [];
  const faculty = facultyById(ws).get(session.facultyId);
  const un = faculty?.unavailable.find(
    (u) => u.day === session.day && u.periods.some((p) => p >= session.startPeriod && p <= session.endPeriod),
  );
  if (un) issues.push(`${session.facultyName} is unavailable (${un.reason})`);
  const room = roomById(ws).get(session.roomId);
  if (room && room.capacity < session.size) {
    issues.push(`Seats ${room.capacity}, needs ${session.size}`);
  }
  const maintenance = ws.unavailability.find(
    (u) =>
      u.room_id === session.roomId && u.day === session.day &&
      u.periods.some((p) => p >= session.startPeriod && p <= session.endPeriod),
  );
  if (maintenance) issues.push(maintenance.reason);
  return issues;
}

export interface Suggestion {
  target: MoveTarget;
  state: "valid" | "warning";
  warnings: string[];
}

export function suggestSlots(ws: Workspace, sessionId: string, limit = 4): Suggestion[] {
  const session = sessionById(ws).get(sessionId);
  if (!session) return [];
  const sameRoom = roomById(ws).get(session.roomId);
  const candidateRooms = ws.rooms.filter(
    (r) => roomFitsKind(r, session) && r.capacity >= session.size && (!needsAccessible(ws, session) || r.accessible),
  );
  const rooms = [sameRoom, ...candidateRooms].filter(Boolean) as Room[];
  const seen = new Set<string>();
  const out: Suggestion[] = [];

  for (const day of ws.calendar.days) {
    for (const slot of ws.calendar.periods.filter((p) => p.teaching)) {
      const startPeriod = slot.id;
      if (session.day === day && session.startPeriod === startPeriod) continue;
      for (const room of rooms.slice(0, 8)) {
        const key = `${day}-${startPeriod}-${room.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const result = validateMove(ws, sessionId, { day, startPeriod, roomId: room.id });
          if (result.state === "invalid") continue;
          out.push({
            target: { day, startPeriod, roomId: room.id },
            state: result.state,
            warnings: result.checks.filter((c) => c.status !== "pass").map((c) => c.detail),
          });
        } catch {
          continue;
        }
        if (out.length >= limit * 6) break;
      }
    }
  }

  return out
    .sort((a, b) => {
      const sameDayA = a.target.day === session.day ? 0 : 1;
      const sameDayB = b.target.day === session.day ? 0 : 1;
      if (sameDayA !== sameDayB) return sameDayA - sameDayB;
      const roomA = a.target.roomId === session.roomId ? 0 : 1;
      const roomB = b.target.roomId === session.roomId ? 0 : 1;
      if (roomA !== roomB) return roomA - roomB;
      return Math.abs(a.target.startPeriod - session.startPeriod) - Math.abs(b.target.startPeriod - session.startPeriod);
    })
    .slice(0, limit);
}

/* ------------------------------------------------------------------ people */

export interface FacultyCandidate {
  faculty: Faculty;
  compatible: boolean;
  score: number;
  reasons: { ok: boolean; text: string }[];
  hours: number;
}

export function replacementCandidates(ws: Workspace, sessionId: string): FacultyCandidate[] {
  const session = sessionById(ws).get(sessionId);
  if (!session) return [];
  const course = ws.courses.find((c) => c.id === session.courseId);
  const out: FacultyCandidate[] = [];

  for (const faculty of ws.faculty) {
    if (faculty.id === session.facultyId) continue;
    const summary = facultySummary(ws, faculty.id);
    const busy = ws.sessions.find(
      (s) =>
        s.facultyId === faculty.id && s.day === session.day &&
        s.startPeriod <= session.endPeriod && session.startPeriod <= s.endPeriod,
    );
    const blocked = faculty.unavailable.find(
      (u) => u.day === session.day && u.periods.some((p) => p >= session.startPeriod && p <= session.endPeriod),
    );
    const sameDept = faculty.department === (course?.department ?? session.department);
    const teachesSameYear = summary.classes.some((s) => s.year === session.year);
    const loadOk = summary.hours + (session.endPeriod - session.startPeriod + 1) <= faculty.maxHoursPerDay * 5;

    const reasons = [
      {
        ok: !busy,
        text: busy ? `Teaching ${busy.courseId} at the same time` : "Free at this time",
      },
      {
        ok: !blocked,
        text: blocked ? `Declared unavailable (${blocked.reason})` : "No declared unavailability",
      },
      {
        ok: sameDept,
        text: sameDept ? `Same department (${faculty.department})` : `Different department (${faculty.department})`,
      },
      {
        ok: teachesSameYear,
        text: teachesSameYear ? "Already teaches this cohort" : "No existing class with this cohort",
      },
      {
        ok: loadOk,
        text: loadOk ? `${summary.hours} h this week — within workload` : `${summary.hours} h this week — heavy load`,
      },
    ];
    const score = reasons.reduce((sum, r, i) => sum + (r.ok ? [4, 4, 3, 2, 1][i] ?? 0 : 0), 0);
    const compatible = !busy && !blocked && loadOk;
    out.push({ faculty, compatible, score, reasons, hours: summary.hours });
  }

  return out.sort((a, b) => b.score - a.score || a.hours - b.hours);
}

/* ------------------------------------------------------------------ rooms */

export interface RoomRequirement {
  minCapacity?: number;
  features?: string[];
  types?: string[];
  accessible?: boolean;
  day?: DayCode;
  fromPeriod?: number;
  toPeriod?: number;
  uses?: string[];
}

export interface RoomMatch {
  room: Room;
  fit: boolean;
  why: { ok: boolean; text: string }[];
  freeInWindow: boolean;
}

export function matchRoom(ws: Workspace, room: Room, req: RoomRequirement): RoomMatch {
  const why: { ok: boolean; text: string }[] = [];
  let fit = true;

  if (req.minCapacity) {
    const ok = room.capacity >= req.minCapacity;
    fit = fit && ok;
    why.push({ ok, text: `Seats ${room.capacity}${ok ? "" : ` — below ${req.minCapacity}`}` });
  }
  for (const feature of req.features ?? []) {
    const ok = room.features.includes(feature);
    fit = fit && ok;
    why.push({ ok, text: ok ? `Has ${feature.replace(/_/g, " ")}` : `No ${feature.replace(/_/g, " ")}` });
  }
  if (req.types?.length) {
    const ok = req.types.includes(room.type);
    fit = fit && ok;
    why.push({ ok, text: ok ? `${room.type.replace(/_/g, " ")} requested` : `Wrong venue type` });
  }
  if (req.accessible) {
    const ok = room.accessible;
    fit = fit && ok;
    why.push({ ok, text: ok ? "Step-free access" : "No step-free access" });
  }
  if (req.uses?.length) {
    const ok = req.uses.some((u) => room.allowedUses.includes(u));
    fit = fit && ok;
    why.push({ ok, text: ok ? "Allows this use" : "Not licensed for this use" });
  }

  let freeInWindow = true;
  if (req.day && req.fromPeriod != null && req.toPeriod != null) {
    for (let p = req.fromPeriod; p <= req.toPeriod; p += 1) {
      if (roomOccupancy(ws, room, req.day, p).state !== "free") {
        freeInWindow = false;
        break;
      }
    }
    why.push({
      ok: freeInWindow,
      text: freeInWindow ? "Free in the requested window" : "Busy inside the requested window",
    });
  }

  return { room, fit, why, freeInWindow };
}

export function matchRooms(ws: Workspace, req: RoomRequirement): RoomMatch[] {
  return ws.rooms
    .map((room) => matchRoom(ws, room, req))
    .sort((a, b) => Number(b.fit) - Number(a.fit) || Number(b.freeInWindow) - Number(a.freeInWindow) || b.room.capacity - a.room.capacity);
}

export function availabilityWindow(ws: Workspace, room: Room): { free: number; total: number; ratio: number } {
  const days = ws.calendar.days;
  const periods = ws.calendar.periods.filter((p) => !ws.calendar.eventOnlyPeriods.includes(p.id));
  const total = days.length * periods.length;
  let free = 0;
  for (const day of days) {
    for (const p of periods) {
      if (roomOccupancy(ws, room, day, p.id).state === "free") free += 1;
    }
  }
  return { free, total, ratio: total ? free / total : 0 };
}

/* ------------------------------------------------------------------ board items */

export interface BoardItem {
  key: string;
  courseId?: string;
  kind: "session" | "booking" | "exam";
  title: string;
  subtitle: string;
  day: DayCode;
  startPeriod: number;
  endPeriod: number;
  roomId: string;
  roomName: string;
  facultyId?: string;
  facultyName?: string;
  groupIds: string[];
  groupNames: string[];
  tone: Tone;
  sessionId?: string;
  bookingId?: string;
  status?: string;
  department?: string;
  size?: number;
}

export function bookingToBoardItem(ws: Workspace, booking: Booking): BoardItem | null {
  const d = booking.decision;
  if (!d || !d.day || d.room_id == null || d.start_period == null || d.end_period == null) return null;
  if (d.status === "rejected") return null;
  const room = roomById(ws).get(d.room_id);
  return {
    key: `booking-${booking.request_id}`,
    courseId: booking.request_id,
    kind: "booking",
    title: booking.title,
    subtitle: booking.requester,
    day: d.day,
    startPeriod: d.start_period,
    endPeriod: d.end_period,
    roomId: d.room_id,
    roomName: room?.name ?? d.room_id,
    groupIds: booking.mandatory_for_groups ?? [],
    groupNames: (booking.mandatory_for_groups ?? []).map((g) => groupById(ws).get(g)?.name ?? g),
    tone: d.status === "alternative_offered" ? "sand" : "lime",
    bookingId: booking.request_id,
    status: d.status,
    size: booking.attendance,
    department: booking.effective_category,
  };
}

export function boardItems(ws: Workspace, day: DayCode): BoardItem[] {
  const sessions: BoardItem[] = ws.sessions
    .filter((s) => s.day === day)
    .map((s) => ({
      key: s.id,
      courseId: s.courseId,
      kind: "session" as const,
      title: s.courseTitle,
      subtitle: `${s.courseId} · ${s.facultyName}`,
      day: s.day,
      startPeriod: s.startPeriod,
      endPeriod: s.endPeriod,
      roomId: s.roomId,
      roomName: s.roomName,
      facultyId: s.facultyId,
      facultyName: s.facultyName,
      groupIds: s.groupIds,
      groupNames: s.groupNames,
      tone: toneForDepartment(s.department),
      sessionId: s.id,
      department: s.department,
      size: s.size,
    }));

  const bookings = ws.bookings.bookings
    .map((b) => bookingToBoardItem(ws, b))
    .filter((b): b is BoardItem => b !== null && b.day === day);

  return [...sessions, ...bookings].sort((a, b) => a.startPeriod - b.startPeriod);
}

/** Split overlapping items into side-by-side lanes (equal width), like a calendar app. */
export function packItems(items: BoardItem[]): { item: BoardItem; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod);
  const out: { item: BoardItem; lane: number; lanes: number }[] = [];
  let cluster: BoardItem[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const lanes: BoardItem[][] = [];
    for (const item of cluster) {
      let placed = false;
      for (const lane of lanes) {
        if (lane.every((other) => item.startPeriod > other.endPeriod || item.endPeriod < other.startPeriod)) {
          lane.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([item]);
    }
    lanes.forEach((lane, index) => {
      lane.forEach((item) => out.push({ item, lane: index, lanes: lanes.length }));
    });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    if (item.startPeriod > clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endPeriod);
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ institutions */

export interface DepartmentStat {
  code: string;
  faculty: number;
  groups: number;
  courses: number;
  sessions: number;
  hours: number;
  rooms: string[];
  tone: Tone;
}

export function departmentStats(ws: Workspace): DepartmentStat[] {
  const codes = new Set<string>();
  ws.courses.forEach((c) => codes.add(c.department));
  ws.faculty.forEach((f) => codes.add(f.department));
  ws.groups.forEach((g) => g.department && codes.add(g.department));
  codes.delete("COMMON");

  return [...codes].sort().map((code) => {
    const courses = ws.courses.filter((c) => c.department === code);
    const courseIds = new Set(courses.map((c) => c.id));
    const sessions = ws.sessions.filter((s) => courseIds.has(s.courseId));
    const rooms = [...new Set(sessions.map((s) => s.roomId))];
    return {
      code,
      faculty: ws.faculty.filter((f) => f.department === code).length,
      groups: ws.groups.filter((g) => g.department === code).length,
      courses: courses.length,
      sessions: sessions.length,
      hours: sessions.reduce((sum, s) => sum + (s.endPeriod - s.startPeriod + 1), 0),
      rooms,
      tone: toneForDepartment(code),
    };
  });
}

export interface BuildingStat {
  name: string;
  rooms: Room[];
  capacity: number;
  accessible: number;
  sessions: number;
}

export function buildings(ws: Workspace): BuildingStat[] {
  const map = new Map<string, Room[]>();
  ws.rooms.forEach((r) => {
    const key = r.building || "Unassigned";
    map.set(key, [...(map.get(key) ?? []), r]);
  });
  return [...map.entries()]
    .map(([name, rooms]) => ({
      name,
      rooms,
      capacity: rooms.reduce((sum, r) => sum + r.capacity, 0),
      accessible: rooms.filter((r) => r.accessible).length,
      sessions: ws.sessions.filter((s) => rooms.some((r) => r.id === s.roomId)).length,
    }))
    .sort((a, b) => b.rooms.length - a.rooms.length);
}

/** Weekday load per department, for the reports heat strip. */
export function departmentLoad(ws: Workspace): { dept: string; days: Record<string, number> }[] {
  return departmentStats(ws).map((d) => {
    const courseIds = new Set(ws.courses.filter((c) => c.department === d.code).map((c) => c.id));
    const days: Record<string, number> = {};
    for (const day of ws.calendar.days) {
      days[day] = ws.sessions.filter((s) => s.day === day && courseIds.has(s.courseId)).length;
    }
    return { dept: d.code, days };
  });
}
