import { useMemo, useState } from "react";
import { useWorkspace } from "../lib/workspace";
import { useUi } from "../lib/ui";
import { Icon } from "../components/Icon";
import { ChangePanel } from "../components/ChangePanel";
import { DAY_LONG, plural } from "../lib/format";
import { initials, tintFor } from "../lib/persona";
import { periodSpan, suggestSlots } from "../lib/derive";
import type { DayCode } from "../lib/types";

const WINDOW_START = 2;
const WINDOW_END = 10;

interface Block {
  id: string;
  title: string;
  code: string;
  day: DayCode;
  start: number;
  end: number;
  room: string;
  faculty: string;
  groups: string[];
  role: "origin" | "target" | "affected" | "plain" | "conflict";
}

export default function Ripple() {
  const { data, pending, proposeChange, discardChange } = useWorkspace();
  const { rippleFocus } = useUi();
  const [sessionId, setSessionId] = useState(
    pending?.sessionId ?? rippleFocus ?? data.sessions[0]?.id ?? "",
  );
  const [targetDay, setTargetDay] = useState<DayCode>(pending?.target.day ?? data.calendar.days[1] ?? "TUE");
  const [targetPeriod, setTargetPeriod] = useState<number>(pending?.target.startPeriod ?? 4);

  const session = data.sessions.find((s) => s.id === sessionId) ?? data.sessions[0];
  const days = data.calendar.days;

  const blocks = useMemo<Block[]>(() => {
    if (!session) return [];
    const list: Block[] = [];
    const daySet = new Set(days);
    const visible = (day: DayCode, start: number, end: number) =>
      daySet.has(day) && end >= WINDOW_START && start <= WINDOW_END;

    const push = (b: Omit<Block, "id">) => {
      if (!visible(b.day, b.start, b.end)) return;
      list.push({ ...b, id: `${b.day}-${b.start}-${b.room}-${b.title}` });
    };

    if (!pending) {
      // Context, not a timetable: the chosen session plus everything that shares its room,
      // its teacher or its students — spread across the week rather than one heavy day.
      const connected = data.sessions.filter(
        (s) =>
          s.id === session.id ||
          s.roomId === session.roomId ||
          s.facultyId === session.facultyId ||
          s.groupIds.some((g) => session.groupIds.includes(g)),
      );
      const perDay = new Map<DayCode, number>();
      connected
        .sort((a, b) => Number(b.id === session.id) - Number(a.id === session.id))
        .forEach((s) => {
          const used = perDay.get(s.day) ?? 0;
          if (s.id !== session.id && used >= 6) return;
          perDay.set(s.day, used + 1);
          push({
            title: s.courseTitle,
            code: s.courseId,
            day: s.day,
            start: s.startPeriod,
            end: s.endPeriod,
            room: s.roomName,
            faculty: s.facultyName,
            groups: s.groupNames,
            role: s.id === session.id ? "origin" : "plain",
          });
        });
      return list;
    }

    const { local } = pending;
    const from = local.from;
    const to = local.to;
    const affectedRooms = new Set([from.roomId, to.roomId]);
    const affectedFaculty = new Set([session.facultyId]);
    const affectedGroups = new Set(session.groupIds);

    push({
      title: session.courseTitle,
      code: session.courseId,
      day: from.day,
      start: from.startPeriod,
      end: from.endPeriod,
      room: from.roomName,
      faculty: session.facultyName,
      groups: session.groupNames,
      role: "origin",
    });

    push({
      title: session.courseTitle,
      code: session.courseId,
      day: to.day,
      start: to.startPeriod,
      end: to.endPeriod,
      room: to.roomName,
      faculty: session.facultyName,
      groups: session.groupNames,
      role: local.checks.some((c) => c.status === "fail" && c.id === "room") ? "conflict" : "target",
    });

    data.sessions
      .filter((s) => s.id !== session.id)
      .filter(
        (s) =>
          affectedRooms.has(s.roomId) ||
          affectedFaculty.has(s.facultyId) ||
          s.groupIds.some((g) => affectedGroups.has(g)),
      )
      .forEach((s) =>
        push({
          title: s.courseTitle,
          code: s.courseId,
          day: s.day,
          start: s.startPeriod,
          end: s.endPeriod,
          room: s.roomName,
          faculty: s.facultyName,
          groups: s.groupNames,
          role: "affected",
        }),
      );

    return list;
  }, [data.sessions, days, pending, session]);

  /** Greedy lane packing per day so nothing ever overlaps. */
  const lanesByDay = useMemo(() => {
    const map = new Map<string, { lane: number; lanes: number }>();
    days.forEach((day) => {
      const inDay = blocks
        .filter((block) => block.day === day)
        .sort((a, b) => a.start - b.start || a.end - b.end);
      const lanes: Block[][] = [];
      inDay.forEach((block) => {
        const lane = lanes.find((candidate) =>
          candidate.every((other) => block.start > other.end || block.end < other.start),
        );
        if (lane) lane.push(block);
        else lanes.push([block]);
      });
      lanes.forEach((lane, index) =>
        lane.forEach((block) => map.set(block.id, { lane: index, lanes: lanes.length })),
      );
    });
    return map;
  }, [blocks, days]);

  const colX = (day: DayCode) => ((days.indexOf(day) + 0.5) / days.length) * 100;
  const rowY = (period: number, duration = 1) =>
    ((period - WINDOW_START + duration / 2) / rows) * 100;

  /** The map is only as tall as the data: empty grid rows read as missing information. */
  const lastRow = Math.min(
    WINDOW_END,
    Math.max(blocks.reduce((max, block) => Math.max(max, block.end), WINDOW_START), WINDOW_START + 3),
  );
  const rows = lastRow - WINDOW_START + 1;

  const origin = blocks.find((b) => b.role === "origin");
  const target = blocks.find((b) => b.role === "target" || b.role === "conflict");
  const affected = blocks.filter((b) => b.role === "affected");
  const suggestions = useMemo(() => suggestSlots(data, session?.id ?? "", 3), [data, session?.id]);

  const preview = async () => {
    if (!session) return;
    await proposeChange(session.id, { day: targetDay, startPeriod: targetPeriod });
  };

  return (
    <div className="page ripple-page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Signature interaction</div>
          <h2 className="serif" style={{ fontSize: 38, marginTop: 6 }}>
            Every change sends a ripple.
          </h2>
          <p>
            Move one session and TESSERA traces what else moves with it: the room it leaves, the room it enters,
            the faculty timetable, and every student group in between. The motion is the explanation.
          </p>
        </div>
        <div className="row gap-8">
          {pending ? (
            <button className="btn sm" onClick={discardChange}>
              <Icon name="x" size={13} /> Clear proposal
            </button>
          ) : null}
          <span className={`status ${pending ? pending.local.state : "neutral"}`}>
            <Icon name={pending ? "route" : "info"} size={11} />
            {pending ? "Live proposal" : "No proposal yet"}
          </span>
        </div>
      </div>

      <div className="ripple-grid">
        <div className="ripple-stage">
          <div className="ripple-stage-head">
            <span className="eyebrow" style={{ color: "var(--muted)" }}>
              Impact map
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
              {session?.courseId} · {pending ? "proposed move" : "current placement"}
            </span>
            <span className="spacer" />
            <div className="row gap-6">
              <span className="chip outline">
                <Icon name="calendar" size={10} />
                {days[0]}–{days[days.length - 1]}
              </span>
              <span className="chip outline">P{WINDOW_START + 1}–P{WINDOW_END + 1}</span>
            </div>
          </div>

          <div className="ripple-canvas">
            <svg className="ripple-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {origin && target ? (
                <path
                  d={`M ${colX(origin.day)} ${rowY(origin.start, origin.end - origin.start + 1)} C ${colX(origin.day) + 6} ${rowY(origin.start)}, ${colX(target.day) - 6} ${rowY(target.start)}, ${colX(target.day)} ${rowY(target.start, target.end - target.start + 1)}`}
                  className={target.role === "target" ? "hot" : undefined}
                />
              ) : null}
              {target
                ? affected.map((block) => (
                    <path
                      key={`line-${block.id}`}
                      d={`M ${colX(target.day)} ${rowY(target.start, target.end - target.start + 1)} Q ${(colX(target.day) + colX(block.day)) / 2} ${(rowY(target.start) + rowY(block.start)) / 2 - 4}, ${colX(block.day)} ${rowY(block.start, block.end - block.start + 1)}`}
                    />
                  ))
                : null}
            </svg>

            <div className="ripple-columns" style={{ "--cols": days.length } as React.CSSProperties}>
              {days.map((day) => (
                <div className="ripple-col" key={day}>
                  <div className="ripple-col-head">
                    <b>{DAY_LONG[day].slice(0, 3)}</b>
                    <span>{blocks.filter((b) => b.day === day).length}</span>
                  </div>
                  <div style={{ position: "relative", height: rows * 52 }}>
                    {blocks
                      .filter((block) => block.day === day)
                      .map((block) => (
                        <div
                          key={block.id}
                          className={`ripple-slot ${block.role}`}
                          style={{
                            position: "absolute",
                            top: (block.start - WINDOW_START) * 52 + 2,
                            height: (block.end - block.start + 1) * 52 - 4,
                            left: `calc(${((lanesByDay.get(block.id)?.lane ?? 0) / (lanesByDay.get(block.id)?.lanes ?? 1)) * 100}% + 2px)`,
                            width: `calc(${100 / (lanesByDay.get(block.id)?.lanes ?? 1)}% - 4px)`,
                            background:
                              block.role === "plain" ? "var(--ivory)" : undefined,
                            borderStyle: block.role === "plain" ? "solid" : undefined,
                          }}
                          title={`${block.title} · ${block.room}`}
                        >
                          <span className="rs-code">{block.code}</span>
                          <span className="rs-title">{block.title}</span>
                          <span className="rs-time">
                            {block.start}–{block.end} · {block.room}
                          </span>
                        </div>
                      ))}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: "linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
                        backgroundSize: "100% 52px",
                        pointerEvents: "none",
                        opacity: 0.6,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ripple-legend">
            <span>
              <i style={{ background: "transparent", border: "1.5px dashed rgba(25,26,28,.35)" }} /> original slot
            </span>
            <span>
              <i style={{ background: "rgba(191,226,209,.7)" }} /> proposed slot
            </span>
            <span>
              <i style={{ background: "rgba(207,194,245,.7)" }} /> connected session
            </span>
            <span>
              <i style={{ background: "rgba(241,107,85,.4)" }} /> conflict at target
            </span>
            <span className="spacer" />
            <span>{plural(affected.length, "dependent session")}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {pending ? (
            <ChangePanel />
          ) : (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">Propose a change</div>
                  <h3 style={{ marginTop: 3 }}>Choose a session and a target slot</h3>
                </div>
              </div>
              <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="field">
                  <label htmlFor="ripple-session">Session</label>
                  <select
                    id="ripple-session"
                    className="select"
                    value={sessionId}
                    onChange={(event) => setSessionId(event.target.value)}
                  >
                    {data.sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.courseId} · {s.courseTitle} — {DAY_LONG[s.day].slice(0, 3)} P{s.startPeriod} · {s.roomId}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row gap-8">
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="ripple-day">Day</label>
                    <select
                      id="ripple-day"
                      className="select"
                      value={targetDay}
                      onChange={(event) => setTargetDay(event.target.value as DayCode)}
                    >
                      {days.map((day) => (
                        <option key={day} value={day}>
                          {DAY_LONG[day]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="ripple-period">Start period</label>
                    <select
                      id="ripple-period"
                      className="select"
                      value={targetPeriod}
                      onChange={(event) => setTargetPeriod(Number(event.target.value))}
                    >
                      {data.calendar.periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          P{period.id} · {period.start}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button className="btn primary" onClick={() => void preview()}>
                  <Icon name="route" size={14} /> Preview the ripple
                </button>
                <div className="callout violet" style={{ fontSize: 11 }}>
                  <Icon name="sparkles" size={13} />
                  <span>
                    <b>Validated alternatives.</b>{" "}
                    {suggestions.length
                      ? suggestions
                          .map((s) => `${DAY_LONG[s.target.day].slice(0, 3)} P${s.target.startPeriod}`)
                          .join(" · ")
                      : "No clean slot was found in this week."}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Connections</div>
                <h3 style={{ marginTop: 3 }}>What this session touches</h3>
              </div>
            </div>
            <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {session ? (
                <>
                  <div className="row gap-10">
                    <span className={`avatar tone-${tintFor(session.facultyId)}`}><Icon name="user" size={13} /></span>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <b style={{ fontFamily: "var(--font-display)", fontSize: 12.5, fontWeight: 500 }}>
                        {session.facultyName}
                      </b>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                        {session.facultyId} · {session.department}
                      </span>
                    </div>
                    <span className="chip outline" style={{ marginLeft: "auto" }}>
                      faculty
                    </span>
                  </div>

                  <div>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>
                      Student groups
                    </div>
                    <div className="row gap-6 wrap">
                      {session.groupIds.map((id, index) => (
                        <span key={id} className={`person-chip ${pending ? "hot" : ""}`}>
                          <span className={`avatar sm tone-${tintFor(id)}`}>
                            {initials(session.groupNames[index] ?? id)}
                          </span>
                          {session.groupNames[index] ?? id}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>
                      Spaces
                    </div>
                    <div className="row gap-6 wrap">
                      <span className="person-chip">
                        <Icon name="pin" size={12} /> {session.roomName}
                      </span>
                      {pending && pending.target.roomId !== session.roomId ? (
                        <span className="person-chip hot">
                          <Icon name="pin" size={12} />{" "}
                          {data.rooms.find((r) => r.id === pending.target.roomId)?.name ?? pending.target.roomId}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="divider" />

                  <div className="row-between">
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                      {periodSpan(data, session.startPeriod, session.endPeriod)} · {session.day}
                    </span>
                    <span className="chip outline">{plural(affected.length + 1, "session")} in the ripple</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="callout" style={{ fontSize: 11 }}>
            <Icon name="shield" size={14} />
            <span>
              <b>Where the verdict comes from.</b> The browser previews the rules instantly; the scheduling
              authority still decides. Approving here only applies a change the API has already accepted — and a
              second admin is always required.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
