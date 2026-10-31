/** The integration boundary.
 *
 * All backend access lives in this file. It only *reads* and calls the documented endpoints;
 * it never assumes an endpoint that does not exist. If the API is unreachable the workspace
 * is loaded from `data/snapshot.json` instead, and every screen states that the numbers are
 * a snapshot.
 */
import snapshot from "../data/snapshot.json";
import type {
  DataSource,
  DayCode,
  Faculty,
  Room,
  SessionEntry,
  SessionUser,
  Workspace,
} from "./types";

/**
 * Where the API lives.
 *
 * Empty by default: the dev server proxies /api, and the single-service deployment has
 * FastAPI serving this bundle on its own origin. When the UI is hosted separately (a
 * Render static site, for example) the build sets VITE_API_BASE to the API origin and the
 * browser calls it cross-origin — the API allows it through CORS_ORIGINS.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").trim().replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  // A stalled request must never leave the UI on the boot screen: hard-stop after 9s.
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 9000) : null;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    throw new ApiError(0, "The scheduling API is not reachable.", error);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in (body as Record<string, unknown>)
        ? (body as Record<string, unknown>).detail
        : body;
    throw new ApiError(response.status, typeof detail === "string" ? detail : `Request failed (${response.status})`, detail);
  }
  return body as T;
}

/** The committed snapshot predates the maintenance layer and the soft-rule labels, so the
 *  offline workspace fills them honestly with "nothing known" rather than `undefined`. */
export const snapshotWorkspace: Workspace = {
  ...(snapshot as unknown as Workspace),
  maintenance: (snapshot as unknown as Workspace).maintenance ?? [],
  softRuleLabels: (snapshot as unknown as Workspace).softRuleLabels ?? {},
};

/** Published availability for one room — called only when a room is opened, not at boot. */
export async function fetchRoomAvailability(roomId: string, token?: string | null): Promise<AvailabilityResponse> {
  return request<AvailabilityResponse>(`/api/dataset/rooms/${roomId}/availability`, {}, token);
}

/** Fast, non-authenticated probe. Never blocks the UI for more than a moment. */
export async function probeApi(timeoutMs = 1800): Promise<{ ok: boolean; datasetId?: string }> {
  if (typeof window === "undefined") return { ok: false };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as { dataset_id?: string };
    return { ok: true, datasetId: body.dataset_id };
  } catch {
    return { ok: false };
  } finally {
    window.clearTimeout(timer);
  }
}

export interface LoginResult {
  token: string;
  user: SessionUser;
  capabilities: string[];
}

/** Real sign-in against the scheduler's own auth: email + password in, JWT out. */
export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  return request<LoginResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
}

export async function demoLogin(role: string, email?: string): Promise<LoginResult> {
  const query = email ? `?email=${encodeURIComponent(email)}` : "";
  return request<LoginResult>(`/api/auth/demo-login/${role}${query}`, { method: "POST" });
}

/* --------------------------------------------------------------- normalisation */

interface Entities {
  groups: { id: string; name: string; size: number; year: number | null; department: string | null }[];
  faculty: { id: string; name: string; department: string }[];
  rooms: { id: string; name: string; type: string; capacity: number; accessible: boolean; features: string[]; building: string }[];
}

interface WeekResponse {
  count: number;
  days: DayCode[];
  periods: { id: number; start: string; end: string }[];
  lunch_after_period: number;
  entries: {
    session_id: string;
    course_id: string;
    kind: string;
    day: DayCode;
    start_period: number;
    end_period: number;
    room_id: string;
    faculty_id: string;
    groups: string[];
    size: number;
  }[];
}

/** /api/admin/dashboard speaks snake_case; the workspace speaks camelCase. */
interface LiveDashboard {
  counts: Workspace["dashboard"]["counts"];
  conflicts?: { hard?: number; by_rule?: Record<string, number> };
  soft?: { total?: number; breakdown?: Record<string, number> };
  utilisation?: Workspace["dashboard"]["utilisation"];
  busiest_rooms?: Workspace["dashboard"]["busiestRooms"];
  pending_proposals?: number;
  risks?: string[];
}

interface AvailabilityResponse {
  room: { id: string; name: string; building: string; type: string; capacity: number; features: string[]; accessible: boolean; allowed_uses: string[] };
  busy: Room["busy"];
  free_slots: Room["availability"];
}

/** /api/exams row (snake_case) - the midsem schedule. */
interface ExamRow {
  exam_id: string;
  course_ids: string[];
  groups: string[];
  size: number;
  duration_hours: number;
  day: DayCode | null;
  session: string | null;
  rooms: string[];
  seats: number;
}

