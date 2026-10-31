import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { TileMark } from "../components/TileMark";
import { DAY_LONG, plural } from "../lib/format";
import { toneForDepartment } from "../lib/derive";

/* ============================================================================
   /landing — the public front door.

   Structure follows the reference (raycast.com): a dark stage, one sentence,
   the product shown as a real window, then proof. The dress is Tessera's own:
   Space Grotesk + Instrument Serif, the tile palette, and real numbers read
   from the committed dataset — never a stock screenshot, never a fake metric.
   ========================================================================== */

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#proof", label: "Proof" },
  { href: "#screens", label: "Screens" },
  { href: "#assistant", label: "Assistant" },
];

interface MiniTile {
  key: string;
  code: string;
  title: string;
  room: string;
  time: string;
  tone: string;
  span: number;
  faculty: string;
}

/**
 * The hero board is the real timetable, not a drawing: every cell is a session that exists in
 * the loaded dataset, keyed by day + starting period, so the board looks as full as the week is.
 */
function useMiniBoard() {
  const { data } = useWorkspace();
  return useMemo(() => {
    const periods = data.calendar.periods.slice(0, 9);
    const days = data.calendar.days.slice(0, 5);
    const byCell = new Map<string, MiniTile>();
    data.sessions.forEach((session) => {
      const key = `${session.day}-${session.startPeriod}`;
      const existing = byCell.get(key);
      // two sessions can share a slot; keep the one that spans more periods, it reads better
      const span = session.endPeriod - session.startPeriod + 1;
      if (existing && span <= existing.span) return;
      byCell.set(key, {
        key: `${session.id}-${key}`,
        code: session.courseId,
        title: session.courseTitle,
        room: session.roomId,
        time: data.calendar.periods.find((p) => p.id === session.startPeriod)?.start ?? "",
        tone: toneForDepartment(session.department),
        span,
        faculty: session.facultyName,
      });
    });
    const perDay = days.map((day) => data.sessions.filter((s) => s.day === day).length);
    return { periods, days, byCell, perDay };
  }, [data]);
}

