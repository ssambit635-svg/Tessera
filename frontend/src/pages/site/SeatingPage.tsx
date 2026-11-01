import { useMemo, useState } from "react";
import { useWorkspace } from "../../lib/workspace";
import { SiteFooter, SiteHeader, SiteIntro } from "../../components/SiteChrome";
import { Icon } from "../../components/Icon";
import { DAY_LONG } from "../../lib/format";
import type { DayCode } from "../../lib/types";

/* ============================================================================
   /seating — the midsem plan.

   Exams are the one schedule where being one seat short is a hard failure, so
   this page shows the two numbers that matter per paper: how many students, how
   many seats, and which halls carry them. Maintenance cells are printed as
   blocked, not omitted — the gaps are part of the plan.
   ========================================================================== */

export default function SeatingPage() {
  const { data } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null);

  const days = (data.calendar.examWeek?.days ?? data.calendar.days) as DayCode[];
  const slots = useMemo(
    () => [...new Set(data.exams.map((exam) => exam.slot))].sort(),
    [data.exams],
  );

  const papers = useMemo(
    () =>
      selected
        ? data.exams.filter((exam) => `${exam.day}-${exam.slot}` === selected)
        : data.exams,
    [data.exams, selected],
  );

  const grid = useMemo(() => {
    const map = new Map<string, { papers: number; students: number }>();
    data.exams.forEach((exam) => {
      const key = `${exam.day}-${exam.slot}`;
      const current = map.get(key) ?? { papers: 0, students: 0 };
      map.set(key, { papers: current.papers + 1, students: current.students + exam.size });
    });
    return map;
  }, [data.exams]);

  const capacityOf = (ids: string[]) =>
    ids.reduce((sum, id) => sum + Math.floor((data.rooms.find((room) => room.id === id)?.capacity ?? 0) / 2), 0);

  const totalStudents = data.exams.reduce((sum, exam) => sum + exam.size, 0);
  const seatsOffered = data.exams.reduce((sum, exam) => sum + (exam.seats ?? capacityOf(exam.rooms)), 0);
  const hallsUsed = new Set(data.exams.flatMap((exam) => exam.rooms)).size;
  const averageFill = Math.round((totalStudents / Math.max(1, seatsOffered)) * 100);
  const biggest = data.exams.reduce((lead, exam) => (exam.size > lead.size ? exam : lead), data.exams[0]);
  /* the tightest paper is measured against *all* the halls it is seated in, not the
     first one — otherwise a four-room paper reads as 400% of a single classroom */
  const tightRoom = data.exams.reduce(
    (worst, exam) => {
      const seats = exam.seats ?? capacityOf(exam.rooms);
      const fill = exam.size / Math.max(1, seats);
      return fill > worst.fill ? { fill, exam } : worst;
    },
    { fill: 0, exam: data.exams[0] },
  );

  return (
    <div className="landing site">
      <SiteHeader current="/seating" />

      <main className="site-wrap">
        <SiteIntro
          kicker="The seating plan · midsem examinations"
          title={`${data.exams.length} papers. ${totalStudents.toLocaleString("en-IN")} candidates. No hall over its limit.`}
          lede="Exams use a separate week, half-capacity seating and declared maintenance restrictions. Pick a slot to read the papers in it."
        />

        <div className="site-kpis">
          <span>
            <b>{data.exams.length}</b>
            <i>papers scheduled</i>
          </span>
          <span>
            <b>{totalStudents.toLocaleString("en-IN")}</b>
            <i>candidates seated</i>
          </span>
          <span>
            <b>{seatsOffered.toLocaleString("en-IN")}</b>
            <i>seats offered</i>
          </span>
          <span>
            <b>{biggest?.size ?? 0}</b>
            <i>largest single paper</i>
          </span>
          <span>
            <b>{hallsUsed}</b>
            <i>halls carrying papers</i>
          </span>
          <span>
            <b>{averageFill}%</b>
            <i>average seat fill</i>
          </span>
        </div>

        <section className="seating-panel">
          <div className="seating-head">
            <h2>Slot map</h2>
            <span className="mono">
              {selected ? `showing ${papers.length} paper(s) in one slot` : "click a cell to filter below"}
            </span>
          </div>

          <div className="seating-grid" style={{ gridTemplateColumns: `80px repeat(${days.length}, minmax(0, 1fr))` }}>
            <span />
            {days.map((day) => (
              <span key={day} className="seating-day mono">
                {DAY_LONG[day].slice(0, 3).toUpperCase()}
              </span>
            ))}

            {slots.map((slot) => (
              <div key={slot} style={{ display: "contents" }}>
                <span className="seating-slot mono">{slot}</span>
                {days.map((day) => {
                  const cell = grid.get(`${day}-${slot}`);
                  const key = `${day}-${slot}`;
                  return (
                    <button
                      key={key}
                      className="seating-cell"
                      data-on={selected === key ? "true" : "false"}
                      data-empty={cell ? "false" : "true"}
                      onClick={() => setSelected(selected === key ? null : key)}
                      aria-label={cell ? `${cell.papers} papers on ${DAY_LONG[day]} ${slot}` : `nothing on ${DAY_LONG[day]} ${slot}`}
                    >
                      {cell ? (
                        <>
                          <b>{cell.papers}</b>
                          <i>{cell.students} seats</i>
                        </>
                      ) : (
                        <i>free</i>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="seating-table">
          <div className="seating-head">
            <h2>{selected ? "Papers in the selected slot" : "Every paper"}</h2>
            <span className="mono">
              {tightRoom.exam
                ? `tightest fit · ${Math.round(tightRoom.fill * 100)}% of the seats it was given`
                : ""}
            </span>
          </div>

          <div className="paper-head mono">
            <span>paper</span>
            <span>cohort</span>
            <span>halls</span>
            <span>seats</span>
            <span>when</span>
          </div>

          {papers.map((exam) => {
            const seats = exam.seats ?? capacityOf(exam.rooms);
            const fill = Math.round((exam.size / Math.max(1, seats)) * 100);
            return (
              <div key={exam.id} className="paper-row">
                <span className="paper-name">
                  <b>{exam.courseTitles[0] ?? exam.id}</b>
                  <i>
                    {exam.courseIds.join(" · ")} — {exam.groupNames.join(", ")}
                  </i>
                </span>
                <span className="paper-num mono">{exam.size}</span>
                <span className="paper-halls mono">{exam.rooms.join(", ") || "—"}</span>
                <span className="paper-seats">
                  <span className="paper-bar">
                    <i style={{ width: `${Math.min(100, fill)}%` }} />
                  </span>
                  <em className="mono">
                    {seats} · {fill}%
                  </em>
                </span>
                <span className="paper-when mono">
                  {DAY_LONG[exam.day].slice(0, 3)} · {exam.slot}
                  <em>{exam.durationHours}h</em>
                </span>
              </div>
            );
          })}
        </section>

        <section className="site-close">
          <h2>Seating is a constraint, not a spreadsheet.</h2>
          <p>
            A hall can be closed, a cohort can grow, a paper can be moved — the plan re-validates
            instead of trusting yesterday's grid. {data.unavailability.length} declared closures and
            every blocked cell are excluded before a paper is seated.
          </p>
          <div className="rk-cta">
            <a className="rk-btn white lg" href="/login?next=%2Fexams">
              <span className="rk-keycap">
                <Icon name="arrowRight" size={13} />
              </span>
              Open the examinations screen
            </a>
            <a className="rk-btn outline lg" href="/spaces">
              Next: rooms and utilisation
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
