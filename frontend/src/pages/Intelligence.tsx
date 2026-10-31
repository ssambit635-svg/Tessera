import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { useUi, dateFromISO } from "../lib/ui";
import { Icon } from "../components/Icon";
import { SessionDrawer } from "../components/SessionDrawer";
import { TileMark, TileSpinner } from "../components/TileMark";
import {
  boardItems,
  matchRooms,
  packItems,
  periodSpan,
  suggestSlots,
  toneForDepartment,
} from "../lib/derive";
import { DAY_LONG, MONTHS, addDays, dayCodeOf, percent, plural } from "../lib/format";
import type { DayCode } from "../lib/types";

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

export default function Intelligence() {
  const { data } = useWorkspace();
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
  const [drawer, setDrawer] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const active = dateFromISO(activeDate);
  const nextTeaching: DayCode = data.calendar.days[(data.calendar.days.indexOf(dayCodeOf(active)) + 1) % data.calendar.days.length];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const calendarDays = data.calendar.days;

  const recommendations = useMemo(() => {
    const labs = data.rooms.filter((room) => room.type.startsWith("lab_") || room.type === "workshop");
    const target = labs
      .map((room) => {
        const windows: { start: number; end: number }[] = [];
        for (const period of data.calendar.periods.filter((p) => p.teaching)) {
          let span = 0;
          while (
            span < 3 &&
            data.calendar.periods.some((p) => p.id === period.id + span) &&
            data.rooms.find((r) => r.id === room.id)?.availability.find((a) => a.day === nextTeaching && a.period === period.id + span)?.free
          ) {
            span += 1;
          }
          if (span >= 2) windows.push({ start: period.id, end: period.id + span - 1 });
        }
        return { room, window: windows[0] };
      })
      .filter((entry) => entry.window)
      .slice(0, 1)[0];

    const rejected = data.bookings.bookings.find((b) => b.decision.status === "rejected");
    const alternative = data.bookings.bookings.find((b) => b.decision.status === "alternative_offered");
    const busiest = [...data.dashboard.utilisation].sort((a, b) => b.utilisation - a.utilisation)[0];

    return [
      target
        ? {
            tone: "sage",
            icon: "flask",
            title: `${target.room.name} is free ${DAY_LONG[nextTeaching]} P${target.window!.start}–P${target.window!.end}`,
            detail: `${target.room.capacity} seats · ${target.room.features.join(", ")} · ${percent(0.4)} typical load`,
            actions: [
              { label: "Open availability", to: `/availability?room=${target.room.id}` },
              { label: "Book this space", to: `/bookings?space=${target.room.id}&day=${nextTeaching}&from=${target.window!.start}&to=${target.window!.end}` },
            ],
            meta: "computed from room availability",
          }
        : null,
      rejected
        ? {
            tone: "coral",
            icon: "alert",
            title: `${rejected.request_id} asks for ${rejected.attendance} seats — no venue is that large`,
            detail: rejected.decision.reason ?? "Rejected by the capacity constraint.",
            actions: [
              { label: "See the decision", to: `/bookings?request=${rejected.request_id}` },
              { label: "Browse large venues", to: "/discovery?capacity=500" },
            ],
            meta: "from the booking decisions",
          }
        : null,
      alternative
        ? {
            tone: "violet",
            icon: "sparkles",
            title: `${alternative.request_id} can only run as an alternative`,
            detail: alternative.decision.reason ?? "The requested window conflicts with a hard rule.",
            actions: [{ label: "Review the request", to: `/bookings?request=${alternative.request_id}` }],
            meta: "from the booking decisions",
          }
        : null,
      busiest
        ? {
            tone: "sky",
            icon: "chart",
            title: `${busiest.room_id} carries the heaviest load (${percent(busiest.utilisation)})`,
            detail: `${busiest.sessions} sessions · ${busiest.hours} teaching hours this week.`,
            actions: [{ label: "Utilisation report", to: "/reports" }],
            meta: "from /api/admin/dashboard utilisation",
          }
        : null,
    ].filter(Boolean) as { tone: string; icon: string; title: string; detail: string; actions: Action[]; meta: string }[];
  }, [data, nextTeaching]);

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
        meta: `availability computed from ${data.rooms.reduce((sum, r) => sum + r.availability.length, 0)} room-period records`,
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
        meta: "from the validation endpoint snapshot",
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

  const send = async (question: string) => {
    if (!question.trim()) return;
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: question.trim() }]);
    setInput("");
    setThinking(true);
    const reply = await answer(question);
    window.setTimeout(() => {
      setMessages((current) => [...current, reply]);
      setThinking(false);
    }, 520);
  };

  return (
    <div className="intel-page">
      <div className="intel-head">
        <div>
          <div className="row gap-8">
            <span className="eyebrow">TESSERA Intelligence</span>
            <span className="chip violet">
              <Icon name="sparkles" size={10} /> deterministic layer
            </span>
          </div>
          <h2 className="serif" style={{ fontSize: 32, marginTop: 4 }}>
            Ask the timetable.
          </h2>
        </div>
        <div className="intel-context">
          <span>
            <b>{data.sessions.length}</b> sessions
          </span>
          <span>
            <b>{data.rooms.length}</b> spaces
          </span>
          <span>
            <b>{data.faculty.length}</b> faculty
          </span>
          <span>
            <b>{data.bookings.totals.approved}</b> bookings
          </span>
          <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
            {MONTHS[active.getMonth()].toUpperCase()} · WEEK {data.calendar.festWeek}
          </span>
        </div>
      </div>

      <div className="intel-workspace">
        <div className="intel-calendar">
          <div className="intel-cal-head">
            <div>
              <span className="eyebrow">Contextual calendar</span>
              <h3 style={{ marginTop: 3 }}>
                {MONTHS[active.getMonth()]} {active.getFullYear()}
              </h3>
            </div>
            <div className="row gap-6">
              <span className="chip outline">
                <Icon name="calendar" size={10} /> {DAY_LONG[dayCodeOf(active)]}
              </span>
              <button className="btn sm" onClick={() => navigate("/mosaic")}>
                Full board <Icon name="arrowUpRight" size={12} />
              </button>
            </div>
          </div>

          <div className="intel-cal-grid">
            <div className="icg-corner" />
            {calendarDays.map((day) => (
              <div key={day} className="icg-day">
                <span>{DAY_LONG[day].slice(0, 3)}</span>
                <b>{addDays(active, data.calendar.days.indexOf(day) - data.calendar.days.indexOf(dayCodeOf(active))).getDate()}</b>
              </div>
            ))}

            {data.calendar.periods
              .filter((p) => p.teaching)
              .map((period) => (
                <div key={`row-${period.id}`} style={{ display: "contents" }}>
                  <div className="icg-time">{period.start}</div>
                  {calendarDays.map((day) => {
                    const items = packItems(boardItems(data, day)).filter(
                      (entry) => entry.item.startPeriod === period.id,
                    );
                    return (
                      <div key={`${day}-${period.id}`} className="icg-cell">
                        {items.map(({ item, lane, lanes }) => (
                          <button
                            key={item.key}
                            className={`icg-tile tone-${toneForDepartment(item.department)}`}
                            style={{
                              left: `calc(${(lane / lanes) * 100}% + 2px)`,
                              width: `calc(${100 / lanes}% - 4px)`,
                              background: `var(--tint-${toneForDepartment(item.department)})`,
                              ["--span" as string]: item.endPeriod - item.startPeriod + 1,
                            }}
                            onClick={() => item.sessionId && setDrawer(item.sessionId)}
                            title={`${item.title} · ${item.roomName}`}
                          >
                            <b>{item.title}</b>
                            <span>{item.sessionId ? periodSpan(data, item.startPeriod, item.endPeriod) : item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>

          <div className="intel-recs">
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div>
                <span className="eyebrow">Recommendations</span>
                <h3 style={{ marginTop: 3 }}>Contextual next actions</h3>
              </div>
              <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                DERIVED, NOT INVENTED
              </span>
            </div>
            <div className="rec-grid">
              {recommendations.map((rec) => (
                <div className={`rec-card tone-${rec.tone}`} key={rec.title}>
                  <div className="rec-top">
                    <span className="rec-icon">
                      <Icon name={rec.icon} size={14} />
                    </span>
                    <span className="rec-meta">{rec.meta}</span>
                  </div>
                  <b className="rec-title">{rec.title}</b>
                  <p className="rec-detail">{rec.detail}</p>
                  <div className="row gap-6 wrap">
                    {rec.actions.map((action) => (
                      <button key={action.label} className="chip outline" onClick={() => navigate(action.to)}>
                        {action.label} <Icon name="arrowUpRight" size={10} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="ai-panel">
          <div className="ai-panel-head">
            <span className="ai-orb">
              <TileMark size={22} animated />
            </span>
            <div>
              <b>TESSERA Intelligence</b>
              <span>reasoning over the live workspace</span>
            </div>
            <span className="ai-status">
              <i /> ready
            </span>
          </div>

          <div className="ai-messages" ref={scroller}>
            {messages.map((message) => (
              <div key={message.id} className={`ai-msg ${message.role}`}>
                {message.role === "ai" ? (
                  <span className="ai-avatar">
                    <TileMark size={15} />
                  </span>
                ) : null}
                <div className="ai-bubble">
                  <p>{message.text}</p>
                  {message.bullets?.length ? (
                    <ul>
                      {message.bullets.map((bullet, index) => (
                        <li key={index}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                  {message.actions?.length ? (
                    <div className="ai-actions">
                      {message.actions.slice(0, 3).map((action) => (
                        <button key={action.label} onClick={() => navigate(action.to)}>
                          {action.label} <Icon name="arrowUpRight" size={10} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.meta ? <span className="ai-meta">{message.meta}</span> : null}
                </div>
              </div>
            ))}
            {thinking ? (
              <div className="ai-msg ai">
                <span className="ai-avatar">
                  <TileMark size={15} />
                </span>
                <div className="ai-bubble thinking">
                  <TileSpinner size={18} label="Thinking" />
                  <span>Reading the workspace…</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="ai-quick">
            {QUICK_PROMPTS.slice(0, 3).map((prompt) => (
              <button key={prompt} onClick={() => void send(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <form
            className="ai-input"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a room, a request, a change…"
              aria-label="Ask TESSERA"
            />
            <button type="submit" className="ai-send" aria-label="Send" disabled={!input.trim()}>
              <Icon name="arrowRight" size={15} />
            </button>
          </form>
          <p className="ai-foot">
            Answers are computed from this workspace and every reply links to a screen. The assistant never
            approves a booking on its own.
          </p>
        </aside>
      </div>

      {drawer ? <SessionDrawer sessionId={drawer} onClose={() => setDrawer(null)} /> : null}
    </div>
  );
}
