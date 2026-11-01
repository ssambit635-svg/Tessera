import { useMemo } from "react";
import { useWorkspace } from "../../lib/workspace";
import { SiteFooter, SiteHeader, SiteIntro } from "../../components/SiteChrome";
import { Icon } from "../../components/Icon";

/* ============================================================================
   /spaces — what the 27 rooms actually carry.

   Utilisation is the honest measure of a timetable: a room that is 90% booked
   is a bottleneck, a room at 12% is a wasted hall, and both are visible here.
   ========================================================================== */

export default function SpacesPage() {
  const { data } = useWorkspace();

  const rows = useMemo(() => {
    return data.rooms
      .map((room) => {
        const sessions = data.sessions.filter((session) => session.roomId === room.id);
        const hours = sessions.reduce((sum, session) => sum + (session.endPeriod - session.startPeriod + 1), 0);
        const exams = data.exams.filter((exam) => exam.rooms.includes(room.id)).length;
        return { room, sessions: sessions.length, hours, exams };
      })
      .sort((a, b) => b.sessions - a.sessions);
  }, [data.rooms, data.sessions, data.exams]);

  const busiest = rows[0];
  const quietest = rows[rows.length - 1];
  const maxSessions = Math.max(1, ...rows.map((row) => row.sessions));

  const byPeriod = useMemo(() => {
    return data.calendar.periods
      .filter((period) => period.teaching)
      .map((period) => ({
        period,
        count: data.sessions.filter((session) => session.startPeriod === period.id).length,
      }));
  }, [data.calendar.periods, data.sessions]);

  const busiestPeriod = byPeriod.reduce(
    (lead, entry) => (entry.count > lead.count ? entry : lead),
    byPeriod[0] ?? { period: undefined, count: 0 },
  );

  const types = useMemo(() => {
    const map = new Map<string, number>();
    data.rooms.forEach((room) => map.set(room.type, (map.get(room.type) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.rooms]);

  const seats = data.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const unused = rows.filter((row) => row.sessions === 0).length;

  return (
    <div className="landing site">
      <SiteHeader current="/spaces" />

      <main className="site-wrap">
        <SiteIntro
          kicker="The estate · rooms and utilisation"
          title={`${data.rooms.length} rooms. ${seats.toLocaleString("en-IN")} seats. Every hour accounted for.`}
          lede="A timetable is a statement about space: which halls are full, which are idle, and which cannot be used at all. This is the whole estate, sorted by how hard the solver leans on it."
        />

        <div className="site-kpis">
          <span>
            <b>{busiest?.sessions ?? 0}</b>
            <i>{busiest?.room.name ?? "—"} · busiest room</i>
          </span>
          <span>
            <b>{quietest?.sessions ?? 0}</b>
            <i>{quietest?.room.name ?? "—"} · lightest load</i>
          </span>
          <span>
            <b>{busiestPeriod.count}</b>
            <i>sessions in the peak period{busiestPeriod.period ? ` · ${busiestPeriod.period.start}` : ""}</i>
          </span>
          <span>
            <b>{unused}</b>
            <i>rooms with no sessions</i>
          </span>
          <span>
            <b>{data.rooms.filter((room) => room.accessible).length}</b>
            <i>accessible rooms</i>
          </span>
        </div>

        <section className="spaces-panel">
          <div className="seating-head">
            <h2>Load by room</h2>
            <span className="mono">{types.map(([type, count]) => `${type} ${count}`).join(" · ")}</span>
          </div>

          <div className="room-table">
            {rows.map(({ room, sessions, hours, exams }) => (
              <div key={room.id} className="room-row">
                <span className="room-name">
                  <b>{room.name}</b>
                  <i>
                    {room.building} · {room.capacity} seats · {room.type}
                  </i>
                </span>

                <span className="room-bar">
                  <i style={{ width: `${Math.round((sessions / maxSessions) * 100)}%` }} />
                </span>

                <span className="room-num mono">
                  {sessions}
                  <em>sessions</em>
                </span>
                <span className="room-num mono">
                  {hours}
                  <em>periods</em>
                </span>
                <span className="room-num mono">
                  {exams}
                  <em>papers</em>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="spaces-split">
          <div>
            <h2>What the solver avoids</h2>
            <ul className="site-bullets">
              <li>
                <Icon name="check" size={13} />
                {data.maintenance.length + data.unavailability.length} blocked room-cells and declared
                closures are hard rules — no session, no paper
              </li>
              <li>
                <Icon name="check" size={13} />
                {data.unavailability.length} declared closures carried straight from the dataset
              </li>
              <li>
                <Icon name="check" size={13} />
                labs never host a theory cohort; the room type is a rule, not a preference
              </li>
            </ul>
          </div>

          <div>
            <h2>The peak hour</h2>
            <p className="site-body">
              {busiestPeriod.period
                ? `${busiestPeriod.period.start}–${busiestPeriod.period.end} carries ${busiestPeriod.count} sessions — the point where the estate is closest to its limit.`
                : "No sessions in the committed snapshot."}
            </p>
            <div className="peak-bars">
              {byPeriod.map((entry) => (
                <span key={entry.period.id} title={`${entry.count} sessions`}>
                  <i style={{ height: `${Math.round((entry.count / Math.max(1, busiestPeriod.count)) * 100)}%` }} />
                  <em className="mono">{entry.period.start}</em>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="site-close">
          <h2>Space is the argument.</h2>
          <p>
            Every extra room-hour is a class that can move without breaking something else. The
            estate is why the solver moves three sessions instead of thirty.
          </p>
          <div className="rk-cta">
            <a className="rk-btn white lg" href="/login?next=%2Favailability">
              <span className="rk-keycap">
                <Icon name="arrowRight" size={13} />
              </span>
              Open availability
            </a>
            <a className="rk-btn outline lg" href="/ledger">
              Back to the ledger
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
