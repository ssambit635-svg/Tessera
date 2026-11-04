import { useRef, useState } from "react";
import { Icon } from "./Icon";

/* ============================================================================
   Product Film — the demo, shown the way it was captured.

   The recording is real: a headless browser signed into the workspace, opened a
   session off the board, filtered the estate, asked the assistant for a free
   lab and walked the reports, in one continuous take. It plays inside a macOS
   terminal window because that is where the session was started — the app is
   the thing running in the pane, not a screenshot pinned to a landing page.

   The chrome is drawn, not photographed: traffic lights, the tab title with the
   window size, a prompt line, and the process log under the pane. Everything
   else on this page stays quiet so the film is the only thing moving.
   ========================================================================== */

interface ProductFilmProps {
  src: string;
  poster: string;
  /** the take length, printed under the window */
  duration?: string;
  /** live numbers from the workspace, printed in the process log */
  stats?: { sessions: number; rooms: number; faculty: number } | null;
}

export function ProductFilm({ src, poster, duration = "0:29", stats }: ProductFilmProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  const toggle = () => {
    const node = video.current;
    if (!node) return;
    if (node.paused) {
      void node.play();
      setPlaying(true);
    } else {
      node.pause();
      setPlaying(false);
    }
  };

  return (
    <section className="film" id="film" aria-labelledby="film-title">
      <div className="rk-inner">
        <div className="film-head">
          <span className="rk-kicker">01 — The film</span>
          <h2 className="film-title" id="film-title">
            The whole week, <span>handled in one take.</span>
          </h2>
          <p className="film-lede">
            A real session inside Tessera, recorded end to end: step into the workspace, open a
            session off the board, filter the estate, then ask the assistant for a free lab. No
            mock-ups, no cuts between screens.
          </p>
        </div>

        <div className="film-window">
          <div className="film-chrome">
            <span className="film-lights" aria-hidden="true">
              <i className="film-light close" />
              <i className="film-light min" />
              <i className="film-light zoom" />
            </span>
            <span className="film-chrome-title">tessera — -zsh — 144×45</span>
            <span className="film-chrome-actions">
              <span className="film-rec">
                <i aria-hidden="true" /> REC
              </span>
              <button
                type="button"
                className="film-play"
                onClick={toggle}
                aria-label={playing ? "Pause the film" : "Play the film"}
              >
                {playing ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <rect x="1.5" y="1" width="2.4" height="8" rx="0.6" fill="currentColor" />
                    <rect x="6.1" y="1" width="2.4" height="8" rx="0.6" fill="currentColor" />
                  </svg>
                ) : (
                  <Icon name="play" size={10} strokeWidth={1.4} />
                )}
              </button>
            </span>
          </div>

          <div className="film-prompt">
            <span className="film-prompt-path">~/tessera</span>
            <span className="film-prompt-cmd">tessera open --workspace --live</span>
            <span className="film-caret" aria-hidden="true" />
          </div>

          <div className="film-pane">
            <video
              ref={video}
              className="film-video"
              src={src}
              poster={poster}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Screen recording of a Tessera session: signing in, opening a session, discovering a room, asking the assistant for a free lab, and reading the reports."
            />
          </div>

          <div className="film-log" aria-hidden="true">
            <span className="film-log-ok" />
            <span>workspace ready</span>
            <span className="film-log-stats">
              <span className="film-log-sep">·</span>
              <span>{stats ? `${stats.sessions} sessions` : "week loaded"}</span>
              <span className="film-log-sep">·</span>
              <span>{stats ? `${stats.rooms} spaces` : "estate loaded"}</span>
              <span className="film-log-sep">·</span>
              <span>{stats ? `${stats.faculty} faculty` : "faculty loaded"}</span>
              <span className="film-log-sep">·</span>
              <span>0 hard conflicts</span>
            </span>
            <span className="film-log-spacer" />
            <span className="film-log-dim">take 01 · {duration}</span>
          </div>
        </div>

        <div className="film-caption">
          <span>
            <Icon name="monitor" size={13} /> A single unedited take, captured in the running app.
          </span>
          <span className="film-caption-dim">Sign-in → session → discovery → assistant → reports</span>
        </div>
      </div>
    </section>
  );
}
