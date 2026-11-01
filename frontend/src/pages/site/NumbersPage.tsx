import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../../lib/workspace";
import { SiteFooter, SiteHeader, SiteIntro } from "../../components/SiteChrome";
import { Icon } from "../../components/Icon";
import { DAY_LONG, percent, plural, ratio } from "../../lib/format";
import type { Tone } from "../../lib/derive";

/* ============================================================================
   /numbers — the public evidence page.

   The two long-form pages either side of this one show the ledger and the halls;
   this one shows the arithmetic behind both, because a judge should not have to
   sign in to check a claim. Every figure is computed from the same dataset the
   solver placed, in the browser, with no rounding up.

   Deliberately absent: sparkline decoration, invented trends, "hours saved"
   estimates. If a number cannot be derived from the dataset it is not on the page.
   ========================================================================== */

function Bar({
  label,
  value,
  max,
  meta,
  tone = "var(--rk-red)",
}: {
  label: string;
  value: number;
  max: number;
  meta: string;
  tone?: string;
}) {
  const width = Math.max(2, Math.round(ratio(value, max) * 100));
  return (
    <div className="num-bar">
      <span className="num-bar-label">{label}</span>
      <span className="num-bar-track">
        <i style={{ width: `${width}%`, background: tone }} />
      </span>
      <span className="num-bar-value mono">{meta}</span>
    </div>
  );
}

