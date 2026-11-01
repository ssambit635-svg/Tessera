import { Fragment, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { departmentLoad, departmentStats, roomSummary } from "../lib/derive";
import { DAY_LONG, percent, plural, ratio } from "../lib/format";
import { ROOM_TYPE_LABELS } from "../lib/persona";

export default function Reports() {
  const { data, source } = useWorkspace();
  const navigate = useNavigate();
  const load = departmentLoad(data);
  const depts = departmentStats(data);
  const soft = data.dashboard.soft.breakdown;
  const softTotal = Object.values(soft).reduce((sum, v) => sum + Number(v), 0);
  const bookings = data.bookings.totals;
  const totalUtil = data.dashboard.utilisation.reduce((sum, row) => sum + row.utilisation, 0) /
    Math.max(1, data.dashboard.utilisation.length);

  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    data.rooms.forEach((room) => map.set(room.type, (map.get(room.type) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.rooms]);

  const outcomes = [
    { label: "Approved", value: bookings.approved, tone: "var(--sage)" },
    { label: "Alternative", value: bookings.alternatives, tone: "var(--sand)" },
    { label: "Rejected", value: bookings.rejected, tone: "var(--coral)" },
  ];
  const outcomeTotal = Math.max(1, outcomes.reduce((sum, o) => sum + o.value, 0));
  let angle = 0;

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Reports & analytics</div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            The institution, measured honestly.
          </h2>
          <p>
            Utilisation, validation and booking outcomes, computed from {data.sessions.length} placements — the
            same numbers the scheduling authority reports.
          </p>
        </div>
        <div className="row gap-8">
          <button className="btn sm" onClick={() => navigate("/availability")}>
            <Icon name="grid" size={13} /> Availability
          </button>
        </div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="kpi">
          <span className="kpi-label"><Icon name="shield" size={12} /> Hard violations</span>
          <span className="kpi-value">{data.dashboard.conflicts.hard}</span>
          <span className="kpi-foot">timetable + bookings + exams</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><Icon name="sigma" size={12} /> Soft penalty</span>
          <span className="kpi-value">
            {softTotal}
            <small>points</small>
          </span>
          <span className="kpi-foot">{Object.entries(soft).filter(([, v]) => Number(v) > 0).map(([k]) => k).join(", ") || "none"}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><Icon name="ticket" size={12} /> Booking score</span>
          <span className="kpi-value">
            {bookings.score}
            <small>/ {bookings.max}</small>
          </span>
          <span className="kpi-foot">{bookings.approved} approved · {bookings.rejected} rejected</span>
        </div>
        <div className="kpi">
          <span className="kpi-label"><Icon name="activity" size={12} /> Mean utilisation</span>
          <span className="kpi-value">{percent(totalUtil)}</span>
          <span className="kpi-foot">across {data.dashboard.utilisation.length} bookable rooms</span>
        </div>
      </div>

      <div className="report-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Space utilisation</div>
              <h3 style={{ marginTop: 3 }}>Busiest rooms this week</h3>
            </div>
            <span className="chip outline" style={{ marginLeft: "auto" }}>top 10</span>
          </div>
          <div className="panel-body">
            <div className="bar-list">
              {[...data.dashboard.utilisation]
                .sort((a, b) => b.utilisation - a.utilisation)
                .slice(0, 10)
                .map((row) => (
                  <button key={row.room_id} className="bar-row" onClick={() => navigate(`/discovery?room=${row.room_id}`)}>
                    <span className="bar-label">
                      <b>{data.rooms.find((r) => r.id === row.room_id)?.name ?? row.room_id}</b>
                      <span className="mono">{row.sessions} sessions · {row.hours} h</span>
                    </span>
                    <span className="bar-track">
                      <i style={{ width: `${Math.max(3, ratio(row.utilisation, 1) * 100)}%` }} />
                    </span>
                    <span className="bar-value mono">{percent(row.utilisation)}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Booking outcomes</div>
              <h3 style={{ marginTop: 3 }}>Every request, accounted for</h3>
            </div>
          </div>
          <div className="panel-body" style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <svg width="132" height="132" viewBox="0 0 42 42" aria-label="Booking outcomes">
              <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--line)" strokeWidth="4" />
              {outcomes.map((outcome) => {
                const fraction = outcome.value / outcomeTotal;
                const dash = fraction * 100;
                const circle = (
                  <circle
                    key={outcome.label}
                    cx="21"
                    cy="21"
                    r="15.9"
                    fill="none"
                    stroke={outcome.tone}
                    strokeWidth="4"
                    strokeDasharray={`${dash} ${100 - dash}`}
                    strokeDashoffset={-angle}
                    transform="rotate(-90 21 21)"
                  />
                );
                angle += dash;
                return circle;
              })}
              <text x="21" y="20.2" textAnchor="middle" style={{ font: "600 7px var(--font-display)", fill: "var(--text)" }}>
                {bookings.score}/{bookings.max}
              </text>
              <text x="21" y="25" textAnchor="middle" style={{ font: "3px var(--font-mono)", fill: "var(--muted)" }}>
                SCORE
              </text>
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
              {outcomes.map((outcome) => (
                <div key={outcome.label} className="legend-row" style={{ padding: 0 }}>
                  <span className="legend-label" style={{ color: "var(--text-soft)", fontSize: 12 }}>
                    <i className="legend-dot" style={{ background: outcome.tone }} />
                    {outcome.label}
                  </span>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>{outcome.value}</span>
                </div>
              ))}
              <div className="divider" style={{ margin: "4px 0" }} />
              <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                {bookings.cancelled} cancelled before review
              </span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Soft constraints</div>
              <h3 style={{ marginTop: 3 }}>Where the penalty comes from</h3>
            </div>
            <span className="chip sage" style={{ marginLeft: "auto" }}>S1–S6</span>
          </div>
          <div className="panel-body">
            <div className="bar-list">
              {Object.entries(soft).map(([rule, value]) => (
                <div key={rule} className="bar-row static">
                  <span className="bar-label">
                    <b className="mono">{rule}</b>
                    <span className="mono">{Number(value) === 0 ? "clean" : `${value} points`}</span>
                  </span>
                  <span className="bar-track">
                    <i
                      style={{
                        width: `${Math.max(Number(value) === 0 ? 2 : 8, (Number(value) / Math.max(1, softTotal)) * 100)}%`,
                        background: Number(value) === 0 ? "var(--sage)" : "var(--sand)",
                      }}
                    />
                  </span>
                  <span className="bar-value mono">{value}</span>
                </div>
              ))}
            </div>
            <div className="callout" style={{ marginTop: 12, fontSize: 11 }}>
              <Icon name="info" size={13} />
              <span>
                The remaining {softTotal} points are structural: one visiting professor teaches three lectures in a
                two-day availability window.
              </span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Teaching load</div>
              <h3 style={{ marginTop: 3 }}>Sessions per department, per day</h3>
            </div>
          </div>
          <div className="panel-body">
            <div className="heat">
              <div className="heat-corner" />
              {data.calendar.days.map((day) => (
                <div key={day} className="heat-head">{DAY_LONG[day].slice(0, 3)}</div>
              ))}
              {load.map((row) => (
                <Fragment key={row.dept}>
                  <div className="heat-label">
                    {row.dept}
                  </div>
                  {data.calendar.days.map((day) => {
                    const value = row.days[day] ?? 0;
                    const max = Math.max(...load.flatMap((l) => data.calendar.days.map((d) => l.days[d] ?? 0)), 1);
                    return (
                      <div
                        key={`${row.dept}-${day}`}
                        className="heat-cell"
                        style={{ background: `rgba(142, 201, 233, ${0.12 + (value / max) * 0.7})` }}
                        title={`${row.dept} · ${DAY_LONG[day]} · ${value} sessions`}
                      >
                        {value || ""}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
            <p className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10 }}>
              COUNT OF PLACED SESSIONS · DARKER = HEAVIER
            </p>
          </div>
        </div>
      </div>

      <div className="report-grid two">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Venue mix</div>
              <h3 style={{ marginTop: 3 }}>{plural(data.rooms.length, "bookable space")}</h3>
            </div>
          </div>
          <div className="panel-body">
            <div className="bar-list">
              {typeCounts.map(([type, count]) => (
                <div key={type} className="bar-row static">
                  <span className="bar-label">
                    <b>{ROOM_TYPE_LABELS[type] ?? type}</b>
                    <span className="mono">
                      {data.rooms.filter((r) => r.type === type).reduce((sum, r) => sum + r.capacity, 0)} seats
                    </span>
                  </span>
                  <span className="bar-track">
                    <i style={{ width: `${ratio(count, data.rooms.length) * 100}%`, background: "var(--sky)" }} />
                  </span>
                  <span className="bar-value mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Departments</div>
              <h3 style={{ marginTop: 3 }}>Teaching hours</h3>
            </div>
          </div>
          <div className="panel-body">
            <div className="bar-list">
              {depts
                .sort((a, b) => b.hours - a.hours)
                .slice(0, 8)
                .map((dept) => (
                  <button key={dept.code} className="bar-row" onClick={() => navigate("/departments")}>
                    <span className="bar-label">
                      <b>{dept.code}</b>
                      <span className="mono">{dept.faculty} faculty · {dept.sessions} sessions</span>
                    </span>
                    <span className="bar-track">
                      <i style={{ width: `${ratio(dept.hours, Math.max(...depts.map((d) => d.hours), 1)) * 100}%`, background: `var(--${dept.tone})` }} />
                    </span>
                    <span className="bar-value mono">{dept.hours}h</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Provenance</div>
            <h3 style={{ marginTop: 3 }}>Where these numbers come from</h3>
          </div>
          <span className={`status ${source.mode === "live" ? "valid" : "warning"}`} style={{ marginLeft: "auto" }}>
            {source.mode === "live" ? "connected" : "bundled copy"}
          </span>
        </div>
        <div className="panel-body">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="eyebrow">Schedule</span>
              <b style={{ fontSize: 13 }}>Spectra ’27 · week 7</b>
              <span className="mono">{data.summary.teaching_hours} teaching hours</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Source detail</span>
              <b style={{ fontSize: 12 }}>{source.detail}</b>
              <span className="mono">generated {data.generatedAt.slice(0, 19).replace("T", " ")}</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Validation</span>
              <b>{data.dashboard.conflicts.hard} hard violations</b>
              <span className="mono">soft {data.dashboard.soft.total}</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Exports</span>
              <b style={{ fontSize: 12 }}>Owned by the API</b>
              <span className="mono">{source.mode === "live" ? "download from the API" : "not available offline"}</span>
            </div>
          </div>
          <div className="row gap-8 wrap" style={{ marginTop: 14 }}>
            {source.mode === "live" ? (
              <a className="btn sm" href="/docs" target="_blank" rel="noreferrer">
                <Icon name="external" size={13} /> Open API docs
              </a>
            ) : (
              <span className="chip sand">Exports need the scheduling service</span>
            )}
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
              {data.sessions.length} placements · {data.rooms.reduce((sum, r) => sum + roomSummary(data, r.id).classes.length, 0)} room assignments
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
