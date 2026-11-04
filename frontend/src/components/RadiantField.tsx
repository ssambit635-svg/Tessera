import { useEffect, useRef } from "react";

/* ============================================================================
   Radiant Field — the front door's sky.

   The page opens on black. Then, over three seconds, a single ring of light
   grows out of the centre and carries a faint warm glow with it; behind it,
   hairline rings keep spreading outward for as long as the page is open. That
   is the whole picture: no colour, no blobs, no gradient mesh — one quiet
   light, one slow radial breath, black around it.

   It is drawn on a canvas because the rings have to be perfectly circular at
   any size and their alpha has to fade exactly at the edge; a stack of CSS
   gradients cannot carry a moving front. The loop only paints when the tab is
   visible, the device-pixel ratio is capped, and there is no blur filter — the
   gradient is already soft.

   `prefers-reduced-motion` gets the settled frame: the light, no spreading.
   ========================================================================== */

/** how long the light takes to reach the edges on first paint */
const SPREAD_MS = 3400;
/** one slow ring every N seconds; unrelated periods so they never sync up */
const RING_PERIODS = [11, 14.5, 18.5, 23, 29, 37];

interface RadiantFieldProps {
  className?: string;
  /** 0–1: how far the pointer pulls the light off centre */
  pointerStrength?: number;
}

export function RadiantField({ className = "", pointerStrength = 0.05 }: RadiantFieldProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let width = 0;
    let height = 0;
    let frame = 0;
    let driftX = 0;
    let driftY = 0;
    let wantX = 0;
    let wantY = 0;

    /* The front door is assembled behind the preloader. The spread must begin the
       moment that cover lifts, not while it is still up — so the clock waits for
       it. Until then the stage simply stays black. */
    let start = -1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (now: number) => {
      if (!width || !height) return;
      if (start < 0) {
        if (document.querySelector(".pre")) {
          ctx.clearRect(0, 0, width, height);
          ctx.fillStyle = "#08080a";
          ctx.fillRect(0, 0, width, height);
          return;
        }
        start = now;
      }
      const elapsed = now - start;
      const intro = reduced ? 1 : Math.min(1, Math.max(0, (elapsed - 160) / SPREAD_MS));
      const spread = 1 - Math.pow(1 - intro, 3);

      /* black first: the page must open on black even before the light arrives */
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#08080a";
      ctx.fillRect(0, 0, width, height);

      driftX += (wantX - driftX) * 0.035;
      driftY += (wantY - driftY) * 0.035;

      const cx = width * 0.5 + driftX * width * pointerStrength;
      const cy = height * 0.5 + driftY * height * pointerStrength;
      const maxR = Math.hypot(width, height) * 0.68;
      const front = Math.max(1, spread * maxR);

      /* the light that travels with the front */
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, front);
      glow.addColorStop(0, `rgba(248, 245, 238, ${(0.2 * spread).toFixed(4)})`);
      glow.addColorStop(0.22, `rgba(214, 220, 228, ${(0.095 * spread).toFixed(4)})`);
      glow.addColorStop(0.52, `rgba(150, 158, 172, ${(0.05 * spread).toFixed(4)})`);
      glow.addColorStop(0.8, `rgba(96, 102, 116, ${(0.02 * spread).toFixed(4)})`);
      glow.addColorStop(1, "rgba(8, 8, 10, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      /* the rings: each one is born at the centre, dies at the edge */
      const time = elapsed / 1000;
      ctx.lineWidth = 1.1;
      for (let index = 0; index < RING_PERIODS.length; index += 1) {
        const period = RING_PERIODS[index];
        const phase = ((time / period + index * 0.237) % 1 + 1) % 1;
        const radius = phase * maxR;
        if (radius > front) continue;
        const life = Math.sin(Math.PI * phase);
        const alpha = 0.2 * life * life * spread * (1 - phase * 0.42);
        if (alpha < 0.002) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(244, 241, 232, ${alpha.toFixed(4)})`;
        ctx.stroke();
      }

      /* the leading edge of the first spread, only while it is travelling */
      if (intro < 1) {
        const edge = 1 - intro;
        ctx.beginPath();
        ctx.arc(cx, cy, front, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.16 * edge).toFixed(4)})`;
        ctx.stroke();
      }
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      paint(now);
    };

    const onPointer = (event: PointerEvent) => {
      wantX = (event.clientX / window.innerWidth - 0.5) * 2;
      wantY = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    resize();
    paint(performance.now());
    if (reduced) {
      /* one settled frame is the whole picture when motion is unwelcome */
      return () => undefined;
    }
    frame = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [pointerStrength]);

  return <canvas ref={ref} className={`radiant-field ${className}`} aria-hidden="true" />;
}
