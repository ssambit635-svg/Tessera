import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { TileMark } from "../components/TileMark";
import { plural } from "../lib/format";

/* ============================================================================
   /landing — the public front door.

   The dress is the reference's (raycast.com), measured off the live page: a
   black stage, one field of film-grain diagonal ribbons, a huge sentence, a
   floating pill nav, then plain black sections. The hero is a statement, not a
   screenshot — the product object lives further down, floating over its own
   ribbon art, the way the reference shows a feature.

   Deliberately absent: glows, blooms, gradient text, floating blobs, count-up
   stats. The only colour is the hero art and the app's own department tones.
   ========================================================================== */

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#proof", label: "Proof" },
  { href: "#screens", label: "Screens" },
  { href: "#assistant", label: "Assistant" },
];

export default function Landing() {
  const { data, source } = useWorkspace();
  const navigate = useNavigate();
  const [navSolid, setNavSolid] = useState(false);

  /* One rAF-throttled scroll handler: the nav only gains weight once the visitor leaves the
     fold. Nothing else listens to scroll. */
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
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
      <header className={`rk-nav ${navSolid ? "solid" : ""}`}>
        <Link to="/landing" className="rk-brand" aria-label="Tessera home">
          <span className="ld-mark">
            <TileMark size={22} accent={false} />
          </span>
          Tessera
        </Link>

        <nav className="rk-links" aria-label="Landing sections">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="rk-nav-actions">
          <Link className="rk-navlink" to="/login">
            Log in
          </Link>
          <Link className="rk-btn white sm" to="/login">
            <span className="rk-keycap">
              <Icon name="arrowRight" size={12} />
            </span>
            Sign in
          </Link>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <div className="rk-stage">
        <div className="rk-beams" aria-hidden="true">
          <span className="rk-beam-a" />
          <span className="rk-beam-b" />
          <span className="rk-beam-c" />
          <span className="rk-beam-mask" />
          <span className="rk-grain" />
        </div>

        <section className="rk-hero">
          <p className="rk-eyebrow">Tech Zephyr 4.0 · Team Voltryx</p>

          <h1 className="rk-title">
            <span>Your week,</span> <span>solved.</span>
          </h1>

          <p className="rk-sub">{numbers.sessions} sessions. {numbers.exams} exams. Zero clashes.</p>

          <div className="rk-cta">
            <Link className="rk-btn white lg" to="/login">
              <span className="rk-keycap">
                <Icon name="arrowRight" size={13} />
              </span>
              Sign in to Tessera
            </Link>
            <button className="rk-btn outline lg" onClick={() => go("/mosaic")}>
              See the live board
            </button>
          </div>

          <p className="rk-cta-note">
            Five demo seats, one password ·{" "}
            {source.mode === "live" ? "live scheduling API" : "committed dataset"}
          </p>
        </section>

        <div className="rk-hero-bottom" aria-hidden="true" />
      </div>

      {/* --------------------------------------------------------- product */}
      <section className="rk-section" id="product">
        <div className="rk-inner">
          <div className="rk-head">
            <span className="rk-kicker">01 — The product</span>
            <h2 className="rk-h2">Three decisions the campus makes every week.</h2>
            <p className="rk-lede">
              Tessera is not a calendar. It is the authority that decides what goes where — and keeps
              a record of why.
            </p>
          </div>

          <div className="rk-cards">
            {[
              {
                icon: "board",
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
                title: "Repair, not rebuild",
                body: "A room closes or a faculty member travels: the engine moves the fewest sessions possible, re-validates everything, and waits for a second admin to say yes.",
                stats: [
                  ["moved by contract", "minimum"],
                  ["awaiting approval", String(numbers.proposals)],
                ],
                to: "/approvals",
              },
            ].map((card) => (
              <button key={card.title} className="rk-card" onClick={() => go(card.to)}>
                <span className="rk-card-icon">
                  <Icon name={card.icon} size={16} />
                </span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <div className="rk-stats">
                  {card.stats.map(([label, value]) => (
                    <span key={label}>
                      <b>{value}</b>
                      <i>{label}</i>
                    </span>
                  ))}
                </div>
                <span className="rk-card-go">
                  Open the screen <Icon name="arrowUpRight" size={12} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- proof */}
      <section className="rk-proof" id="proof">
        <div className="rk-inner">
          <div className="rk-proof-split">
            <div>
              <span className="rk-kicker">02 — The proof</span>

              <h2 className="rk-statement">
                <b>Nothing here was typed by hand.</b>{" "}
                <span>
                  The week is solved, the exams seated and every request answered before the page
                  loads — you are reading the workspace, not a promise about it.
                </span>
              </h2>

              <div className="rk-product">
                <span className="rk-product-name">
                  <TileMark size={16} accent={false} /> Tessera Ledger
                </span>
                <p className="rk-product-note">
                  One signed-off week, as the institute sees it:{" "}
                  <a href="#screens">open the screens</a> and check every number yourself.
                </p>
              </div>
            </div>

            <div className="rk-stage-card">
              <div className="rk-beams" aria-hidden="true">
                <span className="rk-beam-a" />
                <span className="rk-beam-b" />
                <span className="rk-beam-c" />
                <span className="rk-beam-mask" />
                <span className="rk-grain" />
              </div>

              <div className="rk-ledger">
                <div className="rk-ledger-head">
                  <b>Week 7 · signed off</b>
                  <span className="rk-ledger-tag">
                    <Icon name="check" size={10} /> validated
                  </span>
                </div>
                {[
                  [String(numbers.hard), "hard violations", "timetable + bookings + exams"],
                  [String(numbers.exams), "midsem papers seated", "every cohort fits its hall"],
                  [
                    `${numbers.bookings.score}/${numbers.bookings.max}`,
                    "booking score",
                    "22 approved · 1 alternative · 2 rejected",
                  ],
                  ["0", "priority inversions", "the institute's order wins every tie"],
                ].map(([value, label, note]) => (
                  <div key={label} className="rk-ledger-row">
                    <span>
                      {label}
                      <em>{note}</em>
                    </span>
                    <b>{value}</b>
                  </div>
                ))}
                <div className="rk-ledger-foot">
                  <Icon name="shield" size={11} /> second-admin approval on every repair
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- screens */}
      <section className="rk-section" id="screens">
        <div className="rk-inner">
          <div className="rk-head">
            <span className="rk-kicker">03 — The screens</span>
            <h2 className="rk-h2">Every rule has a page you can stand in front of.</h2>
            <p className="rk-lede">Sign in with any demo seat — the whole workspace is this one app.</p>
          </div>

          <div className="rk-screens">
            {[
              ["Mosaic Board", "Week, day, room, faculty and group views with drag-to-preview a move before it happens.", "board", "/mosaic"],
              ["Bookings", "25 requests, the parsed message, the venue, the rule chain behind each verdict.", "ticket", "/bookings"],
              ["Approvals", "Upload a change file, watch the minimal-move repair, then approve or reject it with a reason.", "shield", "/approvals"],
              ["Examinations", "41 papers by day and slot, seat counts against cohort size, maintenance cells that are hard-blocked.", "clipboard", "/exams"],
              ["Intelligence", "Hinglish or English in, a checked proposal out — the model reads, the engine decides.", "sparkles", "/intelligence"],
              ["Operations", "Load a dataset, regenerate, export the exact files the validator reads, inspect the database and the audit trail.", "database", "/operations"],
            ].map(([title, body, icon, to]) => (
              <button key={title} className="rk-screen" onClick={() => go(to)}>
                <span className="rk-screen-top">
                  <span className="rk-screen-icon">
                    <Icon name={icon} size={15} />
                  </span>
                  <span className="rk-screen-go">
                    <Icon name="arrowUpRight" size={13} />
                  </span>
                </span>
                <b>{title}</b>
                <p>{body}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- assistant */}
      <section className="rk-section" id="assistant">
        <div className="rk-inner">
          <div className="rk-split">
            <div>
              <span className="rk-kicker">04 — The assistant</span>
              <h2 className="rk-h2">Ask in Hinglish. Get a checked answer.</h2>
              <p className="rk-lede">
                A sentence is read by a small model on the free tier; whether the change is{" "}
                <em>legal</em> is decided by the constraint kernel, never by the model. When the key
                is absent or the daily budget is spent, the deterministic parser answers instead —
                same endpoints, same guarantees.
              </p>
              <ul className="rk-bullets">
                <li>
                  <Icon name="check" size={13} /> {plural(1000, "request")}/day on the 70B model,
                  counted before every call
                </li>
                <li>
                  <Icon name="check" size={13} /> a rate limit is never retried — it falls back, then
                  stops
                </li>
                <li>
                  <Icon name="check" size={13} /> the key never leaves the server
                </li>
              </ul>
            </div>

            <div className="rk-chat" aria-hidden="true">
              <div className="rk-bubble user">
                “CS101-A-L1 kal subah nahi, Tuesday 3rd period me shift kar do”
              </div>
              <div className="rk-bubble ai">
                <span className="rk-ai-head">
                  <TileMark size={13} /> TESSERA
                </span>
                <p>
                  Valid. <b>1 session moves</b> — CS101-A-L1 → TUE P3, room unchanged. No hard rule
                  broken: F33 free, CE-2 free, room fits 50 seats.
                </p>
                <div className="rk-tags">
                  <span>proposal PR-585f9bf2</span>
                  <span>awaiting a second admin</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- close */}
      <section className="rk-close">
        <span className="rk-close-mark">
          <TileMark size={38} accent={false} />
        </span>
        <h2>Step inside the campus.</h2>
        <p>
          Five demo seats, one password, no setup. The board opens on the week that is already
          solved.
        </p>
        <div className="rk-cta">
          <Link className="rk-btn white lg" to="/login">
            <span className="rk-keycap">
              <Icon name="arrowRight" size={13} />
            </span>
            Sign in
          </Link>
          <a className="rk-btn outline lg" href="/docs" target="_blank" rel="noreferrer">
            API docs
          </a>
        </div>

        <footer className="rk-footer">
          <span>
            Tessera · team Voltryx · Tech Zephyr 4.0 · dataset{" "}
            <span className="mono">{data.datasetId || "cit-public-v1"}</span>
          </span>
          <span className="rk-footer-links">
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
