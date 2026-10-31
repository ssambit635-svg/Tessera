import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BoardItem } from "../lib/derive";
import { periodSpan } from "../lib/derive";
import { useWorkspace } from "../lib/workspace";
import { useUi } from "../lib/ui";
import { Icon } from "./Icon";
import { initials, roomImage, tintFor, KIND_LABELS } from "../lib/persona";
import { DAY_LONG, MONTHS_SHORT } from "../lib/format";
import { dateFromISO } from "../lib/ui";

interface Props {
  item: BoardItem;
  anchor: { x: number; y: number };
  onClose: () => void;
  onDetails: () => void;
}

export function EventPopover({ item, anchor, onClose, onDetails }: Props) {
  const { data } = useWorkspace();
  const { activeDate } = useUi();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x + 18, top: anchor.y - 40 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 16;
    let left = anchor.x + 20;
    if (left + rect.width + gap > window.innerWidth) left = anchor.x - rect.width - 20;
    let top = anchor.y - 46;
    if (top + rect.height + gap > window.innerHeight) top = window.innerHeight - rect.height - gap;
    if (top < gap) top = gap;
    if (left < gap) left = gap;
    setPos({ left, top });
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const date = dateFromISO(activeDate);
  const span = periodSpan(data, item.startPeriod, item.endPeriod);
  const groupAvatars = item.groupIds.slice(0, 3);
  const isBooking = item.kind === "booking";

  return (
    <div className="event-popover" style={{ left: pos.left, top: pos.top }} ref={ref} role="dialog" aria-label={item.title}>
      <div className="ep-head">
        <div className="ep-title">{item.title}</div>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <Icon name="x" size={13} />
        </button>
      </div>

      <div className="row gap-6" style={{ marginTop: 7 }}>
        <span className={`chip ${isBooking ? "lime" : "outline"}`}>{isBooking ? "Booking" : item.department}</span>
        <span className="chip outline">
          <Icon name={item.kind === "booking" ? "ticket" : "book"} size={10} />
          {isBooking ? (item.status ?? "approved").replace(/_/g, " ") : KIND_LABELS[item.kind] ?? item.kind}
        </span>
        {item.size ? <span className="chip outline">{item.size} seats</span> : null}
      </div>

      <div className="ep-rows">
        <div className="ep-row">
          <Icon name="calendar" size={14} />
          <span>
            <b>{DAY_LONG[item.day]}</b> {date.getDate()} {MONTHS_SHORT[date.getMonth()]}
          </span>
        </div>
        <div className="ep-row">
          <Icon name="clock" size={14} />
          <span>
            <b>{span.split(" – ")[0]}</b> <span className="ep-sep">→</span> <b>{span.split(" – ")[1]}</b>
            <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>
              {item.endPeriod - item.startPeriod + 1}h
            </span>
          </span>
        </div>
        <div className="ep-row">
          <Icon name="pin" size={14} />
          <span>
            <b>{item.roomName}</b>
            <span style={{ marginLeft: 6, color: "var(--muted)" }}>{item.roomId}</span>
          </span>
        </div>
        {isBooking ? (
          <div className="ep-row">
            <Icon name="user" size={14} />
            <span>{item.subtitle}</span>
          </div>
        ) : (
          <div className="ep-row">
            <Icon name="users" size={14} />
            <span>{item.groupNames.join(" · ") || "No group assigned"}</span>
          </div>
        )}
      </div>

      <div className="ep-tags">
        {isBooking ? (
          <span className="chip sand">Fest week</span>
        ) : (
          <>
            <span className="chip sky">{item.facultyName}</span>
            <span className="chip outline">{item.subtitle.split(" · ")[0]}</span>
          </>
        )}
      </div>

      <div className="ep-foot">
        <div className="avatar-stack">
          {item.facultyName ? (
            <span className={`avatar sm tone-${tintFor(item.facultyName)}`} title={item.facultyName}>
              {initials(item.facultyName)}
            </span>
          ) : null}
          {groupAvatars.map((group, index) => {
            const name = item.groupNames[index] ?? group;
            return (
              <span key={group} className={`avatar sm tone-${tintFor(group)}`} title={name}>
                {initials(name)}
              </span>
            );
          })}
          <button
            className="ep-avatar-add"
            aria-label="See everyone connected"
            onClick={onDetails}
            style={{ marginLeft: 6 }}
          >
            <Icon name="plus" size={11} />
          </button>
        </div>
        <button className="btn primary" style={{ flex: 1 }} onClick={onDetails}>
          Session details
        </button>
        <button
          className="icon-square"
          aria-label="Open Ripple view"
          onClick={() => navigate("/ripple")}
          title="See what this session is connected to"
        >
          <Icon name="route" size={15} />
        </button>
      </div>

      <div
        style={{
          margin: "10px -16px -14px",
          height: 0,
          borderTop: "1px solid var(--line)",
        }}
      />
      <div className="row gap-6" style={{ marginTop: 10 }}>
        <img
          src={roomImage(item.roomId, data.rooms.find((r) => r.id === item.roomId)?.type ?? "classroom")}
          alt=""
          style={{ width: 42, height: 30, objectFit: "cover", borderRadius: 7 }}
        />
        <span className="mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.04em" }}>
          {item.roomId} · {data.rooms.find((r) => r.id === item.roomId)?.building}
        </span>
      </div>
    </div>
  );
}
