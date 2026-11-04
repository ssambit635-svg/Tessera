import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { API_BASE } from "../lib/api";
import { Icon } from "../components/Icon";
import { TileMark } from "../components/TileMark";
import { GlassStripes } from "../components/GlassStripes";
import { SpreadReveal } from "../components/SpreadReveal";
import { ProductFilm } from "../components/ProductFilm";
import BeamWordmarkFooter from "../components/BeamFooter";
import { Magnetic } from "../components/Magnetic";
import { TextReveal } from "../components/TextReveal";

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

/* The API's Swagger UI. Same origin in dev (vite proxies /docs); on the split deployment the
   UI is a separate static origin, so the docs must point at the API itself. */
const DOCS_URL = `${API_BASE}/docs`;

const NAV_LINKS = [
  { href: "#film", label: "Film", icon: "play" },
  { href: "#product", label: "Product", icon: "board" },
  { href: "#proof", label: "Proof", icon: "sigma" },
  { href: "#screens", label: "Screens", icon: "grid" },
  { href: "#assistant", label: "Assistant", icon: "sparkles" },
];

export default function Landing() {
  const { data, source } = useWorkspace();
  const navigate = useNavigate();
  const [navSolid, setNavSolid] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

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

  const perDay = useMemo(
    () =>
      data.calendar.days.slice(0, 5).map((day) => ({
        day,
        count: data.sessions.filter((session) => session.day === day).length,
      })),
    [data],
  );
  const busiestDay = Math.max(1, ...perDay.map((entry) => entry.count));

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
            <TileMark size={26} accent={false} />
          </span>
          Tessera
        </Link>

        <nav className="rk-links" aria-label="Landing sections">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rk-tab"
              data-open={activeTab === link.href ? "true" : "false"}
              aria-current={activeTab === link.href ? "true" : undefined}
              onClick={() => setActiveTab(link.href)}
            >
              <Icon name={link.icon} size={20} />
              <span className="rk-tab-label">
                <span>{link.label}</span>
              </span>
            </a>
          ))}
        </nav>

        <div className="rk-nav-actions">
          <Link className="rk-navlink" to="/login">
            Log in
          </Link>
          <Magnetic>
            <Link className="rk-btn white sm" to="/login">
              <span className="rk-keycap">
                <Icon name="arrowRight" size={12} />
              </span>
              Sign in
            </Link>
          </Magnetic>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <div className="rk-stage">
        {/* The reference's ribbon field, uncovered from the centre on open. */}
        <SpreadReveal className="rk-hero-art">
          <GlassStripes stripeCount={18} angle={34} pointerStrength={0.4} />
        </SpreadReveal>

        <section className="rk-hero">
          <p className="rk-eyebrow">Tech Zephyr 4.0 · Team Voltryx</p>

          <h1 className="rk-title">
            <span>One campus. One week.</span>
            <span className="rk-title-dim">Zero clashes.</span>
          </h1>

          <p className="rk-sub">
            {numbers.sessions} sessions, {numbers.exams} exams and {data.bookings.count} venue requests,
            placed across {numbers.rooms} rooms by a solver that holds every rule — and explains every
            decision it makes.
          </p>

          <div className="rk-cta">
            <Magnetic strength={0.14}>
              <Link className="rk-btn white lg" to="/login">
                <span className="rk-keycap">
                  <Icon name="arrowRight" size={13} />
                </span>
                Sign in to Tessera
              </Link>
            </Magnetic>
            <button className="rk-btn outline lg" onClick={() => go("/mosaic")}>
              Explore the board
            </button>
          </div>

          <p className="rk-cta-note">
            {source.mode === "live" ? "Connected to your campus schedule" : "Explore the campus schedule in preview mode"}
          </p>
        </section>

        <a href="#week" className="rk-hero-scroll"><span>SCROLL TO EXPLORE</span><span aria-hidden="true">↓</span></a>
        <div className="rk-hero-bottom" aria-hidden="true" />
      </div>

      {/* Everything past the hero shares one dot field, so the pattern is continuous
          across sections instead of restarting at every boundary. */}
      <div className="rk-body">
      <ProductFilm
        src="/media/tessera-product-film.mp4"
        poster="/media/tessera-product-film.jpg"
        duration="0:29"
        stats={{ sessions: numbers.sessions, rooms: numbers.rooms, faculty: numbers.faculty }}
      />

      {/* --------------------------------------------------------- product */}
      <section className="rk-section" id="product">
        <div className="rk-inner">
          <div className="rk-head">
            <span className="rk-kicker">02 — The product</span>
            <TextReveal
              as="h2"
              className="rk-h2"
              dim={0.13}
              text="Three decisions the campus makes every week."
            />
            <TextReveal
              className="rk-lede"
              dim={0.24}
              text="Tessera is not a calendar. It is the authority that decides what goes where — and keeps a record of why."
            />
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
                body: `${data.bookings.count} venue requests, considered against the institute’s priority order, with a clear reason for each decision.`,
                stats: [
                  ["booking score", `${numbers.bookings.score}/${numbers.bookings.max}`],
                  ["approved", String(numbers.bookings.approved)],
                ],
                to: "/bookings",
              },
              {
                icon: "route",
                title: "Repair, not rebuild",
                body: "When a room closes or a faculty member travels, Tessera proposes a checked repair and waits for a second admin to review it.",
                stats: [
                  ["review", "required"],
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
                <TextReveal className="rk-card-body" dim={0.26} text={card.body} />
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
              <span className="rk-kicker">03 — The proof</span>

              <div className="rk-statement-block">
                <TextReveal
                  as="h2"
                  className="rk-statement"
                  dim={0.1}
                  text="A clearer picture of campus."
                />
                <TextReveal
                  className="rk-statement-tail"
                  dim={0.16}
                  text="A closer look at the sessions, papers and requests in the current schedule. Every number here comes from the workspace."
                />
              </div>

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
              <GlassStripes
                stripeCount={12}
                angle={34}
                interactive={false}
                quality="low"
                restX={-70}
                restY={-40}
                className="glass-panel"
              />

              <div className="rk-ledger">
                <div className="rk-ledger-head">
                  <b>Campus schedule</b>
                  <span className="rk-ledger-tag">
                    <Icon name="check" size={10} /> {source.mode === "live" ? "connected" : "preview"}
                  </span>
                </div>

                <div className="rk-meter" aria-hidden="true">
                  {perDay.map(({ day, count }) => (
                    <div key={day} className="rk-meter-day">
                      <b>{count}</b>
                      <span className="rk-meter-track">
                        <span
                          className="rk-meter-bar"
                          style={{ height: `${Math.round((count / busiestDay) * 100)}%` }}
                        />
                      </span>
                      <i>{day.slice(0, 3).toUpperCase()}</i>
                    </div>
                  ))}
                </div>

                {[
                  [String(numbers.sessions), "teaching sessions placed", `${numbers.rooms} rooms · ${numbers.faculty} faculty`],
                  [String(numbers.exams), "midsem papers seated", "every cohort fits its hall"],
                  [
                    String(data.bookings.count),
                    "venue requests decided",
                    `${numbers.bookings.approved} approved · ${numbers.bookings.alternatives} alternative · ${numbers.bookings.rejected} rejected`,
                  ],
                  [`${numbers.bookings.score}/${numbers.bookings.max}`, "booking score", "scored against campus priorities"],
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
                  <Icon name="shield" size={11} /> {numbers.hard} hard conflicts · second-admin approval on every repair
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
            <span className="rk-kicker">04 — The screens</span>
            <TextReveal
              as="h2"
              className="rk-h2"
              dim={0.13}
              text="Every rule has a page you can stand in front of."
            />
            <TextReveal
              className="rk-lede"
              dim={0.24}
              text="Sign in with any demo seat — the whole workspace is this one app."
            />
          </div>

          <div className="rk-screens">
            {[
              ["Mosaic Board", "Week, day, room, faculty and group views with drag-to-preview a move before it happens.", "board", "/mosaic"],
              ["Bookings", `${data.bookings.count} requests, their venues and the reasons behind each decision.`, "ticket", "/bookings"],
              ["Approvals", "Upload a change file, watch the minimal-move repair, then approve or reject it with a reason.", "shield", "/approvals"],
              ["Examinations", `${numbers.exams} papers by day and slot, with seating and room availability.`, "clipboard", "/exams"],
              ["Intelligence", "Hinglish or English in, a checked proposal out — the model reads, the engine decides.", "sparkles", "/intelligence"],
              ["Operations", "Load a dataset, generate the timetable, review activity and export the results.", "database", "/operations"],
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
                <TextReveal className="rk-screen-body" dim={0.26} text={body} />
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
              <span className="rk-kicker">05 — The assistant</span>
              <TextReveal
                as="h2"
                className="rk-h2"
                dim={0.13}
                text="Ask in Hinglish. Get a checked answer."
              />
              <TextReveal
                className="rk-lede"
                dim={0.24}
                text="Describe what you need in your own words. Tessera helps turn it into a request you can review, while campus rules check what is possible before anything changes."
              />
              <ul className="rk-bullets">
                <li><Icon name="check" size={13} /> Write naturally in English or Hinglish</li>
                <li><Icon name="check" size={13} /> Review the details before submitting</li>
                <li><Icon name="check" size={13} /> Campus rules check every proposed change</li>
              </ul>
            </div>

            <div className="rk-chat">
              <div className="rk-bubble user">
                <span className="rk-ai-head">AN EXAMPLE REQUEST</span>
                “Kal shaam ek seminar hall chahiye, 100 logon ke liye.”
              </div>
              <div className="rk-bubble ai">
                <span className="rk-ai-head"><TileMark size={13} /> TESSERA</span>
                <p>Start with a sentence. Review the time, attendance and room details before checking availability.</p>
                <button className="rk-assistant-link" onClick={() => go("/intelligence")}>Explore the assistant <Icon name="arrowUpRight" size={13} /></button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- long-form */}
      <section className="rk-section" id="longform">
        <div className="rk-inner">
          <div className="rk-head">
            <span className="rk-kicker">06 — The record</span>
            <TextReveal
              as="h2"
              className="rk-h2"
              dim={0.13}
              text="Four pages you can read without signing in."
            />
            <TextReveal
              className="rk-lede"
              dim={0.24}
              text="The same data the workspace runs on, printed in full: every request with its reason, every paper with its seats, every room with its load."
            />
          </div>

          <div className="rk-screens">
            {[
              [
                "The Ledger",
                `${numbers.bookings.approved} approved · ${numbers.bookings.alternatives} alternative · ${numbers.bookings.rejected} rejected — each row carries the sentence it came from and the rule that decided it.`,
                "ticket",
                "/ledger",
              ],
              [
                "The Seating Plan",
                `${numbers.exams} midsem papers, every cohort measured against the halls it was given, slot by slot.`,
                "clipboard",
                "/seating",
              ],
              [
                "The Estate",
                `${numbers.rooms} rooms sorted by load, the peak hour named, and every closure the solver may never touch.`,
                "grid",
                "/spaces",
              ],
              [
                "The Numbers",
                "Sessions per day, hours by department, booking decisions and the utilisation spread.",
                "chart",
                "/numbers",
              ],
            ].map(([title, body, icon, to]) => (
              <Link key={title} className="rk-screen rk-screen-link" to={to}>
                <span className="rk-screen-top">
                  <span className="rk-screen-icon">
                    <Icon name={icon} size={15} />
                  </span>
                  <span className="rk-screen-go">
                    <Icon name="arrowUpRight" size={13} />
                  </span>
                </span>
                <b>{title}</b>
                <TextReveal className="rk-screen-body" dim={0.26} text={body} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="week-close" aria-labelledby="week-close-title">
        <div className="rk-inner week-close-inner">
          <div className="week-close-meta"><span>THE WORK BEHIND THE WEEK</span><span>FIN / 06</span></div>
          <div className="week-close-content">
            <div><p className="rk-kicker">Ready when you are</p><h2 id="week-close-title">Make room for <em>better weeks.</em></h2></div>
            <div className="week-close-action"><p>See how a little more order can make space for everything else.</p><Link className="rk-btn white lg" to="/login">Explore Tessera <Icon name="arrowUpRight" size={15} /></Link></div>
          </div>
        </div>
      </section>
      </div>

      <BeamWordmarkFooter
        brand="Tessera"
        company="Tessera"
        cut={0.14}
        socials={[
          {
            label: "GitHub",
            href: "https://github.com/ssambit635-svg/Tessera",
            icon: "github",
          },
          {
            label: "Documentation",
            href: DOCS_URL,
            icon: (
              <path
                d="M9 7.5 4.5 12 9 16.5M15 7.5 19.5 12 15 16.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ),
          },
        ]}
        credits={[
          {
            lead: "Built by ",
            label: "team Voltryx",
            href: "https://github.com/ssambit635-svg/Tessera",
            tail: " · Tech Zephyr 4.0",
          },
          {
            lead: "Dataset ",
            label: data.datasetId || "cit-public-v1",
            tail: ` · ${numbers.sessions} sessions · ${numbers.exams} papers`,
          },
        ]}
      />
    </div>
  );
}
