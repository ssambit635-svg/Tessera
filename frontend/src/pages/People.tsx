import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { SessionDrawer } from "../components/SessionDrawer";
import {
  facultyStrip,
  facultySummary,
  periodSpan,
  replacementCandidates,
  type StripState,
} from "../lib/derive";
import { DAY_LONG, formatStampShort, percent, plural } from "../lib/format";
import { designationFor,  tintFor } from "../lib/persona";
import type { Faculty } from "../lib/types";

const STRIP_LEGEND: { state: StripState; label: string }[] = [
  { state: "class", label: "Teaching" },
  { state: "free", label: "Available" },
  { state: "unavailable", label: "Declared unavailable" },
  { state: "preference", label: "Avoid (preference)" },
];

export default function People() {
  const { data } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [dept, setDept] = useState("all");
  const [query, setQuery] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [sessionDrawer, setSessionDrawer] = useState<string | null>(null);

  const openId = params.get("faculty");
  const faculty = data.faculty.find((f) => f.id === openId) ?? null;

  const departments = [...new Set(data.faculty.map((f) => f.department))].sort();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.faculty
      .filter((f) => {
        if (dept !== "all" && f.department !== dept) return false;
        if (q && !`${f.name} ${f.department} ${f.id}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .map((f) => ({ faculty: f, summary: facultySummary(data, f.id), strip: facultyStrip(data, f.id) }))
      .filter((row) => (onlyFree ? row.summary.freePeriods > 0 : true))
      .sort((a, b) => b.summary.hours - a.summary.hours);
  }, [data, dept, onlyFree, query]);

  const expertiseFor = (person: Faculty) =>
    [...new Set(
      data.sessions
        .filter((s) => s.facultyId === person.id)
        .map((s) => data.courses.find((c) => c.id === s.courseId)?.title ?? s.courseTitle),
    )].slice(0, 3);

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">People & availability</div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            A faculty directory that behaves like a timetable.
          </h2>
          <p>
            {plural(data.faculty.length, "member")} across {departments.length} departments. Every strip below is
            computed from real sessions, declared unavailability and preferences.
          </p>
        </div>
        <div className="row gap-8">
          <button className="btn sm" onClick={() => navigate("/mosaic")}>
            <Icon name="board" size={13} /> Faculty lanes
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-field" style={{ maxWidth: 220 }}>
            <span className="eyebrow">Department</span>
            <select className="select" value={dept} onChange={(event) => setDept(event.target.value)} aria-label="Department">
              <option value="all">Every department</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field" style={{ maxWidth: 260 }}>
            <span className="eyebrow">Search</span>
            <div className="filter-input">
              <Icon name="search" size={13} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, department, id" />
            </div>
          </div>
          <div className="filter-field">
            <span className="eyebrow">Filters</span>
            <button className={`chip lg ${onlyFree ? "sage" : "outline"}`} onClick={() => setOnlyFree((v) => !v)} aria-pressed={onlyFree}>
              <Icon name="check" size={10} /> Has free periods
            </button>
          </div>
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            {rows.length} PEOPLE
          </span>
        </div>
        <div className="row gap-12 wrap" style={{ paddingTop: 4 }}>
          {STRIP_LEGEND.map((item) => (
            <span key={item.state} className="legend-key">
              <i className={`strip-state ${item.state}`} /> {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="people-grid">
        {rows.map(({ faculty: person, summary, strip }) => {
          const expertise = expertiseFor(person);
          return (
            <article key={person.id} className="person-card">
              <div className="pc-top">
                <span className={`avatar xl tone-${tintFor(person.id)}`}><Icon name="user" size={22} /></span>
                <div className="pc-id">
                  <h3>{person.name}</h3>
                  <span className="pc-role">{designationFor(person.id, person.department)}</span>
                  <span className="pc-dept">
                    {person.department} · {person.id}
                  </span>
                </div>
                <span className="ring" style={{ ["--value" as string]: summary.utilisation, ["--tone" as string]: "var(--sky)" }}>
                  <span>{Math.round(summary.utilisation * 100)}%</span>
                </span>
              </div>

              <div className="pc-expertise">
                {expertise.length ? (
                  expertise.map((title) => (
                    <span key={title} className="chip outline">
                      {title}
                    </span>
                  ))
                ) : (
                  <span className="chip outline">No assigned courses</span>
                )}
              </div>

              <div className="pc-strip" aria-label={`${person.name} weekly availability`}>
                {data.calendar.days.map((day) => (
                  <div key={day} className="strip-row">
                    <span className="strip-day">{day[0]}</span>
                    <span className="strip-cells">
                      {data.calendar.periods
                        .filter((p) => p.teaching)
                        .map((period) => {
                          const state = strip.get(`${day}-${period.id}`) ?? "free";
                          return <i key={period.id} className={`strip-state ${state}`} title={`${DAY_LONG[day]} · ${period.start} · ${state}`} />;
                        })}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pc-stats">
                <div>
                  <b>{summary.hours}</b>
                  <span>hours / week</span>
                </div>
                <div>
                  <b>{summary.classes.length}</b>
                  <span>sessions</span>
                </div>
                <div>
                  <b>{summary.freePeriods}</b>
                  <span>free periods</span>
                </div>
              </div>

              <div className="pc-next">
                <Icon name="clock" size={12} />
                {summary.classes[0] ? (
                  <span>
                    Next: <b>{summary.classes[0].courseId}</b> · {DAY_LONG[summary.classes[0].day].slice(0, 3)} P
                    {summary.classes[0].startPeriod}
                  </span>
                ) : (
                  <span>No scheduled teaching</span>
                )}
                {person.unavailable.length ? (
                  <span className="chip sand" style={{ marginLeft: "auto" }}>
                    {person.unavailable[0].reason}
                  </span>
                ) : null}
              </div>

              <div className="pc-actions">
                <button
                  className="btn sm"
                  onClick={() => {
                    setDrawer(person.id);
                    setParams({ faculty: person.id });
                  }}
                >
                  Open profile
                </button>
                <button className="btn sm quiet" onClick={() => navigate(`/mosaic`)}>
                  View lane <Icon name="arrowRight" size={12} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {faculty ? (
        <FacultyDrawer
          faculty={faculty}
          onClose={() => {
            setDrawer(null);
            setParams({});
          }}
          onOpenSession={(id) => setSessionDrawer(id)}
        />
      ) : null}
      {drawer && !faculty ? null : null}
      {sessionDrawer ? <SessionDrawer sessionId={sessionDrawer} onClose={() => setSessionDrawer(null)} /> : null}
    </div>
  );
}

function FacultyDrawer({
  faculty,
  onClose,
  onOpenSession,
}: {
  faculty: Faculty;
  onClose: () => void;
  onOpenSession: (id: string) => void;
}) {
  const { data, notify } = useWorkspace();
  const strip = facultyStrip(data, faculty.id);
  const summary = facultySummary(data, faculty.id);
  const [sessionId, setSessionId] = useState<string>(summary.classes[0]?.id ?? "");
  const candidates = sessionId ? replacementCandidates(data, sessionId).slice(0, 4) : [];
  const session = data.sessions.find((s) => s.id === sessionId);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer wide" role="dialog" aria-label={faculty.name}>
        <div className="drawer-head">
          <span className={`avatar xl tone-${tintFor(faculty.id)}`}><Icon name="user" size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <h2>{faculty.name}</h2>
            <div className="pc-role" style={{ marginTop: 2 }}>{designationFor(faculty.id, faculty.department)}</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
              {faculty.department} · {faculty.id} · max {faculty.maxHoursPerDay} h/day
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto" }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="pc-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div>
              <b>{summary.hours}</b>
              <span>teaching hours</span>
            </div>
            <div>
              <b>{summary.classes.length}</b>
              <span>sessions</span>
            </div>
            <div>
              <b>{summary.freePeriods}</b>
              <span>free periods</span>
            </div>
            <div>
              <b>{percent(summary.utilisation)}</b>
              <span>utilisation</span>
            </div>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="eyebrow">Weekly availability</span>
              <span className="row gap-8">
                {STRIP_LEGEND.map((item) => (
                  <span key={item.state} className="legend-key">
                    <i className={`strip-state ${item.state}`} /> {item.label}
                  </span>
                ))}
              </span>
            </div>
            <div className="week-avail">
              <div className="wa-corner" />
              {data.calendar.periods.map((p) => (
                <div key={p.id} className="wa-head">
                  {p.id}
                </div>
              ))}
              {data.calendar.days.map((day) => (
                <div key={day} style={{ display: "contents" }}>
                  <div className="wa-day">{day}</div>
                  {data.calendar.periods.map((p) => {
                    const state = strip.get(`${day}-${p.id}`) ?? "free";
                    return <div key={p.id} className={`wa-cell strip-state ${state}`} title={`${DAY_LONG[day]} ${p.start} · ${state}`} />;
                  })}
                </div>
              ))}
            </div>
          </div>

          {faculty.unavailable.length ? (
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Declared unavailability</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {faculty.unavailable.map((window) => (
                  <div key={`${window.day}-${window.reason}`} className="row-between" style={{ fontSize: 12, color: "var(--text-soft)" }}>
                    <span>
                      <b style={{ color: "var(--text)" }}>{DAY_LONG[window.day]}</b> · periods {window.periods.join(", ")}
                    </span>
                    <span className="chip sand">{window.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Assigned sessions</div>
            <div className="session-list">
              {summary.classes.map((item) => (
                <button key={item.id} className="session-row" onClick={() => onOpenSession(item.id)}>
                  <span className="sr-day">{item.day}</span>
                  <span style={{ minWidth: 0, textAlign: "left" }}>
                    <b>{item.courseId} · {item.courseTitle}</b>
                    <span>
                      {periodSpan(data, item.startPeriod, item.endPeriod)} · {item.roomName} · {item.groupNames.join(", ")}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={13} style={{ marginLeft: "auto", color: "var(--muted)" }} />
                </button>
              ))}
              {summary.classes.length === 0 ? <p className="muted">No sessions assigned.</p> : null}
            </div>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="eyebrow">Session compatibility</span>
              <span className="chip violet">
                <Icon name="sparkles" size={10} /> reassignment
              </span>
            </div>
            <select className="select" value={sessionId} onChange={(event) => setSessionId(event.target.value)} aria-label="Session to reassign">
              {summary.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.courseId} · {DAY_LONG[item.day].slice(0, 3)} P{item.startPeriod}
                </option>
              ))}
            </select>
            {session ? (
              <p style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 8 }}>
                Looking for a substitute for <b>{session.courseId}</b> on {DAY_LONG[session.day]} at{" "}
                {periodSpan(data, session.startPeriod, session.endPeriod)}. Suitability is more than being free.
              </p>
            ) : null}

            <div className="candidate-list">
              {candidates.map((candidate) => (
                <div key={candidate.faculty.id} className={`candidate ${candidate.compatible ? "ok" : "no"}`}>
                  <span className={`avatar tone-${tintFor(candidate.faculty.id)}`}><Icon name="user" size={13} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row-between" style={{ gap: 8 }}>
                      <b>{candidate.faculty.name}</b>
                      <span className={`status ${candidate.compatible ? "valid" : "invalid"}`}>
                        {candidate.compatible ? "suitable" : "not suitable"}
                      </span>
                    </div>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                      {candidate.faculty.department} · {candidate.hours} h this week
                    </span>
                    <div className="candidate-reasons">
                      {candidate.reasons.map((reason) => (
                        <span key={reason.text} className={reason.ok ? "ok" : "no"}>
                          <Icon name={reason.ok ? "check" : "x"} size={9} strokeWidth={2.5} /> {reason.text}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    className="btn sm"
                    disabled={!candidate.compatible || !session}
                    onClick={() =>
                      notify({
                        tone: "info",
                        title: "Reassignment drafted",
                        detail: `${candidate.faculty.name} could cover ${session?.courseId}. Faculty reassignment is owned by the scheduling authority — this is a frontend draft, not a booking.`,
                      })
                    }
                  >
                    Draft
                  </button>
                </div>
              ))}
              {candidates.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>Select a session to see candidates.</p> : null}
            </div>
          </div>

          <div className="callout" style={{ fontSize: 11 }}>
            <Icon name="info" size={13} />
            <span>
              Workload, department and declared unavailability are read from the dataset. Compatibility here is an
              interface aid — the scheduling authority decides an actual reassignment.
            </span>
          </div>
        </div>

        <div className="drawer-foot">
          <button
            className="btn primary"
            onClick={() =>
              notify({
                tone: "info",
                title: "Modification request opened",
                detail: "In live mode this would be sent to /api/disruption/move for a second admin to approve.",
              })
            }
          >
            <Icon name="edit" size={14} /> Request a change
          </button>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginLeft: "auto" }}>
            {formatStampShort(new Date().toISOString())}
          </span>
        </div>
      </aside>
    </>
  );
}
