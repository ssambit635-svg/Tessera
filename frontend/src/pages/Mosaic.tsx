import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { useUi, dateFromISO } from "../lib/ui";
import { Icon } from "./../components/Icon";
import { EventPopover } from "../components/EventPopover";
import { SessionDrawer } from "../components/SessionDrawer";
import { ChangePanel } from "../components/ChangePanel";
import {
  boardItems,
  departmentStats,
  examPeriods,
  packItems,
  periodSpan,
  validateMove,
  type BoardItem,
  type MoveValidation,
  type Tone,
} from "../lib/derive";
import {
  DAY_LONG,
  MONTHS,
  addDays,
  dayCodeOf,
  isoDate,
  monthMatrix,
  startOfWeek,
} from "../lib/format";
import { initials, roomImage, tintFor } from "../lib/persona";
import type { DayCode } from "../lib/types";
import type { Layers } from "../lib/workspace";

/** A layer hides exactly the items it names - no toggle is decorative. */
function layerOn(layers: Layers, item: BoardItem): boolean {
  if (item.kind === "session") return layers.classes;
  if (item.kind === "booking") return layers.events;
  if (item.kind === "exam") return layers.exams;
  return true;
}

type View = "week" | "month" | "day";
type Perspective = "days" | "rooms" | "faculty" | "groups" | "departments";

const ROW_H = 72;
/** Beyond four lanes a column stops being readable; the rest is filed into a ribbon. */
const MAX_LANES = 4;

/** How many concurrent sessions a column shows before it starts filing them.
 *  Week view splits the canvas five ways, so two lanes keep every title readable;
 *  day and room views have room for more. */
function laneBudget(view: View): number {
  // Week view is the agenda: one session per slot, the rest counted in the ribbon.
  // Day, room and faculty views are the working views and open up to four lanes.
  if (view === "week") return 1;
  return MAX_LANES;
}
const RIBBON_W = 26;

interface Column {
  key: string;
  label: string;
  sub: string;
  count: number;
  dayCode?: DayCode;
  roomId?: string;
  tone?: Tone;
  closed?: boolean;
}

interface DragState {
  sessionId: string;
  item: BoardItem;
  over: { colKey: string; period: number } | null;
  preview: MoveValidation | null;
}

/** Phone widths need wider columns: a "+N more" ribbon takes 35px out of every lane, and an
 *  86px tile cannot hold "Communicative English" without breaking the word apart. */