function normaliseExam(row: ExamRow): Workspace["exams"][number] {
  return {
    id: row.exam_id,
    courseIds: row.course_ids,
    courseTitles: row.course_ids,
    groupIds: row.groups,
    groupNames: row.groups,
    size: row.size,
    durationHours: row.duration_hours,
    day: row.day ?? "MON",
    slot: row.session ?? "unscheduled",
    rooms: row.rooms,
    seats: row.seats,
  };
}

/**
 * Turn live API responses into the same shape `snapshot.json` has.
 *
 * The API does not publish the course catalogue or declared faculty unavailability, so when
 * the dataset ids match we take those two *descriptive* tables from the committed snapshot.
 * Nothing that decides a booking or a validity verdict is inferred here.
 */
export async function loadLiveWorkspace(token: string, datasetId: string): Promise<Workspace> {
  const auth = { Authorization: `Bearer ${token}` };
  const json = <T,>(path: string) => request<T>(path, { headers: auth }, token);

  const [summary, entities, week, bookings, dashboard, manual, exams] = await Promise.all([
    json<{
      summary: Workspace["summary"];
      calendar: Record<string, unknown>;
      priority_order: string[];
      role_category_cap: Record<string, string>;
      maintenance?: { room_id: string; day: DayCode; period: number }[];
      soft_rule_labels?: Record<string, string>;
    }>("/api/dataset/summary"),
    json<Entities>("/api/dataset/entities"),
    json<WeekResponse>("/api/timetable/week"),
    json<Workspace["bookings"]>("/api/bookings"),
    json<LiveDashboard>("/api/admin/dashboard"),
    json<{ events: Workspace["manualEvents"] }>("/api/bookings/manual"),
    json<{ exams: ExamRow[]; exam_week?: unknown }>("/api/exams"),
  ]);

  // The per-room availability endpoint is a 1:1 mirror of the timetable we already hold.
  // Fetching it 27 times made first paint wait on the network (and the dev proxy serialises
  // concurrent requests), so we derive occupancy locally and read a room's published slots
  // only when someone opens that room. `fetchRoomAvailability` below does that.
  const availability: AvailabilityResponse[] = [];

  const sameDataset = datasetId === snapshotWorkspace.datasetId;
  const courses = sameDataset ? snapshotWorkspace.courses : [];
  const facultyMeta = new Map<string, Faculty>(
    (sameDataset ? snapshotWorkspace.faculty : []).map((f) => [f.id, f]),
  );

  const courseById = new Map(courses.map((c) => [c.id, c]));
  // NOTE: per-room availability is fetched lazily (one room at a time), so this map must be
  // built from /dataset/entities — otherwise every tile shows a raw id like "CR-103".
  const roomMeta = new Map(entities.rooms.map((r) => [r.id, r]));
  const busyByRoom = new Map<string, Workspace["rooms"][number]["busy"]>();
  week.entries.forEach((entry) => {
    const list = busyByRoom.get(entry.room_id) ?? [];
    list.push({
      day: entry.day,
      start_period: entry.start_period,
      end_period: entry.end_period,
      session_id: entry.session_id,
      source: "session",
    });
    busyByRoom.set(entry.room_id, list);
  });
  bookings.bookings.forEach((booking) => {
    const decision = booking.decision;
    if (!decision?.room_id || decision.status === "rejected") return;
    const list = busyByRoom.get(decision.room_id) ?? [];
    list.push({
      day: decision.day ?? "MON",
      start_period: decision.start_period ?? 0,
      end_period: decision.end_period ?? 0,
      session_id: booking.request_id,
      source: "booking",
    });
    busyByRoom.set(decision.room_id, list);
  });
  const groupById = new Map(entities.groups.map((g) => [g.id, g]));
  const facultyName = new Map(entities.faculty.map((f) => [f.id, f.name]));

  const facultySessions = new Map<string, string[]>();
  const groupSessions = new Map<string, string[]>();

  const sessions: SessionEntry[] = week.entries.map((entry) => {
    const course = courseById.get(entry.course_id);
    const sessionId = entry.session_id;
    facultySessions.set(entry.faculty_id, [...(facultySessions.get(entry.faculty_id) ?? []), sessionId]);
    entry.groups.forEach((g) =>
      groupSessions.set(g, [...(groupSessions.get(g) ?? []), sessionId]),
    );
    return {
      id: sessionId,
      courseId: entry.course_id,
      courseTitle: course?.title ?? entry.course_id,
      kind: entry.kind,
      day: entry.day,
      startPeriod: entry.start_period,
      endPeriod: entry.end_period,
      roomId: entry.room_id,
      roomName: roomMeta.get(entry.room_id)?.name ?? entry.room_id,
      building: roomMeta.get(entry.room_id)?.building ?? "",
      roomType: roomMeta.get(entry.room_id)?.type ?? "",
      facultyId: entry.faculty_id,
      facultyName: facultyName.get(entry.faculty_id) ?? entry.faculty_id,
      groupIds: entry.groups,
      groupNames: entry.groups.map((g) => groupById.get(g)?.name ?? g),
      size: entry.size,
      department: course?.department ?? "COMMON",
      year: course?.year ?? null,
    };
  });

  const pub = new Map(availability.map((a) => [a.room.id, a]));
  const rooms: Room[] = entities.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    type: room.type,
    capacity: room.capacity,
    building: room.building,
    features: room.features,
    accessible: room.accessible,
    allowedUses: pub.get(room.id)?.room.allowed_uses ?? [],
    availability: pub.get(room.id)?.free_slots ?? [],
    busy: busyByRoom.get(room.id) ?? [],
  }));

  const faculty: Faculty[] = entities.faculty.map((f) => {
    const meta = facultyMeta.get(f.id);
    return {
      id: f.id,
      name: f.name,
      department: f.department,
      maxHoursPerDay: meta?.maxHoursPerDay ?? 4,
      needsAccessible: meta?.needsAccessible ?? false,
      unavailable: meta?.unavailable ?? [],
      preferences: meta?.preferences ?? [],
      sessionIds: facultySessions.get(f.id) ?? [],
    };
  });

  const groups = entities.groups.map((g) => ({
    id: g.id,
    name: g.name,
    year: g.year,
    department: g.department,
    size: g.size,
    needsAccessible: sameDataset ? snapshotWorkspace.groups.find((x) => x.id === g.id)?.needsAccessible ?? false : false,
    sessionIds: groupSessions.get(g.id) ?? [],
  }));

  const periods = snapshotWorkspace.calendar.periods.map((p) => {
    const live = week.periods.find((x) => x.id === p.id);
    return { id: p.id, start: live?.start ?? p.start, end: live?.end ?? p.end, teaching: p.teaching };
  });

  return {
    ...snapshotWorkspace,
    datasetId,
    generatedAt: new Date().toISOString(),
    summary: summary.summary,
    calendar: {
      ...snapshotWorkspace.calendar,
      days: week.days,
      periods,
      lunchAfterPeriod: week.lunch_after_period,
      // The dataset speaks snake_case; a judge's own upload must not fall back to our
      // snapshot's exam window, so read it from the live payload when it is there.
      festWeek: (summary.calendar?.fest_week as string | undefined) ?? snapshotWorkspace.calendar.festWeek,
      examWeek: (summary.calendar?.exam_week as Workspace["calendar"]["examWeek"]) ?? snapshotWorkspace.calendar.examWeek,
      labStartPeriods:
        (summary.calendar?.lab_start_periods as number[] | undefined) ?? snapshotWorkspace.calendar.labStartPeriods,
      eventOnlyPeriods:
        (summary.calendar?.event_only_periods as number[] | undefined) ?? snapshotWorkspace.calendar.eventOnlyPeriods,
    },
    rooms,
    faculty,
    groups,
    courses,
    sessions,
    bookings,
    manualEvents: manual.events ?? [],
    exams: (exams.exams ?? []).map(normaliseExam),
    dashboard: {
      counts: dashboard.counts,
      conflicts: { hard: dashboard.conflicts?.hard ?? 0, by_rule: dashboard.conflicts?.by_rule ?? {} },
      soft: { total: dashboard.soft?.total ?? 0, breakdown: dashboard.soft?.breakdown ?? {} },
      utilisation: dashboard.utilisation ?? [],
      busiestRooms: dashboard.busiest_rooms ?? [],
      pendingProposals: dashboard.pending_proposals ?? 0,
      risks: dashboard.risks ?? [],
    },
    maintenance: summary.maintenance ?? [],
    softRuleLabels: summary.soft_rule_labels ?? {},
    priorityOrder: summary.priority_order,
    roleCategoryCap: summary.role_category_cap,
  };
}

