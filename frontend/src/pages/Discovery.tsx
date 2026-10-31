import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import {
  availabilityWindow,
  matchRooms,
  roomOccupancy,
  roomSummary,
  type RoomMatch,
} from "../lib/derive";
import { FEATURE_LABELS, ROOM_TYPE_LABELS, roomImage } from "../lib/persona";
import { DAY_LONG, MONTHS_SHORT, percent, plural, ratio } from "../lib/format";
import { dateFromISO } from "../lib/ui";
import { useUi } from "../lib/ui";
import type { Room } from "../lib/types";

const EQUIPMENT = ["computers", "projector", "pa_system", "power_benches", "ac", "stage"];

export default function Discovery() {
  const { data } = useWorkspace();
  const { activeDate } = useUi();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const [minCapacity, setMinCapacity] = useState(0);
  const [type, setType] = useState("all");
  const [building, setBuilding] = useState("all");
  const [features, setFeatures] = useState<string[]>([]);
  const [accessible, setAccessible] = useState(false);
  const [windowDay, setWindowDay] = useState("all");
  const [fromPeriod, setFromPeriod] = useState(0);
  const [toPeriod, setToPeriod] = useState(0);
  const [search, setSearch] = useState("");

  const openRoom = params.get("room");
  const room = data.rooms.find((r) => r.id === openRoom) ?? null;

  const types = [...new Set(data.rooms.map((r) => r.type))].sort();
  const buildingNames = [...new Set(data.rooms.map((r) => r.building))].sort();

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = data.rooms.filter((r) => {
      if (type !== "all" && r.type !== type) return false;
      if (building !== "all" && r.building !== building) return false;
      if (q && !`${r.name} ${r.id} ${r.building} ${r.features.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return matchRooms(data, {
      minCapacity: minCapacity || undefined,
      features,
      accessible,
      day: windowDay === "all" ? undefined : (windowDay as Room["availability"][number]["day"]),
      fromPeriod: fromPeriod || undefined,
      toPeriod: toPeriod || undefined,
    }).filter((m) => filtered.some((r) => r.id === m.room.id));
  }, [accessible, building, data, features, fromPeriod, minCapacity, search, toPeriod, type, windowDay]);

  const activeFilters =
    Number(Boolean(minCapacity)) +
    Number(type !== "all") +
    Number(building !== "all") +
    Number(accessible) +
    Number(windowDay !== "all") +
    features.length;

  const hero = matches.find((m) => m.fit) ?? matches[0];
  const supporting = matches.filter((m) => m.room.id !== hero?.room.id && m.room.type !== "workshop").slice(0, 2);
  const rest = matches.filter((m) => ![hero, ...supporting].some((x) => x?.room.id === m.room.id));

  const reset = () => {
    setMinCapacity(0);
    setType("all");
    setBuilding("all");
    setFeatures([]);
    setAccessible(false);
    setWindowDay("all");
    setFromPeriod(0);
    setToPeriod(0);
    setSearch("");
  };

  const toggleFeature = (feature: string) =>
    setFeatures((current) =>
      current.includes(feature) ? current.filter((f) => f !== feature) : [...current, feature],
    );

  return (
    <div className="page">
      <section className="discovery-head">
        <div>
          <div className="eyebrow">Resource discovery</div>
          <h1 className="serif discovery-title">
            A collection of spaces,
            <br />
            not a spreadsheet.
          </h1>
          <p className="discovery-lede">
            {data.rooms.length} rooms, laboratories, halls and workshops across{" "}
            {new Set(data.rooms.map((r) => r.building)).size} buildings — filtered by what a booking actually
            needs: capacity, equipment, access and a real free window.
          </p>
        </div>
        <div className="discovery-aside">
          <div className="aside-figure">
            <img src="/media/innovation-hub.jpg" alt="Collaboration space" />
            <span className="annotation">Plate 01 · collaboration</span>
          </div>
          <div className="aside-notes">
            <div>
              <span className="mono">{String(data.rooms.length).padStart(2, "0")}</span>
              <span className="eyebrow">spaces</span>
            </div>
            <div>
              <span className="mono">{plural(matches.filter((m) => m.fit).length, "match")}</span>
              <span className="eyebrow">under current filters</span>
            </div>
          </div>
        </div>
      </section>

      <section className="filter-bar">
        <div className="filter-row">
          <div className="filter-field">
            <span className="eyebrow">Search</span>
            <div className="filter-input">
              <Icon name="search" size={13} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Room, building, equipment" />
            </div>
          </div>

          <div className="filter-field">
            <span className="eyebrow">Capacity ≥</span>
            <div className="row gap-8">
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={minCapacity}
                onChange={(event) => setMinCapacity(Number(event.target.value))}
                className="range"
                aria-label="Minimum capacity"
              />
              <span className="mono" style={{ minWidth: 34 }}>{minCapacity || "any"}</span>
            </div>
          </div>

          <div className="filter-field">
            <span className="eyebrow">Category</span>
            <select className="select" value={type} onChange={(event) => setType(event.target.value)} aria-label="Room category">
              <option value="all">Every category</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {ROOM_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <span className="eyebrow">Building</span>
            <select className="select" value={building} onChange={(event) => setBuilding(event.target.value)} aria-label="Building">
              <option value="all">Anywhere on campus</option>
              {buildingNames.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <span className="eyebrow">Free on</span>
            <div className="row gap-6">
              <select className="select" value={windowDay} onChange={(event) => setWindowDay(event.target.value)} aria-label="Day">
                <option value="all">Any day</option>
                {data.calendar.days.map((day) => (
                  <option key={day} value={day}>
                    {DAY_LONG[day]}
                  </option>
                ))}
              </select>
              <select className="select" value={fromPeriod} onChange={(event) => setFromPeriod(Number(event.target.value))} aria-label="From period">
                <option value={0}>from</option>
                {data.calendar.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.start}
                  </option>
                ))}
              </select>
              <select className="select" value={toPeriod} onChange={(event) => setToPeriod(Number(event.target.value))} aria-label="To period">
                <option value={0}>to</option>
                {data.calendar.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.end}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="filter-row secondary">
          <div className="row gap-6 wrap">
            {EQUIPMENT.map((feature) => (
              <button
                key={feature}
                className={`chip lg ${features.includes(feature) ? "lime" : "outline"}`}
                onClick={() => toggleFeature(feature)}
                aria-pressed={features.includes(feature)}
              >
                {features.includes(feature) ? <Icon name="check" size={10} strokeWidth={2.6} /> : null}
                {FEATURE_LABELS[feature] ?? feature}
              </button>
            ))}
            <button
              className={`chip lg ${accessible ? "sage" : "outline"}`}
              onClick={() => setAccessible((v) => !v)}
              aria-pressed={accessible}
            >
              <Icon name="user" size={10} /> Step-free access
            </button>
          </div>
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>
            {activeFilters} FILTERS · {matches.length} RESULTS
          </span>
          <button className="btn sm quiet" onClick={reset}>
            <Icon name="refresh" size={12} /> Reset
          </button>
        </div>
      </section>

      {hero ? (
        <section className="discovery-feature">
          <button className="disc-hero" onClick={() => setParams({ room: hero.room.id })}>
            <img src={roomImage(hero.room.id, hero.room.type)} alt={hero.room.name} />
            <span className="disc-hero-top">
              <span className="chip lime lg">
                <Icon name="sparkles" size={11} /> Best match
              </span>
              <span className="annotation">{hero.room.id}</span>
            </span>
            <span className="disc-hero-body">
              <span className="feature-name serif">{hero.room.name}</span>
              <span className="disc-hero-meta">
                {ROOM_TYPE_LABELS[hero.room.type]} · {hero.room.building} · seats {hero.room.capacity}
              </span>
              <span className="disc-hero-why">
                {hero.why
                  .filter((w) => w.ok)
                  .slice(0, 3)
                  .map((w) => w.text)
                  .join(" · ")}
              </span>
            </span>
            <span className="disc-hero-side">
              <span className="disc-free">
                {percent(availabilityWindow(data, hero.room).ratio)}
                <small>free this week</small>
              </span>
              <span className="disc-open">
                Open space <Icon name="arrowUpRight" size={14} />
              </span>
            </span>
          </button>

          <div className="disc-side">
            {supporting.map((match, index) => (
              <button key={match.room.id} className="disc-small" onClick={() => setParams({ room: match.room.id })}>
                <img src={roomImage(match.room.id, match.room.type)} alt={match.room.name} />
                <span className="disc-small-body">
                  <span className="mono" style={{ fontSize: 9, color: "rgba(255,255,255,.6)" }}>
                    {String(index + 2).padStart(2, "0")} · {match.room.id}
                  </span>
                  <span className="disc-small-name">{match.room.name}</span>
                  <span className="disc-small-meta">
                    {match.room.capacity} seats · {match.room.building.split("(")[0]}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="empty card" style={{ padding: 60 }}>
          <Icon name="compass" size={24} />
          <h4>No space satisfies every filter</h4>
          <p>Relax the capacity or equipment requirements — TESSERA will show the closest alternatives.</p>
          <button className="btn sm" onClick={reset}>
            Clear filters
          </button>
        </div>
      )}

      <section>
        <div className="section-head">
          <div>
            <div className="eyebrow">Compatibility</div>
            <h2 style={{ marginTop: 4 }}>Every space, scored against your requirement</h2>
            <p>Compatible rooms are listed first; each row explains exactly which requirement it meets or misses.</p>
          </div>
        </div>

        <div className="space-grid">
          {rest.map((match) => (
            <SpaceCard key={match.room.id} match={match} onOpen={() => setParams({ room: match.room.id })} />
          ))}
        </div>
      </section>

      {room ? (
        <RoomDrawer
          room={room}
          onClose={() => setParams({})}
          onAvailability={() => navigate(`/availability?room=${room.id}`)}
          onRequest={() => navigate(`/bookings?space=${room.id}`)}
        />
      ) : null}

      <p className="mono" style={{ fontSize: 9.5, color: "var(--muted)", letterSpacing: "0.06em" }}>
        AVAILABILITY IS COMPUTED FROM {data.rooms.reduce((sum, r) => sum + r.availability.length, 0)} REAL
        ROOM-PERIOD RECORDS · WEEK OF {MONTHS_SHORT[dateFromISO(activeDate).getMonth()].toUpperCase()}{" "}
        {dateFromISO(activeDate).getFullYear()}
      </p>
    </div>
  );
}

function SpaceCard({ match, onOpen }: { match: RoomMatch; onOpen: () => void }) {
  const { data } = useWorkspace();
  const summary = roomSummary(data, match.room.id);
  const availability = availabilityWindow(data, match.room);
  return (
    <button className={`space-card ${match.fit ? "" : "no-fit"}`} onClick={onOpen}>
      <span className="space-card-media">
        <img src={roomImage(match.room.id, match.room.type)} alt={match.room.name} loading="lazy" />
        <span className="space-card-id">{match.room.id}</span>
        {match.fit ? (
          <span className="chip sage space-card-fit">
            <Icon name="check" size={10} strokeWidth={2.5} /> compatible
          </span>
        ) : (
          <span className="chip coral space-card-fit">
            <Icon name="alert" size={10} /> {match.why.filter((w) => !w.ok).length} misses
          </span>
        )}
      </span>
      <span className="space-card-body">
        <span className="row-between" style={{ alignItems: "flex-start" }}>
          <span style={{ minWidth: 0, textAlign: "left" }}>
            <span className="space-card-name">{match.room.name}</span>
            <span className="space-card-meta">
              {ROOM_TYPE_LABELS[match.room.type]} · {match.room.building}
            </span>
          </span>
          <span className="space-card-cap">{match.room.capacity}</span>
        </span>
        <span className="space-card-why">
          {match.why.slice(0, 2).map((w) => (
            <span key={w.text} className={`why ${w.ok ? "ok" : "no"}`}>
              <Icon name={w.ok ? "check" : "x"} size={9} strokeWidth={2.4} /> {w.text}
            </span>
          ))}
        </span>
        <span className="space-card-foot">
          <span className="meter thin" style={{ flex: 1 }}>
            <i style={{ width: `${Math.max(3, ratio(availability.ratio, 1) * 100)}%`, background: "var(--sage-ink)" }} />
          </span>
          <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
            {percent(availability.ratio)} free · {summary.classes.length} classes
          </span>
        </span>
      </span>
    </button>
  );
}

function RoomDrawer({
  room,
  onClose,
  onAvailability,
  onRequest,
}: {
  room: Room;
  onClose: () => void;
  onAvailability: () => void;
  onRequest: () => void;
}) {
  const { data } = useWorkspace();
  const availability = availabilityWindow(data, room);
  const summary = roomSummary(data, room.id);
  const freeNow = data.calendar.days
    .map((day) => ({
      day,
      slots: data.calendar.periods.filter((p) => roomOccupancy(data, room, day, p.id).state === "free").length,
    }))
    .filter((row) => row.slots > 0);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer wide" role="dialog" aria-label={room.name}>
        <div className="drawer-head">
          <div>
            <div className="row gap-6" style={{ marginBottom: 6 }}>
              <span className="chip outline">{room.id}</span>
              <span className="chip sky">{ROOM_TYPE_LABELS[room.type] ?? room.type}</span>
              {room.accessible ? <span className="chip sage">step-free</span> : <span className="chip coral">no step-free access</span>}
            </div>
            <h2>{room.name}</h2>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              {room.building} · {room.capacity} seats · {room.allowedUses.join(" / ")}
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto" }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="drawer-body">
          <img src={roomImage(room.id, room.type)} alt={room.name} style={{ borderRadius: 16, aspectRatio: "16/9", objectFit: "cover", width: "100%" }} />

          <div className="detail-grid">
            <div className="detail-item">
              <span className="eyebrow">Capacity</span>
              <b>{room.capacity} seats</b>
              <span className="mono">{summary.classes.reduce((sum, s) => Math.max(sum, s.size), 0)} peak class</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Availability</span>
              <b>{percent(availability.ratio)} free</b>
              <span className="mono">{availability.free} of {availability.total} slots</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Scheduled</span>
              <b>{summary.classes.length} sessions</b>
              <span className="mono">{summary.hours} teaching hours</span>
            </div>
            <div className="detail-item">
              <span className="eyebrow">Bookings</span>
              <b>{summary.bookings.length}</b>
              <span className="mono">fest-week requests</span>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Equipment & characteristics
            </div>
            <div className="row gap-6 wrap">
              {room.features.map((feature) => (
                <span key={feature} className="chip outline">
                  {FEATURE_LABELS[feature] ?? feature}
                </span>
              ))}
              {room.accessible ? <span className="chip sage">Step-free route</span> : <span className="chip coral">Stairs only</span>}
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Free windows this week
            </div>
            <div className="free-window-list">
              {freeNow.map((row) => (
                <div key={row.day} className="free-window">
                  <b>{DAY_LONG[row.day].slice(0, 3)}</b>
                  <span className="meter thin">
                    <i style={{ width: `${ratio(row.slots, data.calendar.periods.length) * 100}%`, background: "var(--sage-ink)" }} />
                  </span>
                  <span className="mono">{row.slots} free periods</span>
                </div>
              ))}
            </div>
          </div>

          <div className="callout" style={{ fontSize: 11 }}>
            <Icon name="info" size={13} />
            <span>
              Restrictions come from the dataset: <b>{room.allowedUses.join(", ")}</b>
              {data.unavailability
                .filter((u) => u.room_id === room.id)
                .map((u) => ` · ${u.reason} (${u.day})`)
                .join("")}
              .
            </span>
          </div>
        </div>

        <div className="drawer-foot">
          <button className="btn primary" onClick={onRequest}>
            <Icon name="ticket" size={14} /> Request this space
          </button>
          <button className="btn" onClick={onAvailability}>
            <Icon name="grid" size={14} /> Availability matrix
          </button>
        </div>
      </aside>
    </>
  );
}