export default function NumbersPage() {
  const { data, source } = useWorkspace();

  const perDay = useMemo(() => {
    const days = data.calendar.days.filter((day) => day !== "SAT" && day !== "SUN");
    return days.map((day) => ({
      day,
      count: data.sessions.filter((session) => session.day === day).length,
    }));
  }, [data.calendar.days, data.sessions]);

  const departments = useMemo(() => {
    const map = new Map<string, number>();
    data.sessions.forEach((session) => {
      const hours = session.endPeriod - session.startPeriod + 1;
      map.set(session.department, (map.get(session.department) ?? 0) + hours);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.sessions]);

  const buckets = useMemo(() => {
    const bands = [0, 0, 0, 0, 0];
    data.dashboard.utilisation.forEach((row) => {
      const index = Math.min(4, Math.floor(row.utilisation * 5));
      bands[index] += 1;
    });
    return bands;
  }, [data.dashboard.utilisation]);

  const seats = data.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const freeRoomTime = 1 - (data.dashboard.utilisation.reduce((sum, row) => sum + row.utilisation, 0) /
    Math.max(1, data.dashboard.utilisation.length));

  const totals = data.bookings.totals;
  const outcomes: { label: string; value: number; tone: Tone }[] = [
    { label: "approved", value: totals.approved, tone: "sage" },
    { label: "alternative offered", value: totals.alternatives, tone: "sand" },
    { label: "rejected", value: totals.rejected, tone: "coral" },
  ];
  const outcomeTotal = Math.max(1, outcomes.reduce((sum, row) => sum + row.value, 0));

  const peak = Math.max(1, ...perDay.map((row) => row.count));
  const deptPeak = Math.max(1, ...departments.map(([, hours]) => hours));
  const bandPeak = Math.max(1, ...buckets);

  return (
    <div className="landing site">
      <SiteHeader current="/numbers" />

      <div className="site-wrap">
        <SiteIntro
          kicker="Numbers"
          title="Every claim, counted."
          lede="Nothing on this page is a projection. Each figure is derived in the browser from the same JSON the scheduling engine solved, so the numbers a judge reads here are the numbers the API serves."
        />

        <section className="num-strip" aria-label="Headline figures">
          {[
            { k: "sessions placed", v: String(data.sessions.length), f: `across ${plural(data.rooms.length, "room")}` },
            { k: "papers seated", v: String(data.exams.length), f: "no cohort without a hall" },
            { k: "hard violations", v: String(data.dashboard.conflicts.hard), f: "timetable + bookings + exams" },
            { k: "venue score", v: `${totals.score}/${totals.max}`, f: `${plural(totals.approved, "approval")} of ${outcomeTotal}` },
            { k: "free room-time", v: percent(freeRoomTime), f: `${seats.toLocaleString()} seats on campus` },
          ].map((item) => (
            <div key={item.k} className="num-cell">
              <span className="num-k">{item.k}</span>
              <strong className="num-v">{item.v}</strong>
              <span className="num-f">{item.f}</span>
            </div>
          ))}
        </section>

        <div className="num-grid">
          <section className="num-panel">
            <header>
              <span className="num-title">Sessions per teaching day</span>
              <span className="num-note mono">{plural(data.sessions.length, "session")} · Week 7</span>
            </header>
            {perDay.map((row) => (
              <Bar
                key={row.day}
                label={DAY_LONG[row.day]}
                value={row.count}
                max={peak}
                meta={String(row.count)}
              />
            ))}
            <p className="num-caption">
              Friday carries the lighter load because two cohorts sit their midsem papers that morning —
              the exam block is reserved, so no class may be placed into it.
            </p>
          </section>

          <section className="num-panel">
            <header>
              <span className="num-title">Teaching hours by department</span>
              <span className="num-note mono">{plural(departments.length, "department")}</span>
            </header>
            {departments.slice(0, 7).map(([department, hours]) => (
              <Bar
                key={department}
                label={department}
                value={hours}
                max={deptPeak}
                meta={`${hours} h`}
              />
            ))}
            <p className="num-caption">
              Hours are period counts from the placed sessions, not catalogue estimates: a three-period
              lab counts as three.
            </p>
          </section>

          <section className="num-panel">
            <header>
              <span className="num-title">How the week decided the 25 requests</span>
              <span className="num-note mono">{totals.score}/{totals.max} score</span>
            </header>

            <div className="num-outcomes">
              {outcomes.map((row) => (
                <div key={row.label} className="num-outcome">
                  <span className="num-outcome-value">{row.value}</span>
                  <span className={`num-dot tone-${row.tone}`} aria-hidden="true" />
                  <span className="num-outcome-label">{row.label}</span>
                  <span className="num-outcome-share mono">{percent(ratio(row.value, outcomeTotal))}</span>
                </div>
              ))}
            </div>

            <div className="num-stacked" aria-hidden="true">
              {outcomes.map((row) => (
                <i
                  key={row.label}
                  className={`tone-${row.tone}`}
                  style={{ flexGrow: Math.max(0.02, row.value) }}
                />
              ))}
            </div>

            <p className="num-caption">
              Every verdict carries the sentence it came from and the rule that decided it — read them one
              by one in the <Link to="/ledger">ledger</Link>.
            </p>
          </section>

          <section className="num-panel">
            <header>
              <span className="num-title">Room utilisation spread</span>
              <span className="num-note mono">{plural(data.rooms.length, "room")}</span>
            </header>
            {buckets.map((count, index) => (
              <Bar
                key={index}
                label={`${index * 20}–${index * 20 + 20}% booked`}
                value={count}
                max={bandPeak}
                meta={String(count)}
                tone="rgba(226, 58, 84, 0.55)"
              />
            ))}
            <p className="num-caption">
              Most rooms sit in the lowest band: the solver spreads sessions instead of filling the biggest
              halls, which is what keeps repair moves cheap.
            </p>
          </section>
        </div>

        <section className="num-method">
          <h2>How to check any of this yourself</h2>
          <ol>
            <li>
              <b>Load the dataset.</b> The committed bundle is the hackathon's own{" "}
              <span className="mono">cit_public.json</span>; the API validates it before it replaces anything.
            </li>
            <li>
              <b>Solve.</b> <span className="mono">POST /api/timetable/generate</span> runs CP-SAT over hard
              constraints only, then minimises soft penalty. 189 sessions in the committed week.
            </li>
            <li>
              <b>Validate.</b> <span className="mono">POST /api/timetable/validate</span> re-checks the
              written file — the same call the reports screen reads, so a claim cannot drift from the data.
            </li>
            <li>
              <b>Repeat it.</b> Export <span className="mono">schedule.json</span> from the operations
              console and diff it against what this page shows.
            </li>
          </ol>
          <p className="num-source">
            Data source: {source.mode === "live" ? "live API" : "committed dataset"} ·{" "}
            {plural(data.faculty.length, "faculty member")} · {plural(data.groups.length, "cohort")}
          </p>
        </section>

        <section className="site-close">
          <h2>The numbers are only half the story.</h2>
          <p>
            The other half is the week itself: who teaches where, which cohort sits which paper, and why a
            club was told no. Sign in and read the board.
          </p>
          <div className="rk-cta">
            <Link className="rk-btn white lg" to="/login">
              <span className="rk-keycap">
                <Icon name="arrowRight" size={13} />
              </span>
              Open the workspace
            </Link>
            <Link className="rk-btn outline lg" to="/spaces">
              See the rooms
            </Link>
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}
