import { useState } from "react";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { groupStrip, groupSummary, periodSpan, toneForDepartment } from "../lib/derive";
import { DAY_LONG } from "../lib/format";
import { tintFor, initials } from "../lib/persona";

export default function Groups() {
  const { data } = useWorkspace();
  const [open, setOpen] = useState<string | null>(null);
  const active = data.groups.find((g) => g.id === open) ?? null;

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Management</div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            Academic groups.
          </h2>
          <p>{data.groups.length} cohorts share rooms, faculty and hours. Click a row for its week.</p>
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Group</th>
                <th>Year</th>
                <th>Department</th>
                <th>Size</th>
                <th>Sessions</th>
                <th>Teaching hours</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.map((group) => {
                const summary = groupSummary(data, group.id);
                return (
                  <tr key={group.id} onClick={() => setOpen(group.id)}>
                    <td>
                      <div className="row gap-8">
                        <span className={`avatar sm tone-${tintFor(group.id)}`}>{initials(group.name)}</span>
                        <span>
                          <strong>{group.name}</strong>
                          <span className="mono" style={{ display: "block", fontSize: 9.5, color: "var(--muted)" }}>{group.id}</span>
                        </span>
                      </div>
                    </td>
                    <td className="mono">Y{group.year}</td>
                    <td>
                      <span className={`chip ${group.department ? "outline" : "neutral"}`}>{group.department ?? "COMMON"}</span>
                    </td>
                    <td className="mono">{group.size}</td>
                    <td className="mono">{summary.classes.length}</td>
                    <td className="mono">{summary.hours}h</td>
                    <td>
                      <span className={`status ${group.needsAccessible ? "warning" : "valid"}`}>
                        {group.needsAccessible ? "step-free" : "standard"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {active ? (
        <>
          <div className="scrim" onClick={() => setOpen(null)} />
          <aside className="drawer" role="dialog" aria-label={active.name}>
            <div className="drawer-head">
              <div>
                <div className="eyebrow">Academic group</div>
                <h2 style={{ marginTop: 3 }}>{active.name}</h2>
                <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                  {active.id} · {active.size} students · {active.department ?? "COMMON"}
                </div>
              </div>
              <button className="close-btn" onClick={() => setOpen(null)} aria-label="Close" style={{ marginLeft: "auto" }}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="drawer-body">
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Week</div>
                <div className="week-avail">
                  <div className="wa-corner" />
                  {data.calendar.periods.filter((p) => p.teaching).map((p) => (
                    <div key={p.id} className="wa-head">{p.id}</div>
                  ))}
                  {data.calendar.days.map((day) => (
                    <div key={day} style={{ display: "contents" }}>
                      <div className="wa-day">{day}</div>
                      {data.calendar.periods
                        .filter((p) => p.teaching)
                        .map((p) => {
                          const state = groupStrip(data, active.id).get(`${day}-${p.id}`) ?? "free";
                          return (
                            <div
                              key={p.id}
                              className={`wa-cell strip-state ${state}`}
                              title={`${DAY_LONG[day]} ${p.start} · ${state}`}
                            />
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Sessions</div>
                <div className="session-list">
                  {groupSummary(data, active.id).classes.map((session) => (
                    <div key={session.id} className="session-row static">
                      <span className="sr-day">{session.day}</span>
                      <span style={{ minWidth: 0, textAlign: "left" }}>
                        <b>{session.courseId} · {session.courseTitle}</b>
                        <span>
                          {periodSpan(data, session.startPeriod, session.endPeriod)} · {session.roomName} · {session.facultyName}
                        </span>
                      </span>
                      <span className={`chip tone-${toneForDepartment(session.department)}`}>{session.kind}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
