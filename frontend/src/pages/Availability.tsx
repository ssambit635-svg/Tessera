import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { useUi, dateFromISO } from "../lib/ui";
import { Icon } from "../components/Icon";
import { SessionDrawer } from "../components/SessionDrawer";
import { roomOccupancy, roomSummary, type CellState, type Occupancy } from "../lib/derive";
import { ratio, DAY_LONG, addDays, dayCodeOf, formatDayLong, percent, plural, startOfWeek } from "../lib/format";
import { ROOM_TYPE_LABELS, roomImage } from "../lib/persona";
import type { DayCode, Room } from "../lib/types";

const STATE_LABEL: Record<CellState, string> = {
  free: "Available",
  class: "Class",
  booking: "Booking",
  blocked: "Unavailable",
  "event-only": "Event only",
  closed: "Closed",
};

export default function Availability() {
  const { data, notify } = useWorkspace();
  const { activeDate, setActiveDate } = useUi();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"day" | "week">("day");
  const [building, setBuilding] = useState("all");
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [evenings, setEvenings] = useState(false);
  const [selected, setSelected] = useState<{ room: Room; period: number; occupancy: Occupancy } | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);

  const active = dateFromISO(activeDate);
  const activeDay = dayCodeOf(active);
  const weekStart = startOfWeek(active);
  const roomParam = params.get("room");

  const rooms = useMemo(
    () =>
      data.rooms.filter((room) => {
        if (building !== "all" && room.building !== building) return false;
        if (accessibleOnly && !room.accessible) return false;
        return true;
      }),
    [accessibleOnly, building, data.rooms],
  );

  const periods = useMemo(
    () => data.calendar.periods.filter((p) => (evenings ? true : p.id <= 9)),
    [data.calendar.periods, evenings],
  );

  const buildings = [...new Set(data.rooms.map((r) => r.building))].sort();

  const cellFor = (room: Room, day: DayCode, period: number) => roomOccupancy(data, room, day, period);

  const stats = useMemo(() => {
    let free = 0;
    let busy = 0;
    let blocked = 0;
    rooms.forEach((room) => {
      periods.forEach((period) => {
        const state = cellFor(room, activeDay, period.id).state;
        if (state === "free") free += 1;
        else if (state === "blocked" || state === "event-only" || state === "closed") blocked += 1;
        else busy += 1;
      });
    });
    return { free, busy, blocked };
  }, [activeDay, periods, rooms, data]);

  const freeCount = stats.free;
  const occupiedCount = stats.busy;

  const openCell = (room: Room, period: number) => {
    const occupancy = cellFor(room, activeDay, period);
    setSelected({ room, period, occupancy });
    if (roomParam !== room.id) setParams({ room: room.id });
  };

  const findSessionAt = (room: Room, period: number) =>
    data.sessions.find(
      (s) => s.roomId === room.id && s.day === activeDay && s.startPeriod <= period && s.endPeriod >= period,
    );

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Availability matrix</div>
          <h2 className="serif" style={{ fontSize: 32, marginTop: 5 }}>
            {formatDayLong(active)}
          </h2>
          <p>
            {rooms.length} resources × {periods.length} periods, {freeCount} free and {occupiedCount} taken —
            derived from {data.sessions.length} placed sessions and {data.bookings.bookings.length} venue decisions.
          </p>
        </div>
        <div className="row gap-8 wrap">
          <div className="seg">
            <button className={mode === "day" ? "on" : ""} onClick={() => setMode("day")}>
              Day
            </button>
            <button className={mode === "week" ? "on" : ""} onClick={() => setMode("week")}>
              Week
            </button>
          </div>
          <div className="date-nav">
            <button onClick={() => setActiveDate(addDays(active, mode === "day" ? -1 : -7))} aria-label="Previous">
              <Icon name="chevronLeft" size={14} />
            </button>
            <button className="today" onClick={() => setActiveDate(new Date())}>
              Today
            </button>
            <button onClick={() => setActiveDate(addDays(active, mode === "day" ? 1 : 7))} aria-label="Next">
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
          <button className="btn sm primary" onClick={() => navigate("/bookings")}>
            <Icon name="plus" size={13} /> New booking
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-field" style={{ maxWidth: 260 }}>
            <span className="eyebrow">Building</span>
            <select className="select" value={building} onChange={(event) => setBuilding(event.target.value)} aria-label="Building filter">
              <option value="all">Every building</option>
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <span className="eyebrow">Options</span>
            <div className="row gap-8 wrap">
              <button className={`chip lg ${accessibleOnly ? "sage" : "outline"}`} onClick={() => setAccessibleOnly((v) => !v)} aria-pressed={accessibleOnly}>
                <Icon name="user" size={10} /> Step-free only
              </button>
              <button className={`chip lg ${evenings ? "lime" : "outline"}`} onClick={() => setEvenings((v) => !v)} aria-pressed={evenings}>
                <Icon name="clock" size={10} /> Show evening periods
              </button>
            </div>
          </div>
          <span className="spacer" />
          <div className="avail-summary">
            <div>
              <b className="mono" style={{ color: "var(--sage-ink)" }}>{stats.free}</b>
              <span>free</span>
            </div>
            <div>
              <b className="mono" style={{ color: "var(--coral-ink)" }}>{stats.busy}</b>
              <span>occupied</span>
            </div>
            <div>
              <b className="mono" style={{ color: "var(--muted)" }}>{stats.blocked}</b>
              <span>blocked</span>
            </div>
          </div>
        </div>
      </div>

      {mode === "day" ? (
        <div className="matrix-wrap">
          <div className="matrix" style={{ "--periods": periods.length } as React.CSSProperties}>
            <div className="matrix-corner">
              <span className="eyebrow">Resource</span>
              <span className="mono">{activeDay}</span>
            </div>
            {periods.map((period) => (
              <div key={period.id} className="matrix-head">
                <span className="mh-time">{period.start}</span>
                <span className="mh-period">P{period.id}</span>
              </div>
            ))}

            {rooms.map((room) => {
              const summary = roomSummary(data, room.id);
              return (
                <div key={room.id} className="matrix-row" style={{ display: "contents" }}>
                  <div className="matrix-rail">
                    <div style={{ minWidth: 0 }}>
                      <b>{room.name}</b>
                      <span>
                        {room.id} · {ROOM_TYPE_LABELS[room.type] ?? room.type} · {room.capacity}
                      </span>
                    </div>
                    <span className="matrix-dot" style={{ background: summary.classes.length ? "var(--sky)" : "var(--sage)" }} />
                  </div>
                  {periods.map((period) => {
                    const occupancy = cellFor(room, activeDay, period.id);
                    const isSelected = selected?.room.id === room.id && selected.period === period.id;
                    return (
                      <button
                        key={period.id}
                        className={`matrix-cell state-${occupancy.state} ${isSelected ? "selected" : ""}`}
                        onClick={() => openCell(room, period.id)}
                        title={`${room.name} · ${period.start} · ${STATE_LABEL[occupancy.state]} — ${occupancy.detail}`}
                      >
                        <span className="mc-fill" />
                        <span className="mc-label">
                          {occupancy.state === "free" ? "free" : occupancy.state === "booking" ? "event" : occupancy.state === "class" ? "class" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="week-matrix">
          <div className="week-matrix-head">
            <div className="wm-rail">Resource</div>
            {data.calendar.days.map((day, index) => (
              <button
                key={day}
                className={`wm-day ${dayCodeOf(addDays(weekStart, index + 1)) === activeDay ? "on" : ""}`}
                onClick={() => {
                  setActiveDate(addDays(weekStart, index + 1));
                  setMode("day");
                }}
              >
                <span>{DAY_LONG[day].slice(0, 3)}</span>
                <b>{addDays(weekStart, index + 1).getDate()}</b>
              </button>
            ))}
            <div className="wm-total">Week free</div>
          </div>

          {rooms.map((room) => {
            const dayStats = data.calendar.days.map((day) => {
              const list = data.calendar.periods.filter((p) => !data.calendar.eventOnlyPeriods.includes(p.id));
              const free = list.filter((p) => cellFor(room, day, p.id).state === "free").length;
              return { day, free, total: list.length };
            });
            const totalFree = dayStats.reduce((sum, d) => sum + d.free, 0);
            const totalSlots = dayStats.reduce((sum, d) => sum + d.total, 0);
            return (
              <div key={room.id} className="week-matrix-row">
                <div className="wm-rail">
                  <img src={roomImage(room.id, room.type)} alt="" />
                  <div>
                    <b>{room.name}</b>
                    <span>{room.id}</span>
                  </div>
                </div>
                {dayStats.map((stat) => (
                  <button
                    key={stat.day}
                    className="wm-cell"
                    onClick={() => {
                      setActiveDate(addDays(weekStart, data.calendar.days.indexOf(stat.day) + 1));
                      setMode("day");
                      setParams({ room: room.id });
                    }}
                    title={`${room.name} · ${DAY_LONG[stat.day]} · ${stat.free}/${stat.total} free`}
                  >
                    <span className="wm-bar">
                      <i style={{ width: `${ratio(stat.free, stat.total) * 100}%` }} />
                    </span>
                    <span className="mono">
                      {stat.free}/{stat.total}
                    </span>
                  </button>
                ))}
                <div className="wm-total mono">{percent(totalSlots ? totalFree / totalSlots : 0)}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="row gap-12 wrap" style={{ marginTop: 4 }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
          LEGEND
        </span>
        {(
          [
            ["free", "Available"],
            ["class", "Scheduled class"],
            ["booking", "Venue booking"],
            ["blocked", "Unavailable / maintenance"],
            ["event-only", "Event-only window"],
          ] as [CellState, string][]
        ).map(([state, label]) => (
          <span key={state} className="legend-key">
            <i className={`legend-swatch state-${state}`} /> {label}
          </span>
        ))}
      </div>

      {selected ? (
        <>
          <div className="scrim" onClick={() => setSelected(null)} />
          <aside className="drawer" role="dialog" aria-label="Slot details">
            <div className="drawer-head">
              <div>
                <div className="eyebrow">{selected.occupancy.state === "free" ? "Available slot" : STATE_LABEL[selected.occupancy.state]}</div>
                <h2 style={{ marginTop: 4 }}>{selected.room.name}</h2>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
                  {formatDayLong(active)} · {data.calendar.periods.find((p) => p.id === selected.period)?.start}–
                  {data.calendar.periods.find((p) => p.id === selected.period)?.end}
                </div>
              </div>
              <button className="close-btn" onClick={() => setSelected(null)} aria-label="Close" style={{ marginLeft: "auto" }}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="drawer-body">
              <div className={`verdict ${selected.occupancy.state === "free" ? "valid" : selected.occupancy.state === "booking" ? "warning" : "invalid"}`}>
                <Icon name={selected.occupancy.state === "free" ? "check" : "info"} size={15} />
                <span>
                  <b>{STATE_LABEL[selected.occupancy.state]}.</b> {selected.occupancy.detail}
                </span>
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <span className="eyebrow">Capacity</span>
                  <b>{selected.room.capacity} seats</b>
                  <span className="mono">{selected.room.id}</span>
                </div>
                <div className="detail-item">
                  <span className="eyebrow">Building</span>
                  <b style={{ fontSize: 12 }}>{selected.room.building}</b>
                  <span className="mono">{selected.room.accessible ? "step-free" : "stairs only"}</span>
                </div>
              </div>

              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Equipment</div>
                <div className="row gap-6 wrap">
                  {selected.room.features.map((f) => (
                    <span key={f} className="chip outline">
                      {f.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Restrictions</div>
                <ul style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-soft)" }}>
                  <li>· Licensed for {selected.room.allowedUses.join(", ")}</li>
                  {data.unavailability
                    .filter((u) => u.room_id === selected.room.id)
                    .map((u) => (
                      <li key={u.day}>· {u.reason} ({u.day})</li>
                    ))}
                  {data.calendar.eventOnlyPeriods.includes(selected.period) ? (
                    <li>· Evening periods are reserved for institute events ({plural(data.calendar.eventOnlyPeriods.length, "period")})</li>
                  ) : null}
                </ul>
              </div>

              {selected.occupancy.state === "class" ? (
                <button
                  className="btn"
                  onClick={() => {
                    const session = findSessionAt(selected.room, selected.period);
                    if (session) {
                      setSelected(null);
                      setDrawer(session.id);
                    }
                  }}
                >
                  <Icon name="eye" size={14} /> Open the occupying session
                </button>
              ) : null}
            </div>
            <div className="drawer-foot">
              <button
                className="btn primary"
                disabled={selected.occupancy.state !== "free"}
                onClick={() => {
                  setSelected(null);
                  navigate(
                    `/bookings?space=${selected.room.id}&day=${activeDay}&from=${selected.period}&to=${selected.period}`,
                  );
                  notify({
                    tone: "info",
                    title: "Booking form prefilled",
                    detail: `${selected.room.name} · ${activeDay} P${selected.period}`,
                  });
                }}
              >
                <Icon name="ticket" size={14} /> Request this slot
              </button>
              <button className="btn" onClick={() => navigate(`/discovery?room=${selected.room.id}`)}>
                Space profile
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {drawer ? <SessionDrawer sessionId={drawer} onClose={() => setDrawer(null)} /> : null}

      {roomParam && !selected ? (
        <div className="callout" style={{ marginTop: 4 }}>
          <Icon name="pin" size={14} />
          <span>
            Showing <b>{data.rooms.find((r) => r.id === roomParam)?.name ?? roomParam}</b> from the space profile.
            Click any cell for its booking details.
          </span>
        </div>
      ) : null}
    </div>
  );
}
