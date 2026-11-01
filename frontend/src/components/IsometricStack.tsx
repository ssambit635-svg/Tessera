import { useState } from "react";

/* ============================================================================
   IsometricStack — FIG.01.

   A technical drawing of the three layers that stand between a Hinglish sentence
   and a legal timetable change:

       1  the sentence          what was typed
       2  the parsed slot       what the parser made of it
       3  the kernel            what the rules allow

   Real DOM on a CSS 3D stage, not one picture. The plates are drawn with shapes
   (bars, fields, rule cells) rather than text, because type inside an isometric
   projection is unreadable — the reference does the same thing.

   Interaction: the labels are the targets. Hovering or focusing a label lifts its
   plate, dims the other two and lights the leader line. The plates themselves are
   not hit targets (pointer-events: none): they overlap in projection, so hit-testing
   on them would highlight whichever plate happens to be nearest the camera.
   ========================================================================== */

type LayerId = "sentence" | "parsed" | "kernel";

const LAYERS: { id: LayerId; label: string; z: number }[] = [
  { id: "sentence", label: "SENTENCE", z: 132 },
  { id: "parsed", label: "PARSED SLOT", z: 0 },
  { id: "kernel", label: "RULE CHECK", z: -132 },
];

const FIELDS: [string, string, boolean][] = [
  ["session", "CS101-A-L1", false],
  ["from", "MON · P1", false],
  ["to", "TUE · P3", true],
  ["room", "unchanged · CE-2", false],
];

export function IsometricStack() {
  const [active, setActive] = useState<LayerId | null>(null);

  const bind = (id: LayerId) => ({
    onMouseEnter: () => setActive(id),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(id),
    onBlur: () => setActive(null),
  });

  return (
    <div className="iso" data-active={active ?? ""}>
      <div className="iso-stage" aria-hidden="true">
        {LAYERS.map((layer) => (
          <div
            key={layer.id}
            className="iso-layer"
            data-id={layer.id}
            style={{ "--z": `${layer.z}px` } as React.CSSProperties}
          >
            <div className="iso-face">
              {layer.id === "sentence" ? (
                <>
                  <span className="iso-bars">
                    <i style={{ width: "86%" }} />
                    <i style={{ width: "64%" }} />
                    <i className="lit" style={{ width: "38%" }} />
                  </span>
                  <span className="iso-caret" />
                </>
              ) : null}

              {layer.id === "parsed"
                ? FIELDS.map(([field, value, lit]) => (
                    <span key={field} className="iso-field" data-lit={lit ? "true" : "false"}>
                      <i>{field}</i>
                      <b>{value}</b>
                    </span>
                  ))
                : null}

              {layer.id === "kernel" ? (
                <span className="iso-grid">
                  {Array.from({ length: 24 }, (_, index) => (
                    <i key={index} data-fail={index === 4 || index === 13 ? "true" : "false"} />
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="iso-labels">
        {LAYERS.map((layer) => (
          <button key={layer.id} type="button" className="iso-label" data-for={layer.id} {...bind(layer.id)}>
            <i />
            {layer.label}
          </button>
        ))}
      </div>
    </div>
  );
}