export interface LoadOptions {
  /** Signed out: read the labelled snapshot and hold no token at all. */
  anonymous?: boolean;
  /** A token from the sign-in screen — skip the silent demo login. */
  session?: LoginResult | null;
}

function signedOutSource(reachable: boolean): DataSource {
  return {
    mode: "snapshot",
    detail: reachable
      ? "Signed out · API is up, showing the bundled snapshot until you sign in"
      : "Signed out · API unreachable, showing the bundled snapshot",
    token: null,
    apiBase: API_BASE || "same origin",
    reachable,
  };
}

export async function loadWorkspace(options: LoadOptions = {}): Promise<{
  data: Workspace;
  source: DataSource;
  user: SessionUser | null;
}> {
  if (options.anonymous) {
    const reachable = (await probeApi(1200)).ok;
    return { data: snapshotWorkspace, source: signedOutSource(reachable), user: null };
  }

  if (options.session) {
    const { token, user } = options.session;
    try {
      const data = await Promise.race([
        loadLiveWorkspace(token, snapshotWorkspace.datasetId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new ApiError(0, "The scheduling API took too long to answer.")), 14000),
        ),
      ]);
      return {
        data,
        source: {
          mode: "live",
          detail: `Live · ${data.datasetId} · ${data.sessions.length} sessions · ${user.email}`,
          token,
          apiBase: API_BASE || "same origin",
          reachable: true,
        },
        user,
      };
    } catch (error) {
      console.warn("[tessera] signed in, but live reads failed — using the snapshot.", error);
      return {
        data: snapshotWorkspace,
        source: {
          mode: "snapshot",
          detail: "Signed in · live reads failed, showing the bundled snapshot",
          token,
          apiBase: API_BASE || "same origin",
          reachable: false,
        },
        user,
      };
    }
  }

  const probe = await probeApi();
  if (!probe.ok) {
    return {
      data: snapshotWorkspace,
      source: {
        mode: "snapshot",
        detail: "Snapshot of cit-public-v1 · the scheduling API is not running",
        token: null,
        apiBase: API_BASE || "same origin",
        reachable: false,
      },
      user: null,
    };
  }

  try {
    const login = await demoLogin("admin");
    const data = await Promise.race([
      loadLiveWorkspace(login.token, probe.datasetId ?? snapshotWorkspace.datasetId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ApiError(0, "The scheduling API took too long to answer.")), 14000),
      ),
    ]);
    return {
      data,
      source: {
        mode: "live",
        detail: `Live · ${data.datasetId} · ${data.sessions.length} sessions`,
        token: login.token,
        apiBase: API_BASE || "same origin",
        reachable: true,
      },
      user: login.user,
    };
  } catch (error) {
    // Loud on purpose: a silent fallback would let snapshot numbers masquerade as live ones.
    console.warn("[tessera] live workspace unavailable — falling back to the bundled snapshot.", error);
    return {
      data: snapshotWorkspace,
      source: {
        mode: "snapshot",
        detail:
          error instanceof ApiError
            ? `Snapshot · API answered but could not be read (${error.message})`
            : "Snapshot · the scheduling API is not running",
        token: null,
        apiBase: API_BASE || "same origin",
        reachable: false,
      },
      user: null,
    };
  }
}

