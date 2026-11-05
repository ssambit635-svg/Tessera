import { useState } from "react";
import { Layers, useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { tintFor } from "../lib/persona";
import { useTheme } from "../lib/theme";

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
  const { light, setTheme } = useTheme();
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
          <p>Personalise how you explore the campus schedule.</p>
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
                  ? "Switch between available demo roles."
                  : "Preview identities are for exploring only; changes are not saved."}
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
              <b>{data.calendar.festWeek ?? "Teaching week"} · {data.summary.exams} examinations</b>
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
                  <Icon name="external" size={13} /> Documentation
                </a>
              ) : null}
            </div>
            <div className="callout" style={{ fontSize: 11 }}>
              <Icon name="shield" size={13} />
              <span>
                {source.mode === "live" ? "Saved decisions are associated with the signed-in identity." : "This is a preview. Changes will not be saved to the campus schedule."}
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
            {/* the same choice as the switch in the top bar and on the landing nav */}
            <div className="settings-row">
              <Icon name={light ? "sun" : "moon"} size={13} />
              <span style={{ flex: 1 }}>
                Cream page
                <span className="settings-hint">{light ? "On paper · black and red is one tap away" : "Off · the black and red page"}</span>
              </span>
              <button
                className={`switch ${light ? "on" : ""}`}
                onClick={() => setTheme(light ? "dark" : "light")}
                aria-label="Toggle the cream page"
                aria-pressed={light}
              />
            </div>
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


      </div>
    </div>
  );
}
