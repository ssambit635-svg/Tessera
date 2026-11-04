import { Icon } from "./Icon";

/* ============================================================================
   The screens — one composed scene, not a row of cards.

   Reference read, translated literally: a single wide stage, softly rounded and
   cropped, filled with a hot out-of-focus light; one assistant window sitting in
   the middle of it, mid-conversation, with a code block running out of the
   bottom of the frame; and the app's other surfaces drifting at the edges —
   two sliders, an account chip, two search windows half out of shot. Everything
   is frosted glass over the same light, everything is cropped by the frame.

   All of it is one stage: the light, the windows and the chips share a single
   coordinate space and scale together, so on a phone the scene simply gets
   smaller rather than falling into three separate blocks.
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

/* a window bar: three muted dots, a centred title, a plus */
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

function Sliders() {
  return (
    <div className="rk-panel is-sliders" aria-hidden="true">
      <div className="rk-slider">
        <span>Load</span>
        <i className="rk-slider-track is-warm">
          <b style={{ left: "88%" }} />
        </i>
      </div>
      <div className="rk-slider">
        <span>Balance</span>
        <i className="rk-slider-track is-violet">
          <b style={{ left: "32%" }} />
        </i>
      </div>
    </div>
  );
}

function SearchLeft() {
  return (
    <div className="rk-panel is-search-left" aria-hidden="true">
      <div className="rk-panel-bar is-plain">
        <span className="rk-bar-caret">
          <Icon name="chevronLeft" size={9} />
          <Icon name="chevronRight" size={9} />
        </span>
        <span className="rk-bar-title is-left">Search for sessions…</span>
      </div>
      <div className="rk-search-body">
        <span className="rk-search-label">Favourites</span>
        <span className="rk-search-row">
          <i className="rk-row-glyph" />
          Exam seating
        </span>
        <span className="rk-search-row">
          <i className="rk-row-glyph is-b" />
          Hall B · free 14:00
        </span>
      </div>
    </div>
  );
}

function SearchRight() {
  return (
    <div className="rk-panel is-search-right" aria-hidden="true">
      <div className="rk-panel-bar is-plain">
        <span className="rk-bar-caret">
          <Icon name="arrowLeft" size={10} />
        </span>
        <span className="rk-bar-title is-left">Search for rooms…</span>
      </div>
      <div className="rk-search-body">
        <span className="rk-search-label">Grid items&nbsp;&nbsp;3</span>
        <div className="rk-tiles">
          <i className="rk-tile is-a" />
          <i className="rk-tile is-b" />
          <i className="rk-tile is-c" />
        </div>
      </div>
    </div>
  );
}

export function ScreenStage({ onOpen }: { onOpen: (to: string) => void }) {
  return (
    <div className="rk-screens-stage">
      {/* the out-of-focus app behind everything: three soft bodies of light */}
      <div className="rk-stage-bloom" aria-hidden="true">
        <span className="rk-bloom is-a" />
        <span className="rk-bloom is-b" />
        <span className="rk-bloom is-c" />
        <span className="rk-bloom is-d" />
        <span className="rk-bloom is-e" />
        <span className="rk-bloom-grain" />
        <span className="rk-bloom-vignette" />
      </div>

      <div className="rk-stage-scene">
        <button
          type="button"
          className="rk-panel is-assistant"
          onClick={() => onOpen("/intelligence")}
          aria-label="Open the Tessera assistant"
        >
          <Bar title="Tessera Assistant" />
          <div className="rk-panel-body">
            <p className="rk-msg">
              <span className="rk-msg-avatar" aria-hidden="true">
                <Icon name="people" size={11} />
              </span>
              Create a timetable for Spectra week that fits every rule.
            </p>
            <p className="rk-msg">
              <span className="rk-msg-avatar is-mark" aria-hidden="true">
                <img src="/brand/tessera-mark.png" alt="" width={13} height={13} />
              </span>
              Sure. Let&apos;s start off with creating these files:
            </p>
            <pre className="rk-code" aria-hidden="true">
              <code>
                <span className="c-key">import</span> {"{ solve }"}{" "}
                <span className="c-key">from</span> <span className="c-str">&quot;@tessera/engine&quot;</span>;
                {"\n"}
                <span className="c-key">import</span> {"{ explain }"}{" "}
                <span className="c-key">from</span> <span className="c-str">&quot;@tessera/ledger&quot;</span>;
                {"\n\n"}
                <span className="c-key">const</span> rules = {"{"}
                {"\n  "}hard: [<span className="c-str">&quot;room-fit&quot;</span>,{" "}
                <span className="c-str">&quot;no-clash&quot;</span>],{"\n  "}soft: [
                <span className="c-str">&quot;compactness&quot;</span>,{" "}
                <span className="c-str">&quot;lane-balance&quot;</span>],{"\n"}
                {"}"};
                {"\n\n"}
                <span className="c-key">const</span> week = <span className="c-key">await</span> solve({"{"}
                {"\n  "}sessions: <span className="c-num">189</span>,{"\n  "}rooms:{" "}
                <span className="c-num">27</span>,{"\n  "}faculty: <span className="c-num">40</span>,{"\n  "}
                rules,{"\n"}
                {"}"});
                {"\n\n"}week.decisions.forEach(explain);
                {"\n"}week.writeTo(<span className="c-str">&quot;spectra-week.json&quot;</span>);
              </code>
            </pre>
          </div>
        </button>

        <Sliders />

        <div className="rk-chip" aria-hidden="true">
          <span className="rk-chip-avatar">
            <Icon name="people" size={8} />
          </span>
          dean@cit.edu
        </div>

        <div className="rk-panel is-peek" aria-hidden="true" />
        <SearchLeft />
        <SearchRight />
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