/* --------------------------------------------------------------- actions */

export interface RemoteMove {
  proposal_id?: string;
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
  [key: string]: unknown;
}

export function requestMove(
  token: string | null,
  payload: { session_id: string; day: DayCode; start_period: number; title?: string },
): Promise<RemoteMove> {
  return request<RemoteMove>("/api/disruption/move", { method: "POST", body: JSON.stringify(payload) }, token);
}

export function applyProposal(token: string | null, proposalId: string) {
  return request<Record<string, unknown>>(`/api/disruption/${proposalId}/apply`, { method: "POST" }, token);
}

export function parseRequest(token: string | null, text: string, role?: string) {
  return request<Record<string, unknown>>(
    "/api/ai/parse",
    { method: "POST", body: JSON.stringify({ text, role, allow_llm: true }) },
    token,
  );
}

export function checkManualEvent(token: string | null, payload: Record<string, unknown>) {
  return request<Record<string, unknown>>(
    "/api/bookings/manual/check",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export function createManualEvent(token: string | null, payload: Record<string, unknown>) {
  return request<Record<string, unknown>>(
    "/api/bookings/manual",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}

export function listProposals(token: string | null) {
  return request<{ count: number; proposals: Record<string, unknown>[] }>("/api/disruption/proposals", {}, token);
}

/* ------------------------------------------------------- approvals & operations */

export interface ProposalRow {
  id: string;
  title: string;
  status: string;
  requested_by: string;
  decided_by: string | null;
  created_at: string;
  moves: number | null;
  valid: boolean | null;
  changes: Record<string, unknown>[];
  can_i_approve: boolean;
}

export function listProposalQueue(token: string | null) {
  return request<{ count: number; proposals: ProposalRow[] }>("/api/disruption/proposals", {}, token);
}

export function rejectProposal(token: string | null, proposalId: string, note: string) {
  return request<Record<string, unknown>>(
    `/api/disruption/${proposalId}/reject?note=${encodeURIComponent(note)}`,
    { method: "POST" },
    token,
  );
}

/** A whole change file, previewed without touching the timetable. */
export function previewChangeFile(token: string | null, changes: unknown[], title = "Uploaded change file") {
  return request<Record<string, unknown>>(
    "/api/disruption/preview-file",
    { method: "POST", body: JSON.stringify({ changes, title }) },
    token,
  );
}

export function fetchSampleChanges(token: string | null) {
  return request<{ file: string; changes: Record<string, unknown>[] }>("/api/disruption/sample", {}, token);
}

/** "Why is this class here?" - the phrase a judge asks, answered by the constraint codes. */
export function fetchExplain(token: string | null, sessionId: string) {
  return request<{
    summary: string;
    reasons: string[];
    tradeoffs: string[];
    alternatives: { day: string; start_period: number }[];
    checked_by: string;
  }>(`/api/timetable/sessions/${sessionId}/explain`, {}, token);
}

export function facultyChangeRequest(token: string | null, text: string, facultyId?: string | null) {
  return request<Record<string, unknown>>(
    "/api/ai/change-request",
    { method: "POST", body: JSON.stringify({ text, faculty_id: facultyId ?? null, create_proposal: true }) },
    token,
  );
}

export function fetchAiStatus(token: string | null) {
  return request<{
    enabled: boolean;
    mode: string;
    model: string | null;
    fallback_model: string | null;
    daily_limit: number;
    note: string;
    budget: BudgetSnapshot;
    stats: Record<string, unknown>;
  }>("/api/ai/status", {}, token);
}

export interface BudgetSnapshot {
  date: string;
  enabled: boolean;
  primary_model: string;
  fallback_model: string;
  requests_today: number;
  by_model: Record<string, number>;
  remaining_primary: number;
  remaining_fallback: number;
  daily_limit: number;
  daily_limit_fallback: number;
  per_minute_limit: number;
  denied_today: number;
  note: string;
}

export function runAiSelfTest(token: string | null) {
  return request<{ ok: boolean; model?: string; latency_ms?: number; error?: string; reason?: string; budget?: BudgetSnapshot }>(
    "/api/ai/selftest",
    { method: "POST" },
    token,
  );
}

export function generateTimetable(token: string | null, timeLimit?: number) {
  return request<{
    ok: boolean;
    hard_violations: number;
    soft_total: number;
    seed: number;
    solve_seconds: number;
    hard_by_rule: Record<string, number>;
  }>("/api/timetable/generate", { method: "POST", body: JSON.stringify({ time_limit: timeLimit }) }, token);
}

export function writeExports(token: string | null) {
  return request<{ written: Record<string, unknown> }>("/api/admin/exports", { method: "POST" }, token);
}

/** The files the judges download - written by the same code CI validates. */
export const EXPORT_NAMES = [
  { name: "schedule.json", note: "the semester timetable" },
  { name: "schedule_after.json", note: "after the sample disruption is repaired" },
];

/** Authenticated download: an <a href> would arrive without the bearer token. */
export async function downloadExport(token: string | null, name: string) {
  const response = await fetch(`/api/admin/exports/${name}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.slice(0, 200) || `download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function uploadDataset(token: string | null, payload: unknown) {
  return request<Record<string, unknown>>("/api/admin/dataset", { method: "POST", body: JSON.stringify(payload) }, token);
}

export function restoreDataset(token: string | null) {
  return request<Record<string, unknown>>("/api/admin/dataset", { method: "DELETE" }, token);
}

export function resetDemo(token: string | null) {
  return request<{ ok: boolean; users: number; sessions: number; after: boolean }>(
    "/api/admin/reset",
    { method: "POST" },
    token,
  );
}

export function fetchDatabase(token: string | null) {
  return request<{
    engine: string;
    url: string;
    file_bytes: number | null;
    tables: Record<string, number>;
    active_version: Record<string, unknown> | null;
    note: string;
  }>("/api/admin/db", {}, token);
}

export function fetchAudit(token: string | null, limit = 40) {
  return request<{ audit: { at: string; actor: string; role: string; action: string; detail: string }[] }>(
    `/api/admin/audit?limit=${limit}`,
    {},
    token,
  );
}

export function fetchHistory(token: string | null) {
  return request<{ versions: Record<string, unknown>[] }>("/api/admin/history", {}, token);
}
