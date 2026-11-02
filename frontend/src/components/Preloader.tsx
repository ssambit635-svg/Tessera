import { useEffect } from "react";
import type { CSSProperties } from "react";

interface PreloaderProps {
  state: "loading" | "leaving";
  ready: boolean;
  complete: boolean;
  reducedMotion: boolean;
  onComplete: () => void;
}

// Each piece is a clipped portion of the existing brand artwork, not a new logo.
const pieces = Array.from({ length: 25 }, (_, index) => {
  const row = Math.floor(index / 5);
  const column = index % 5;
  const angle = (index * 137.5 * Math.PI) / 180;
  const distance = 65 + (index % 4) * 24;
  return {
    clipPath: `inset(${row * 20}% ${80 - column * 20}% ${80 - row * 20}% ${column * 20}%)`,
    "--piece-x": `${Math.cos(angle) * distance}%`,
    "--piece-y": `${Math.sin(angle) * distance}%`,
    "--piece-rotation": `${(index % 2 ? 1 : -1) * (8 + (index % 4) * 5)}deg`,
    "--piece-delay": `${(index % 5) * 0.045 + row * 0.025}s`,
  } as CSSProperties;
});

const scheduleTiles = [
  [2, 2, 2, "blue"], [5, 2, 1, "mint"], [7, 2, 2, "plain"],
  [1, 3, 1, "plain"], [4, 3, 2, "plain"], [8, 3, 1, "blue"],
  [2, 4, 1, "mint"], [6, 4, 2, "plain"], [9, 4, 1, "plain"],
  [1, 5, 2, "plain"], [4, 5, 1, "blue"], [7, 5, 2, "mint"],
] as const;

/** A short assembly of the real mark, followed by a grid-led reveal. */
export function Preloader({ state, ready, complete, reducedMotion, onComplete }: PreloaderProps) {
  useEffect(() => {
    if (reducedMotion || complete) return;
    // If animation events are unavailable or styles fail to load, don't block the site.
    const fallback = window.setTimeout(onComplete, 3400);
    return () => window.clearTimeout(fallback);
  }, [reducedMotion, complete, onComplete]);

  return (
    <div className={`pre ${state === "leaving" ? "is-leaving" : ""} ${reducedMotion ? "is-reduced" : ""}`}>
      <div className="pre-grid" aria-hidden="true">
        {scheduleTiles.map(([column, row, span, color], index) => (
          <span key={index} className={`pre-grid-tile is-${color}`} style={{
            gridColumn: `${column} / span ${span}`, gridRow: row, animationDelay: `${0.1 + index * 0.055}s`,
          }} />
        ))}
      </div>
      <div className="pre-topline" aria-hidden="true">
        <span>THE ART OF A BETTER WEEK</span>
        <span>A LITTLE MORE IN SYNC</span>
      </div>
      {!complete && state !== "leaving" && (
        <button className="pre-skip" type="button" onClick={onComplete}>Skip intro <span aria-hidden="true">↗</span></button>
      )}
      <div className="pre-content" aria-hidden="true">
        <div className="pre-mark-frame">
          <span className="pre-corner pre-corner-tl" />
          <span className="pre-corner pre-corner-tr" />
          <span className="pre-corner pre-corner-bl" />
          <span className="pre-corner pre-corner-br" />
          <div className="pre-mark-assembly">
            {pieces.map((style, index) => <span className="pre-piece" key={index} style={style} />)}
          </div>
        </div>
        <div className="pre-identity">
          <span className="pre-eyebrow"><i /> EVERY PIECE IN ITS PLACE</span>
          <span className="pre-wordmark">Tessera<span className="pre-period">.</span></span>
          <span className="pre-tagline">A clearer way to see your week.</span>
        </div>
      </div>
      <div className="pre-footer">
        <span className="pre-footer-label" aria-hidden="true">MADE FOR THE WAY CAMPUS MOVES</span>
        <p className="pre-status" role="status" aria-live="polite">
          {!ready && complete ? "Preparing your workspace…" : <span className="pre-sr-only">Loading Tessera</span>}
        </p>
        <span className="pre-footer-number" aria-hidden="true">T / 01</span>
      </div>
      {!reducedMotion && !complete && (
        <span className="pre-clock" aria-hidden="true" onAnimationEnd={(event) => {
          if (event.animationName === "pre-clock") onComplete();
        }} />
      )}
    </div>
  );
}
