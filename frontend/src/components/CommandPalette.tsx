import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { useUi } from "../lib/ui";
import { NAV } from "../lib/nav";
import { Icon } from "./Icon";
import { DAY_LONG } from "../lib/format";

interface Result {
  id: string;
  kind: string;
  title: string;
  sub: string;
  action: () => void;
}

export function CommandPalette() {
  const { data } = useWorkspace();
  const { paletteOpen, setPaletteOpen, openSession } = useUi();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  const results = useMemo<Result[]>(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const out: Result[] = [];

    const go = (to: string) => () => {
      navigate(to);
      setPaletteOpen(false);
    };

    NAV.forEach((item) => {
      if (!q || item.label.toLowerCase().includes(q)) {
        out.push({ id: `nav-${item.to}`, kind: "Page", title: item.label, sub: item.crumb, action: go(item.to) });
      }
    });

    if (q) {
      data.sessions
        .filter((s) =>
          `${s.courseTitle} ${s.courseId} ${s.facultyName} ${s.roomName} ${s.groupNames.join(" ")}`
            .toLowerCase()
            .includes(q),
        )
        .slice(0, 7)
        .forEach((s) =>
          out.push({
            id: `session-${s.id}`,
            kind: "Session",
            title: `${s.courseId} · ${s.courseTitle}`,
            sub: `${DAY_LONG[s.day].slice(0, 3)} · P${s.startPeriod}–P${s.endPeriod} · ${s.roomName}`,
            action: () => {
              navigate("/mosaic");
              openSession(s.id);
              setPaletteOpen(false);
            },
          }),
        );

      data.rooms
        .filter((r) => `${r.name} ${r.id} ${r.type} ${r.building}`.toLowerCase().includes(q))
        .slice(0, 6)
        .forEach((r) =>
          out.push({
            id: `room-${r.id}`,
            kind: "Space",
            title: r.name,
            sub: `${r.building} · seats ${r.capacity}`,
            action: () => {
              navigate(`/discovery?room=${encodeURIComponent(r.id)}`);
              setPaletteOpen(false);
            },
          }),
        );

      data.faculty
        .filter((f) => `${f.name} ${f.department}`.toLowerCase().includes(q))
        .slice(0, 6)
        .forEach((f) =>
          out.push({
            id: `faculty-${f.id}`,
            kind: "Person",
            title: f.name,
            sub: `${f.department} · ${f.sessionIds.length} sessions`,
            action: () => {
              navigate(`/people?faculty=${encodeURIComponent(f.id)}`);
              setPaletteOpen(false);
            },
          }),
        );

      data.bookings.bookings
        .filter((b) => `${b.title} ${b.requester} ${b.request_id}`.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach((b) =>
          out.push({
            id: `booking-${b.request_id}`,
            kind: "Booking",
            title: b.title,
            sub: `${b.request_id} · ${b.requester} · ${b.decision.status.replace(/_/g, " ")}`,
            action: () => {
              navigate(`/bookings?request=${encodeURIComponent(b.request_id)}`);
              setPaletteOpen(false);
            },
          }),
        );
    }

    return out.slice(0, 18);
  }, [data, navigate, openSession, query, setPaletteOpen]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPaletteOpen(false);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((c) => Math.min(results.length - 1, c + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      }
      if (event.key === "Enter") {
        const item = results[cursor];
        if (item) item.action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, paletteOpen, results, setPaletteOpen]);

  if (!paletteOpen) return null;

  return (
    <>
      <div className="scrim" onClick={() => setPaletteOpen(false)} style={{ backdropFilter: "blur(6px)" }} />
      <div className="palette" role="dialog" aria-label="Search TESSERA">
        <div style={{ display: "flex", alignItems: "center", paddingRight: 14 }}>
          <Icon name="search" size={16} style={{ marginLeft: 18, color: "var(--muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions, spaces, people, requests…"
            aria-label="Search query"
          />
        </div>
        <div className="palette-results">
          {results.length === 0 ? (
            <div className="empty" style={{ padding: 30 }}>
              <p>No match. Try a room, a faculty name or a request id.</p>
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                className={`palette-item ${index === cursor ? "active" : ""}`}
                onMouseEnter={() => setCursor(index)}
                onClick={result.action}
              >
                <Icon
                  name={
                    result.kind === "Session"
                      ? "book"
                      : result.kind === "Space"
                        ? "pin"
                        : result.kind === "Person"
                          ? "user"
                          : result.kind === "Booking"
                            ? "ticket"
                            : "arrowUpRight"
                  }
                  size={14}
                  style={{ color: "var(--muted)" }}
                />
                <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span className="pi-title truncate">{result.title}</span>
                  <span className="pi-sub truncate">{result.sub}</span>
                </span>
                <span className="pi-kind">{result.kind}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
