import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { checkManualEvent, createManualEvent, parseRequest, ApiError } from "../lib/api";
import { localParse } from "../lib/nlp";
import { matchRooms } from "../lib/derive";
import { DAY_LONG, formatStamp, plural } from "../lib/format";
import { CATEGORY_LABELS, ROOM_TYPE_LABELS } from "../lib/persona";
import type { Booking, DayCode } from "../lib/types";

type StatusTab = "all" | "approved" | "alternative_offered" | "rejected";

interface DisplayDraft {
  title: string | null;
  attendance: number | null;
  duration_periods: number | null;
  windows: { day: DayCode; from_period: number; to_period: number }[];
  needs: string[];
  room_types: string[];
  requested_room: string | null;
  requested_category: string | null;
  mandatory_for_groups: string[];
  confidence: Record<string, number>;
  assumptions: { field: string; value: unknown; why: string }[];
  follow_up: string | null;
  source: string;
}

export default function Bookings() {
  const { data, source } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<StatusTab>("all");
  const [open, setOpen] = useState<string | null>(params.get("request"));
  const [nlOpen, setNlOpen] = useState(Boolean(params.get("space")));

  const bookings = data.bookings.bookings;
  const counts = data.bookings.totals;
  const active = bookings.find((b) => b.request_id === open) ?? null;

  const visible = bookings.filter((b) => (tab === "all" ? true : b.decision.status === tab));

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Bookings · {data.calendar.festWeek ?? "fest week"}</div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            Requests, decided with reasons.
          </h2>
          <p>
            Every Spectra-week request, the venue it was given, and the rule chain behind the
            decision. Nothing is silently approved.
          </p>
        </div>
        <div className="row gap-8" style={{ flexShrink: 0 }}>
          <button className="btn primary" onClick={() => setNlOpen(true)}>
            <Icon name="sparkles" size={14} /> Natural-language request
          </button>
        </div>
      </div>

      <div className="booking-score">
        <div className="bs-main">
          <span className="eyebrow">Booking score</span>
          <div className="bs-value">
            {counts.score}
            <small>/ {counts.max}</small>
          </div>
          <div className="meter" style={{ maxWidth: 240 }}>
            <i style={{ width: `${(counts.score / Math.max(1, counts.max)) * 100}%`, background: "var(--sage-ink)" }} />
          </div>
        </div>
        <div className="bs-cell">
          <b>{counts.approved}</b>
          <span>approved</span>
        </div>
        <div className="bs-cell">
          <b style={{ color: "var(--sand-ink)" }}>{counts.alternatives}</b>
          <span>alternative</span>
        </div>
        <div className="bs-cell">
          <b style={{ color: "var(--coral-ink)" }}>{counts.rejected}</b>
          <span>rejected</span>
        </div>
        <div className="bs-cell">
          <b>{counts.cancelled}</b>
          <span>cancelled</span>
        </div>
        <div className="bs-note">
          <Icon name="shield" size={14} />
          <span>
            {data.dashboard.conflicts.hard} hard conflicts across timetable, bookings and exams. A rejected request
            is a decision, not an error.
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head" style={{ gap: 18 }}>
          <div className="tabs" style={{ borderBottom: 0 }}>
            {(
              [
                ["all", `All ${bookings.length}`],
                ["approved", `Approved ${counts.approved}`],
                ["alternative_offered", `Alternatives ${counts.alternatives}`],
                ["rejected", `Rejected ${counts.rejected}`],
              ] as [StatusTab, string][]
            ).map(([key, label]) => (
              <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            {source.mode === "live" ? "DECIDED LIVE" : "PREVIEW ONLY"}
          </span>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 78 }}>Request</th>
                <th>Title</th>
                <th>Requester</th>
                <th>Category</th>
                <th>Window</th>
                <th>Venue</th>
                <th>Status</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((booking) => (
                <tr
                  key={booking.request_id}
                  onClick={() => {
                    setOpen(booking.request_id);
                    setParams({ request: booking.request_id });
                  }}
                  className={open === booking.request_id ? "selected" : ""}
                >
                  <td className="mono">{booking.request_id}</td>
                  <td>
                    <strong>{booking.title}</strong>
                    <span className="mono" style={{ display: "block", fontSize: 10.5, color: "var(--muted)" }}>
                      {booking.attendance} seats · {booking.duration_periods}h
                    </span>
                  </td>
                  <td>{booking.requester}</td>
                  <td>
                    <span className={`chip ${booking.effective_category === "institute_event" ? "lime" : booking.effective_category === "club_event" ? "sky" : "outline"}`}>
                      {CATEGORY_LABELS[booking.effective_category] ?? booking.effective_category}
                    </span>
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>
                    {booking.decision.day ?? booking.windows[0]?.day ?? "—"}
                    {booking.decision.start_period ? ` P${booking.decision.start_period}` : ""}
                    {booking.decision.end_period ? `–P${booking.decision.end_period}` : ""}
                  </td>
                  <td className="mono">{booking.decision.room_id ?? booking.requested_room ?? "—"}</td>
                  <td>
                    <span
                      className={`status ${
                        booking.decision.status === "approved"
                          ? "valid"
                          : booking.decision.status === "alternative_offered"
                            ? "warning"
                            : booking.decision.status === "rejected"
                              ? "invalid"
                              : "neutral"
                      }`}
                    >
                      {booking.decision.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>
                    <Icon name="chevronRight" size={13} style={{ color: "var(--muted)" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-foot">
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            {visible.length} REQUEST{visible.length === 1 ? "" : "S"} · SORTED BY PRIORITY
          </span>
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            {Object.entries(data.roleCategoryCap)
              .map(([role, cap]) => `${role}: ${cap}`)
              .join(" · ")}
          </span>
        </div>
      </div>

      {active ? <BookingDrawer booking={active} onClose={() => { setOpen(null); setParams({}); }} /> : null}

      {nlOpen ? (
        <NaturalLanguageBooking
          initialSpace={params.get("space") ?? ""}
          initialDay={(params.get("day") as DayCode) ?? ""}
          initialFrom={params.get("from") ?? ""}
          initialTo={params.get("to") ?? ""}
          onClose={() => {
            setNlOpen(false);
            setParams({});
          }}
        />
      ) : null}

      <p className="mono" style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: "0.06em" }}>
        {plural(bookings.length, "request")} · SPECTRA ’27 · WEEK 7
      </p>
    </div>
  );
}

function BookingDrawer({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { data, notify } = useWorkspace();
  const [showJson, setShowJson] = useState(false);
  const status = booking.decision.status;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={booking.title}>
        <div className="drawer-head">
          <div>
            <div className="row gap-6" style={{ marginBottom: 6 }}>
              <span className="chip outline">{booking.request_id}</span>
              <span className={`status ${status === "approved" ? "valid" : status === "alternative_offered" ? "warning" : "invalid"}`}>
                {status.replace(/_/g, " ")}
              </span>
              {booking.cancelled ? <span className="chip coral">cancelled</span> : null}
            </div>
            <h2>{booking.title}</h2>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
              {booking.requester} · {formatStamp(booking.submitted_at)}
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto" }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="drawer-body">
          {booking.decision.reason ? (
            <div className={`callout ${status === "approved" ? "sage" : status === "rejected" ? "coral" : "sand"}`}>
              <Icon name={status === "approved" ? "check" : "info"} size={15} />
              <span>
                <b>Decision.</b> {booking.decision.reason}
              </span>
            </div>
          ) : null}

          <div className="detail-grid">
            <div className="detail-item">
              <span className="eyebrow">Venue awarded</span>
              <b>{booking.decision.room_id ?? "—"}</b>
              <span className="mono">
                {data.rooms.find((r) => r.id === booking.decision.room_id)?.name ?? "no venue"}
              </span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Slot</span>
              <b>{booking.decision.day ?? "—"}</b>
              <span className="mono">
                P{booking.decision.start_period ?? "—"}–P{booking.decision.end_period ?? "—"}
              </span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Attendance</span>
              <b>{booking.attendance}</b>
              <span className="mono">{plural(booking.duration_periods, "period")}</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Category</span>
              <b style={{ fontSize: 12 }}>{CATEGORY_LABELS[booking.effective_category] ?? booking.effective_category}</b>
              <span className="mono">weight {booking.weight}</span>
            </div>
          </div>

          {booking.category_note ? (
            <div className="callout sand" style={{ fontSize: 11 }}>
              <Icon name="lock" size={13} />
              <span>
                <b>Category capped.</b> {booking.category_note}
              </span>
            </div>
          ) : null}

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Requirements</div>
            <div className="row gap-6 wrap">
              <span className="chip outline">{booking.attendance} seats</span>
              <span className="chip outline">{plural(booking.duration_periods, "period")}</span>
              {booking.needs.map((need) => (
                <span key={need} className="chip sky">
                  {need.replace(/_/g, " ")}
                </span>
              ))}
              {booking.room_types.map((type) => (
                <span key={type} className="chip outline">
                  {ROOM_TYPE_LABELS[type] ?? type}
                </span>
              ))}
              {booking.windows.map((window) => (
                <span key={`${window.day}-${window.from_period}`} className="chip outline">
                  {DAY_LONG[window.day]} P{window.from_period}–P{window.to_period}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Original message</div>
            <blockquote className="quote-block">{booking.raw_text}</blockquote>
          </div>

          <div>
            <button className="row-between" style={{ width: "100%" }} onClick={() => setShowJson((v) => !v)}>
              <span className="eyebrow">Decision object</span>
              <Icon name={showJson ? "chevronUp" : "chevronDown"} size={13} />
            </button>
            {showJson ? <pre className="code-block">{JSON.stringify(booking.decision, null, 2)}</pre> : null}
          </div>

          <div className="callout" style={{ fontSize: 11 }}>
            <Icon name="info" size={13} />
            <span>
              Bookings are decided by the scheduling authority using priority order and hard constraints. This
              panel reads the decision; it does not make one.
            </span>
          </div>
        </div>

        <div className="drawer-foot">
          <button
            className="btn primary"
            onClick={() =>
              notify({
                tone: "info",
                title: "Approval is a two-person action",
                detail: "TESSERA requires a different admin to approve a change. Switch persona from the profile menu to act as the second approver.",
              })
            }
          >
            <Icon name="shield" size={14} /> Review for approval
          </button>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)", marginLeft: "auto" }}>
            {booking.role.replace(/_/g, " ")}
          </span>
        </div>
      </aside>
    </>
  );
}

const SAMPLES = [
  "Book a laboratory for the electronics club on Friday from 10 to 12. We need 25 seats and an oscilloscope.",
  "Need a room for 45 people for a coding workshop on Wednesday between 2 and 4, with computers and a projector.",
  "We want the seminar hall on Tuesday 11 to 1 for a guest lecture, around 120 attendees, sound required.",
];

function NaturalLanguageBooking({
  initialSpace,
  initialDay,
  initialFrom,
  initialTo,
  onClose,
}: {
  initialSpace: string;
  initialDay: string;
  initialFrom: string;
  initialTo: string;
  onClose: () => void;
}) {
  const { data, source, notify } = useWorkspace();
  const [text, setText] = useState(
    data.rooms.some((r) => r.id === initialSpace)
      ? `Book ${data.rooms.find((r) => r.id === initialSpace)?.name} on ${
          initialDay ? DAY_LONG[initialDay as DayCode] : "Monday"
        } from ${data.calendar.periods.find((p) => p.id === Number(initialFrom))?.start ?? "10:00"} to ${
          data.calendar.periods.find((p) => p.id === Number(initialTo))?.end ?? "12:00"
        } for 30 people.`
      : SAMPLES[0],
  );
  const [draft, setDraft] = useState<DisplayDraft | null>(null);
  const [parsing, setParsing] = useState(false);
  const [checked, setChecked] = useState<Record<string, unknown> | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, unknown> | null>(null);
  const [confirmedWrite, setConfirmedWrite] = useState(false);

  useEffect(() => {
    setChecked(null);
    setCheckError(null);
    setCreated(null);
  }, [draft]);

  const interpret = async () => {
    setParsing(true);
    setDraft(null);
    try {
      if (source.mode === "live" && source.token) {
        const result = (await parseRequest(source.token, text)) as {
          draft: DisplayDraft;
          confidence: Record<string, number>;
          assumptions: { field: string; value: unknown; why: string }[];
          follow_up: string | null;
          source: { model?: string; method?: string } | string;
        };
        setDraft({
          ...result.draft,
          mandatory_for_groups: result.draft.mandatory_for_groups ?? [],
          confidence: result.confidence,
          assumptions: result.assumptions,
          follow_up: result.follow_up,
          source:
            typeof result.source === "string"
              ? result.source
              : `${result.source.method ?? "parser"}${result.source.model ? ` · ${result.source.model}` : ""}`,
        });
        notify({ tone: "ai", title: "Interpreted by the API", detail: "Draft returned by /api/ai/parse." });
      } else {
        const local = localParse(text, data);
        setDraft({ ...local, mandatory_for_groups: [], source: local.source });
      }
    } catch (error) {
      const local = localParse(text, data);
      setDraft({ ...local, mandatory_for_groups: [], source: `${local.source} — API parse failed (${error instanceof Error ? error.message : "error"})` });
      notify({ tone: "warn", title: "Using the local interpreter", detail: "The API could not parse this text; the draft below was built in the browser." });
    } finally {
      setParsing(false);
    }
  };

  const updateDraft = (patch: Partial<DisplayDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  const primaryWindow = draft?.windows[0];
  const matches = useMemo(() => {
    if (!draft) return [];
    return matchRooms(data, {
      minCapacity: draft.attendance ?? undefined,
      features: draft.needs,
      types: draft.room_types.length ? draft.room_types : undefined,
      day: primaryWindow?.day,
      fromPeriod: primaryWindow?.from_period,
      toPeriod: primaryWindow?.to_period,
      uses: draft.requested_category === "institute_event" ? ["event"] : ["event", "lecture", "lab"],
    }).slice(0, 5);
  }, [data, draft, primaryWindow?.day, primaryWindow?.from_period, primaryWindow?.to_period]);

  const validDraft = Boolean(draft && draft.attendance && draft.attendance > 0 &&
    draft.duration_periods && draft.duration_periods >= 1 && draft.duration_periods <= 4 &&
    draft.windows.length && draft.windows.every((window) => window.day && window.from_period <= window.to_period &&
      window.to_period - window.from_period + 1 >= (draft.duration_periods ?? 0)));
  const payload = draft && validDraft
    ? {
        title: draft.title ?? "Untitled request",
        attendance: draft.attendance,
        duration_periods: draft.duration_periods,
        windows: draft.windows,
        needs: draft.needs,
        mandatory_for_groups: draft.mandatory_for_groups,
        room_types: draft.room_types,
        room_id: draft.requested_room ?? undefined,
        category: draft.requested_category ?? "club_event",
        note: text,
      }
    : null;

  const dryRun = async () => {
    if (!payload) return;
    setCheckError(null);
    if (source.mode === "live" && source.token) {
      try {
        const result = await checkManualEvent(source.token, payload);
        setChecked(result);
      } catch (error) {
        setCheckError(error instanceof ApiError ? error.message : String(error));
      }
    } else {
      const result = matches.find((m) => m.fit && m.freeInWindow) ?? matches[0];
      setChecked({
        simulated: true,
        slot: result
          ? { room_id: result.room.id, day: primaryWindow?.day, from: primaryWindow?.from_period, to: primaryWindow?.to_period }
          : null,
        note: "Checked in the browser against this week\u2019s availability — nothing was sent.",
      });
    }
  };

  const commit = async () => {
    if (!payload) return;
    if (source.mode === "live" && source.token && confirmedWrite) {
      try {
        const result = await createManualEvent(source.token, payload);
        setCreated(result);
        notify({ tone: "valid", title: "Event created in the API", detail: "The backend accepted this manual event." });
      } catch (error) {
        setCheckError(error instanceof ApiError ? error.message : String(error));
        notify({ tone: "danger", title: "The API refused the event", detail: error instanceof ApiError ? error.message : String(error) });
      }
    } else {
      setCreated({
        simulated: true,
        detail: "Nothing was written. In live mode this button writes one manual event through /api/bookings/manual.",
      });
      notify({
        tone: "info",
        title: "Request preview only",
        detail: "This is a frontend demonstration. No booking exists until the scheduling authority confirms it.",
      });
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal wide" role="dialog" aria-label="Natural-language booking">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <div className="eyebrow">Natural-language request</div>
            <h2 style={{ marginTop: 4 }}>Describe the booking in your own words</h2>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label htmlFor="nl-text">Your request</label>
            <textarea
              id="nl-text"
              className="textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Book a laboratory for the electronics club on Friday from 10 to 12…"
            />
            <div className="row gap-6 wrap" style={{ marginTop: 4 }}>
              {SAMPLES.map((sample, index) => (
                <button key={sample} className="chip outline" onClick={() => setText(sample)}>
                  Example {index + 1}
                </button>
              ))}
              <span className="spacer" />
              <button className="btn sm primary" onClick={() => void interpret()} disabled={parsing || text.trim().length < 6}>
                <Icon name="sparkles" size={13} /> {parsing ? "Interpreting…" : "Interpret request"}
              </button>
            </div>
          </div>

          {draft ? (
            <>
              <div className="row-between">
                <div className="row gap-6">
                  <span className="chip violet">
                    <Icon name="sparkles" size={10} /> {draft.source}
                  </span>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                    {source.mode === "live" ? "Returned by the API" : "Frontend fallback — the API is not reachable"}
                  </span>
                </div>
                <button className="btn sm quiet" onClick={() => setDraft(null)}>
                  Reset
                </button>
              </div>

              <div className="nl-grid">
                <div className="nl-form">
                  <div className="eyebrow" style={{ marginBottom: 8 }}>
                    Extracted requirements · editable
                  </div>
                  <div className="field">
                    <label htmlFor="nl-title">Title</label>
                    <input
                      id="nl-title"
                      className="input"
                      value={draft.title ?? ""}
                      onChange={(event) => updateDraft({ title: event.target.value })}
                    />
                  </div>
                  <div className="row gap-8">
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor="nl-cap">Attendance</label>
                      <input
                        id="nl-cap"
                        className="input mono-input"
                        type="number"
                        value={draft.attendance ?? ""}
                        onChange={(event) => updateDraft({ attendance: Number(event.target.value) || null })}
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor="nl-dur">Duration (periods)</label>
                      <input
                        id="nl-dur"
                        className="input mono-input"
                        type="number"
                        min={1}
                        max={4}
                        value={draft.duration_periods ?? ""}
                        onChange={(event) => updateDraft({ duration_periods: Number(event.target.value) || null })}
                      />
                    </div>
                  </div>
                  {primaryWindow ? (
                    <div className="row gap-8">
                      <div className="field" style={{ flex: 1 }}>
                        <label htmlFor="nl-day">Day</label>
                        <select
                          id="nl-day"
                          className="select"
                          value={primaryWindow.day}
                          onChange={(event) =>
                            updateDraft({
                              windows: [{ ...primaryWindow, day: event.target.value as DayCode }],
                            })
                          }
                        >
                          {data.calendar.days.map((day) => (
                            <option key={day} value={day}>
                              {DAY_LONG[day]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ flex: 1 }}>
                        <label htmlFor="nl-from">From</label>
                        <select
                          id="nl-from"
                          className="select"
                          value={primaryWindow.from_period}
                          onChange={(event) =>
                            updateDraft({
                              windows: [{ ...primaryWindow, from_period: Number(event.target.value) }],
                            })
                          }
                        >
                          {data.calendar.periods.map((p) => (
                            <option key={p.id} value={p.id}>
                              P{p.id} · {p.start}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ flex: 1 }}>
                        <label htmlFor="nl-to">To</label>
                        <select
                          id="nl-to"
                          className="select"
                          value={primaryWindow.to_period}
                          onChange={(event) =>
                            updateDraft({
                              windows: [{ ...primaryWindow, to_period: Number(event.target.value) }],
                            })
                          }
                        >
                          {data.calendar.periods.map((p) => (
                            <option key={p.id} value={p.id}>
                              P{p.id} · {p.end}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}

                  {!primaryWindow ? (
                    <div className="callout sand">
                      <span>A day and time window are required.</span>
                      <button className="btn sm" onClick={() => updateDraft({ windows: [{
                        day: data.calendar.days[0], from_period: data.calendar.periods[0].id,
                        to_period: data.calendar.periods[0].id,
                      }] })}>Add a window</button>
                    </div>
                  ) : null}
                  <div className="field">
                    <span className="field-label">Mandatory student groups</span>
                    <div className="row gap-6 wrap">
                      {data.groups.map((group) => (
                        <button key={group.id} className={`chip ${draft.mandatory_for_groups.includes(group.id) ? "sky" : "outline"}`}
                          aria-pressed={draft.mandatory_for_groups.includes(group.id)}
                          onClick={() => updateDraft({ mandatory_for_groups: draft.mandatory_for_groups.includes(group.id)
                            ? draft.mandatory_for_groups.filter((id) => id !== group.id)
                            : [...draft.mandatory_for_groups, group.id] })}>
                          {group.id}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span className="field-label">Equipment requirements</span>
                    <div className="row gap-6 wrap">
                      {["computers", "projector", "pa_system", "power_benches", "stage", "ac"].map((feature) => (
                        <button
                          key={feature}
                          className={`chip ${draft.needs.includes(feature) ? "sky" : "outline"}`}
                          onClick={() =>
                            updateDraft({
                              needs: draft.needs.includes(feature)
                                ? draft.needs.filter((f) => f !== feature)
                                : [...draft.needs, feature],
                            })
                          }
                          aria-pressed={draft.needs.includes(feature)}
                        >
                          {feature.replace(/_/g, " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="row gap-6 wrap">
                    {Object.entries(draft.confidence ?? {}).map(([field, value]) => (
                      <span key={field} className={`chip ${Number(value) > 0.7 ? "sage" : Number(value) > 0.45 ? "sand" : "coral"}`}>
                        {field} · {Math.round(Number(value) * 100)}%
                      </span>
                    ))}
                  </div>

                  {draft.assumptions?.length ? (
                    <div className="callout sand" style={{ fontSize: 11 }}>
                      <Icon name="info" size={13} />
                      <span>
                        <b>Assumptions.</b>{" "}
                        {draft.assumptions.map((a) => `${a.field}: ${a.why}`).join(" · ")}
                      </span>
                    </div>
                  ) : null}
                  {draft.follow_up ? (
                    <div className="callout violet" style={{ fontSize: 11 }}>
                      <Icon name="sparkles" size={13} />
                      <span>{draft.follow_up}</span>
                    </div>
                  ) : null}
                </div>

                <div className="nl-results">
                  <div className="eyebrow" style={{ marginBottom: 8 }}>
                    Compatible spaces
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {matches.map((match) => (
                      <button
                        key={match.room.id}
                        className={`nl-room ${draft.requested_room === match.room.id ? "chosen" : ""} ${match.fit && match.freeInWindow ? "" : "muted"}`}
                        onClick={() => updateDraft({ requested_room: match.room.id })}
                      >
                        <div className="row-between">
                          <b>{match.room.name}</b>
                          <span className={`status ${match.fit && match.freeInWindow ? "valid" : "warning"}`}>
                            {match.fit && match.freeInWindow ? "fits" : "partial"}
                          </span>
                        </div>
                        <span className="mono">
                          {match.room.id} · {match.room.capacity} seats · {match.room.building}
                        </span>
                        <span className="nl-why">
                          {match.why.slice(0, 2).map((w) => (
                            <span key={w.text} className={w.ok ? "ok" : "no"}>
                              <Icon name={w.ok ? "check" : "x"} size={9} strokeWidth={2.4} /> {w.text}
                            </span>
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                  {draft.requested_room ? (
                    <div className="row-between" style={{ marginTop: 8 }}>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                        SELECTED {draft.requested_room}
                      </span>
                      <button className="btn sm quiet" onClick={() => updateDraft({ requested_room: null })}>
                        Clear
                      </button>
                    </div>
                  ) : null}

                  {checked ? (
                    <div className={`callout ${checked.ok === false ? "coral" : "sage"}`} style={{ fontSize: 11, marginTop: 10 }}>
                      <Icon name="shield" size={13} />
                      <span>
                        <b>{source.mode === "live" && !checked.simulated ? "API dry run." : "Simulated dry run."}</b>{" "}
                        {String(checked.reason ?? checked.note ?? "")}
                        {Array.isArray(checked.conflicts) && checked.conflicts.length ? ` ${checked.conflicts.join("; ")}` : ""}
                        {Array.isArray(checked.candidates) && checked.candidates.length ?
                          ` Available: ${checked.candidates.map((item: { room_id: string; day: string; start_period: number }) =>
                            `${item.room_id} ${item.day} P${item.start_period}`).join(", ")}` : ""}
                        {checked.slot ? (
                          <>
                            {" "}
                            Slot: {String((checked.slot as { day?: string }).day)} ·{" "}
                            {String((checked.slot as { room_id?: string }).room_id)}
                          </>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  {checkError ? (
                    <div className="callout coral" style={{ fontSize: 11, marginTop: 10 }}>
                      <Icon name="alert" size={13} />
                      <span>{checkError}</span>
                    </div>
                  ) : null}
                  {created ? (
                    <div className="callout violet" style={{ fontSize: 11, marginTop: 10 }}>
                      <Icon name="check" size={13} />
                      <span>
                        <b>{(created as { simulated?: boolean }).simulated ? "Nothing was written." : "Created."}</b>{" "}
                        {String((created as { detail?: string }).detail ?? "The API returned a manual event.")}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="callout" style={{ fontSize: 11.5 }}>
              <Icon name="info" size={14} />
              <span>
                An interpreted request is a <b>draft</b>, never a booking. TESSERA extracts requirements, shows which
                spaces actually satisfy them, and only the scheduling authority can confirm.
              </span>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {source.mode === "live" ? (
            <label className="checkline on" style={{ gap: 7 }}>
              <button
                className={`switch ${confirmedWrite ? "on" : ""}`}
                aria-pressed={confirmedWrite}
                aria-label="Allow writing to the API"
                onClick={() => setConfirmedWrite((v) => !v)}
              />
              Allow the API write
            </label>
          ) : (
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
              PREVIEW ONLY · NOTHING IS SENT
            </span>
          )}
          <span className="spacer" />
          {draft && !validDraft ? <span className="mono">Enter attendance, duration and a fitting time window.</span> : null}
          <button className="btn sm" onClick={() => void dryRun()} disabled={!validDraft}>
            <Icon name="shield" size={13} /> Dry run
          </button>
          <button className="btn sm primary" onClick={() => void commit()} disabled={!validDraft}>
            <Icon name="check" size={13} /> {source.mode === "live" && confirmedWrite ? "Create event" : "Submit request"}
          </button>
        </div>
      </div>
    </>
  );
}
