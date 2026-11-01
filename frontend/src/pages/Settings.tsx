import { useState } from "react";
import { Layers, useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { TileMark } from "../components/TileMark";
import { tintFor } from "../lib/persona";

const TOKENS = [
  { name: "Warm Paper", value: "#F1EEE6", role: "page foundation" },
  { name: "Soft Ivory", value: "#F8F6F0", role: "surfaces" },
  { name: "Charcoal", value: "#242424", role: "type · dark panels" },
  { name: "Deep Charcoal", value: "#191A1C", role: "navigation" },
  { name: "Acid Lime", value: "#D4F05A", role: "primary action · selection" },
  { name: "Violet", value: "#A985E8", role: "intelligence" },
  { name: "Coral", value: "#F16B55", role: "conflict · warning" },
  { name: "Sky Blue", value: "#8EC9E9", role: "information" },
  { name: "Sage", value: "#BFE2D1", role: "validated" },
];

/** Every layer controls something you can see on the board. No decorative toggles. */
const LAYER_COPY: [keyof Layers, string][] = [
  ["classes", "Teaching sessions"],
  ["exams", "Midsem examination blocks"],
  ["events", "Approved venue bookings"],
  ["maintenance", "Maintenance / unavailable cells"],
];

export default function Settings() {
  const { data, source, user, personas, switchPersona, reload, railCollapsed, setRailCollapsed, layers, toggleLayer } =
    useWorkspace();
  const [motion, setMotion] = useState(() => window.localStorage.getItem("tessera.motion") !== "reduced");
  const displayUser = user ?? { email: "admin@cit.edu", name: "Campus operations", role: "admin" };

  const setReducedMotion = (value: boolean) => {
    setMotion(value);
    window.localStorage.setItem("tessera.motion", value ? "full" : "reduced");
    document.documentElement.style.setProperty("--motion", value ? "1" : "0");
    document.body.classList.toggle("reduced-motion", !value);
  };

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Management</div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            Settings.
          </h2>
          <p>Interface preferences live in the browser. Scheduling truth stays with the backend.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Identity</div>
              <h3 style={{ marginTop: 3 }}>Signed-in persona</h3>
            </div>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="row gap-12">
              <span className={`avatar xl tone-${tintFor(displayUser.email)}`}><Icon name="user" size={22} /></span>
              <div>
                <b style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{displayUser.name}</b>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
                  {displayUser.email} · {displayUser.role.replace(/_/g, " ")}
                </div>
              </div>
            </div>
            <div className="field">
              <span className="field-label">Demo accounts</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {personas.map((persona) => (
                  <button
                    key={persona.email}
                    className="settings-row"
                    onClick={() => void switchPersona(persona.role, persona.email)}
                  >
                    <Icon name="user" size={13} />
                    <span style={{ flex: 1, textAlign: "left" }}>{persona.label}</span>
                    <span className="mono">{persona.role.replace(/_/g, " ")}</span>
                    {user?.email === persona.email ? <Icon name="check" size={12} /> : null}
                  </button>
                ))}
              </div>
              <span className="field-hint">
                {source.mode === "live"
                  ? "Switching persona requests a real token from /api/auth/demo-login."
                  : "Offline: identities are labels for this preview; no token is issued."}
              </span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Connection</div>
              <h3 style={{ marginTop: 3 }}>Where these numbers come from</h3>
            </div>
            <span className={`status ${source.mode === "live" ? "valid" : "warning"}`} style={{ marginLeft: "auto" }}>
              {source.mode === "live" ? "connected" : "offline"}
            </span>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="settings-kv">
              <span>Schedule</span>
              <b>{source.mode === "live" ? "Read live from the scheduling service" : "This week, read offline"}</b>
            </div>
            <div className="settings-kv">
              <span>Signed in as</span>
              <b style={{ fontSize: 11.5, textAlign: "right" }}>{user?.email ?? "—"}</b>
            </div>
            <div className="settings-kv">
              <span>Week</span>
              <b>Spectra ’27 · week 7 · {data.summary.exams} examinations</b>
            </div>
            <div className="settings-kv">
              <span>In this week</span>
              <b>
                {data.sessions.length} sessions · {data.rooms.length} rooms · {data.bookings.count} venue requests
              </b>
            </div>
            <div className="row gap-8">
              <button className="btn sm" onClick={() => void reload()}>
                <Icon name="refresh" size={13} /> Reload
              </button>
              {source.mode === "live" ? (
                <a className="btn sm" href="/docs" target="_blank" rel="noreferrer">
                  <Icon name="external" size={13} /> API docs
                </a>
              ) : null}
            </div>
            <div className="callout" style={{ fontSize: 11 }}>
              <Icon name="shield" size={13} />
              <span>
                Every approval, move and venue decision is written back with the signed-in identity, so the audit
                trail always names a person. Nothing is edited on the client.
              </span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Interface</div>
              <h3 style={{ marginTop: 3 }}>Display & layers</h3>
            </div>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="settings-row">
              <Icon name="list" size={13} />
              <span style={{ flex: 1 }}>Collapse the navigation rail</span>
              <button className={`switch ${railCollapsed ? "on" : ""}`} onClick={() => setRailCollapsed(!railCollapsed)} aria-label="Collapse rail" />
            </div>
            <div className="settings-row">
              <Icon name="zap" size={13} />
              <span style={{ flex: 1 }}>Full motion & transitions</span>
              <button className={`switch ${motion ? "on" : ""}`} onClick={() => setReducedMotion(!motion)} aria-label="Toggle motion" />
            </div>
            <div className="divider" />
            <span className="eyebrow">Calendar layers</span>
            {LAYER_COPY.map(([key, label]) => (
              <div key={key} className="settings-row">
                <Icon name="layers" size={13} />
                <span style={{ flex: 1 }}>{label}</span>
                <button
                  className={`switch ${layers[key] ? "on" : ""}`}
                  onClick={() => toggleLayer(key)}
                  aria-label={`Toggle ${label}`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Legend</div>
              <h3 style={{ marginTop: 3 }}>One meaning per colour</h3>
            </div>
          </div>
          <div className="panel-body">
            <div className="token-list">
              {TOKENS.map((token) => (
                <div key={token.name} className="token-row">
                  <span className="token-swatch" style={{ background: token.value }} />
                  <span style={{ minWidth: 0 }}>
                    <b>{token.name}</b>
                    <span>{token.role}</span>
                  </span>
                  <span className="mono">{token.value}</span>
                </div>
              ))}
            </div>
            <div className="row gap-10" style={{ marginTop: 14, alignItems: "center" }}>
              <TileMark size={30} />
              <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                THE TESSERA TILE · FOUR INTERLOCKING BLOCKS
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
