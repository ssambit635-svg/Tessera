import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { buildings, roomSummary, availabilityWindow } from "../lib/derive";
import { percent, plural } from "../lib/format";
import { PHOTO_NOTE, ROOM_TYPE_LABELS, roomImage, roomImageAlt } from "../lib/persona";

export default function Locations() {
  const { data } = useWorkspace();
  const navigate = useNavigate();
  const list = buildings(data);

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Management</div>
          <h2 className="serif" style={{ fontSize: 34, marginTop: 5 }}>
            Locations.
          </h2>
          <p>{plural(list.length, "building")} · {plural(data.rooms.length, "space")}. Accessibility notes come straight from the dataset.</p>
        </div>
      </div>

      <div className="location-grid">
        {list.map((building, index) => {
          const hero = building.rooms[0];
          return (
            <article key={building.name} className="location-card">
              <div className="location-media">
                <img src={roomImage(hero.id, hero.type)} alt={roomImageAlt(hero.name)} loading="lazy" />
                <span className="photo-note">{PHOTO_NOTE}</span>
                <span className="annotation">{String(index + 1).padStart(2, "0")} · {building.rooms.length} spaces</span>
              </div>
              <div className="location-body">
                <div className="row-between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <h3>{building.name}</h3>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                      {building.capacity} seats · {building.sessions} sessions this week
                    </span>
                  </div>
                  <span className={`chip ${building.accessible === building.rooms.length ? "sage" : "sand"}`}>
                    <Icon name="user" size={10} /> {building.accessible}/{building.rooms.length} step-free
                  </span>
                </div>

                <div className="location-rooms">
                  {building.rooms.map((room) => {
                    const stats = availabilityWindow(data, room);
                    const summary = roomSummary(data, room.id);
                    return (
                      <button
                        key={room.id}
                        className="location-room"
                        onClick={() => navigate(`/discovery?room=${room.id}`)}
                      >
                        <span style={{ minWidth: 0 }}>
                          <b>{room.name}</b>
                          <span className="mono">
                            {room.id} · {ROOM_TYPE_LABELS[room.type] ?? room.type} · {room.capacity}
                          </span>
                        </span>
                        <span className="location-metrics">
                          <span className="mono">{summary.classes.length} cls</span>
                          <span className="mono" style={{ color: "var(--sage-ink)" }}>{percent(stats.ratio)} free</span>
                          {!room.accessible ? <span className="chip coral">stairs</span> : null}
                        </span>
                        <Icon name="chevronRight" size={12} style={{ color: "var(--muted)" }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="callout" style={{ fontSize: 11.5 }}>
        <Icon name="info" size={14} />
        <span>
          Building names and accessibility notes are read from the shared dataset. TESSERA never invents a floor
          plan — “no lift” is a real constraint that changes which room is compatible.
        </span>
      </div>
    </div>
  );
}
