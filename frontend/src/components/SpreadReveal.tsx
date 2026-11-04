import { useEffect, useRef, type ReactNode } from "react";

/* ============================================================================
   Spread Reveal — the hero art opens from the middle.

   The front door is black on the first paint. Then the art underneath (the red
   fluted glass, the reference's ribbon field) is uncovered by a soft circle
   growing out of the centre: a radial mask whose feather travels from nothing
   to past the corners in under four seconds, on a slow ease-out, so the colour
   arrives rather than appears.

   Why a mask and not a transform: scaling the art would stretch the ribs and
   move the light; masking keeps the glass exactly as it is and only changes how
   much of it you can see.

   The clock waits for the preloader to lift — otherwise the whole spread would
   play behind the cover and nobody would ever see it. `prefers-reduced-motion`
   gets the finished state straight away.
   ========================================================================== */

/** how long the circle takes to reach past the corners — slow on purpose */
const SPREAD_MS = 5200;
/** start fully outside the mask so the first frame is pure black */
const FROM = 0;
const TO = 106;

interface SpreadRevealProps {
  children: ReactNode;
  className?: string;
}

export function SpreadReveal({ children, className = "" }: SpreadRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      node.style.setProperty("--reveal", `${TO}%`);
      return;
    }

    let frame = 0;
    let started = 0;

    const tick = (now: number) => {
      if (!started) {
        if (document.querySelector(".pre")) {
          node.style.setProperty("--reveal", `${FROM}%`);
          frame = requestAnimationFrame(tick);
          return;
        }
        started = now;
      }
      const progress = Math.min(1, (now - started) / SPREAD_MS);
      /* ease-in-out: the light gathers at the centre before it travels */
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      node.style.setProperty("--reveal", `${(FROM + (TO - FROM) * eased).toFixed(2)}%`);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={ref} className={`spread-reveal ${className}`} aria-hidden="true">
      {children}
    </div>
  );
}