function useNarrowViewport(query = "(max-width: 720px)"): boolean {
  const supported = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [narrow, setNarrow] = useState(() => (supported ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(query);
    const onChange = () => setNarrow(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query, supported]);

  return narrow;
}

function Tile({
  item,
  lane,
  lanes,
  onOpen,
  onDragStart,
  dragging,
  photo,
  dimmed,
  time,
  reserve = 0,
}: {
  item: BoardItem;
  lane: number;
  lanes: number;
  onOpen: (event: React.MouseEvent) => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  dragging?: boolean;
  photo?: string;
  dimmed?: boolean;
  time: string;
  /** Pixels kept clear on the right for the "+N more" ribbon. */
  reserve?: number;
}) {
  const top = (item.startPeriod - 1) * ROW_H + 3;
  const height = (item.endPeriod - item.startPeriod + 1) * ROW_H - 6;
  const share = 1 / lanes;
  const showMeta = height > 150;
  const showPhoto = Boolean(photo) && height > 240;
  /* A one-period tile is 66px tall: the code and who teaches it share one line, so the
     title gets the full two lines it needs instead of being squeezed into 1.4. */
  const compact = height <= 92;
  const avatars = (
    <span className={`tile-avatars ${compact ? "compact" : ""}`}>
      {item.facultyName ? (
        <span className={`avatar tone-${tintFor(item.facultyName)}`} title={item.facultyName}>
          {initials(item.facultyName)}
        </span>
      ) : (
        <span className={`avatar tone-sand`} title={item.subtitle}>
          {initials(item.subtitle)}
        </span>
      )}
      {item.groupIds.slice(0, height > 100 ? 2 : 0).map((group, index) => (
        <span key={group} className={`avatar tone-${tintFor(group)}`} title={item.groupNames[index]}>
          {initials(item.groupNames[index] ?? group)}
        </span>
      ))}
    </span>
  );

  return (
    <button
      type="button"
      className={`tile tone-${item.tone} ${compact ? "is-compact" : ""} ${item.kind === "booking" ? "kind-booking" : ""} ${item.kind === "exam" ? "kind-exam" : ""} ${item.department ? `dept-${item.department}` : ""} ${dragging ? "is-dragging" : ""} ${dimmed ? "is-muted" : ""}`}
      style={{
        top,
        height,
        left: `calc((100% - ${reserve}px) * ${lane * share} + 3px)`,
        width: `calc((100% - ${reserve}px) * ${share} - 6px)`,
      }}
      onClick={onOpen}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      aria-label={`${item.title}, ${item.day} P${item.startPeriod} to P${item.endPeriod}, ${item.roomName}`}
    >
      {compact ? (
        <span className="tile-head">
          <span className="tile-code">
            {item.courseId ?? item.subtitle}
            <span className="tile-dot" aria-hidden="true" />
          </span>
          {avatars}
        </span>
      ) : (
        <span className="tile-code">
          {item.courseId ?? item.subtitle}
          <span className="tile-dot" aria-hidden="true" />
        </span>
      )}
      <span className="tile-title">{item.title}</span>
      {compact ? null : (
        <>
          <span className="tile-time">{time}</span>
          {showMeta ? (
            <span className="tile-meta">
              {item.kind === "booking" ? item.subtitle : `${item.roomId} · ${item.groupNames[0] ?? ""}`}
            </span>
          ) : null}
          <span className="tile-foot">
            {avatars}
            <span className="tile-status" title="Validated · no hard conflicts" />
          </span>
        </>
      )}
      {showPhoto ? (
        <span className="tile-photo">
          <img src={photo} alt="" loading="lazy" />
        </span>
      ) : null}
    </button>
  );
}

/** Everything past the readable lanes, filed by the period it starts in.
 *  One ribbon per start period keeps the count honest: "+5" means five sessions
 *  begin at 09:00 and did not fit, not "five sessions somewhere below". */
function groupOverflow(
  overflow: { item: BoardItem; lane: number; lanes: number }[],
  _lanes: number,
): { startPeriod: number; endPeriod: number; items: BoardItem[] }[] {
  const byStart = new Map<number, { startPeriod: number; endPeriod: number; items: BoardItem[] }>();
  overflow.forEach(({ item }) => {
    const group = byStart.get(item.startPeriod) ?? {
      startPeriod: item.startPeriod,
      endPeriod: item.endPeriod,
      items: [],
    };
    group.items.push(item);
    group.endPeriod = Math.max(group.endPeriod, item.endPeriod);
    byStart.set(item.startPeriod, group);
  });
  return [...byStart.values()].sort((a, b) => a.startPeriod - b.startPeriod);
}

export default function Mosaic() {
  const { data, layers, toggleLayer, pending, proposeChange, notify } = useWorkspace();
  const { activeDate, setActiveDate, selectedSession, openSession } = useUi();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("week");
  const [perspective, setPerspective] = useState<Perspective>("days");
  const [dept, setDept] = useState("all");
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [popover, setPopover] = useState<{ item: BoardItem; x: number; y: number } | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  /** A day column with more concurrent sessions than can be read is filed into one stack. */
  const [stack, setStack] = useState<{ title: string; items: BoardItem[]; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const narrow = useNarrowViewport();
  const active = dateFromISO(activeDate);
  const activeDay = dayCodeOf(active);
  const weekStart = startOfWeek(active);

  const periods = data.calendar.periods;

  useEffect(() => {
    if (selectedSession) {
      setDrawer(selectedSession);
      openSession(null);
    }
  }, [selectedSession, openSession]);

  useEffect(() => {
    setPopover(null);
  }, [view, perspective]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  // The strip is the grid's own header, so it lists exactly the days the grid draws.
  const teachingWeekDates = useMemo(
    () => weekDates.filter((date) => data.calendar.days.includes(dayCodeOf(date))),
    [data.calendar.days, weekDates],
  );

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.sessions.filter((session) => {
      if (dept !== "all" && session.department !== dept) return false;
      if (!q) return true;
      return `${session.courseTitle} ${session.courseId} ${session.facultyName} ${session.roomName} ${session.groupNames.join(" ")}`
        .toLowerCase()
        .includes(q);
    });
  }, [data.sessions, dept, query]);

  const columns: Column[] = useMemo(() => {
    if (view === "day") {
      const roomIds = [...new Set(data.sessions.filter((s) => s.day === activeDay).map((s) => s.roomId))];
      const rooms = data.rooms
        .filter((room) => roomIds.includes(room.id) || room.id === "AUD")
        .sort((a, b) => a.name.localeCompare(b.name));
      return rooms.map((room) => ({
        key: room.id,
        label: room.name.replace(/^(Classroom|Lecture Hall) /, "$1 "),
        sub: room.id,
        roomId: room.id,
        count: filteredSessions.filter((s) => s.roomId === room.id && s.day === activeDay).length,
      }));
    }

    if (perspective === "days") {
      const byDay = new Map<DayCode, number>();
      filteredSessions.forEach((s) => byDay.set(s.day, (byDay.get(s.day) ?? 0) + 1));
      // Weekend columns would be 470px of "no teaching"; the calendar strip above still
      // shows all seven dates, the grid only spends width on days that hold sessions.
      return weekDates.filter((date) => data.calendar.days.includes(dayCodeOf(date))).map((date) => {
        const code = dayCodeOf(date);
        return {
          key: code,
          label: DAY_LONG[code],
          sub: `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`,
          dayCode: code,
          count: byDay.get(code) ?? 0,
          closed: false,
        };
      });
    }

    if (perspective === "rooms") {
      return data.rooms.map((room) => ({
        key: room.id,
        label: room.name,
        sub: room.id,
        roomId: room.id,
        count: filteredSessions.filter((s) => s.roomId === room.id).length,
      }));
    }

    if (perspective === "faculty") {
      return data.faculty
        .filter((f) => (dept === "all" ? true : f.department === dept))
        .map((f) => ({
          key: f.id,
          label: f.name,
          sub: f.department,
          count: filteredSessions.filter((s) => s.facultyId === f.id).length,
        }));
    }

    if (perspective === "groups") {
      return data.groups.map((g) => ({
        key: g.id,
        label: g.name,
        sub: g.id,
        count: filteredSessions.filter((s) => s.groupIds.includes(g.id)).length,
      }));
    }

    return departmentStats(data).map((d) => ({
      key: d.code,
      label: d.code,
      sub: `${d.courses} courses`,
      tone: d.tone,
      count: filteredSessions.filter((s) => s.department === d.code).length,
    }));
  }, [activeDay, data, dept, filteredSessions, perspective, view, weekDates]);

  const itemsByColumn = useMemo(() => {
    const map = new Map<string, BoardItem[]>();
    columns.forEach((column) => map.set(column.key, []));

    const dates = data.calendar.days;
    const push = (columnKey: string, item: BoardItem) => {
      const list = map.get(columnKey);
      if (list) list.push(item);
    };

    if (view === "day") {
      boardItems(data, activeDay).forEach((item) => {
        if (!layerOn(layers, item)) return;
        if (dept !== "all" && item.department !== dept) return;
        const q = query.trim().toLowerCase();
        if (q && !`${item.title} ${item.subtitle} ${item.roomName}`.toLowerCase().includes(q)) return;
        push(item.roomId, item);
      });
      return map;
    }

    if (perspective === "days") {
      dates.forEach((day) => {
        boardItems(data, day).forEach((item) => {
          if (!layerOn(layers, item)) return;
          const session = item.sessionId ? data.sessions.find((s) => s.id === item.sessionId) : null;
          if (dept !== "all" && session && session.department !== dept) return;
          const q = query.trim().toLowerCase();
          if (
            q &&
            !`${item.title} ${item.subtitle} ${item.facultyName ?? ""} ${item.roomName}`.toLowerCase().includes(q)
          )
            return;
          push(day, item);
        });
      });
      // weekend columns stay empty on purpose
      return map;
    }

    filteredSessions.forEach((session) => {
      if (!layers.classes) return;
      const item = boardItems(data, session.day).find((b) => b.key === session.id);
      if (!item) return;
      if (perspective === "rooms") push(session.roomId, item);
      if (perspective === "faculty") push(session.facultyId, item);
      if (perspective === "groups") session.groupIds.forEach((g) => push(g, item));
      if (perspective === "departments") push(session.department, item);
    });

    if (perspective === "rooms" && layers.exams) {
      data.exams.forEach((exam) => {
        if (!exam.rooms.length) return;
        const span = examPeriods(data, exam.slot);
        if (!span) return;
        exam.rooms.forEach((roomId) => {
          const list = map.get(roomId);
          if (!list) return;
          list.push({
            key: `exam-${exam.id}-${roomId}`,
            courseId: exam.courseIds[0],
            kind: "exam",
            title: exam.courseIds.join(" + "),
            subtitle: "Midsem examination",
            day: exam.day,
            startPeriod: span.start,
            endPeriod: span.end,
            roomId,
            roomName: data.rooms.find((r) => r.id === roomId)?.name ?? roomId,
            groupIds: exam.groupIds,
            groupNames: exam.groupNames,
            tone: "violet",
            size: exam.size,
          });
        });
      });
    }

    if (perspective === "rooms" && layers.events) {
      data.bookings.bookings.forEach((booking) => {
        const decision = booking.decision;
        if (!decision?.room_id || decision.status === "rejected") return;
        const list = data.bookings.bookings.length ? map.get(decision.room_id) : null;
        if (!list) return;
        const item = boardItems(data, decision.day ?? "MON").find((b) => b.bookingId === booking.request_id);
        if (item) list.push(item);
      });
    }

    return map;
  }, [activeDay, columns, data, dept, filteredSessions, layers, perspective, query, view]);

  const shift = (direction: number) => {
    if (view === "month") {
      const next = new Date(active.getFullYear(), active.getMonth() + direction, 1);
      setActiveDate(next);
    } else if (view === "week") {
      setActiveDate(addDays(active, direction * 7));
    } else {
      setActiveDate(addDays(active, direction));
    }
  };

  const totalHeight = periods.length * ROW_H;
  const gridStyle = {
    "--cols": columns.length,
    "--col-min": narrow ? "184px" : perspective === "days" || view === "day" ? "128px" : "176px",
    "--row-h": `${ROW_H}px`,
  } as CSSProperties;

  const onCellDragOver = (column: Column, period: number, event: DragEvent<HTMLDivElement>) => {
    if (!drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const key = `${column.key}-${period}`;
    if (drag.over && `${drag.over.colKey}-${drag.over.period}` === key) return;
    const target = targetFor(column, period, drag.item);
    if (!target) {
      setDrag({ ...drag, over: { colKey: column.key, period }, preview: null });
      return;
    }
    const preview = validateMove(data, drag.sessionId, target);
    setDrag({ ...drag, over: { colKey: column.key, period }, preview });
  };

  const targetFor = (column: Column, period: number, item: BoardItem): { day: DayCode; startPeriod: number; roomId?: string } | null => {
    if (!item.sessionId) return null;
    if (view === "day") return { day: activeDay, startPeriod: period, roomId: column.roomId };
    if (perspective === "days") return { day: column.dayCode ?? "MON", startPeriod: period };
    if (perspective === "rooms") return { day: activeDay, startPeriod: period, roomId: column.roomId };
    return null;
  };

  const onDrop = async (column: Column, period: number) => {
    if (!drag) return;
    const target = targetFor(column, period, drag.item);
    setDrag(null);
    if (!target) {
      notify({
        tone: "warn",
        title: "This lane is for reading, not moving",
        detail: "Switch to the Days or Rooms perspective to reschedule a session.",
      });
      return;
    }
    setPopover(null);
    await proposeChange(drag.sessionId, target);
  };

  const canDrag = view === "day" || perspective === "days" || perspective === "rooms";

  return (
    <div className="mosaic-page">
      <div className="board-topbar">
        <div className="board-title">
          <h2>
            {MONTHS[active.getMonth()]}, {active.getFullYear()}
          </h2>
          <span className="academic-period">
            {data.calendar.festWeek ?? "Teaching week"} · {data.calendar.days.length}-day week
          </span>
        </div>

        <div className="board-tools">
          <div className="seg" role="tablist" aria-label="Board range">
            {(["month", "week", "day"] as View[]).map((option) => (
              <button key={option} className={view === option ? "on" : ""} onClick={() => setView(option)} role="tab" aria-selected={view === option}>
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
          <div className="date-nav">
            <button onClick={() => shift(-1)} aria-label="Previous period">
              <Icon name="chevronLeft" size={14} />
            </button>
            <button
              className="today"
              onClick={() => setActiveDate(new Date())}
              aria-label="Jump to today"
            >
              Today
            </button>
            <button onClick={() => shift(1)} aria-label="Next period">
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
          <button className="btn sm" onClick={() => navigate("/ripple")}>
            <Icon name="route" size={13} /> Ripple
          </button>
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid
          month={active}
          onPick={(date) => {
            setActiveDate(date);
            setView("week");
          }}
          activeIso={isoDate(active)}
        />
      ) : (
        <>
          {view === "week" ? (
            <div className="board-subhead">
              <div
                className="day-strip"
                style={{ "--day-count": teachingWeekDates.length } as CSSProperties}
              >
                <div className="day-strip-gutter">
                  <button aria-label="Open date picker" onClick={() => setView("month")} title="Month view">
                    <Icon name="calendar" size={17} />
                  </button>
                </div>
                {teachingWeekDates.map((date) => {
                  const code = dayCodeOf(date);
                  const iso = isoDate(date);
                  const count = data.sessions.filter((s) => s.day === code).length;
                  return (
                    <button
                      key={iso}
                      className={[
                        "day-pill",
                        iso === activeDate ? "on" : "",
                        iso === isoDate(new Date()) ? "today" : "",
                        !data.calendar.days.includes(code) ? "closed" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setActiveDate(date)}
                      aria-pressed={iso === activeDate}
                    >
                      <span className="dow">{DAY_LONG[code]}</span>
                      <span className="dom">{String(date.getDate()).padStart(2, "0")}</span>
                      {count ? <span className="day-count">{count}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="board-controls">
            <label className="control-select">
              <span className="cs-label">Lanes</span>
              <select
                value={view === "day" ? "rooms" : perspective}
                onChange={(event) => setPerspective(event.target.value as Perspective)}
                aria-label="Board perspective"
                style={{ border: 0, background: "transparent", font: "inherit", color: "inherit", outline: "none" }}
                disabled={view === "day"}
              >
                <option value="days">Days</option>
                <option value="rooms">Rooms</option>
                <option value="faculty">Faculty</option>
                <option value="groups">Groups</option>
                <option value="departments">Departments</option>
              </select>
              <Icon name="chevronDown" size={11} />
            </label>

            <label className="control-select">
              <span className="cs-label">Dept</span>
              <select
                value={dept}
                onChange={(event) => setDept(event.target.value)}
                aria-label="Department filter"
                style={{ border: 0, background: "transparent", font: "inherit", color: "inherit", outline: "none" }}
              >
                <option value="all">All departments</option>
                {departmentStats(data).map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={11} />
            </label>

            {/* The same four layers the rail lists — real toggles, not a status readout. */}
            <div className="board-layers" role="group" aria-label="Calendar layers">
              {(
                [
                  ["classes", "Classes"],
                  ["exams", "Exams"],
                  ["events", "Bookings"],
                  ["maintenance", "Closures"],
                ] as [keyof Layers, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`chip ${layers[key] ? "on" : "outline"}`}
                  style={{ height: 26 }}
                  aria-pressed={layers[key]}
                  onClick={() => toggleLayer(key)}
                  title={`${layers[key] ? "Hide" : "Show"} ${label.toLowerCase()}`}
                >
                  <Icon name={layers[key] ? "check" : "layers"} size={11} />
                  {label}
                </button>
              ))}
            </div>

            {!canDrag ? (
              <span className="chip sand" style={{ height: 26 }}>
                <Icon name="info" size={11} /> Drag is available in Days / Rooms
              </span>
            ) : (
              <span className="chip outline" style={{ height: 26 }}>
                <Icon name="route" size={11} /> Drag a session to preview a change
              </span>
            )}

            <div className="board-search">
              <Icon name="search" size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter this board…"
                aria-label="Filter the board"
              />
            </div>
          </div>

          <div className="board-scroll" ref={scrollRef}>
            <div className="board-grid" style={gridStyle}>
              <div className="board-head-cell corner">
                <Icon name="clock" size={13} />
              </div>
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={`board-head-cell ${column.dayCode && column.dayCode === activeDay ? "active-col" : ""}`}
                  title={`${column.label}${column.sub ? ` · ${column.sub}` : ""}`}
                >
                  <span className="truncate">{column.label}</span>
                  <span className="bh-sub">{column.count}</span>
                </div>
              ))}

              <div className="time-gutter">
                {periods.map((period) => (
                  <div key={period.id} className="time-cell">
                    {period.start}
                    {period.id === data.calendar.lunchAfterPeriod ? <span className="lunch-tag">LUNCH</span> : null}
                  </div>
                ))}
              </div>

              {columns.map((column) => {
                const raw = packItems(itemsByColumn.get(column.key) ?? []);
                // Nine sessions can share an hour. Three lanes stay readable; the rest is
                // filed into one honest "+N" stack you can open.
                const widest = raw.reduce((max, entry) => Math.max(max, entry.lanes), 1);
                const lanes = Math.min(widest, laneBudget(view));
                const visible = raw.filter((entry) => entry.lane < lanes);
                const hidden = raw.filter((entry) => entry.lane >= lanes);
                const packed = visible.map((entry) => ({ ...entry, lanes }));
                const stacks = groupOverflow(hidden, lanes);
                const closed = column.closed || (view === "day" && !data.calendar.days.includes(activeDay));
                return (
                  <div
                    key={column.key}
                    className={`board-col ${closed ? "weekend" : ""}`}
                    style={{ height: totalHeight }}
                    data-column={column.key}
                  >
                    {closed ? <span className="weekend-mark">No teaching</span> : null}

                    {packed.map(({ item, lane, lanes }) => (
                      <Tile
                        key={item.key}
                        item={item}
                        lane={lane}
                        lanes={lanes}
                        time={periodSpan(data, item.startPeriod, item.endPeriod)}
                        reserve={stacks.length ? RIBBON_W + 9 : 0}
                        dragging={drag?.sessionId === item.sessionId}
                        photo={
                          item.kind === "booking"
                            ? roomImage(item.roomId, data.rooms.find((r) => r.id === item.roomId)?.type ?? "classroom")
                            : undefined
                        }
                        onOpen={(event) => {
                          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                          setPopover({ item, x: rect.right - 10, y: rect.top });
                        }}
                        onDragStart={
                          canDrag && item.sessionId
                            ? (event) => {
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", item.sessionId ?? "");
                                setDrag({ sessionId: item.sessionId!, item, over: null, preview: null });
                                setPopover(null);
                              }
                            : undefined
                        }
                      />
                    ))}

                    {perspective === "rooms" && layers.maintenance
                      ? data.maintenance
                          .filter((cell) => cell.room_id === column.key)
                          .map((cell) => (
                            <div
                              key={`maint-${cell.room_id}-${cell.day}-${cell.period}`}
                              className="maint-marker"
                              style={{ top: (cell.period - 1) * ROW_H + 4, height: ROW_H - 8 }}
                              title={`${column.label} is closed ${cell.day} P${cell.period} (declared unavailable)`}
                            >
                              <Icon name="lock" size={10} />
                              <span>closed</span>
                            </div>
                          ))
                      : null}

                    {stacks.map((group) => (
                      <button
                        key={`stack-${group.startPeriod}-${group.items[0]?.key ?? ""}`}
                        className="tile tile-stack"
                        style={{
                          top: (group.startPeriod - 1) * ROW_H + 3,
                          height: (group.endPeriod - group.startPeriod + 1) * ROW_H - 6,
                          right: 3,
                          width: RIBBON_W,
                        }}
                        onClick={(event) => {
                          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                          setStack({
                            title: `${column.label} · ${group.items.length} more`,
                            items: group.items,
                            x: rect.right,
                            y: rect.top,
                          });
                        }}
                        aria-label={`${group.items.length} more sessions on ${column.label}`}
                      >
                        <span className="stack-count">+{group.items.length}</span>
                        <span className="stack-label">more</span>
                      </button>
                    ))}

                    {drag ? (
                      <div
                        className="drop-layer"
                        style={{ gridTemplateRows: `repeat(${periods.length}, ${ROW_H}px)` }}
                      >
                        {periods.map((period) => {
                          const isOver =
                            drag.over?.colKey === column.key && drag.over?.period === period.id;
                          const state = isOver ? drag.preview?.state : undefined;
                          return (
                            <div
                              key={period.id}
                              className={`drop-cell ${state ? `hot-${state}` : ""}`}
                              onDragOver={(event) => onCellDragOver(column, period.id, event)}
                              onDragLeave={() => {
                                if (isOver && drag) setDrag({ ...drag, over: null, preview: null });
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                void onDrop(column, period.id);
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : null}

                    {drag?.over?.colKey === column.key && drag.preview ? (
                      <div
                        className={`drag-ghost ${drag.preview.state}`}
                        style={{
                          top: (drag.over.period - 1) * ROW_H + 3,
                          height: (drag.item.endPeriod - drag.item.startPeriod + 1) * ROW_H - 6,
                          left: 3,
                          right: 3,
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 11 }}>
                          {drag.item.title}
                        </span>
                        <span className="ghost-state">
                          <Icon
                            name={drag.preview.state === "invalid" ? "x" : drag.preview.state === "warning" ? "alert" : "check"}
                            size={10}
                            strokeWidth={2.4}
                          />
                          {drag.preview.state === "valid"
                            ? "All checks pass"
                            : drag.preview.state === "warning"
                              ? "Warnings"
                              : "Blocked"}
                        </span>
                      </div>
                    ) : null}

                    {!drag && column.count === 0 && !closed ? (
                      <div
                        className="tile add-slot"
                        style={{ top: 3 * ROW_H + 4, height: ROW_H - 8, left: 4, width: "calc(100% - 8px)" }}
                        onClick={() =>
                          notify({
                            tone: "info",
                            title: "Nothing scheduled in this lane",
                            detail: "Use Bookings to request a resource, or drag a session here.",
                          })
                        }
                        role="button"
                        tabIndex={0}
                      >
                        <Icon name="plus" size={14} /> Free
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="row gap-10 wrap" style={{ padding: "0 2px" }}>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: "0.06em" }}>
              {data.sessions.length} SESSIONS · {data.rooms.length} SPACES · {data.faculty.length} FACULTY ·{" "}
              {data.dashboard.conflicts.hard} HARD CONFLICTS
            </span>
            <span className="spacer" />
            {pending ? (
              <span className={`status ${pending.local.state}`}>
                <Icon name="route" size={11} /> Proposal awaiting review
              </span>
            ) : (
              <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                {data.calendar.labStartPeriods.length} lab starts · lunch after P{data.calendar.lunchAfterPeriod}
              </span>
            )}
          </div>
        </>
      )}

      {stack ? (
        <>
          <div className="scrim soft" onClick={() => setStack(null)} />
          <div className="stack-popover" style={{ left: Math.min(stack.x - 300, window.innerWidth - 320), top: stack.y }}>
            <div className="sp-head">
              <b>{stack.title}</b>
              <button className="icon-square sm" onClick={() => setStack(null)} aria-label="Close">
                <Icon name="x" size={12} />
              </button>
            </div>
            <ul>
              {stack.items.map((entry) => (
                <li key={entry.key}>
                  <button
                    onClick={() => {
                      setStack(null);
                      if (entry.sessionId) setDrawer(entry.sessionId);
                    }}
                  >
                    <span className={`sp-swatch tone-${entry.tone}`} />
                    <span className="sp-body">
                      <b>{entry.title}</b>
                      <span>
                        {periodSpan(data, entry.startPeriod, entry.endPeriod)} · {entry.roomId}
                        {entry.facultyName ? ` · ${entry.facultyName}` : ""}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {popover ? (
        <EventPopover
          item={popover.item}
          anchor={{ x: popover.x, y: popover.y }}
          onClose={() => setPopover(null)}
          onDetails={() => {
            if (popover.item.sessionId) {
              setDrawer(popover.item.sessionId);
              setPopover(null);
            } else {
              navigate(`/bookings?request=${popover.item.bookingId ?? ""}`);
              setPopover(null);
            }
          }}
        />
      ) : null}

      {drawer ? <SessionDrawer sessionId={drawer} onClose={() => setDrawer(null)} /> : null}

      {pending ? (
        <div style={{ position: "fixed", right: 24, bottom: 24, width: 372, zIndex: 80 }}>
          <ChangePanel compact />
        </div>
      ) : null}
    </div>
  );
}

function MonthGrid({
  month,
  onPick,
  activeIso,
}: {
  month: Date;
  onPick: (date: Date) => void;
  activeIso: string;
}) {
  const { data } = useWorkspace();
  const weeks = monthMatrix(month);
  const today = isoDate(new Date());

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <div className="month-grid">
        {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => (
          <div key={day} className="month-dow">
            {day}
          </div>
        ))}
        {weeks.flat().map((date) => {
          const iso = isoDate(date);
          const code = dayCodeOf(date);
          const items = boardItems(data, code);
          const outside = date.getMonth() !== month.getMonth();
          return (
            <button
              key={iso}
              className={[
                "month-cell",
                outside ? "outside" : "",
                iso === today ? "today" : "",
                iso === activeIso ? "selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onPick(date)}
              aria-label={`${DAY_LONG[code]} ${date.getDate()}`}
            >
              <span className="month-dom">{date.getDate()}</span>
              {items.slice(0, 3).map((item) => (
                <span
                  key={item.key}
                  className="month-chip"
                  style={{ background: `var(--tint-${item.tone})`, color: `var(--${item.tone}-ink)` }}
                >
                  <i style={{ background: `var(--${item.tone})` }} />
                  {item.title}
                </span>
              ))}
              {items.length > 3 ? <span className="month-more">+{items.length - 3} more</span> : null}
            </button>
          );
        })}
      </div>
      <div className="row gap-10 wrap" style={{ marginTop: 12 }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
          MONTH VIEW · density only. Pick a day to open its lanes.
        </span>
        <span className="spacer" />
        <span className="chip outline">
          <Icon name="book" size={11} /> {data.sessions.length} sessions
        </span>
        <span className="chip outline">
          <Icon name="ticket" size={11} /> {data.bookings.totals.approved} bookings
        </span>
      </div>
    </div>
  );
}
