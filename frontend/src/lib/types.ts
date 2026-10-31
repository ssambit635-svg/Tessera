/** Shapes exchanged between the TESSERA UI and its data adapter.
 *
 * These mirror the read endpoints of the independently-owned scheduling API. The adapter
 * (`lib/api.ts`) normalises live responses into exactly these types; the snapshot in
 * `data/snapshot.json` already has this shape. Pages only ever see `Workspace`.
 */

export type DayCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface Period {
  id: number;
  start: string;
  end: string;
  teaching: boolean;
}

export interface Calendar {
  days: DayCode[];
  periods: Period[];
  lunchAfterPeriod: number;
  lunch?: { after_period: number; start: string; end: string } | null;
  labStartPeriods: number[];
  eventOnlyPeriods: number[];
  festWeek?: string | null;
  examWeek?: { days: string[]; sessions: { id: string; start: string; end: string }[] } | null;
}

export interface RoomAvailabilitySlot {
  day: DayCode;
  period: number;
  start: string;
  free: boolean;
  blocked_reason: string | null;
}

export interface RoomBusy {
  session_id: string;
  day: DayCode;
  start_period: number;
  end_period: number;
  source: "class" | "booking" | "manual" | string;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  building: string;
  features: string[];
  accessible: boolean;
  allowedUses: string[];
  availability: RoomAvailabilitySlot[];
  busy: RoomBusy[];
}

export interface FacultyUnavailable {
  day: DayCode;
  periods: number[];
  reason: string;
}

export interface FacultyPreference {
  type: string;
  days: DayCode[];
  periods: number[];
  note?: string;
}

export interface Faculty {
  id: string;
  name: string;
  department: string;
  maxHoursPerDay: number;
  needsAccessible: boolean;
  unavailable: FacultyUnavailable[];
  preferences: FacultyPreference[];
  sessionIds: string[];
}

export interface StudentGroup {
  id: string;
  name: string;
  year: number | null;
  department: string | null;
  size: number | null;
  needsAccessible: boolean;
  sessionIds: string[];
}

export interface Course {
  id: string;
  title: string;
  department: string;
  year: number;
  lectureHours: number;
  tutorialHours: number;
  labBlocks: number;
}

export type SessionKind = "lecture" | "tutorial" | "lab" | string;

export interface SessionEntry {
  id: string;
  courseId: string;
  courseTitle: string;
  kind: SessionKind;
  day: DayCode;
  startPeriod: number;
  endPeriod: number;
  roomId: string;
  roomName: string;
  building: string;
  facultyId: string;
  facultyName: string;
  groupIds: string[];
  groupNames: string[];
  size: number;
  department: string;
  year: number | null;
}

export type BookingStatus = "approved" | "alternative_offered" | "rejected" | "undecided";

export interface BookingDecision {
  request_id: string;
  status: BookingStatus;
  day?: DayCode | null;
  start_period?: number | null;
  end_period?: number | null;
  room_id?: string | null;
  reason?: string;
}

export interface Booking {
  request_id: string;
  title: string;
  requester: string;
  role: string;
  submitted_at: string;
  requested_category: string;
  effective_category: string;
  category_note: string | null;
  weight: number;
  attendance: number;
  duration_periods: number;
  windows: { day: DayCode; from_period: number; to_period: number }[];
  needs: string[];
  room_types: string[];
  requested_room: string | null;
  mandatory_for_groups: string[];
  raw_text: string;
  cancelled: boolean;
  decision: BookingDecision;
}

export interface BookingCollection {
  count: number;
  totals: {
    score: number;
    max: number;
    approved: number;
    alternatives: number;
    rejected: number;
    cancelled: number;
  };
  bookings: Booking[];
}

export interface ManualEvent {
  id: string;
  title: string;
  room_id?: string;
  day?: DayCode;
  start_period?: number;
  end_period?: number;
  [key: string]: unknown;
}

export interface ExamEntry {
  id: string;
  courseIds: string[];
  courseTitles: string[];
  groupIds: string[];
  groupNames: string[];
  size: number;
  durationHours: number;
  day: DayCode;
  slot: string;
  rooms: string[];
}

export interface UtilisationRow {
  room_id: string;
  sessions: number;
  hours: number;
  utilisation: number;
}

export interface Dashboard {
  counts: {
    sessions: number;
    scheduled: number;
    exams: number;
    bookings: number;
    approved: number;
    alternatives: number;
    rejected: number;
  };
  conflicts: { hard: number; by_rule: Record<string, number> };
  soft: { total: number; breakdown: Record<string, number> };
  utilisation: UtilisationRow[];
  busiestRooms: { room_id: string; sessions: number; hours: number; utilisation: number }[];
  pendingProposals: number;
  risks: string[];
}

export interface DemoAccount {
  role: "admin" | "department_coordinator" | "faculty" | "club" | string;
  email: string;
  label: string;
}

export interface Workspace {
  generatedAt: string;
  datasetId: string;
  institute: string;
  team: string;
  summary: {
    dataset_id: string;
    rooms: number;
    faculty: number;
    groups: number;
    sessions: number;
    teaching_hours: number;
    booking_requests: number;
    cancelled: string[];
    exams: number;
  };
  calendar: Calendar;
  rooms: Room[];
  faculty: Faculty[];
  groups: StudentGroup[];
  courses: Course[];
  sessions: SessionEntry[];
  bookings: BookingCollection;
  manualEvents: ManualEvent[];
  exams: ExamEntry[];
  dashboard: Dashboard;
  priorityOrder: string[];
  roleCategoryCap: Record<string, string>;
  demoAccounts: DemoAccount[];
  unavailability: { room_id: string; day: DayCode; periods: number[]; reason: string }[];
  cancellations: { request_id: string; cancelled_at: string; by: string; note: string }[];
}

/** Where the numbers on screen came from. Never blurred: the UI states it. */
export type DataMode = "live" | "snapshot";

export interface DataSource {
  mode: DataMode;
  /** Human readable detail for the connection badge. */
  detail: string;
  /** Present in live mode only; the UI calls authenticated endpoints with it. */
  token: string | null;
  apiBase: string;
  /** Whether the scheduling API answered at all — independent of which data we show. */
  reachable?: boolean;
}

export interface SessionUser {
  id?: number | string;
  email: string;
  name: string;
  role: string;
  department?: string | null;
  facultyId?: string | null;
  groupId?: string | null;
  capabilities?: string[];
}

export interface Proposal {
  proposal_id?: string;
  id?: string;
  status?: string;
  valid?: boolean;
  session_id?: string;
  requested?: { day: DayCode; start_period: number };
  moves?: number | null;
  moved?: unknown[] | null;
  conflicts?: unknown[] | null;
  explanation?: string | null;
  report?: Record<string, unknown> | null;
  next?: string;
}
