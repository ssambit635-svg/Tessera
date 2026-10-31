import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { useUi } from "../lib/ui";
import { Icon } from "./Icon";
import {
  detectPlacementIssues,
  periodSpan,
  roomById,
  roomOccupancy,
  suggestSlots,
} from "../lib/derive";
import { DAY_LONG, MONTHS_SHORT, plural } from "../lib/format";
import { dateFromISO } from "../lib/ui";
import { initials, tintFor, ROOM_TYPE_LABELS } from "../lib/persona";

export function SessionDrawer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { data, proposeChange, notify } = useWorkspace();
  const { activeDate, openSession } = useUi();
  const navigate = useNavigate();
  const session = data.sessions.find((s) => s.id === sessionId);
  const suggestions = useMemo(() => (session ? suggestSlots(data, session.id, 3) : []), [data, session]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!session) return null;

  const room = roomById(data).get(session.roomId);
  const issues = detectPlacementIssues(data, session);
  const occupancy = room ? roomOccupancy(data, room, session.day, session.startPeriod) : null;
  const relatedSameRoom = data.sessions.filter((s) => s.id !== session.id && s.roomId === session.roomId && s.day === session.day);
  const relatedFaculty = data.sessions.filter((s) => s.id !== session.id && s.facultyId === session.facultyId && s.day === session.day);
  const relatedGroups = data.sessions.filter(
    (s) => s.id !== session.id && s.day === session.day && s.groupIds.some((g) => session.groupIds.includes(g)),
  );
  const date = dateFromISO(activeDate);

  const moveTo = async (day: (typeof data.calendar.days)[number], start: number, roomId: string) => {
    const result = await proposeChange(session.id, { day, startPeriod: start, roomId });
    if (result) {
      onClose();
      navigate("/ripple");
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`${session.courseTitle} details`}>
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="row gap-6" style={{ marginBottom: 6 }}>
              <span className="chip sky">{session.department}</span>
              <span className="chip outline">{session.kind}</span>
              <span className="mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>
                {session.id}
              </span>
            </div>
            <h2>{session.courseTitle}</h2>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              {session.courseId} · {DAY_LONG[session.day]} {date.getDate()} {MONTHS_SHORT[date.getMonth()]} ·{" "}
              {periodSpan(data, session.startPeriod, session.endPeriod)}
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close details" style={{ marginLeft: "auto" }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="drawer-body">
          <div className={`status ${issues.length ? "warning" : "valid"}`} style={{ alignSelf: "flex-start" }}>
            <Icon name={issues.length ? "alert" : "shield"} size={12} strokeWidth={2} />
            {issues.length ? `${plural(issues.length, "issue")} on the current placement` : "Validated · no hard conflicts"}
          </div>

          {issues.length ? (
            <div className="callout sand" style={{ fontSize: 11.5 }}>
              <Icon name="alert" size={14} />
              <span>{issues.join(" · ")}</span>
            </div>
          ) : null}

          <div className="detail-grid">
            <div className="detail-item">
              <span className="eyebrow">Venue</span>
              <b>{session.roomName}</b>
              <span className="mono">{session.roomId} · {room?.building}</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Capacity</span>
              <b>{room?.capacity ?? "—"} seats</b>
              <span className="mono">{session.size} enrolled</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Faculty</span>
              <b>{session.facultyName}</b>
              <span className="mono">{session.facultyId}</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Kind</span>
              <b style={{ textTransform: "capitalize" }}>{session.kind}</b>
              <span className="mono">{room ? ROOM_TYPE_LABELS[room.type] ?? room.type : "—"}</span>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Student groups
            </div>
            <div className="row gap-6 wrap">
              {session.groupIds.map((id, index) => (
                <span key={id} className={`person-chip`}>
                  <span className={`avatar sm tone-${tintFor(id)}`}>{initials(session.groupNames[index] ?? id)}</span>
                  {session.groupNames[index] ?? id}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="eyebrow">Connected today</span>
              <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                ripple preview
              </span>
            </div>
            <div className="connect-list">
              {[
                { label: "Same room", items: relatedSameRoom, icon: "pin" },
                { label: "Same faculty", items: relatedFaculty, icon: "user" },
                { label: "Shared groups", items: relatedGroups, icon: "users" },
              ].map((row) => (
                <div key={row.label} className="connect-row">
                  <span className="connect-label">
                    <Icon name={row.icon} size={12} /> {row.label}
                  </span>
                  <span className="connect-items">
                    {row.items.length === 0 ? (
                      <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                        nothing else
                      </span>
                    ) : (
                      row.items.slice(0, 3).map((s) => (
                        <button
                          key={s.id}
                          className="chip outline"
                          onClick={() => openSession(s.id)}
                          title={`${s.courseTitle} · ${s.roomName}`}
                        >
                          {s.courseId} · P{s.startPeriod}
                        </button>
                      ))
                    )}
                    {row.items.length > 3 ? <span className="mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>+{row.items.length - 3}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="eyebrow">Validated alternatives</span>
              <span className="chip sage">
                <Icon name="sparkles" size={10} /> local rule check
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {suggestions.length === 0 ? (
                <p className="muted" style={{ fontSize: 11.5 }}>
                  No alternative slot in this week keeps every rule intact.
                </p>
              ) : (
                suggestions.map((suggestion) => (
                  <div key={`${suggestion.target.day}-${suggestion.target.startPeriod}-${suggestion.target.roomId}`} className="suggest-row">
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <b>
                        {DAY_LONG[suggestion.target.day]} · P{suggestion.target.startPeriod}
                      </b>
                      <span className="mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>
                        {roomById(data).get(suggestion.target.roomId ?? "")?.name} ·{" "}
                        {suggestion.state === "valid" ? "all checks pass" : "warnings only"}
                      </span>
                    </div>
                    <button
                      className="btn sm"
                      onClick={() =>
                        void moveTo(suggestion.target.day, suggestion.target.startPeriod, suggestion.target.roomId ?? session.roomId)
                      }
                    >
                      Preview
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {occupancy ? (
            <div className="callout" style={{ fontSize: 11 }}>
              <Icon name="info" size={13} />
              <span>
                <b>Live occupancy · {occupancy.label}.</b> {occupancy.detail}
              </span>
            </div>
          ) : null}
        </div>

        <div className="drawer-foot">
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              navigate("/mosaic");
              notify({ tone: "info", title: "Drag to reschedule", detail: "Pick the tile up and drop it on another slot to preview the change." });
            }}
          >
            <Icon name="route" size={14} /> Reschedule on the board
          </button>
          <button
            className="btn"
            onClick={() => {
              onClose();
              navigate(`/people?faculty=${encodeURIComponent(session.facultyId)}`);
            }}
          >
            Find a replacement
          </button>
        </div>
      </aside>
    </>
  );
}
