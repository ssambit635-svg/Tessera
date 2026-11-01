/** The Tessera mark — the faceted glass T from the brand sheet.
 *
 * It is a raster mark (the original artwork is a rendered glass object, not a flat
 * icon), so it ships as one PNG at 404px in /public and is scaled down. Serving it
 * from /public rather than bundling keeps the JS payload small.
 *
 * The old geometric tile is still here as `TilePattern` (used for texture) and as
 * `TileSpinner`'s ring, but the brand identity itself is now the glass T.
 */
interface TileMarkProps {
  size?: number;
  /** kept for API compatibility — the glass mark carries its own colour */
  accent?: boolean;
  animated?: boolean;
  className?: string;
  title?: string;
}

export function TileMark({ size = 28, animated = false, className, title }: TileMarkProps) {
  return (
    <img
      src="/brand/tessera-mark.png"
      width={size}
      height={size}
      alt={title ?? ""}
      className={`tessera-mark ${animated ? "is-animated" : ""} ${className ?? ""}`.trim()}
      style={{ width: size, height: size }}
      draggable={false}
      role={title ? "img" : "presentation"}
    />
  );
}

export function TilePattern({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <pattern id="tessera-tile" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M2 2h21v9H11v12H2z" fill="currentColor" opacity="0.5" />
          <path d="M25 2h21v21h-9V11H25z" fill="currentColor" opacity="0.22" />
          <path d="M46 46H25v-9h12V25h9z" fill="currentColor" opacity="0.5" />
          <path d="M2 46V25h9v12h12v9z" fill="currentColor" opacity="0.22" />
          <rect x="18.5" y="18.5" width="11" height="11" rx="2" fill="currentColor" opacity="0.14" />
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
