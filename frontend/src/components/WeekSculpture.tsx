import { useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import type { DayCode, Period, SessionEntry } from "../lib/types";

interface WeekSculptureProps {
  days: DayCode[];
  sessions: SessionEntry[];
  rooms: number;
  periods: Period[];
}

const DAY_NAMES: Record<DayCode, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

/** A tactile, lightweight CSS-3D preview of the actual timetable, not a mock dashboard. */
export function WeekSculpture({ days, sessions, rooms, periods }: WeekSculptureProps) {
  const [selectedDay, setSelectedDay] = useState<DayCode | null>(null);
  const activeDay =
    selectedDay && days.includes(selectedDay) ? selectedDay : days[0];
  const daySessions = sessions.filter((session) => session.day === activeDay);
  const sample = [...daySessions]
    .sort((a, b) => a.startPeriod - b.startPeriod || a.id.localeCompare(b.id))
    .slice(0, 4);

  const timeFor = (period: number) => periods.find((entry) => entry.id === period)?.start ?? `P${period}`;

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== "mouse" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty(
      "--week-x",
      `${(x * 7).toFixed(2)}deg`,
    );
    event.currentTarget.style.setProperty(
      "--week-y",
      `${(-y * 6).toFixed(2)}deg`,
    );
  };
  const resetTilt = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.removeProperty("--week-x");
    event.currentTarget.style.removeProperty("--week-y");
  };

  return (
    <section className="week-section" id="week" aria-labelledby="week-title">
      <div className="rk-inner">
        <div className="week-section-top">
          <span className="week-index">
            <span /> Field note / 01
          </span>
          <span className="week-index">A closer look at the week &nbsp; ↘</span>
        </div>
        <div className="week-layout">
          <div className="week-copy">
            <span className="rk-kicker">A little more clarity</span>
            <h2 id="week-title">
              A lot goes into <em>one good week.</em>
            </h2>
            <p>
              Rooms, people, time and all the little rules in between. Tessera
              brings them together, so the bigger picture finally makes sense.
            </p>
            <div className="week-copy-rule" />
            <div className="week-copy-foot">
              <span className="week-mini-mark" aria-hidden="true">
                ✳
              </span>
              <span>
                Built for the moving pieces.
                <br />
                <strong>Made for the people behind them.</strong>
              </span>
            </div>
          </div>

          <div className="week-experience">
            <div
              className="week-stage"
              onPointerMove={tilt}
              onPointerLeave={resetTilt}
            >
              <div className="week-stage-top">
                <span>THE WEEK, IN PIECES</span>
                <span>FIG. 01 / 05</span>
              </div>
              <div className="week-stage-grid" aria-hidden="true" />
              <div className="week-orbit week-orbit-one" aria-hidden="true" />
              <div className="week-orbit week-orbit-two" aria-hidden="true" />
              <div className="week-object">
                <div
                  className="week-sheet week-sheet-back"
                  aria-hidden="true"
                />
                <div className="week-sheet week-sheet-mid" aria-hidden="true" />
                <div className="week-sheet week-sheet-front">
                  <div className="week-sheet-head">
                    <span>
                      <i /> TESSERA / TIMETABLE
                    </span>
                    <span>WEEKLY OVERVIEW</span>
                  </div>
                  <div className="week-sheet-title">
                    <div>
                      <small>YOUR CAMPUS / TEACHING WEEK</small>
                      <strong>
                        {activeDay ? DAY_NAMES[activeDay] : "Your week"}
                      </strong>
                    </div>
                    <span>
                      {String(daySessions.length).padStart(2, "0")}
                      <small> scheduled</small>
                    </span>
                  </div>
                  <div className="week-sheet-labels">
                    <span>FIRST SESSIONS</span>
                    <span>{sample.length} OF {daySessions.length}</span>
                  </div>
                  <div className="week-sheet-rows" aria-live="polite">
                    {sample.length ? (
                      sample.map((session, index) => (
                        <div className="week-sheet-row" key={session.id}>
                          <span className="week-row-time">{timeFor(session.startPeriod)}</span>
                          <span className={`week-row-marker dot-${index}`} />
                          <span className="week-row-content">
                            <strong>{session.courseTitle}</strong>
                            <small>{session.facultyName}</small>
                          </span>
                          <span className="week-row-room">{session.roomId}</span>
                        </div>
                      ))
                    ) : (
                      <div className="week-sheet-empty">
                        No sessions scheduled for this day.
                      </div>
                    )}
                  </div>
                  <div className="week-sheet-bottom">
                    <span>EARLIEST SESSIONS · {activeDay ?? "WEEK"}</span>
                    <span>↗</span>
                  </div>
                </div>
              </div>
              <div className="week-floating-note" aria-hidden="true">
                <span>✳</span>
                <div>
                  <b>{daySessions.length} sessions</b>
                  <small>on {activeDay ? DAY_NAMES[activeDay] : "this day"}</small>
                </div>
              </div>
              <div className="week-stage-bottom">
                <span className="week-move-hint">MOVE TO EXPLORE</span>
                <span>{rooms} SPACES / ONE CAMPUS</span>
              </div>
            </div>
            <div className="week-controls">
              <div className="week-day-label">
                <span>YOUR WEEK, AT A GLANCE</span>
                <small>
                  Choose a day to explore
                </small>
              </div>
              <div className="week-days" aria-label="Choose a timetable day">
                {days.map((day) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={activeDay === day}
                    aria-label={`${DAY_NAMES[day]}, ${sessions.filter((entry) => entry.day === day).length} sessions`}
                    onClick={() => setSelectedDay(day)}
                  >
                    <span>{day}</span><small>{sessions.filter((entry) => entry.day === day).length}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="week-caption">
              <span>A PREVIEW OF THE CAMPUS TIMETABLE</span>
              <Link to="/login?next=%2Fmosaic">Open the full board ↗</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
