/** The Tessera Tile — the brand mark.
 *
 * Four interlocking L-shaped blocks rotate around a centre tile; remove any one and the
 * figure stops holding together. That is the product argument in a 48px square: every
 * resource, person and session is load-bearing for the others.
 */
interface TileMarkProps {
  size?: number;
  accent?: boolean;
  animated?: boolean;
  className?: string;
  title?: string;
}

export function TileMark({ size = 28, accent = true, animated = false, className, title }: TileMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <g className={animated ? "tile-spin" : undefined} style={animated ? { transformOrigin: "24px 24px" } : undefined}>
        <path d="M3 3h21v9H12v12H3z" fill="currentColor" opacity="0.92" />
        <path d="M45 3v21h-9V12H24V3z" fill="currentColor" opacity="0.7" />
        <path d="M45 45H24v-9h12V24h9z" fill="currentColor" opacity="0.92" />
        <path d="M3 45V24h9v12h12v9z" fill="currentColor" opacity="0.7" />
        <rect x="19" y="19" width="10" height="10" rx="1.6" fill={accent ? "var(--lime, #D4F05A)" : "currentColor"} />
      </g>
    </svg>
  );
}

export function TilePattern({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <pattern id="tessera-tile" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M2 2h21v9H11v12H2z" fill="currentColor" opacity="0.5" />
          <path d="M46 2v21h-9V11H25V2z" fill="currentColor" opacity="0.22" />
          <path d="M46 46H25v-9h12V25h9z" fill="currentColor" opacity="0.5" />
          <path d="M2 46V25h9v12h12v9z" fill="currentColor" opacity="0.22" />
          <rect x="19" y="19" width="10" height="10" rx="2" fill="currentColor" opacity="0.14" />
        </pattern>
      </defs>
      <rect width="120" height="120" fill="url(#tessera-tile)" />
    </svg>
  );
}

export function TileSpinner({ size = 40, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <div className="tile-spinner" style={{ width: size, height: size }} role="status" aria-label={label}>
      <span className="tile-spinner-ring" />
      <TileMark size={size * 0.56} animated />
    </div>
  );
}
