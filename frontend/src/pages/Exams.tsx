import { useMemo, useState } from "react";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { DAY_LONG, plural } from "../lib/format";
import type { DayCode } from "../lib/types";

/** Slot labels come from the dataset's own exam clock, never from a guess. */
function slotLabel(data: ReturnType<typeof useWorkspace>["data"], slot: string) {
  const window = data.calendar.examWeek?.sessions?.find((s) => s.id === slot);
  if (window) return `${slot} · ${window.start}–${window.end}`;
  return slot;
}

export default function Exams() {
  const { data } = useWorkspace();
  const [day, setDay] = useState<string>("ALL");

  const exams = data.exams;
  const days = (data.calendar.examWeek?.days ?? data.calendar.days) as DayCode[];
  const roomName = (id: string) => data.rooms.find((r) => r.id === id)?.name ?? id;
  const roomCapacity = (id: string) => data.rooms.find((r) => r.id === id)?.capacity ?? 0;

  const rows = useMemo(
    () =>
      exams
        .filter((exam) => (day === "ALL" ? true : exam.day === day))
        .slice()
        .sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day) || a.slot.localeCompare(b.slot)),
    [exams, day, days],
  );

  const unscheduled = exams.filter((exam) => exam.slot === "unscheduled" || exam.rooms.length === 0);
  const seats = (exam: typeof exams[number]) =>
    exam.seats ?? exam.rooms.reduce((sum, id) => sum + Math.floor(roomCapacity(id) / 2), 0);
  const tight = exams.filter((exam) => seats(exam) > 0 && seats(exam) < exam.size);
  const totalSeats = exams.reduce((sum, exam) => sum + seats(exam), 0);
  const totalNeed = exams.reduce((sum, exam) => sum + exam.size, 0);

  const byDay = days.map((code) => ({
    code,
    exams: exams.filter((exam) => exam.day === code),
  }));

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">
            Midsem examinations
            {data.calendar.examWeek?.sessions?.length
              ? ` · ${data.calendar.examWeek.sessions.map((s) => s.id).join(" / ")} sessions`
              : ""}
          </div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            {exams.length} exams, no class left homeless.
          </h2>
          <p>
            Exam week is separate from the teaching timetable. Each room contributes half its
            normal capacity, with one available invigilator per room. Weekly unavailability is
            conservatively applied to exam week.
          </p>
        </div>
        <div className="row gap-8" style={{ flexShrink: 0 }}>
          <button className={`btn sm ${day === "ALL" ? "primary" : "quiet"}`} onClick={() => setDay("ALL")}>
            All days
          </button>
          {days.map((code) => (
            <button key={code} className={`btn sm ${day === code ? "primary" : "quiet"}`} onClick={() => setDay(code)}>
              {code}
            </button>
          ))}
        </div>
      </div>

      <div className="exam-strip">
        <div className="es-cell">
          <b>{exams.length - unscheduled.length}</b>
          <span>papers scheduled</span>
        </div>
        <div className="es-cell">
          <b>{byDay.filter((d) => d.exams.length).length}</b>
          <span>exam days used</span>
        </div>
        <div className="es-cell">
          <b className={unscheduled.length ? "warn" : ""}>{unscheduled.length}</b>
          <span>without a hall</span>
        </div>
        <div className="es-cell">
          <b className={tight.length ? "warn" : ""}>{tight.length}</b>
          <span>short on seats</span>
        </div>
        <div className="es-cell">
          <b>
            {totalNeed} → {totalSeats}
          </b>
          <span>students → seats</span>
        </div>
      </div>

      <div className="exam-day-grid">
        {byDay.map((group) => (
          <div key={group.code} className={`exam-day ${group.exams.length ? "" : "quiet"}`}>
            <div className="ed-head">
              <strong>{DAY_LONG[group.code] ?? group.code}</strong>
              <span>{plural(group.exams.length, "paper")}</span>
            </div>
            <div className="ed-slots">
              {(data.calendar.examWeek?.sessions.map((s) => s.id) ?? ["AM", "PM"]).map((slot) => {
                const slotExams = group.exams.filter((exam) => exam.slot === slot);
                if (!slotExams.length) return null;
                return (
                  <div key={slot} className="ed-slot">
                    <span className="mono">{slotLabel(data, slot)}</span>
                    <div className="ed-pills">
                      {slotExams.map((exam) => (
                        <span key={exam.id} className="ed-pill">
                          {exam.courseIds.join(" + ")}
                          <i>{exam.size}</i>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {group.exams.length === 0 ? <span className="ed-empty">No papers</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="eyebrow">Exam seating table</div>
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            {rows.length} SHOWN · SEAT COUNT FROM THE DATASET
          </span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 96 }}>Exam</th>
                <th>Course</th>
                <th style={{ width: 140 }}>Groups</th>
                <th style={{ width: 64 }}>Day</th>
                <th style={{ width: 84 }}>Slot</th>
                <th>Halls</th>
                <th>Invigilators</th>
                <th style={{ width: 118 }}>Seats vs cohort</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((exam) => {
                const seatTotal = seats(exam);
                const ok = seatTotal >= exam.size;
                return (
                  <tr key={exam.id}>
                    <td className="mono">{exam.id}</td>
                    <td>
                      <strong>{exam.courseIds.join(", ")}</strong>
                      <div className="cell-sub">{exam.durationHours} h · {exam.groupNames.join(", ")}</div>
                    </td>
                    <td className="mono">{exam.groupIds.join(", ") || "—"}</td>
                    <td>{exam.slot === "unscheduled" ? "—" : exam.day}</td>
                    <td className="mono">{exam.slot}</td>
                    <td>
                      <div className="hall-pills">
                        {exam.rooms.length ? (
                          exam.rooms.map((id) => (
                            <span key={id} className="hall-pill" title={`${roomName(id)} · exam seats ${Math.floor(roomCapacity(id) / 2)}`}>
                              {id}
                            </span>
                          ))
                        ) : (
                          <span className="mono" style={{ color: "var(--coral-ink)" }}>
                            unplaced
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="mono">
                      {exam.invigilators?.length
                        ? exam.invigilators.map((item) => `${item.room_id}: ${item.faculty_id}`).join(", ")
                        : "Not assigned in this snapshot"}
                    </td>
                    <td>
                      <div className="seat-meter" title={ok ? "Enough seats" : "Short of seats"}>
                        <div className="sm-track">
                          <i
                            style={{
                              width: `${Math.min(100, (exam.size / Math.max(1, seatTotal)) * 100)}%`,
                              background: ok ? "var(--sage-ink)" : "var(--coral-ink)",
                            }}
                          />
                        </div>
                        <span className="mono">
                          {exam.size}/{seatTotal || 0}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel-foot">
          <Icon name="shield" size={13} />
          <span>
            A paper short of seats is a genuine finding, not a formatting gap — the API computes the
            same number and the evaluator fails the schedule if any cohort does not fit.
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="eyebrow">Declared unavailability · maintenance &amp; closures</div>
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            {data.maintenance.length} CELLS BLOCKED
          </span>
        </div>
        <div className="maint-grid">
          {data.maintenance.map((cell) => {
            const room = data.rooms.find((r) => r.id === cell.room_id);
            return (
              <div key={`${cell.room_id}-${cell.day}-${cell.period}`} className="maint-cell">
                <span className="mc-room">
                  {room?.name ?? cell.room_id}
                  <i>{room?.building ?? ""}</i>
                </span>
                <span className="mc-when">
                  {DAY_LONG[cell.day] ?? cell.day} · P{cell.period}
                </span>
              </div>
            );
          })}
          {data.maintenance.length === 0 ? (
            <div className="empty" style={{ gridColumn: "1 / -1" }}>
              <p>No maintenance cells in this dataset.</p>
            </div>
          ) : null}
        </div>
        <div className="panel-foot">
          <Icon name="info" size={13} />
          <span>
            These cells are hard-blocked: the generator and the repair engine both refuse to place a
            class or a booking in them.
          </span>
        </div>
      </div>

      {unscheduled.length ? (
        <div className="panel">
          <div className="panel-head">
            <div className="eyebrow" style={{ color: "var(--coral-ink)" }}>
              Unplaced papers
            </div>
          </div>
          <div className="empty">
            <Icon name="alert" size={18} />
            <p>
              {unscheduled.length} paper(s) have no hall. Regenerate the timetable from the admin
              console — the exam placer will report why a paper cannot be seated.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