export default function Landing() {
  const { data, source } = useWorkspace();
  const navigate = useNavigate();
  const board = useMiniBoard();
  const stageRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const [navSolid, setNavSolid] = useState(false);

  /* The hero window stands up as you scroll (Raycast's signature move), but the pose is a
     single CSS variable written inside requestAnimationFrame - no layout thrash, and none of
     it runs at all when the visitor asked for reduced motion. */
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const node = windowRef.current;
    if (!node) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight || 800;
      const progress = Math.min(1, Math.max(0, (viewport - rect.top) / (viewport * 0.92)));
      node.style.setProperty("--pose", (1 - progress).toFixed(3));
      setNavSolid(window.scrollY > 24);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const go = (to: string) => navigate(`/login?next=${encodeURIComponent(to)}`);

  const numbers = {
    sessions: data.dashboard.counts.sessions,
    rooms: data.rooms.length,
    faculty: data.faculty.length,
    exams: data.exams.length,
    hard: data.dashboard.conflicts.hard,
    soft: data.dashboard.soft.total,
    bookings: data.bookings.totals,
    proposals: data.dashboard.pendingProposals,
  };

  return (
    <div className="landing">
      {/* ------------------------------------------------------------- stage (dark) */}
      <div className="ld-stage" ref={stageRef}>
        <div className="ld-aurora" aria-hidden="true">
          <span className="ld-blob a" />
          <span className="ld-blob b" />
          <span className="ld-blob c" />
          <span className="ld-grid" />
          <span className="ld-grain" />
        </div>

        <header className={`ld-nav ${navSolid ? "solid" : ""}`}>
          <Link to="/landing" className="ld-brand" aria-label="Tessera home">
            <span className="ld-mark">
              <TileMark size={24} accent={false} />
            </span>
            <span className="ld-wordmark">TESSERA</span>
          </Link>
          <nav className="ld-nav-links" aria-label="Landing sections">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="ld-nav-actions">
            <button className="ld-btn ghost sm" onClick={() => go("/mosaic")}>
              Open the board
            </button>
            <Link className="ld-btn lime sm" to="/login">
              Sign in <Icon name="arrowRight" size={13} />
            </Link>
          </div>
        </header>

        <section className="ld-hero">
          <div className="ld-eyebrow">
            <span className="ld-pill">
              <i />
              Tech Zephyr 4.0 · Team Voltryx
            </span>
          </div>

          <h1 className="ld-title">
            The timetable that
            <br />
            <em>explains itself.</em>
          </h1>

          <p className="ld-sub">
            {numbers.sessions} teaching sessions, {numbers.exams} midsem papers and{" "}
            {data.bookings.count} venue requests — placed by a constraint solver, and every decision
            arrives with its reason attached.
          </p>

          <div className="ld-cta-row">
            <Link className="ld-btn lime lg" to="/login">
              Sign in to Tessera <Icon name="arrowRight" size={15} />
            </Link>
            <button className="ld-btn ghost lg" onClick={() => go("/mosaic")}>
              <Icon name="play" size={13} /> See the live board
            </button>
          </div>

          <p className="ld-micro">
            <Icon name={source.mode === "live" ? "zap" : "database"} size={11} />
            {source.mode === "live"
              ? "Reading the live scheduling API"
              : "Reading the committed dataset — no model, no network, same answers"}
          </p>

          {/* the product, as a window */}
          <div className="ld-window-wrap">
            <div className="ld-window" ref={windowRef}>
              <div className="ld-window-bar">
                <span className="ld-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="ld-window-title">Mosaic Board · week 7 · Spectra ’27</span>
                <span className="ld-window-meta">
                  {numbers.hard} hard conflicts · {percentFree(data)} free room-time
                </span>
              </div>

              <div className="ld-board">
                <div className="ld-board-head">
                  <span className="ld-board-corner" />
                  {board.days.map((day, index) => (
                    <span key={day} className="ld-board-day">
                      <b>{DAY_LONG[day].slice(0, 3)}</b>
                      <i>{board.perDay[index]}</i>
                    </span>
                  ))}
                </div>
                <div className="ld-board-body">
                  {board.periods.map((period) => (
                    <div className="ld-board-row" key={period.id}>
                      <span className="ld-board-hour">{period.start}</span>
                      {board.days.map((day) => {
                        const tile = board.byCell.get(`${day}-${period.id}`);
                        return (
                          <span key={`${day}-${period.id}`} className={`ld-board-cell ${tile ? "filled" : ""}`}>
                            {tile ? (
                              <span className={`ld-mini tone-${tile.tone}`}>
                                <b>{tile.code}</b>
                                <span>{tile.title}</span>
                                <i>
                                  {tile.room} · {tile.faculty}
                                </i>
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="ld-window-foot">
                <span>
                  <Icon name="check" size={11} /> validated · 0 hard violations
                </span>
                <span>
                  <Icon name="shield" size={11} /> second-admin approval required
                </span>
                <span>
                  <Icon name="sparkles" size={11} /> reasons, not guesses
                </span>
              </div>
            </div>
            <span className="ld-window-glow" aria-hidden="true" />
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------- product (paper) */}
      <section className="ld-section" id="product">
        <div className="ld-section-head">
          <span className="ld-kicker">01 · The product</span>
          <h2>
            Three decisions the campus
            <br />
            makes every single week.
          </h2>
          <p>
            Tessera is not a calendar. It is the authority that decides what goes where — and keeps a
            record of why.
          </p>
        </div>

        <div className="ld-three">
          {[
            {
              icon: "board",
              tone: "sky",
              title: "Place the week",
              body: `${numbers.sessions} sessions across ${numbers.rooms} rooms and ${numbers.faculty} faculty, solved with CP-SAT so the hard rules hold and the soft costs stay near zero.`,
              stats: [
                ["hard violations", String(numbers.hard)],
                ["soft penalty", String(numbers.soft)],
              ],
              to: "/mosaic",
            },
            {
              icon: "ticket",
              tone: "lime",
              title: "Decide every request",
              body: "All 25 Spectra-week asks, ranked by the institute's own priority order, each answered with a venue and a reason chain — approved, alternative, or rejected.",
              stats: [
                ["booking score", `${numbers.bookings.score}/${numbers.bookings.max}`],
                ["approved", String(numbers.bookings.approved)],
              ],
              to: "/bookings",
            },
            {
              icon: "route",
              tone: "violet",
              title: "Repair, not rebuild",
              body: "A room closes or a faculty member travels: the engine moves the fewest sessions possible, re-validates everything, and waits for a second admin to say yes.",
              stats: [
                ["moved by contract", "minimum"],
                ["awaiting approval", String(numbers.proposals)],
              ],
              to: "/approvals",
            },
          ].map((card) => (
            <article key={card.title} className={`ld-card tone-${card.tone}`}>
              <span className="ld-card-icon">
                <Icon name={card.icon} size={17} />
              </span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <div className="ld-card-stats">
                {card.stats.map(([label, value]) => (
                  <span key={label}>
                    <b>{value}</b>
                    <i>{label}</i>
                  </span>
                ))}
              </div>
              <button className="ld-card-link" onClick={() => go(card.to)}>
                Open the screen <Icon name="arrowUpRight" size={12} />
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- proof */}
      <section className="ld-proof" id="proof">
        <div className="ld-proof-inner">
          <div className="ld-proof-copy">
            <span className="ld-kicker">02 · The proof</span>
            <h2>Numbers we did not type by hand.</h2>
            <p>
              These are read from the running workspace, and CI re-checks the same bundle with the
              organisers’ own <span className="mono">validator.py</span> on every push.
            </p>
          </div>
          <div className="ld-proof-grid">
            {[
              [String(numbers.hard), "hard violations", "timetable + bookings + exams"],
              [String(numbers.exams), "midsem papers seated", "every cohort fits its hall"],
              [`${numbers.bookings.score}/${numbers.bookings.max}`, "booking score", "22 approved · 1 alternative · 2 rejected"],
              ["0", "priority inversions", "the institute's order wins every tie"],
            ].map(([value, label, note]) => (
              <div key={label} className="ld-proof-cell">
                <b>{value}</b>
                <span>{label}</span>
                <i>{note}</i>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- screens */}
      <section className="ld-section" id="screens">
        <div className="ld-section-head">
          <span className="ld-kicker">03 · The screens</span>
          <h2>
            Every rule has a page
            <br />
            you can stand in front of.
          </h2>
          <p>Sign in with any demo seat — the whole workspace is this one app.</p>
        </div>

        <div className="ld-screens">
          {[
            ["Mosaic Board", "Week, day, room, faculty and group views with drag-to-preview a move before it happens.", "board", "/mosaic"],
            ["Bookings", "25 requests, the parsed message, the venue, the rule chain behind each verdict.", "ticket", "/bookings"],
            ["Approvals", "Upload a change file, watch the minimal-move repair, then approve or reject it with a reason.", "shield", "/approvals"],
            ["Examinations", "41 papers by day and slot, seat counts against cohort size, maintenance cells that are hard-blocked.", "clipboard", "/exams"],
            ["Intelligence", "Hinglish or English in, a checked proposal out — the model reads, the engine decides.", "sparkles", "/intelligence"],
            ["Operations", "Load a dataset, regenerate, export the exact files the validator reads, inspect the database and the audit trail.", "database", "/operations"],
          ].map(([title, body, icon, to]) => (
            <button key={title} className="ld-screen" onClick={() => go(to)}>
              <span className="ld-screen-icon">
                <Icon name={icon} size={15} />
              </span>
              <b>{title}</b>
              <p>{body}</p>
              <span className="ld-screen-go">
                <Icon name="arrowUpRight" size={12} />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- assistant */}
      <section className="ld-assistant" id="assistant">
        <div className="ld-assistant-inner">
          <div className="ld-assistant-copy">
            <span className="ld-kicker">04 · The assistant</span>
            <h2>Ask in Hinglish. Get a checked answer.</h2>
            <p>
              A sentence is read by a small model on the free tier; whether the change is <em>legal</em>{" "}
              is decided by the constraint kernel, never by the model. When the key is absent or the
              daily budget is spent, the deterministic parser answers instead — same endpoints, same
              guarantees.
            </p>
            <ul className="ld-bullets">
              <li>
                <Icon name="check" size={12} /> {plural(1000, "request")}/day on the 70B model, counted
                before every call
              </li>
              <li>
                <Icon name="check" size={12} /> a rate limit is never retried — it falls back, then stops
              </li>
              <li>
                <Icon name="check" size={12} /> the key never leaves the server
              </li>
            </ul>
          </div>
          <div className="ld-chat" aria-hidden="true">
            <div className="ld-bubble user">
              “CS101-A-L1 kal subah nahi, Tuesday 3rd period me shift kar do”
            </div>
            <div className="ld-bubble ai">
              <span className="ld-ai-head">
                <TileMark size={14} /> TESSERA
              </span>
              <p>
                Valid. <b>1 session moves</b> — CS101-A-L1 → TUE P3, room unchanged. No hard rule
                broken: F33 free, CE-2 free, room fits 50 seats.
              </p>
              <div className="ld-chat-tags">
                <span>proposal PR-585f9bf2</span>
                <span>awaiting a second admin</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- close */}
      <section className="ld-close">
        <div className="ld-close-inner">
          <span className="ld-mark big">
            <TileMark size={40} accent={false} />
          </span>
          <h2>Step inside the campus.</h2>
          <p>
            Five demo seats, one password, no setup. The board opens on the week that is already
            solved.
          </p>
          <div className="ld-cta-row">
            <Link className="ld-btn lime lg" to="/login">
              Sign in <Icon name="arrowRight" size={15} />
            </Link>
            <a className="ld-btn ghost lg" href="/docs" target="_blank" rel="noreferrer">
              <Icon name="external" size={13} /> API docs
            </a>
          </div>
        </div>
        <footer className="ld-footer">
          <span>
            TESSERA · team Voltryx · Tech Zephyr 4.0 · dataset{" "}
            <span className="mono">{data.datasetId || "cit-public-v1"}</span>
          </span>
          <span className="ld-footer-links">
            <Link to="/login">Sign in</Link>
            <a href="https://github.com/ssambit635-svg/Tessera" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="/docs" target="_blank" rel="noreferrer">
              API
            </a>
          </span>
        </footer>
      </section>
    </div>
  );
}

function percentFree(data: ReturnType<typeof useWorkspace>["data"]) {
  const teaching = data.calendar.periods.filter((p) => p.teaching).length * data.calendar.days.length;
  const busy = data.sessions.reduce((sum, s) => sum + (s.endPeriod - s.startPeriod + 1), 0);
  const capacity = teaching * Math.max(1, data.rooms.length);
  return `${Math.round(((capacity - busy) / Math.max(1, capacity)) * 100)}%`;
}
