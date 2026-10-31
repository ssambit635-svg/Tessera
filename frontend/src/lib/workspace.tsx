import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  applyProposal,
  demoLogin,
  loadWorkspace,
  requestMove,
  type RemoteMove,
} from "./api";
import { validateMove, type MoveTarget, type MoveValidation } from "./derive";
import type { DataSource, SessionUser, Workspace } from "./types";

export interface PendingChange {
  id: string;
  sessionId: string;
  target: MoveTarget;
  local: MoveValidation;
  remote: RemoteMove | null;
  remoteError: string | null;
  createdAt: number;
  outcome: "open" | "applied" | "discarded" | "failed";
  outcomeNote?: string;
}

export interface Toast {
  id: string;
  tone: "info" | "valid" | "warn" | "danger" | "ai";
  title: string;
  detail?: string;
}

export interface Layers {
  classes: boolean;
  events: boolean;
  exams: boolean;
  library: boolean;
  birthdays: boolean;
}

interface WorkspaceContextValue {
  status: "loading" | "ready";
  data: Workspace;
  source: DataSource;
  user: SessionUser | null;
  reload: () => Promise<void>;
  switchPersona: (role: string, email?: string) => Promise<void>;
  personas: { role: string; email: string; label: string }[];
  railCollapsed: boolean;
  setRailCollapsed: (value: boolean) => void;
  layers: Layers;
  toggleLayer: (key: keyof Layers) => void;
  pending: PendingChange | null;
  proposeChange: (sessionId: string, target: MoveTarget) => Promise<PendingChange | null>;
  discardChange: () => void;
  applyPending: () => Promise<boolean>;
  notify: (toast: Omit<Toast, "id">) => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** A typed, empty campus so the shell can render before data lands.
 * Every page is written to survive empty collections; nothing here is ever shown as a
 * number — the boot gate covers the provider until the real workspace resolves. */
const EMPTY_WORKSPACE: Workspace = {
  generatedAt: "",
  datasetId: "",
  institute: "Chennai Institute of Technology",
  team: "TESSERA",
  summary: {
    dataset_id: "",
    rooms: 0,
    faculty: 0,
    groups: 0,
    sessions: 0,
    teaching_hours: 0,
    booking_requests: 0,
    cancelled: [],
    exams: 0,
  },
  calendar: {
    days: ["MON", "TUE", "WED", "THU", "FRI"],
    periods: [
      { id: 1, start: "08:00", end: "09:00", teaching: true },
      { id: 2, start: "09:00", end: "10:00", teaching: true },
      { id: 3, start: "10:00", end: "11:00", teaching: true },
      { id: 4, start: "11:00", end: "12:00", teaching: true },
      { id: 5, start: "12:00", end: "13:00", teaching: true },
      { id: 6, start: "14:00", end: "15:00", teaching: true },
      { id: 7, start: "15:00", end: "16:00", teaching: true },
      { id: 8, start: "16:00", end: "17:00", teaching: true },
      { id: 9, start: "17:00", end: "18:00", teaching: true },
    ],
    lunchAfterPeriod: 5,
    labStartPeriods: [],
    eventOnlyPeriods: [],
  },
  rooms: [],
  faculty: [],
  groups: [],
  courses: [],
  sessions: [],
  bookings: {
    count: 0,
    totals: { score: 0, max: 0, approved: 0, alternatives: 0, rejected: 0, cancelled: 0 },
    bookings: [],
  },
  manualEvents: [],
  exams: [],
  dashboard: {
    counts: { sessions: 0, scheduled: 0, exams: 0, bookings: 0, approved: 0, alternatives: 0, rejected: 0 },
    conflicts: { hard: 0, by_rule: {} },
    soft: { total: 0, breakdown: {} },
    utilisation: [],
    busiestRooms: [],
    pendingProposals: 0,
    risks: [],
  },
  priorityOrder: [],
  roleCategoryCap: {},
  demoAccounts: [],
  unavailability: [],
  cancellations: [],
};

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [data, setData] = useState<Workspace>(EMPTY_WORKSPACE);
  const [source, setSource] = useState<DataSource>({ mode: "snapshot", detail: "", token: null, apiBase: "" });
  const [user, setUser] = useState<SessionUser | null>(null);
  const [railCollapsed, setRailCollapsedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("tessera.rail") === "collapsed";
  });
  const [layers, setLayers] = useState<Layers>(() => {
    if (typeof window === "undefined") return { classes: true, events: true, exams: true, library: true, birthdays: false };
    try {
      const raw = window.localStorage.getItem("tessera.layers");
      if (raw) return JSON.parse(raw) as Layers;
    } catch {
      /* ignore malformed local state */
    }
    return { classes: true, events: true, exams: true, library: true, birthdays: false };
  });
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    if (timers.current[id]) {
      window.clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = uid("toast");
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      timers.current[id] = window.setTimeout(() => dismissToast(id), 6200);
    },
    [dismissToast],
  );

  const bootstrap = useCallback(async () => {
    const result = await loadWorkspace();
    setData(result.data);
    setSource(result.source);
    setUser(result.user);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const reload = useCallback(async () => {
    setStatus("loading");
    await bootstrap();
  }, [bootstrap]);

  const setRailCollapsed = useCallback((value: boolean) => {
    setRailCollapsedState(value);
    window.localStorage.setItem("tessera.rail", value ? "collapsed" : "expanded");
  }, []);

  const toggleLayer = useCallback((key: keyof Layers) => {
    setLayers((current) => {
      const next = { ...current, [key]: !current[key] };
      window.localStorage.setItem("tessera.layers", JSON.stringify(next));
      return next;
    });
  }, []);

  const switchPersona = useCallback(
    async (role: string, email?: string) => {
      if (source.mode !== "live") {
        const account = data.demoAccounts.find((a) => a.role === role && (!email || a.email === email));
        setUser({
          email: account?.email ?? `${role}@cit.edu`,
          name: account?.label ?? role,
          role,
        });
        notify({
          tone: "info",
          title: `Viewing as ${account?.label ?? role}`,
          detail: "Snapshot mode — roles are labels here, not authenticated sessions.",
        });
        return;
      }
      try {
        const login = await demoLogin(role, email);
        setSource((current) => ({ ...current, token: login.token }));
        setUser(login.user);
        notify({
          tone: "valid",
          title: `Signed in as ${login.user.name}`,
          detail: `${login.user.email} · ${login.user.role.replace(/_/g, " ")}`,
        });
      } catch (error) {
        notify({
          tone: "danger",
          title: "Could not switch account",
          detail: error instanceof ApiError ? error.message : String(error),
        });
      }
    },
    [data.demoAccounts, notify, source.mode],
  );

  const proposeChange = useCallback(
    async (sessionId: string, target: MoveTarget) => {
      if (!data) return null;
      let local: MoveValidation;
      try {
        local = validateMove(data, sessionId, target);
      } catch {
        return null;
      }
      const draft: PendingChange = {
        id: uid("change"),
        sessionId,
        target,
        local,
        remote: null,
        remoteError: null,
        createdAt: Date.now(),
        outcome: "open",
      };
      setPending(draft);

      if (source.mode === "live" && source.token) {
        try {
          const remote = await requestMove(source.token, {
            session_id: sessionId,
            day: target.day,
            start_period: target.startPeriod,
            title: `Move ${sessionId} to ${target.day} P${target.startPeriod}`,
          });
          const enriched: PendingChange = { ...draft, remote };
          setPending((current) => (current && current.id === draft.id ? enriched : current));
          return enriched;
        } catch (error) {
          const message =
            error instanceof ApiError
              ? `${error.message}${error.status ? ` (HTTP ${error.status})` : ""}`
              : String(error);
          const enriched: PendingChange = { ...draft, remoteError: message };
          setPending((current) => (current && current.id === draft.id ? enriched : current));
          return enriched;
        }
      }
      return draft;
    },
    [data, source.mode, source.token],
  );

  const discardChange = useCallback(() => setPending(null), []);

  const applyPending = useCallback(async () => {
    if (!pending) return false;
    const remoteValid = pending.remote?.valid;
    const acceptable = remoteValid ?? pending.local.state !== "invalid";
    if (!acceptable) {
      notify({
        tone: "danger",
        title: "This change cannot be applied",
        detail: "Tessera's rules reject the target slot. Resolve the conflicts first.",
      });
      return false;
    }

    if (source.mode === "live" && source.token && pending.remote?.proposal_id) {
      try {
        await applyProposal(source.token, pending.remote.proposal_id);
        setPending({ ...pending, outcome: "applied", outcomeNote: "Applied through the API" });
        notify({
          tone: "valid",
          title: "Proposal applied",
          detail: `${pending.local.session.courseId} moved to ${pending.target.day} · ${pending.local.to.roomName}`,
        });
        await bootstrap();
        return true;
      } catch (error) {
        const detail =
          error instanceof ApiError
            ? `${error.message}${error.status === 403 ? " — TESSERA requires a second admin to approve. Sign in as the dean to apply." : ""}`
            : String(error);
        setPending({ ...pending, outcome: "failed", outcomeNote: detail });
        notify({ tone: "danger", title: "Approval refused", detail });
        return false;
      }
    }

    setPending({
      ...pending,
      outcome: "applied",
      outcomeNote: "Simulated in the browser — the scheduling backend was not called",
    });
    notify({
      tone: "valid",
      title: "Change rehearsed",
      detail: "Snapshot mode: the move is drawn, not written. Nothing was sent to the backend.",
    });
    return true;
  }, [bootstrap, notify, pending, source.mode, source.token]);

  const personas = useMemo(() => {
    const fromApi = data.demoAccounts;
    if (fromApi.length) return fromApi;
    return [
      { role: "admin", email: "admin@cit.edu", label: "Admin (Dean's office)" },
      { role: "department_coordinator", email: "dept.cse@cit.edu", label: "Department coordinator" },
      { role: "faculty", email: "faculty@cit.edu", label: "Faculty" },
      { role: "club", email: "club@cit.edu", label: "Club representative" },
    ];
  }, [data.demoAccounts]);

  const value: WorkspaceContextValue = {
    status,
    data,
    source,
    user,
    reload,
    switchPersona,
    personas,
    railCollapsed,
    setRailCollapsed,
    layers,
    toggleLayer,
    pending,
    proposeChange,
    discardChange,
    applyPending,
    notify,
    toasts,
    dismissToast,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}

/** Display name of the signed-in persona. */
export function useDisplayUser() {
  const { user } = useWorkspace();
  return user ?? { email: "demo@cit.edu", name: "Campus operations", role: "admin" };
}
