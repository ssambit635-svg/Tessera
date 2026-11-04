import { Icon } from "./Icon";

/* ============================================================================
   The screens — one composed scene, not a row of cards.

   Reference read, translated literally: a single wide stage, softly rounded and
   cropped, filled with a hot out-of-focus light; one assistant window standing
   in front of it, mid-conversation — its title bar rising out of the frame's
   top edge, its body a sheet of dark glass that thins out until the code block
   dissolves into the light with no bottom edge at all; and the app's other
   surfaces drifting at the edges — two sliders, an account chip, two search
   windows half out of shot, all cropped by the frame.

   All of it is one stage: the light, the windows and the chips share a single
   coordinate space (an em is one percent of the stage's width) and scale
   together, so on a phone the scene simply gets smaller rather than falling
   into three separate blocks.
   ========================================================================== */

export interface ScreenCounts {
  bookings: number;
  exams: number;
}

export function screenLinks({ bookings, exams }: ScreenCounts) {
  return [
    { title: "Mosaic Board", body: "Week, day, room, faculty and group views with drag-to-preview a move before it happens.", icon: "board", to: "/mosaic" },
    { title: "Bookings", body: `${bookings} requests, their venues and the reasons behind each decision.`, icon: "ticket", to: "/bookings" },
    { title: "Approvals", body: "Upload a change file, watch the minimal-move repair, then approve or reject it with a reason.", icon: "shield", to: "/approvals" },
    { title: "Examinations", body: `${exams} papers by day and slot, with seating and room availability.`, icon: "clipboard", to: "/exams" },
    { title: "Intelligence", body: "Hinglish or English in, a checked proposal out — the model reads, the engine decides.", icon: "sparkles", to: "/intelligence" },
    { title: "Operations", body: "Load a dataset, generate the timetable, review activity and export the results.", icon: "database", to: "/operations" },
  ] as const;
}

/* a window bar: three dark dots, a centred title with its selector caret, a plus */
function Bar({ title }: { title: string }) {
  return (
    <div className="rk-panel-bar">
      <span className="rk-bar-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="rk-bar-title">
        {title}
        <b aria-hidden="true">
          <Icon name="chevronUp" size={9} />
          <Icon name="chevronDown" size={9} />
        </b>
      </span>
      <span className="rk-bar-plus" aria-hidden="true">
        <Icon name="plus" size={11} />
      </span>
    </div>
  );
}

/* a text cursor, as in a focused search field */
function Caret() {
  return <i className="rk-caret" aria-hidden="true" />;
}

/* two sliders, hanging off the right edge: a spectrum and a grey-to-violet ramp */
function Sliders() {
  return (
    <div className="rk-panel is-sliders">
      <div className="rk-slider">
        <span>Load</span>
        <i className="rk-slider-track is-hue">
          <b style={{ left: "60%" }} />
        </i>
      </div>
      <div className="rk-slider">
        <span>Balance</span>
        <i className="rk-slider-track is-violet">
          <b style={{ left: "45%" }} />
        </i>
      </div>
    </div>
  );
}

/* the sign-in field, also running off the right edge */
function Chip() {
  return (
    <div className="rk-chip">
      <span className="rk-chip-field">
        <span className="rk-chip-go">
          <Icon name="arrowRight" size={8} strokeWidth={2.4} />
        </span>
        <Caret />
        dean@cit.edu
      </span>
    </div>
  );
}

/* a swatch grid: one warm row, two violet rows, fading to the right */
function Dots() {
  return (
    <div className="rk-dots">
      {Array.from({ length: 12 }, (_, k) => (
        <i key={k} />
      ))}
    </div>
  );
}

/* the command search, twice: a blurred copy behind, the sharp one in front */
function SearchLeft({ ghost = false }: { ghost?: boolean }) {
  return (
    <div className={ghost ? "rk-panel is-search-left is-ghost" : "rk-panel is-search-left"}>
      <div className="rk-panel-bar is-plain">
        <span className="rk-bar-title is-left">
          <Caret />
          Search for sessions and rooms…
        </span>
      </div>
      <div className="rk-search-body">
        <span className="rk-search-label">Favourites</span>
        <span className="rk-search-row">
          <i className="rk-row-glyph" />
          Exam seating
          <em>Mosaic</em>
        </span>
      </div>
    </div>
  );
}

/* a room, as a card: its name, what it holds, and a seat map filled to the
   share of seats already taken at that hour */
function RoomTile({ name, note, taken, on = false }: { name: string; note: string; taken: number; on?: boolean }) {
  return (
    <span className={on ? "rk-tile is-room is-on" : "rk-tile is-room"}>
      <b>{name}</b>
      <span>{note}</span>
      <i className="rk-seats">
        <b style={{ height: `${taken}%` }} />
      </i>
    </span>
  );
}

/* the room search in the corner: what the reference has as a photo grid is,
   in this app, rooms free at an hour */
