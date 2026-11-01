import { useMemo, useState } from "react";
import { useWorkspace } from "../../lib/workspace";
import { SiteFooter, SiteHeader, SiteIntro } from "../../components/SiteChrome";
import { Icon } from "../../components/Icon";
import { DAY_LONG } from "../../lib/format";
import type { BookingStatus } from "../../lib/types";

/* ============================================================================
   /ledger — every Spectra-week request, as the engine decided it.

   The product claim is that a verdict is never a vibe: each row carries the
   sentence it came from, the slot it was given, and the reason the rule kernel
   produced. This page shows all of them, filterable, with nothing hidden.
   ========================================================================== */

const VERDICT: Record<BookingStatus, { label: string; tone: string }> = {
  approved: { label: "approved", tone: "good" },
  alternative_offered: { label: "alternative", tone: "warn" },
  rejected: { label: "rejected", tone: "bad" },
  undecided: { label: "undecided", tone: "quiet" },
};

const FILTERS = [
  { id: "all", label: "All requests" },
  { id: "approved", label: "Approved" },
  { id: "alternative_offered", label: "Alternative offered" },
  { id: "rejected", label: "Rejected" },
] as const;

export default function LedgerPage() {
  const { data } = useWorkspace();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [open, setOpen] = useState<string | null>(null);

  const totals = data.bookings.totals;

  const rows = useMemo(
    () =>
      data.bookings.bookings.filter((booking) =>
        filter === "all" ? true : booking.decision.status === filter,
      ),
    [data.bookings.bookings, filter],
  );

  const seats = data.rooms.reduce((sum, room) => sum + room.capacity, 0);

  return (
    <div className="landing site">
      <SiteHeader current="/ledger" />

      <main className="site-wrap">
        <SiteIntro
          kicker="The ledger · booking decisions"
          title="Twenty-five requests. Twenty-five reasons."
          lede="Spectra week asks for more space than the campus has. Each request was ranked against the institute's own priority order, given a venue that fits, and answered with the rule that produced the verdict — not a yes or no from a person."
        />

        <div className="site-kpis">
          <span>
            <b>{data.bookings.count}</b>
            <i>requests decided</i>
          </span>
          <span>
            <b>{totals.approved}</b>
            <i>approved as asked</i>
          </span>
          <span>
            <b>{totals.alternatives}</b>
            <i>alternative offered</i>
          </span>
          <span>
            <b>{totals.rejected}</b>
            <i>rejected with a reason</i>
          </span>
          <span>
            <b>
              {totals.score}/{totals.max}
            </b>
            <i>booking score</i>
          </span>
        </div>

        <div className="ledger-bar">
          <div className="ledger-filters" role="tablist" aria-label="Filter requests">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                role="tab"
                aria-selected={filter === entry.id}
                data-on={filter === entry.id ? "true" : "false"}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
                <span>
                  {entry.id === "all"
                    ? data.bookings.count
                    : data.bookings.bookings.filter((booking) => booking.decision.status === entry.id).length}
                </span>
              </button>
            ))}
          </div>
          <span className="ledger-note mono">
            {rows.length} shown · priority order: {data.priorityOrder.slice(0, 3).join(" › ")} …
          </span>
        </div>

        <div className="ledger">
          {rows.map((booking) => {
            const verdict = VERDICT[booking.decision.status] ?? VERDICT.undecided;
            const isOpen = open === booking.request_id;
            const window = booking.windows[0];
            return (
              <div key={booking.request_id} className="ledger-item" data-open={isOpen ? "true" : "false"}>
                <button
                  className="ledger-row"
                  onClick={() => setOpen(isOpen ? null : booking.request_id)}
                  aria-expanded={isOpen}
                >
                  <span className="ledger-id mono">{booking.request_id}</span>

                  <span className="ledger-main">
                    <b>{booking.title}</b>
                    <i>“{booking.raw_text}”</i>
                  </span>

                  <span className="ledger-slot mono">
                    {booking.decision.day
                      ? `${DAY_LONG[booking.decision.day].slice(0, 3).toUpperCase()} · P${booking.decision.start_period}`
                      : window
                        ? `${window.day} · P${window.from_period}`
                        : "no slot"}
                    <em>{booking.decision.room_id ?? "unassigned"}</em>
                  </span>

                  <span className={`ledger-verdict tone-${verdict.tone}`}>
                    <i />
                    {verdict.label}
                  </span>

                  <span className="ledger-chevron">
                    <Icon name="chevronDown" size={12} />
                  </span>
                </button>

                {isOpen ? (
                  <div className="ledger-detail">
                    <div>
                      <span className="ledger-label mono">requester</span>
                      <b>{booking.requester}</b>
                      <i>
                        {booking.role} · requested {booking.requested_category}
                        {booking.effective_category !== booking.requested_category
                          ? ` · capped to ${booking.effective_category}`
                          : ""}
                      </i>
                    </div>
                    <div>
                      <span className="ledger-label mono">the ask</span>
                      <b>
                        {booking.attendance} seats · {booking.duration_periods} period
                        {booking.duration_periods === 1 ? "" : "s"}
                      </b>
                      <i>
                        needs {booking.needs.join(", ") || "nothing special"} · wants{" "}
                        {booking.room_types.join(", ")}
                      </i>
                    </div>
                    <div>
                      <span className="ledger-label mono">the reason</span>
                      <b>{booking.decision.reason ?? "no reason recorded"}</b>
                      <i>weight {booking.weight.toFixed(2)} in the institute's priority order</i>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <section className="site-close">
          <h2>The same list is a screen in the app.</h2>
          <p>
            This page is the record; the workspace is where it is acted on — {seats} seats across{" "}
            {data.rooms.length} rooms, every verdict attached to the sentence it came from.
          </p>
          <div className="rk-cta">
            <a className="rk-btn white lg" href="/login?next=%2Fbookings">
              <span className="rk-keycap">
                <Icon name="arrowRight" size={13} />
              </span>
              Open the bookings screen
            </a>
            <a className="rk-btn outline lg" href="/seating">
              Next: exam seating
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
