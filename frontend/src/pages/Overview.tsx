import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { useUi, dateFromISO } from "../lib/ui";
import { Icon } from "../components/Icon";
import { TileMark, TilePattern } from "../components/TileMark";
import { SessionDrawer } from "../components/SessionDrawer";
import {
  DAY_LONG,
  MONTHS,
  formatDayShort,
  formatStamp,
  addDays,
  instituteName,
  isoDate,
  percent,
  plural,
  ratio,
  startOfWeek,
} from "../lib/format";
import { availabilityWindow, periodSpan, toneForDepartment } from "../lib/derive";
import { FEATURE_LABELS, initials, roomImage, roomImageAlt, tintFor, ROOM_TYPE_LABELS } from "../lib/persona";

export default function Overview() {
  const { data } = useWorkspace();
  const { activeDate } = useUi();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState<string | null>(null);
  const active = dateFromISO(activeDate);
  const dayCode = (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const)[active.getDay()];
  const teachingDay = data.calendar.days.includes(dayCode) ? dayCode : data.calendar.days[0];
  // The dashboard always speaks about a teaching day, even when today is a weekend.
  const focusDate = useMemo(() => {
    const monday = addDays(startOfWeek(new Date(active)), 1);
    return data.calendar.days.includes(dayCode) ? active : addDays(monday, Math.max(0, data.calendar.days.indexOf(teachingDay)));
  }, [active, data.calendar.days, dayCode, teachingDay]);
  const todaySessions = data.sessions
    .filter((s) => s.day === teachingDay)
    .sort((a, b) => a.startPeriod - b.startPeriod);

  const availability = useMemo(() => {
    let free = 0;
    let total = 0;
    data.rooms.forEach((room) => {
      const stats = availabilityWindow(data, room);
      free += stats.free;
      total += stats.total;
    });
    return { free, total, ratio: total ? free / total : 0 };
  }, [data]);

  const facultyNow = useMemo(() => {
    const period = data.calendar.periods.find((p) => p.teaching)?.id ?? 1;
    const busy = new Set(
      data.sessions.filter((s) => s.day === teachingDay && s.startPeriod <= period && s.endPeriod >= period).map((s) => s.facultyId),
    );
    return { free: data.faculty.length - busy.size, total: data.faculty.length };
  }, [data, teachingDay]);

  // Two different things were being added under one label. An "alternative offered" booking is
  // already decided; a proposal is the only item genuinely waiting on a second admin.
  const pendingProposals = data.dashboard.pendingProposals;
  const conflicts = data.dashboard.conflicts.hard;
  const soft = data.dashboard.soft.total;

  const featured = (["CS-LAB-1", "ELEC-LAB-1", "SH-1"]
    .map((id) => data.rooms.find((room) => room.id === id))
    .filter(Boolean) as typeof data.rooms);
  const collaboration = data.rooms.find((room) => room.id === "MECH-WS") ?? data.rooms[0];

  const alerts = useMemo(() => {
    const list: { tone: string; title: string; detail: string; to: string; icon: string }[] = [];
    data.bookings.bookings
      .filter((b) => b.decision.status === "rejected")
      .forEach((b) =>
        list.push({
          tone: "coral",
          title: `${b.request_id} · ${b.title}`,
          detail: b.decision.reason ?? "Rejected by the priority rules",
          to: "/bookings",
          icon: "alert",
        }),
      );
    data.bookings.bookings
      .filter((b) => b.decision.status === "alternative_offered")
      .forEach((b) =>
        list.push({
          tone: "sand",
          title: `${b.request_id} · alternative offered`,
          detail: `${b.title} · ${b.requester}`,
          to: "/bookings",
          icon: "clock",
        }),
      );
    data.unavailability.forEach((window) =>
      list.push({
        tone: "sand",
        title: `${window.room_id} out of service`,
        detail: `${window.reason} — ${window.day}`,
        to: `/availability?room=${window.room_id}`,
        icon: "alert",
      }),
    );
    data.dashboard.risks.forEach((risk) =>
      list.push({ tone: "sky", title: "Workload notice", detail: risk, to: "/people", icon: "users" }),
    );
    return list.slice(0, 5);
  }, [data]);

  const upcoming = [...data.bookings.bookings]
    .filter((b) => b.decision.status !== "rejected" && b.decision.day)
    .sort((a, b) => data.calendar.days.indexOf(a.decision.day ?? "MON") - data.calendar.days.indexOf(b.decision.day ?? "MON"))
    .slice(0, 4);

  const weekLoad = data.calendar.days.map((day) => ({
    day,
    count: data.sessions.filter((s) => s.day === day).length,
  }));
  const maxLoad = Math.max(1, ...weekLoad.map((d) => d.count));

  return (
    <div className="page">
      {/* ---------------------------------------------------------------- hero */}
      <section className="hero">
        <div className="hero-copy">
          <TilePattern className="hero-texture" />
          <div className="row" style={{ gap: 10 }}>
            <span className="eyebrow" title={data.institute}>
              TESSERA · {instituteName(data.institute)}
            </span>
            <span className="hairline-dot" />
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: "0.1em" }}>
              {data.calendar.festWeek?.toUpperCase() ?? "TEACHING WEEK"}
            </span>
          </div>
          <h1 className="serif hero-title">
            Spaces, people and time <em>— in sync.</em>
          </h1>
          <p className="hero-lede">
            TESSERA brings your campus resources and academic schedules together in one intelligent
            workspace — every room, every faculty hour and every student group, connected.
          </p>

          <div className="hero-meta">
            <span className="date-block">
              <span className="db-day">{DAY_LONG[dayCode].slice(0, 3).toUpperCase()}</span>
              <span className="db-date">{String(focusDate.getDate()).padStart(2, "0")}</span>
              <span className="db-month">{MONTHS[focusDate.getMonth()].slice(0, 3).toUpperCase()}</span>
            </span>
            <span className="hairline-v" />
            <span className="hero-fact">
              <b>{plural(todaySessions.length, "session")}</b>
              <span>scheduled for {DAY_LONG[teachingDay]}</span>
            </span>
            <span className="hairline-v" />
            <span className="hero-fact">
              <b>{data.summary.teaching_hours} teaching hours</b>
              <span>scheduled this week</span>
            </span>
          </div>

          <div className="row gap-8 wrap" style={{ marginTop: 20 }}>
            <button className="btn primary" onClick={() => navigate("/mosaic")}>
              <Icon name="board" size={15} /> Open the Mosaic Board
            </button>
            <button className="btn" onClick={() => navigate("/intelligence")}>
              <Icon name="sparkles" size={15} style={{ color: "var(--violet)" }} /> Ask TESSERA
            </button>
            <button className="btn quiet" onClick={() => navigate("/discovery")}>
              Browse spaces <Icon name="arrowUpRight" size={14} />
            </button>
          </div>
        </div>

        <figure className="hero-figure">
          <img src="/media/campus-facade.jpg" alt="Campus building at golden hour" />
          <div className="hero-figure-labels">
            <span className="annotation">CIT · ACADEMIC CORE</span>
            <span className="annotation annotation-right">EST. 1996</span>
          </div>
          <figcaption>
            <div>
              <span className="eyebrow" style={{ color: "rgba(255,255,255,.6)" }}>
                Live campus state
              </span>
              <div className="hero-figure-stat">
                {percent(availability.ratio)}
                <span>room-time free this week</span>
              </div>
            </div>
            <div className="hero-tile">
              <TileMark size={44} title="Tessera tile" />
            </div>
          </figcaption>
        </figure>
      </section>

      {/* ---------------------------------------------------------------- metrics */}
      <section className="metric-grid">
        <Metric label="Institutional resources" value={data.rooms.length + data.faculty.length + data.groups.length} foot={`${data.rooms.length} spaces · ${data.faculty.length} faculty · ${data.groups.length} groups`} tone="sky" icon="layers" />
        <Metric label="Free room-time" value={availability.free} foot={`of ${availability.total} bookable slots`} tone="sage" icon="grid" />
        <Metric label="Active bookings" value={data.bookings.totals.approved + data.bookings.totals.alternatives} foot={`${data.bookings.totals.alternatives} awaiting confirmation`} tone="lime" icon="ticket" />
        <Metric label="Scheduled sessions" value={data.dashboard.counts.sessions} foot={`${data.summary.teaching_hours} teaching hours`} tone="sky" icon="book" />
        <Metric label="Faculty free" value={facultyNow.free} foot={`of ${facultyNow.total} right now`} tone="sage" icon="people" />
        <Metric
          label="Proposals awaiting approval"
          value={pendingProposals}
          foot={pendingProposals ? "a second admin must approve" : "nothing in the four-eyes queue"}
          tone={pendingProposals ? "violet" : "sage"}
          icon="clock"
        />
        <Metric label="Conflicts" value={conflicts} foot={`soft penalty ${soft}`} tone={conflicts ? "coral" : "sage"} icon="shield" />
        <Metric
          label="Examinations"
          value={data.exams.length}
          foot={`${new Set(data.exams.flatMap((exam) => exam.rooms)).size} rooms · seated for ${data.exams.reduce((max, exam) => Math.max(max, exam.size), 0)}`}
          tone="sand"
          icon="clipboard"
        />
      </section>

      {/* ---------------------------------------------------------------- today */}
      <section>
        <div className="section-head">
          <div>
            <div className="eyebrow">Today’s activity</div>
            <h2 style={{ marginTop: 5 }}>
              {DAY_LONG[teachingDay]} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {formatDayShort(focusDate)}</span>
            </h2>
            <p>{plural(todaySessions.length, "session")} across {new Set(todaySessions.map((s) => s.roomId)).size} spaces.</p>
          </div>
          <button className="btn sm" onClick={() => navigate("/mosaic")}>
            Open the board <Icon name="arrowRight" size={13} />
          </button>
        </div>

        <div className="session-strip">
          {todaySessions.slice(0, 7).map((session) => {
            const tone = toneForDepartment(session.department);
            return (
              <button key={session.id} className={`today-tile tone-${tone}`} onClick={() => setDrawer(session.id)}>
                <span className="tt-time">
                  {periodSpan(data, session.startPeriod, session.endPeriod)}
                  <span className="tt-code">{session.courseId}</span>
                </span>
                <span className="tt-title">{session.courseTitle}</span>
                <span className="tt-meta">
                  <Icon name="pin" size={11} /> {session.roomName}
                </span>
                <span className="tt-foot">
                  <span className={`avatar sm tone-${tintFor(session.facultyId)}`}>{initials(session.facultyName)}</span>
                  <span className="tt-person">{session.facultyName}</span>
                  <span className={`status valid tt-status`}>
                    <Icon name="check" size={9} strokeWidth={2.5} /> ok
                  </span>
                </span>
              </button>
            );
          })}
          <button className="today-tile add" onClick={() => navigate("/availability")}>
            <Icon name="plus" size={18} />
            <span>Find a free slot</span>
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- featured */}
      <section>
        <div className="section-head">
          <div>
            <div className="eyebrow">Featured campus spaces</div>
            <h2 className="serif" style={{ fontSize: 34, marginTop: 4 }}>
              Rooms with a point of view.
            </h2>
          </div>
          <button className="btn sm" onClick={() => navigate("/discovery")}>
            All {data.rooms.length} spaces <Icon name="arrowUpRight" size={13} />
          </button>
        </div>

        <div className="feature-grid">
          {featured[0] ? (
            <button className="feature feature-large" onClick={() => navigate(`/discovery?room=${featured[0]!.id}`)}>
              <img src={roomImage(featured[0].id, featured[0].type)} alt={roomImageAlt(featured[0].name)} />
              <span className="feature-annot">
                <span>{featured[0].id}</span>
                <span>{featured[0].building}</span>
              </span>
              <span className="feature-body">
                <span className="chip lime lg">Featured space</span>
                <span className="feature-name serif">{featured[0].name}</span>
                <span className="feature-meta">
                  {ROOM_TYPE_LABELS[featured[0].type]} · seats {featured[0].capacity} ·{" "}
                  {featured[0].features.slice(0, 2).map((f) => FEATURE_LABELS[f] ?? f).join(" / ")}
                </span>
              </span>
            </button>
          ) : null}

          <div className="feature-stack">
            {featured.slice(1, 3).map((room) => (
              <button key={room.id} className="feature feature-small" onClick={() => navigate(`/discovery?room=${room.id}`)}>
                <img src={roomImage(room.id, room.type)} alt={room.name} />
                <span className="feature-body">
                  <span className="feature-name">{room.name}</span>
                  <span className="feature-meta">
                    {room.building} · seats {room.capacity}
                  </span>
                </span>
                <span className="feature-free">
                  <span className="dot" style={{ background: "var(--sage-ink)" }} />
                  {percent(availabilityWindow(data, room).ratio)} free
                </span>
              </button>
            ))}
          </div>

          <button className="feature feature-wide" onClick={() => collaboration && navigate(`/discovery?room=${collaboration.id}`)}>
            {collaboration ? <img src={roomImage(collaboration.id, collaboration.type)} alt={collaboration.name} /> : null}
            <span className="feature-wide-body">
              <span className="eyebrow" style={{ color: "rgba(255,255,255,.62)" }}>
                Collaboration & making
              </span>
              <span className="feature-wide-title serif">{collaboration?.name ?? "Collaboration spaces"}</span>
              <span className="feature-wide-meta">
                Open benches, power drops and storage — bookable by any club, with staff supervision
                requested through TESSERA.
              </span>
              <span className="feature-wide-cta">
                Explore the space <Icon name="arrowUpRight" size={14} />
              </span>
            </span>
            <span className="feature-annot annotation-right">
              {collaboration ? `${collaboration.id} · SEATS ${collaboration.capacity}` : ""}
            </span>
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- activity */}
      <section className="overview-lower">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Needs attention</div>
              <h3 style={{ marginTop: 3 }}>Alerts and pending decisions</h3>
            </div>
            <span className="chip coral" style={{ marginLeft: "auto" }}>
              {alerts.length} open
            </span>
          </div>
          <div className="panel-body flush">
            {alerts.length === 0 ? (
              <div className="empty">
                <Icon name="check" size={22} />
                <p>Nothing needs a decision.</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <button key={`${alert.title}-${alert.detail}`} className="alert-row" onClick={() => navigate(alert.to)}>
                  <span className={`alert-icon ${alert.tone}`}>
                    <Icon name={alert.icon} size={13} />
                  </span>
                  <span style={{ minWidth: 0, textAlign: "left" }}>
                    <b>{alert.title}</b>
                    <span>{alert.detail}</span>
                  </span>
                  <Icon name="chevronRight" size={13} style={{ marginLeft: "auto", color: "var(--muted)" }} />
                </button>
              ))
            )}
          </div>
          <div className="panel-foot">
            <button className="btn sm quiet" onClick={() => navigate("/reports")}>
              Full audit trail <Icon name="arrowRight" size={12} />
            </button>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--muted)" }}>
              {data.dashboard.conflicts.hard} HARD · {data.dashboard.soft.total} SOFT
            </span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Fest week</div>
              <h3 style={{ marginTop: 3 }}>Upcoming bookings</h3>
            </div>
            <button className="icon-square sm" onClick={() => navigate("/bookings")} aria-label="All bookings" style={{ marginLeft: "auto" }}>
              <Icon name="arrowUpRight" size={13} />
            </button>
          </div>
          <div className="panel-body">
            <div className="booking-mini-list">
              {upcoming.map((booking) => (
                <button key={booking.request_id} className="booking-mini" onClick={() => navigate(`/bookings?request=${booking.request_id}`)}>
                  <span className="bm-day">{booking.decision.day}</span>
                  <span style={{ minWidth: 0, textAlign: "left" }}>
                    <b>{booking.title}</b>
                    <span>
                      {booking.requester} · {booking.decision.room_id ?? "—"} · P{booking.decision.start_period}–
                      P{booking.decision.end_period}
                    </span>
                  </span>
                  <span className={`status ${booking.decision.status === "approved" ? "valid" : "warning"}`}>
                    {booking.decision.status === "approved" ? "approved" : "alt"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="panel-foot">
            <div className="week-bars" aria-hidden="true">
              {weekLoad.map((day) => (
                <span key={day.day} className="week-bar">
                  <i style={{ height: `${Math.max(8, ratio(day.count, maxLoad) * 100)}%` }} />
                  <em>{day.day[0]}</em>
                </span>
              ))}
            </div>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--muted)" }}>
              {data.bookings.totals.score}/{data.bookings.totals.max} SCORE
            </span>
          </div>
        </div>
      </section>

      <section className="editorial-note">
        <div className="editorial-note-mark">
          <TileMark size={38} />
        </div>
        <div>
          <div className="eyebrow">Why the tile</div>
          <p className="serif" style={{ fontSize: 24, lineHeight: 1.25, marginTop: 6, color: "var(--text)" }}>
            Four interlocking blocks. Remove one and the rest no longer hold.
          </p>
          <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-soft)", maxWidth: "68ch" }}>
            That is the scheduling problem in one mark: a room, a lecturer, a group and an hour. TESSERA keeps
            them locked together — and shows you the shape of a change before you make it.
          </p>
        </div>
        <div className="editorial-note-meta">
          <span className="mono">Spectra ’27 · Week 7</span>
          <span className="mono">read {formatStamp(data.generatedAt)}</span>
        </div>
      </section>

      {drawer ? <SessionDrawer sessionId={drawer} onClose={() => setDrawer(null)} /> : null}
      <span className="sr-only">
        Data timestamp {isoDate(new Date())} · {soft} soft penalties · {DATA_NOTE}
      </span>
    </div>
  );
}

const DATA_NOTE = "every figure is computed from this week\u2019s schedule";

function Metric({
  label,
  value,
  foot,
  tone,
  icon,
}: {
  label: string;
  value: number;
  foot: string;
  tone: string;
  icon: string;
}) {
  return (
    <div className={`metric tone-${tone}`}>
      <span className="metric-label">
        <Icon name={icon} size={12} /> {label}
      </span>
      <span className="metric-value">{value}</span>
      <span className="metric-foot">{foot}</span>
      <span className="metric-accent" />
    </div>
  );
}