function SearchRight() {
  return (
    <div className="rk-panel is-search-right">
      <div className="rk-panel-bar is-photos">
        <span className="rk-bar-back">
          <Icon name="arrowLeft" size={10} strokeWidth={2} />
        </span>
        <span className="rk-bar-title is-left">
          <Caret />
          Search for rooms…
        </span>
      </div>
      <div className="rk-search-body">
        <span className="rk-search-label">
          Free at 14:00 <b>3</b>
        </span>
        <div className="rk-tiles">
          <RoomTile name="Hall B" note="300 seats · exams" taken={85} on />
          <RoomTile name="LH-1" note="120 seats · projector" taken={40} />
          <RoomTile name="Lab 3" note="40 seats · lab PCs" taken={60} />
        </div>
      </div>
    </div>
  );
}

export function ScreenStage({ onOpen }: { onOpen: (to: string) => void }) {
  return (
    <div className="rk-screens-stage">
      {/* the frame: the light and the windows that are cropped by the picture's edge */}
      <div className="rk-stage-frame" aria-hidden="true">
        <div className="rk-stage-bloom">
          <span className="rk-bloom is-a" />
          <span className="rk-bloom is-b" />
          <span className="rk-bloom is-c" />
          <span className="rk-bloom is-d" />
          <span className="rk-bloom is-e" />
          <span className="rk-bloom-grain" />
          <span className="rk-bloom-vignette" />
        </div>

        <div className="rk-stage-scene">
          <Sliders />
          <Chip />
          <Dots />
          <span className="rk-toggle">
            <b />
          </span>
          <SearchLeft ghost />
          <SearchLeft />
          <SearchRight />
        </div>
      </div>

      {/* the assistant window stands in front of the frame: its title bar rises
          out of the top edge, and its body dissolves into the light before it
          reaches a bottom edge — so it is not clipped with the rest */}
      <div className="rk-stage-scene is-front">
        <button
          type="button"
          className="rk-window is-assistant"
          onClick={() => onOpen("/intelligence")}
          aria-label="Open the Tessera assistant"
        >
          <span className="rk-window-sheet" aria-hidden="true" />
          <span className="rk-window-glass">
            <Bar title="Tessera Assistant" />
            <span className="rk-window-body">
              <span className="rk-msg">
                <span className="rk-msg-avatar" aria-hidden="true">
                  <Icon name="people" size={11} />
                </span>
                Create a timetable for Spectra week that fits every rule.
              </span>
              <span className="rk-msg">
                <span className="rk-msg-avatar is-mark" aria-hidden="true">
                  <img src="/brand/tessera-mark.png" alt="" width={13} height={13} />
                </span>
                Sure. Let&apos;s start off with creating these files:
              </span>
              <pre className="rk-code" aria-hidden="true">
                <code>
                  <span className="c-key">import</span> {"{ "}solve{" }"} <span className="c-key">from</span>{" "}
                  <span className="c-str">&quot;@tessera/engine&quot;</span>
                  {"\n"}
                  <span className="c-key">import</span> {"{ "}explain{" }"} <span className="c-key">from</span>{" "}
                  <span className="c-str">&quot;@tessera/ledger&quot;</span>
                  {"\n\n"}
                  <span className="c-key">const</span> week = <span className="c-key">await</span>{" "}
                  <span className="c-type">solve</span>({"{"}
                  {"\n  "}sessions: <span className="c-num">189</span>,
                  {"\n  "}rooms: <span className="c-num">27</span>,
                  {"\n  "}faculty: <span className="c-num">40</span>,
                  {"\n  "}rules: <span className="c-type">Rules</span>.of(
                  {"\n    "}<span className="c-type">Hard</span>(<span className="c-str">&quot;room-fit&quot;</span>),{" "}
                  <span className="c-type">Hard</span>(<span className="c-str">&quot;no-clash&quot;</span>),
                  {"\n    "}<span className="c-type">Soft</span>(<span className="c-str">&quot;compactness&quot;</span>),{" "}
                  <span className="c-type">Soft</span>(<span className="c-str">&quot;lane-balance&quot;</span>),
                  {"\n  "}),
                  {"\n"}
                  {"}"});
                  {"\n\n"}
                  week.decisions.forEach(<span className="c-type">explain</span>);
                  {"\n"}
                  week.writeTo(<span className="c-str">&quot;spectra-week.json&quot;</span>);
                  {"\n"}
                </code>
              </pre>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- the index below */

export function ScreenIndex({
  counts,
  onOpen,
}: {
  counts: ScreenCounts;
  onOpen: (to: string) => void;
}) {
  return (
    <div className="rk-screen-index">
      {screenLinks(counts).map((screen) => (
        <button type="button" className="rk-index-row" key={screen.title} onClick={() => onOpen(screen.to)}>
          <span className="rk-index-icon">
            <Icon name={screen.icon} size={14} />
          </span>
          <b>{screen.title}</b>
          <span className="rk-index-copy">{screen.body}</span>
          <span className="rk-index-go">
            <Icon name="arrowUpRight" size={13} />
          </span>
        </button>
      ))}
    </div>
  );
}
