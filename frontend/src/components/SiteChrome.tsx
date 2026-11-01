import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { TileMark } from "./TileMark";
import BeamWordmarkFooter from "./BeamFooter";

/* ============================================================================
   The chrome for the public long-form pages (/ledger, /seating, /spaces).

   Same grammar as the front door — the mark, a quiet pill nav, hairlines — but
   no scroll spy and no hero art: these pages are meant to be read.
   ========================================================================== */

const PAGES = [
  { to: "/ledger", label: "Ledger" },
  { to: "/seating", label: "Seating" },
  { to: "/spaces", label: "Spaces" },
  { to: "/numbers", label: "Numbers" },
];

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="site-head">
      <div className="site-head-inner">
        <Link to="/landing" className="rk-brand" aria-label="Tessera home">
          <span className="ld-mark">
            <TileMark size={24} />
          </span>
          Tessera
        </Link>

        <nav className="site-nav" aria-label="Long-form pages">
          {PAGES.map((page) => (
            <Link
              key={page.to}
              to={page.to}
              className="site-nav-link"
              data-current={current === page.to ? "true" : "false"}
            >
              {page.label}
            </Link>
          ))}
        </nav>

        <div className="site-head-actions">
          <Link className="rk-navlink" to="/landing">
            Back to the front door
          </Link>
          <Link className="rk-btn solid sm" to="/login">
            <span className="rk-keycap">
              <Icon name="arrowRight" size={12} />
            </span>
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}

/** The long-form pages close on the same beam wordmark as the front door. */
export function SiteFooter() {
  return <BeamWordmarkFooter brand="Tessera" company="Tessera" cut={0.14} />;
}

/** Page intro used by all three long-form pages. */
export function SiteIntro({
  kicker,
  title,
  lede,
}: {
  kicker: string;
  title: string;
  lede: string;
}) {
  return (
    <div className="site-intro">
      <span className="rk-kicker">{kicker}</span>
      <h1 className="site-title">{title}</h1>
      <p className="site-lede">{lede}</p>
    </div>
  );
}
