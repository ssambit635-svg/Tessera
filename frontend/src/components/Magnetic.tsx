import { useRef, type ReactNode } from "react";

/* ============================================================================
   Magnetic — the button leans toward the cursor.

   Plain pointer math writing two CSS variables; the movement itself is a CSS
   transition on `transform`, so the browser interpolates it instead of us running a
   rAF loop. Reduced motion: the variables never move.
   ========================================================================== */

interface MagneticProps {
  children: ReactNode;
  /** fraction of the cursor distance the button follows; 0.18 reads as "alive" */
  strength?: number;
  className?: string;
}

export function Magnetic({ children, strength = 0.18, className }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);

  const onMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rect = node.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    // cap the travel so a big button cannot wander out of its own row
    const limit = 10;
    node.style.setProperty("--mx", `${Math.max(-limit, Math.min(limit, dx * strength)).toFixed(1)}px`);
    node.style.setProperty("--my", `${Math.max(-limit, Math.min(limit, dy * strength)).toFixed(1)}px`);
  };

  const onLeave = () => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--mx", "0px");
    node.style.setProperty("--my", "0px");
  };

  return (
    <span
      ref={ref}
      className={className ? `magnetic ${className}` : "magnetic"}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onBlur={onLeave}
    >
      {children}
    </span>
  );
}
