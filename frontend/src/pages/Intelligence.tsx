import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { useUi, dateFromISO } from "../lib/ui";
import { Icon } from "../components/Icon";
import { TileMark, TileSpinner } from "../components/TileMark";
import { matchRooms, periodSpan, suggestSlots } from "../lib/derive";
import { DAY_LONG, dayCodeOf, plural } from "../lib/format";
import type { DayCode } from "../lib/types";
import { facultyChangeRequest, fetchAiStatus } from "../lib/api";

/* ============================================================================
   TESSERA Intelligence — the workspace, asked in a sentence.

   The page is the conversation and nothing else: a reading column, the thread,
   and a composer that stays where you left it. No decorative panels, no second
   dashboard beside the chat — the model reads, the constraint kernel decides, and
   every reply links to the screen where you can check it.

   The deterministic answerer below is the floor, not the ceiling: it answers from
   this workspace with numbers, and the engine path is only used for change-shaped
   questions (where a proposal can actually be filed).
   ========================================================================== */

interface Action {
  label: string;
  to: string;
}

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  bullets?: string[];
  actions?: Action[];
  meta?: string;
}

const QUICK_PROMPTS = [
  "Find a free lab tomorrow",
  "Why was my request rejected?",
  "Find an alternative slot",
  "What happens if this class moves?",
  "Summarise tomorrow's activities",
];

/** A faculty change request is the one thing the assistant is allowed to send to the engine. */
const CHANGE_INTENT = /(move|shift|swap|reschedul|postpone|cancel|relocate|change|badal|shift kar|\bura?do\b)/i;

interface AiStatus {
  enabled: boolean;
  mode: string;
  model: string | null;
  daily_limit: number;
  note: string;
  budget: { requests_today: number; remaining_primary: number; remaining_fallback: number };
}

