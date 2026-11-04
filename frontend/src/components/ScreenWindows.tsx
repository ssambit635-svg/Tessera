import type { JSX } from "react";
import { Icon } from "./Icon";

/* ============================================================================
   The screens — the app as objects in front of you.

   Reference read: one real app window floating in front of a hot red light,
   two smaller ones drifting behind it, a couple of chips hanging in the depth,
   everything frosted and grainy. Built the same way the rest of the page is:
   gradients and composited layers, no images, no WebGL, and the mini screens
   are live DOM so they stay crisp at any size.

   The windows are deliberately dark in both themes — they are the product, and
   the product is a dark app — while the light behind them changes with the page.
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

function Chrome({ label }: { label: string }) {
  return (
    <div className="rk-win-chrome">
      <span className="rk-win-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="rk-win-title">{label}</span>
      <span className="rk-win-plus" aria-hidden="true">
        <Icon name="plus" size={11} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ mini screens */

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];

/* one week of blocks: start column, span, row, tone */
const BLOCKS: [number, number, number, string][] = [
  [0, 1, 0, "rose"],
  [1, 2, 0, "teal"],
  [3, 1, 0, "violet"],
  [0, 2, 1, "sand"],
  [2, 1, 1, "rose"],
  [3, 2, 1, "teal"],
  [0, 1, 2, "violet"],
  [1, 1, 2, "sand"],
  [2, 2, 2, "rose"],
  [0, 2, 3, "teal"],
  [2, 1, 3, "violet"],
  [3, 1, 3, "sand"],
  [1, 3, 4, "rose"],
];

function MosaicPreview() {
  return (
    <div className="rk-win-mosaic">
      <div className="rk-win-days" aria-hidden="true">
        <span />
        {DAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="rk-win-grid">
        {Array.from({ length: 5 }).map((_, row) => {
          /* one cell per free column, one spanning cell per booked block: the
             row is a five-column grid and nothing is rendered twice */
          const cells: JSX.Element[] = [];
          for (let col = 0; col < 5; ) {
            const block = BLOCKS.find((b) => b[2] === row && b[0] === col);
            if (block) {
              cells.push(
                <span
                  className="rk-win-cell"
                  key={col}
                  data-tone={block[3]}
                  style={{ gridColumn: `span ${block[1]}` }}
                />,
              );
              col += block[1];
            } else {
              cells.push(<span className="rk-win-cell" key={col} data-empty="true" />);
              col += 1;
            }
          }
          return (
            <div className="rk-win-row" key={row} aria-hidden="true">
              <span className="rk-win-hour">{9 + row}:00</span>
              {cells}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BookingsPreview() {
  const rows = [
    { id: "BR-01", label: "Spectra '27 inauguration", status: "approved", tone: "ok" },
    { id: "BR-11a", label: "Robo-Wars arena", status: "approved", tone: "ok" },
    { id: "BR-14", label: "Design review", status: "alternative", tone: "warn" },
    { id: "BR-19", label: "Alumni dinner", status: "rejected", tone: "no" },
  ];
  return (
    <div className="rk-win-rows">
      {rows.map((row) => (
        <div className="rk-win-line" key={row.id}>
          <b>{row.id}</b>
          <span>{row.label}</span>
          <em data-tone={row.tone}>{row.status}</em>
        </div>
      ))}
    </div>
  );
}

function ExamsPreview() {
  return (
    <div className="rk-win-exams">
      <div className="rk-win-seats" aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <i key={i} data-on={[2, 3, 4, 7, 9, 11, 12, 17, 18, 21, 24, 26, 27, 31, 33, 36].includes(i) ? "true" : "false"} />
        ))}
      </div>
      <div className="rk-win-legend">
        <span>
          <i data-tone="filled" /> seated
        </span>
        <span>
          <i data-tone="free" /> free
        </span>
        <b>41 papers</b>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ stage */

export function ScreenWindows({
  counts,
  onOpen,
}: {
  counts: ScreenCounts;
  onOpen: (to: string) => void;
}) {
  return (
    <div className="rk-windows">
      <div className="rk-windows-glow" aria-hidden="true" />
      <div className="rk-windows-field">
        <button
          type="button"
          className="rk-window is-left"
          onClick={() => onOpen("/bookings")}
          aria-label="Open Bookings"
        >
          <Chrome label="tessera — bookings" />
          <div className="rk-win-body">
            <BookingsPreview />
          </div>
          <div className="rk-win-foot">
            <b>Bookings</b>
            <span>{counts.bookings} requests, decided</span>
          </div>
        </button>

        <button
          type="button"
          className="rk-window is-main"
          onClick={() => onOpen("/mosaic")}
          aria-label="Open the Mosaic Board"
        >
          <Chrome label="tessera — mosaic board" />
          <div className="rk-win-body">
            <MosaicPreview />
          </div>
          <div className="rk-win-foot">
            <b>Mosaic Board</b>
            <span>Drag a session, watch the week hold its rules</span>
            <Icon name="arrowUpRight" size={14} />
          </div>
        </button>

        <button
          type="button"
          className="rk-window is-right"
          onClick={() => onOpen("/exams")}
          aria-label="Open Examinations"
        >
          <Chrome label="tessera — examinations" />
          <div className="rk-win-body">
            <ExamsPreview />
          </div>
          <div className="rk-win-foot">
            <b>Examinations</b>
            <span>{counts.exams} papers seated</span>
          </div>
        </button>

        <span className="rk-windows-chip is-a" aria-hidden="true">
          <Icon name="pin" size={12} />
          Block B · 204 free 14:00
        </span>
        <span className="rk-windows-chip is-b" aria-hidden="true">
          <span className="rk-chip-meter">
            <i style={{ width: "72%" }} />
          </span>
          Lane balance 72%
        </span>
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
