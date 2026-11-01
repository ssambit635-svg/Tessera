import { useEffect, useRef } from "react";

/* ============================================================================
   Glass Stripes — the hero art, rebuilt as refracting fluted glass.

   The reference (Wensity's Glass Stripes) does this in WebGL: a bank of glass ribs
   refracting a light that drifts after the cursor, with chromatic fringing at the
   rib edges. That is a 600 KB renderer and a shader compile above the fold; this is
   the same picture built out of composited layers, so it paints with the first
   stylesheet and never blocks the fold.

   How each layer maps to the reference:

     glow          a wide radial light, tinted shadow → midtone → highlight
     refraction    the glow is masked by the rib profile, so light only comes
                   *through* the glass body and dies at the rib edges
     dispersion    a second, offset copy of the glow in a shifted hue, screened
                   back on top: the colour split you get at a glass edge
     rib shading   rim highlights and trough shadows, independent of the light,
                   so the glass reads even where the light is weak
     grain         one tiled turbulence bitmap, to kill banding

   The light is aimed by writing two CSS variables from a single rAF loop: it lerps
   toward the pointer, and when the pointer has been still it drifts on its own
   orbit. `pointerStrength` decides how far it follows. Hidden tab and reduced
   motion both stop the loop where it stands.
   ========================================================================== */

type Palette = {
  /** the dark plane behind the glass */
  background?: string;
  /** the far edge of the light */
  shadow?: string;
  /** the body of the light */
  midtone?: string;
  /** the hot centre of the light */
  highlight?: string;
};

interface GlassStripesProps {
  className?: string;
  /** glass flutes across the scene, clamped to 6–40 */
  stripeCount?: number;
  /** counterclockwise rotation of the ribs, in degrees */
  angle?: number;
  colors?: Palette;
  /** how far the light follows the pointer, 0–1 */
  pointerStrength?: number;
  /** set false for background panels that should not chase the cursor */
  interactive?: boolean;
  /** "low" halves the sample size for small panels */
  quality?: "low" | "balanced" | "high";
  /** resting position of the light, in px, before any drift */
  restX?: number;
  restY?: number;
}

const IDLE_ORBIT_MS = 34_000;
/** how long the light waits after the pointer stops before it starts drifting again */
const IDLE_HOLD_MS = 2_200;

export function GlassStripes({
  className = "",
  stripeCount = 14,
  angle = 36,
  colors,
  pointerStrength = 0.3,
  interactive = true,
  quality = "balanced",
  restX = 0,
  restY = 0,
}: GlassStripesProps) {
  const ref = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);
  const splitRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const ribs = Math.max(6, Math.min(40, Math.round(stripeCount)));

  /* The loop owns three numbers: where the light is, where it wants to be, and how
     alive the pointer is. Nothing here touches layout — only two custom properties
     that two transformed children read. */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      node.style.setProperty("--g-live", "0.55");
      return;
    }

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let lastMove = performance.now();
    let frame = 0;

    /* The art itself is pointer-events:none so it never swallows a click; the pointer is
       read on the surface that hosts it (the hero stage, or the proof panel). */
    const surface: HTMLElement = node.parentElement ?? node;
    const onMove = (event: PointerEvent) => {
      if (!interactive) return;
      const rect = surface.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2 * pointerStrength;
      targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2 * pointerStrength;
      lastMove = performance.now();
    };
    const onLeave = () => {
      // walking away hands the light back to the idle drift
      lastMove = performance.now() - IDLE_ORBIT_MS - 1;
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;

      // Nothing has happened for a while: let the light drift on a slow ellipse, so the
      // hero is alive before the visitor touches it.
      const stillFor = now - lastMove;
      if (stillFor > IDLE_HOLD_MS) {
        /* Two unrelated periods, so the light wanders an open ellipse instead of
           retracing one ring: 34s across, 47s down. The amplitude is a fraction of
           the stage, not of the pointer strength — the hero has to be alive on its own. */
        const phase = (stillFor - IDLE_HOLD_MS) / IDLE_ORBIT_MS;
        targetX = Math.cos(phase * Math.PI * 2) * 0.62 + Math.sin(phase * Math.PI * 1.37) * 0.16;
        targetY = Math.sin(phase * Math.PI * 1.45) * 0.5 + Math.cos(phase * Math.PI * 0.61) * 0.12;
      }

      // Slower easing than the pointer: a drift this long should read as breathing.
      x += (targetX - x) * 0.045;
      y += (targetY - y) * 0.045;

      // The light breathes a little, the way a real refraction shifts as the pane settles.
      const live = 0.92 + Math.sin(now / 5200) * 0.08;

      // Transform + opacity are the two properties the compositor owns: no style recalc,
      // no layout, no paint. Offsets are in px so each layer keeps its own parallax.
      const dx = restX + x * 320;
      const dy = restY + y * 280;
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
        glowRef.current.style.opacity = live.toFixed(3);
      }
      splitRefs.current.forEach((layer, index) => {
        if (!layer) return;
        const spread = index === 0 ? 7 : -8;
        layer.style.transform = `translate3d(${(dx + spread).toFixed(1)}px, ${(dy - spread * 0.6).toFixed(1)}px, 0)`;
      });
    };

    frame = requestAnimationFrame(tick);
    if (interactive) {
      surface.addEventListener("pointermove", onMove, { passive: true });
      surface.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelAnimationFrame(frame);
      surface.removeEventListener("pointermove", onMove);
      surface.removeEventListener("pointerleave", onLeave);
    };
  }, [interactive, pointerStrength, restX, restY]);

  const style = {
    "--g-ribs": ribs,
    "--g-angle": `${90 - angle}deg`,
    "--g-bg": colors?.background ?? "#08080a",
    "--g-shadow": colors?.shadow ?? "#8e1024",
    "--g-mid": colors?.midtone ?? "#ff3a58",
    "--g-hot": colors?.highlight ?? "#fff4f0",
    "--g-quality": quality === "low" ? "0.6" : "1",
  } as React.CSSProperties;

  return (
    <div
      ref={ref}
      className={`glass-stripes ${className}`}
      style={style}
      aria-hidden="true"
      data-quality={quality}
    >
      {/* the light, and the copy that splits into colour at the rib edges */}
      <div className="glass-field">
        <span className="glass-glow" ref={glowRef} />
        <span
          className="glass-split"
          ref={(element) => {
            splitRefs.current[0] = element;
          }}
        />
        <span
          className="glass-split warm"
          ref={(element) => {
            splitRefs.current[1] = element;
          }}
        />
      </div>

      {/* the ribs themselves: rims catch the light, troughs fall to shadow */}
      <div className="glass-ribs" />

      {/* one tiled noise bitmap, so the wide gradients never band */}
      <div className="glass-grain" />
    </div>
  );
}
