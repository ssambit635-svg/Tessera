import { useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { useUi, dateFromISO } from "../lib/ui";
import { NAV } from "../lib/nav";
import { Icon } from "./Icon";
import { TileMark } from "./TileMark";
import { initials, tintFor } from "../lib/persona";
import {
  MONTHS,
  WEEKDAYS_SHORT,
  dayCodeOf,
  formatDayLong,
  isoDate,
  monthMatrix,
} from "../lib/format";
import { boardItems, periodSpan, periodTime } from "../lib/derive";

function MiniCalendar() {
  const { data } = useWorkspace();
  const { activeDate, setActiveDate } = useUi();
  const selected = dateFromISO(activeDate);
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));

  const weeks = monthMatrix(month);
  const todayIso = isoDate(new Date());
  const classDays = new Set(
    (data?.calendar.days ?? []).map((day) => ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].indexOf(day)),
  );

  return (
    <div className="rail-cal">
      <div className="rail-cal-head">
        <b>
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </b>
        <div className="cal-nav">
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <Icon name="chevronLeft" size={13} />
          </button>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <Icon name="chevronRight" size={13} />
          </button>
        </div>
      </div>
      <div className="cal-grid">
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d} className="cal-dow">
            {d.slice(0, 2)}
          </div>
        ))}
        {weeks.flat().map((date) => {
          const iso = isoDate(date);
          const outside = date.getMonth() !== month.getMonth();
          const isSelected = iso === activeDate;
          return (
            <button
              key={iso}
              className={[
                "cal-cell",
                outside ? "outside" : "",
                classDays.has(date.getDay()) && !outside ? "has-class" : "",
                iso === todayIso ? "today" : "",
                isSelected ? "selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setActiveDate(date)}
              aria-label={formatDayLong(date)}
              aria-pressed={isSelected}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NextUp() {
  const { data } = useWorkspace();
  const { activeDate, openSession } = useUi();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const next = useMemo(() => {
    if (!data) return null;
    const day = dayCodeOf(dateFromISO(activeDate));
    const items = boardItems(data, day).filter((item) => item.kind === "session");
    const now = new Date();
    const isToday = isoDate(dateFromISO(activeDate)) === isoDate(now);
    const currentPeriod = data.calendar.periods.find((p) => {
      if (!isToday) return false;
      const [h, m] = p.start.split(":").map(Number);
      const [eh, em] = p.end.split(":").map(Number);
      const minutes = now.getHours() * 60 + now.getMinutes();
      return minutes >= h * 60 + m && minutes < eh * 60 + em;
    });
    const upcoming = currentPeriod
      ? items.filter((i) => i.endPeriod >= currentPeriod.id)
      : items;
    return upcoming[0] ?? items[0] ?? null;
  }, [activeDate, data]);

  if (!data || !next || dismissed) return null;
  const start = periodTime(data, next.startPeriod);
  const label = isoDate(dateFromISO(activeDate)) === isoDate(new Date()) ? "Today" : formatDayLong(dateFromISO(activeDate)).split(",")[0];

  return (
    <div className="rail-next">
      <div className="next-time">
        <span className="pill">
          {label} · P{next.startPeriod}
        </span>
        <span>{periodSpan(data, next.startPeriod, next.endPeriod)}</span>
      </div>
      <h4>
        {next.courseId} · {next.title}
        <br />
        <span style={{ color: "rgba(244,241,232,.55)", fontSize: 11.5 }}>{next.roomName}</span>
      </h4>
      <svg className="next-art" viewBox="0 0 90 74" fill="none" aria-hidden="true">
        <path d="M10 24 45 8l35 16-35 16z" fill="#CFC2F5" opacity="0.5" />
        <path d="M10 24v26l35 16V40z" fill="#A985E8" opacity="0.85" />
        <path d="M80 24v26L45 66V40z" fill="#7E5CC4" opacity="0.9" />
        <path d="M28 16l17-8 17 8-17 8z" fill="#D4F05A" opacity="0.9" />
      </svg>
      <div className="next-actions">
        <button className="rail-btn" onClick={() => setDismissed(true)}>
          Later
        </button>
        <button
          className="rail-btn solid"
          onClick={() => {
            openSession(next.sessionId ?? null);
            navigate("/mosaic");
          }}
        >
          Details
        </button>
      </div>
      <span className="sr-only">{start?.start}</span>
    </div>
  );
}

export function Sidebar() {
  const { data, railCollapsed, setRailCollapsed, layers, toggleLayer, user, pending } = useWorkspace();
  const { mobileNavOpen, setMobileNavOpen } = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const displayUser = user ?? { email: "admin@cit.edu", name: "Campus operations", role: "admin" };

  const counts = useMemo(() => {
    if (!data) return { classes: 0, events: 0, exams: 0, rooms: 0 };
    return {
      classes: data.sessions.length,
      events: data.bookings.totals.approved + data.bookings.totals.alternatives,
      exams: data.exams.length,
      rooms: data.rooms.length,
    };
  }, [data]);

  const load = useMemo(() => {
    if (!data) return [] as { label: string; value: number; tone: string }[];
    const hours = (kind: string) =>
      data.sessions
        .filter((s) => s.kind === kind)
        .reduce((sum, s) => sum + (s.endPeriod - s.startPeriod + 1), 0);
    const lecture = hours("lecture");
    const lab = hours("lab");
    const tutorial = hours("tutorial");
    const total = Math.max(1, lecture + lab + tutorial);
    return [
      { label: "Lectures", value: lecture / total, tone: "var(--sky)" },
      { label: "Laboratories", value: lab / total, tone: "var(--sage)" },
      { label: "Tutorials", value: tutorial / total, tone: "var(--lime)" },
    ];
  }, [data]);

  const pendingCount = data?.dashboard.pendingProposals ?? 0;
  const attention = pendingCount + (data?.bookings.totals.rejected ?? 0);

  const closeOnMobile = () => setMobileNavOpen(false);

  return (
    <>
      <div
        className={`rail-scrim ${mobileNavOpen ? "open" : ""}`}
        onClick={() => setMobileNavOpen(false)}
        role="presentation"
      />
      <aside className={`rail rail-scroll ${railCollapsed ? "is-collapsed" : ""} ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="rail-head">
          <button
            className="rail-brand"
            onClick={() => {
              navigate("/mosaic");
              closeOnMobile();
            }}
            aria-label="TESSERA home"
          >
            <span style={{ color: "var(--text-inverse)", display: "grid", placeItems: "center" }}>
              <TileMark size={26} />
            </span>
            <span className="rail-wordmark">
              <b>TESSERA</b>
              <span>Campus intelligence</span>
            </span>
          </button>
          <button
            className="rail-collapse"
            onClick={() => setRailCollapsed(!railCollapsed)}
            aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={railCollapsed ? "expand" : "collapse"} size={14} />
          </button>
        </div>

        <div className="rail-body rail-scroll">
          <div className="rail-user">
            <button
              className="rail-user-open"
              onClick={() => {
                navigate("/login");
                closeOnMobile();
              }}
              aria-label={`Signed in as ${displayUser.name}. Open the sign-in page to switch identity.`}
              title="Switch identity"
            >
              <span className={`avatar round tone-${tintFor(displayUser.email)}`}>{initials(displayUser.name)}</span>
              <span className="who">
                <b>{displayUser.name}</b>
                <span>{displayUser.role.replace(/_/g, " ")}</span>
              </span>
            </button>
            {railCollapsed ? null : (
              <button className="rail-bell" aria-label={`${attention} items need attention`} onClick={() => navigate("/reports")}>
                <Icon name="bell" size={14} />
                <i>{attention}</i>
              </button>
            )}
          </div>

          {["main", "management"].map((group) => (
            <nav className="nav-group" key={group} aria-label={group === "main" ? "Main" : "Management"}>
              <div className="nav-group-label">{group === "main" ? "Workspace" : "Management"}</div>
              {NAV.filter((item) => item.group === group).map((item) => {
                const active =
                  item.to === "/mosaic"
                    ? location.pathname === "/mosaic" || location.pathname === "/"
                    : location.pathname.startsWith(item.to);
                const badge = item.to === "/bookings" ? pendingCount : 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`nav-item ${active ? "active" : ""}`}
                    data-label={item.short}
                    aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={closeOnMobile}
                    title={railCollapsed ? item.short : undefined}
                  >
                    <Icon name={item.icon} size={17} />
                    <span className="nav-label">{item.label}</span>
                    {badge ? <span className="nav-count">{badge}</span> : null}
                  </NavLink>
                );
              })}
            </nav>
          ))}

          <NextUp />

          <div className="rail-cal-wrap">
            <MiniCalendar />
          </div>

          <div className="rail-layers">
            <div className="rail-section-head">
              <b>My layers</b>
              <span>{Object.values(layers).filter(Boolean).length}/5</span>
            </div>
            {(
              [
                ["classes", "Classes", counts.classes, "var(--sky)"],
                ["events", "Bookings & events", counts.events, "var(--lime)"],
                ["exams", "Examinations", counts.exams, "var(--lavender)"],
                ["library", "Rooms & labs", counts.rooms, "var(--sage)"],
                ["birthdays", "AI holds", pending ? 1 : 0, "var(--violet)"],
              ] as const
            ).map(([key, label, count, colour]) => (
              <button
                key={key}
                className={`layer-row ${layers[key] ? "on" : ""}`}
                onClick={() => toggleLayer(key)}
                aria-pressed={layers[key]}
              >
                <span className="layer-box" style={layers[key] ? { background: colour, borderColor: colour } : undefined}>
                  <Icon name="check" size={9} strokeWidth={3} />
                </span>
                <span>{label}</span>
                <span className="layer-count">{count}</span>
              </button>
            ))}
          </div>

          <div className="rail-legend">
            <div className="rail-section-head">
              <b>Teaching load</b>
              <span>this week</span>
            </div>
            {load.map((row) => (
              <div className="legend-row" key={row.label}>
                <span className="legend-label">
                  <i className="legend-dot" style={{ background: row.tone }} />
                  {row.label}
                </span>
                <span className="legend-value">{Math.round(row.value * 100)}%</span>
                <span className="legend-track">
                  <i style={{ width: `${Math.max(4, row.value * 100)}%`, background: row.tone }} />
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px 0", opacity: 0.5 }}>
            <Icon name={data?.calendar.days.length ? "database" : "wifi"} size={12} />
            <span className="mono" style={{ fontSize: 9, letterSpacing: "0.08em" }}>
              {data?.calendar.festWeek?.toUpperCase() ?? "TEACHING WEEK"}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

export { MiniCalendar };
