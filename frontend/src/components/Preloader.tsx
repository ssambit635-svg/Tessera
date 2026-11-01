import { useEffect, useState } from "react";
import { TileMark } from "./TileMark";

/* ============================================================================
   The intro curtain.

   Walbi's opening move, rebuilt for Tessera: a full-bleed dark stage, a bank of thin
   metering bars along the top edge, the wordmark in the middle — then the whole curtain
   lifts and the site is revealed underneath from below.

   Deliberately restrained: the wordmark is plain Inter (not the display face), the bars
   are the only colour, and there is no glow anywhere. The curtain never blocks the app
   for longer than one brand beat — the caller decides when it may leave.
   ========================================================================== */

const BAR_COUNT = 26;

interface PreloaderProps {
  /** `leaving` starts the lift; the caller unmounts after the transition has played. */
  state: "loading" | "leaving";
  /** True once the workspace has something real to show under the curtain. */
  ready: boolean;
}

export function Preloader({ state, ready }: PreloaderProps) {
  const [creep, setCreep] = useState(8);

  /* An honest-ish progress bar: it creeps while we wait, and completes the moment the
     workspace is ready. Never a fake 0→100 in fixed time — that lies on a slow API. */
  useEffect(() => {
    if (ready) return;
    const timer = window.setInterval(() => {
      setCreep((value) => (value >= 88 ? 88 : value + Math.max(1, Math.round((90 - value) / 9))));
    }, 180);
    return () => window.clearInterval(timer);
  }, [ready]);

  /* Derived, never mirrored in state: the bar completes with the workspace, and it starts
     running the moment the curtain lifts rather than one render later. */
  const progress = ready ? 100 : creep;

  return (
    <div className={`pre ${state === "leaving" ? "is-leaving" : ""}`} role="status" aria-live="polite">
      <div className="pre-bars" aria-hidden="true">
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <i
            key={index}
            style={{
              animationDelay: `${(index % 7) * 90}ms`,
              animationDuration: `${880 + (index % 5) * 120}ms`,
            }}
          />
        ))}
      </div>

      <div className="pre-center">
        <TileMark size={64} className="pre-mark" />
        <div className="pre-word">Tessera</div>
        <div className="pre-track" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        <div className="pre-caption">
          {ready ? "Opening the campus" : "Preparing the campus"}
          <span className="pre-dot" aria-hidden="true" />
          <span className="pre-pct">{progress}%</span>
        </div>
      </div>

      <p className="pre-foot">Tech Zephyr 4.0 · team Voltryx</p>
    </div>
  );
}
