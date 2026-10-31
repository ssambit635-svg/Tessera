import { useState } from "react";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { departmentStats, facultySummary } from "../lib/derive";
import { initials, tintFor } from "../lib/persona";
import { plural } from "../lib/format";

export default function Departments() {
  const { data } = useWorkspace();
  const stats = departmentStats(data);
  const [open, setOpen] = useState<string | null>(null);
  const active = stats.find((s) => s.code === open) ?? null;

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Management</div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            Departments.
          </h2>
          <p>{plural(stats.length, "teaching department")} derived from the course catalogue, faculty and placed sessions.</p>
        </div>
      </div>

      <div className="dept-grid">
        {stats.map((dept) => (
          <button key={dept.code} className={`dept-card tone-${dept.tone}`} onClick={() => setOpen(dept.code)}>
            <div className="dept-top">
              <span className="dept-code">{dept.code}</span>
              <span className="dept-hours">{dept.hours}h</span>
            </div>
            <div className="dept-metrics">
              <div>
                <b>{dept.faculty}</b>
                <span>faculty</span>
              </div>
              <div>
                <b>{dept.courses}</b>
                <span>courses</span>
              </div>
              <div>
                <b>{dept.groups}</b>
                <span>groups</span>
              </div>
              <div>
                <b>{dept.sessions}</b>
                <span>sessions</span>
              </div>
            </div>
            <div className="dept-foot">
              <span className="meter thin">
                <i style={{ width: `${Math.min(100, (dept.hours / 90) * 100)}%`, background: `var(--${dept.tone})` }} />
              </span>
              <span className="mono">{dept.rooms.length} rooms</span>
              <Icon name="arrowUpRight" size={13} />
            </div>
          </button>
        ))}
      </div>

      {active ? (
        <>
          <div className="scrim" onClick={() => setOpen(null)} />
          <aside className="drawer" role="dialog" aria-label={`${active.code} department`}>
            <div className="drawer-head">
              <div>
                <div className="eyebrow">Department</div>
                <h2 style={{ marginTop: 3 }}>{active.code}</h2>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
                  {active.courses} courses · {active.sessions} sessions · {active.hours} teaching hours
                </div>
              </div>
              <button className="close-btn" onClick={() => setOpen(null)} aria-label="Close" style={{ marginLeft: "auto" }}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="drawer-body">
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Faculty</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.faculty
                    .filter((f) => f.department === active.code)
                    .map((person) => {
                      const summary = facultySummary(data, person.id);
                      return (
                        <div key={person.id} className="row gap-10">
                          <span className={`avatar tone-${tintFor(person.id)}`}>{initials(person.name)}</span>
                          <span style={{ display: "flex", flexDirection: "column" }}>
                            <b style={{ fontSize: 12.5, fontFamily: "var(--font-display)", fontWeight: 500 }}>{person.name}</b>
                            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                              {summary.hours} h · {summary.classes.length} sessions
                            </span>
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Courses</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {data.courses
                    .filter((c) => c.department === active.code)
                    .map((course) => (
                      <div key={course.id} className="row-between" style={{ fontSize: 12, color: "var(--text-soft)" }}>
                        <span>
                          <span className="mono" style={{ marginRight: 6, color: "var(--muted)" }}>{course.id}</span>
                          {course.title}
                        </span>
                        <span className="chip outline">Y{course.year}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
            <div className="drawer-foot">
              <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                Read-only view of the shared dataset
              </span>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