export default function Intelligence() {
  const { data, source, user, notify, reload } = useWorkspace();
  const [ai, setAi] = useState<AiStatus | null>(null);
  const { activeDate } = useUi();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "hello",
      role: "ai",
      text: "I can see the whole workspace: every session, room, faculty hour and booking request. Ask me for a free lab, a rejected request's reason, or what a change would touch.",
      actions: [
        { label: "Open the Mosaic Board", to: "/mosaic" },
        { label: "Booking decisions", to: "/bookings" },
      ],
      meta: "context · timetable + availability + requests",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!source.token) return;
    let live = true;
    fetchAiStatus(source.token)
      .then((status) => {
        if (live) setAi(status as unknown as AiStatus);
      })
      .catch(() => {
        /* the chip stays on "deterministic" rather than claiming a provider */
      });
    return () => {
      live = false;
    };
  }, [source.token]);

  const active = dateFromISO(activeDate);
  const nextTeaching: DayCode = data.calendar.days[(data.calendar.days.indexOf(dayCodeOf(active)) + 1) % data.calendar.days.length];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const answer = async (question: string): Promise<Message> => {
    const q = question.toLowerCase();
    const base = { id: `ai-${Date.now()}`, role: "ai" as const };

    if (/(free|available|find).*(lab|laboratory)/.test(q) || /lab.*(free|available)/.test(q)) {
      const matches = matchRooms(data, {
        types: ["lab_cs", "lab_elec", "lab_phy", "lab_civil"],
        day: nextTeaching,
        fromPeriod: 4,
        toPeriod: 6,
      })
        .filter((m) => m.fit && m.freeInWindow)
        .slice(0, 3);
      if (!matches.length) {
        return {
          ...base,
          text: `No laboratory is completely free for a two-period block on ${DAY_LONG[nextTeaching]}. These are the closest windows:`,
          bullets: matchRooms(data, { types: ["lab_cs", "lab_elec"], day: nextTeaching }).slice(0, 3).map((m) => `${m.room.name} — ${m.why.map((w) => w.text).join(", ")}`),
          actions: [{ label: "Open the availability matrix", to: "/availability" }],
          meta: `checked ${data.rooms.length} rooms on ${nextTeaching}`,
        };
      }
      return {
        ...base,
        text: `Three laboratories are free for ${DAY_LONG[nextTeaching]}, P4–P6 (${periodSpan(data, 4, 6)}):`,
        bullets: matches.map((m) => `${m.room.name} · ${m.room.capacity} seats · ${m.room.building}`),
        actions: [
          { label: `See ${matches[0].room.name}`, to: `/availability?room=${matches[0].room.id}` },
          { label: "Request a lab booking", to: `/bookings?space=${matches[0].room.id}&day=${nextTeaching}&from=4&to=6` },
        ],
        meta: `availability derived from ${data.sessions.length} placed sessions and ${data.bookings.bookings.length} venue decisions`,
      };
    }

    if (/(reject|refused|why.*(not|declined))/.test(q)) {
      const rejected = data.bookings.bookings.filter((b) => b.decision.status === "rejected");
      return {
        ...base,
        text: rejected.length
          ? `${plural(rejected.length, "request")} could not be honoured. Each one fails a hard rule — the reason is recorded, not guessed:`
          : "No request has been rejected in this workspace.",
        bullets: rejected.map((b) => `${b.request_id} · ${b.title} — ${b.attendance} seats. ${b.decision.reason ?? ""}`),
        actions: rejected.map((b) => ({ label: `${b.request_id} decision`, to: `/bookings?request=${b.request_id}` })),
        meta: "from /api/bookings decisions",
      };
    }

    if (/(alternative|another slot|other slot|reschedul|free slot)/.test(q)) {
      const focus = data.sessions[0];
      const suggestions = suggestSlots(data, focus.id, 3);
      return {
        ...base,
        text: `Here are validated alternatives for ${focus.courseId} (${focus.courseTitle}), keeping the faculty and every student group intact:`,
        bullets: suggestions.length
          ? suggestions.map((s) => `${DAY_LONG[s.target.day]} · P${s.target.startPeriod} in ${data.rooms.find((r) => r.id === s.target.roomId)?.name} — ${s.state === "valid" ? "all checks pass" : "warnings only"}`)
          : ["No slot this week satisfies every rule."],
        actions: [{ label: "Visualise the ripple", to: "/ripple" }, { label: "Open the board", to: "/mosaic" }],
        meta: "local rule check · 10 constraints",
      };
    }

    if (/(what happens|move|impact|ripple)/.test(q)) {
      const focus = data.sessions[0];
      return {
        ...base,
        text: `If ${focus.courseId} moves, TESSERA recomputes the room, the faculty hour and every group in the session. The Ripple view draws exactly those connections; the impact panel counts them before anything is applied.`,
        bullets: [
          `${focus.courseTitle} · ${focus.facultyName}`,
          `groups affected: ${focus.groupNames.join(", ")}`,
          `room released: ${focus.roomName}`,
        ],
        actions: [{ label: "Open the Ripple Effect", to: "/ripple" }],
        meta: "impact model · backend remains the authority",
      };
    }

    if (/(summar|tomorrow|overview|today)/.test(q)) {
      const day = nextTeaching;
      const sessions = data.sessions.filter((s) => s.day === day);
      const rooms = new Set(sessions.map((s) => s.roomId));
      const faculty = new Set(sessions.map((s) => s.facultyId));
      const first = sessions.reduce((min, s) => Math.min(min, s.startPeriod), 99);
      const last = sessions.reduce((max, s) => Math.max(max, s.endPeriod), 0);
      return {
        ...base,
        text: `${DAY_LONG[day]} at a glance — ${plural(sessions.length, "session")} across ${rooms.size} spaces:`,
        bullets: [
          `${faculty.size} faculty teaching, from P${first} to P${last}`,
          `${sessions.filter((s) => s.kind === "lab").length} laboratory blocks, ${sessions.filter((s) => s.kind === "lecture").length} lectures`,
          `${data.bookings.bookings.filter((b) => b.decision.day === day).length} fest-week bookings on the same day`,
        ],
        actions: [{ label: "Open the board on that day", to: "/mosaic" }],
        meta: `derived from ${sessions.length} placements`,
      };
    }

    if (/(conflict|clash|violation)/.test(q)) {
      return {
        ...base,
        text: `The workspace currently reports ${data.dashboard.conflicts.hard} hard violations and a soft penalty of ${data.dashboard.soft.total}.`,
        bullets: [
          ...Object.entries(data.dashboard.soft.breakdown).filter(([, v]) => Number(v) > 0).map(([rule, value]) => `${rule}: ${value} points`),
          ...data.dashboard.risks,
        ],
        actions: [{ label: "Validation report", to: "/reports" }],
        meta: "checked against every rule in the priority order",
      };
    }

    if (/(faculty|teacher|who.*free|staff)/.test(q)) {
      const free = data.faculty.filter((f) => {
        const period = data.sessions.find((s) => s.facultyId === f.id && s.day === nextTeaching);
        return !period;
      });
      return {
        ...base,
        text: `${free.length} of ${data.faculty.length} faculty have no class at all on ${DAY_LONG[nextTeaching]}:`,
        bullets: free.slice(0, 5).map((f) => `${f.name} · ${f.department} · ${f.sessionIds.length} sessions this week`),
        actions: [{ label: "People & availability", to: "/people" }],
        meta: "faculty loads computed from the timetable",
      };
    }

    return {
      ...base,
      text: "I work on the workspace itself, so I answer with things you can open. Try a free lab, a rejected request, an alternative slot, or the impact of moving a class.",
      actions: [
        { label: "Free lab tomorrow", to: "/availability" },
        { label: "Booking decisions", to: "/bookings" },
        { label: "Ripple Effect", to: "/ripple" },
      ],
      meta: "deterministic · no external model required",
    };
  };

  /** Ask the backend for a checked repair. Only for change-shaped questions, and only when live. */
  const askEngine = async (question: string): Promise<Message | null> => {
    if (!source.token || !CHANGE_INTENT.test(question)) return null;
    try {
      const result = (await facultyChangeRequest(source.token, question, user?.facultyId ?? null)) as {
        status?: string;
        summary?: string;
        follow_up?: string;
        valid?: boolean;
        moves?: number;
        proposal_id?: string | null;
        conflicts?: unknown[];
        explanation?: unknown;
        source?: { provider?: string; llm?: string | null };
        missing?: string[];
      };
      const provider = result.source?.llm ?? result.source?.provider ?? "deterministic";
      const bullets: string[] = [];
      if (result.summary) bullets.push(result.summary);
      if (typeof result.moves === "number") bullets.push(`${result.moves} session(s) would move — minimum-move repair`);
      if (result.follow_up) bullets.push(`I need one more detail: ${result.follow_up}`);
      if (Array.isArray(result.conflicts) && result.conflicts.length) {
        bullets.push(`${result.conflicts.length} hard conflict(s) would remain — this cannot be approved as-is`);
      }
      if (result.proposal_id) {
        bullets.push(`Filed as proposal ${result.proposal_id} — it waits for a different admin`);
      }
      const reply: Message = {
        id: `ai-${Date.now()}`,
        role: "ai",
        text:
          result.status === "needs_detail"
            ? "I could not read the whole request yet."
            : result.valid
              ? "The engine checked that change: it is valid, and it is now a pending proposal."
              : "The engine checked that change: it cannot hold without breaking a hard rule.",
        bullets,
        actions: result.proposal_id
          ? [
              { label: "Open the approval queue", to: "/approvals" },
              { label: "Back to the board", to: "/mosaic" },
            ]
          : [{ label: "Open the board", to: "/mosaic" }],
        meta: `engine-checked · provider: ${provider}${ai?.enabled ? ` · ${ai.budget.requests_today}/${ai.daily_limit} calls today` : " · free tier, budget-guarded"}`,
      };
      if (result.proposal_id) {
        notify({
          tone: "valid",
          title: "Proposal filed",
          detail: "A second admin must approve it before the timetable changes.",
        });
        await reload();
      }
      return reply;
    } catch {
      // A provider outage must never look like an answer. Fall through to the deterministic reply,
      // which is labelled as such.
      return null;
    }
  };

  const send = async (question: string) => {
    if (!question.trim()) return;
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: question.trim() }]);
    setInput("");
    setThinking(true);
    const engineReply = await askEngine(question);
    const reply = engineReply ?? (await answer(question));
    window.setTimeout(() => {
      setMessages((current) => [...current, reply]);
      setThinking(false);
    }, 520);
  };

  return (
    <div className="ai-page">
      <div className="ai-shell">
        <header className="ai-top">
          <span className="ai-top-title">
            Grounded in {plural(data.sessions.length, "session")}, {plural(data.rooms.length, "room")} and{" "}
            {plural(data.bookings.bookings.length, "venue request")}
          </span>
          <span className={`ai-status ${ai && !ai.enabled ? "quiet" : ""}`}>
            <i /> {ai?.enabled ? `groq · ${ai.model}` : "deterministic rules"}
          </span>
        </header>

        <div className="ai-thread" ref={scroller}>
          {messages.map((message) => (
            <div key={message.id} className={`ai-turn ${message.role}`}>
              {message.role === "ai" ? (
                <span className="ai-avatar">
                  <TileMark size={17} />
                </span>
              ) : null}

              {message.role === "user" ? (
                <div className="ai-user">{message.text}</div>
              ) : (
                <div className="ai-say">
                  <p>{message.text}</p>
                  {message.bullets?.length ? (
                    <ul>
                      {message.bullets.map((bullet, index) => (
                        <li key={index}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                  {message.actions?.length ? (
                    <div className="ai-chips">
                      {message.actions.slice(0, 3).map((action) => (
                        <button key={action.label} onClick={() => navigate(action.to)}>
                          {action.label} <Icon name="arrowUpRight" size={11} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.meta ? <span className="ai-meta">{message.meta}</span> : null}
                </div>
              )}
            </div>
          ))}

          {thinking ? (
            <div className="ai-turn ai">
              <span className="ai-avatar">
                <TileMark size={17} />
              </span>
              <div className="ai-say">
                <span className="ai-thinking">
                  <TileSpinner size={15} label="Thinking" />
                  Reading the workspace…
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="ai-dock">
          <div className="ai-quick">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} onClick={() => void send(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <form
            className="ai-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a room, a request, or a change…"
              aria-label="Ask TESSERA"
            />
            <button type="submit" className="ai-send" aria-label="Send" disabled={!input.trim()}>
              <Icon name="arrowRight" size={16} />
            </button>
          </form>

          <p className="ai-foot">
            Change requests go to the scheduling engine, which decides validity — the model only reads your
            sentence. Every reply links to the screen where you can check it.
          </p>
        </div>
      </div>
    </div>
  );
}
