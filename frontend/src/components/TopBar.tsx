import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { useUi } from "../lib/ui";
import { EXTRA_ROUTES, findNav } from "../lib/nav";
import { Icon } from "./Icon";
import { initials, tintFor } from "../lib/persona";

interface Notice {
  id: string;
  tone: "danger" | "warning" | "info" | "ai";
  title: string;
  detail: string;
  to: string;
}

function useNotices(): Notice[] {
  const { data, pending } = useWorkspace();
  if (!data) return [];
  const notices: Notice[] = [];

  data.bookings.bookings
    .filter((b) => b.decision.status === "rejected")
    .forEach((b) =>
      notices.push({
        id: `reject-${b.request_id}`,
        tone: "danger",
        title: `${b.request_id} cannot be honoured`,
        detail: b.decision.reason ?? `${b.title} — request rejected by the priority rules`,
        to: "/bookings",
      }),
    );

  data.bookings.bookings
    .filter((b) => b.decision.status === "alternative_offered")
    .forEach((b) =>
      notices.push({
        id: `alt-${b.request_id}`,
        tone: "warning",
        title: `${b.request_id} needs a decision`,
        detail: `${b.title} — an alternative slot was offered`,
        to: "/bookings",
      }),
    );

  data.dashboard.risks.forEach((risk, i) =>
    notices.push({
      id: `risk-${i}`,
      tone: "info",
      title: "Scheduling notice",
      detail: risk,
      to: "/reports",
    }),
  );

  if (pending && pending.outcome === "open") {
    notices.push({
      id: "pending-change",
      tone: "ai",
      title: `Unreviewed move · ${pending.local.session.courseId}`,
      detail: `${pending.local.from.day} P${pending.local.from.startPeriod} → ${pending.target.day} P${pending.target.startPeriod}`,
      to: "/ripple",
    });
  }

  return notices;
}

export function TopBar() {
  const { data, source, user, personas, switchPersona, reload, signOut } = useWorkspace();
  const { setPaletteOpen, setMobileNavOpen } = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const notices = useNotices();
  const wrapRef = useRef<HTMLDivElement>(null);

  const navItem = findNav(location.pathname);
  const extra = EXTRA_ROUTES[location.pathname];
  const title = navItem?.title ?? extra?.title ?? "Overview";
  const crumb = navItem?.crumb ?? extra?.crumb ?? "Campus";

  const displayUser = user ?? { email: "admin@cit.edu", name: "Campus operations", role: "admin" };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setNotifOpen(false);
        setProfileOpen(false);
        setSourceOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="topbar" ref={wrapRef}>
      <button className="icon-btn hamburger" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
        <Icon name="menu" size={16} />
      </button>

      <div className="topbar-title">
        <div className="breadcrumb">
          <span>Campus</span>
          <i>/</i>
          <span>{crumb}</span>
        </div>
        <h1>{title}</h1>
      </div>

      <div className="topbar-actions">
        <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Search TESSERA">
          <Icon name="search" size={14} />
          <span>Search spaces, people, sessions</span>
          <kbd>⌘K</kbd>
        </button>

        <div style={{ position: "relative" }}>
          <button
            className={`conn-badge ${source.mode}`}
            onClick={() => setSourceOpen((v) => !v)}
            aria-expanded={sourceOpen}
            title={source.detail}
          >
            <span className="led" />
            {source.mode === "live" ? "LIVE API" : "SNAPSHOT"}
            <Icon name="chevronDown" size={11} />
          </button>
          {sourceOpen ? (
            <div className="popover menu" style={{ right: 0, top: "calc(100% + 8px)", width: 300 }}>
              <div className="menu-label">Data source</div>
              <div style={{ padding: "4px 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-soft)", lineHeight: 1.5 }}>{source.detail}</span>
                <span className="mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>
                  {source.mode === "live"
                    ? "Numbers come from the scheduling API. Writes are authenticated."
                    : "Read-only snapshot bundled with the UI. No requests are sent."}
                </span>
                <span className="mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>
                  {data?.sessions.length ?? 0} sessions · {data?.rooms.length ?? 0} rooms · dataset{" "}
                  {data?.datasetId ?? "—"}
                </span>
              </div>
              <div className="menu-sep" />
              <button
                onClick={() => {
                  void reload();
                  setSourceOpen(false);
                }}
              >
                <Icon name="refresh" size={13} /> Reload workspace
              </button>
              <button
                onClick={() => {
                  navigate("/settings");
                  setSourceOpen(false);
                }}
              >
                <Icon name="database" size={13} /> Connection settings
              </button>
            </div>
          ) : null}
        </div>

        <div style={{ position: "relative" }}>
          <button
            className="icon-btn"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label={`Notifications, ${notices.length} items`}
            aria-expanded={notifOpen}
          >
            <Icon name="bell" size={16} />
            {notices.length ? <span className="dot-badge">{notices.length}</span> : null}
          </button>
          {notifOpen ? (
            <div className="popover" style={{ right: 0, top: "calc(100% + 8px)", width: 356, padding: 8 }}>
              <div className="row-between" style={{ padding: "6px 8px 10px" }}>
                <b style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 500 }}>Needs attention</b>
                <span className="chip">{notices.length} items</span>
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                {notices.length === 0 ? (
                  <div className="empty" style={{ padding: 26 }}>
                    <Icon name="check" size={20} />
                    <p>Nothing needs a decision right now.</p>
                  </div>
                ) : (
                  notices.map((notice) => (
                    <button
                      key={notice.id}
                      className="palette-item"
                      style={{ alignItems: "flex-start" }}
                      onClick={() => {
                        navigate(notice.to);
                        setNotifOpen(false);
                      }}
                    >
                      <span
                        className={`chip ${notice.tone === "ai" ? "violet" : notice.tone === "danger" ? "coral" : notice.tone === "warning" ? "sand" : "sky"}`}
                        style={{ marginTop: 2 }}
                      >
                        <Icon
                          name={notice.tone === "danger" ? "alert" : notice.tone === "ai" ? "sparkles" : "info"}
                          size={10}
                        />
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span className="pi-title">{notice.title}</span>
                        <span className="pi-sub" style={{ lineHeight: 1.45 }}>
                          {notice.detail}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ position: "relative" }}>
          <button className="profile-chip" onClick={() => setProfileOpen((v) => !v)} aria-expanded={profileOpen}>
            <span className={`avatar tone-${tintFor(displayUser.email)}`} style={{ width: 28, height: 28, borderRadius: 9 }}>
              {initials(displayUser.name)}
            </span>
            <span className="pc-name">
              <b>{displayUser.name.split(" ").slice(0, 2).join(" ")}</b>
              <span>{displayUser.role.replace(/_/g, " ")}</span>
            </span>
            <Icon name="chevronDown" size={12} />
          </button>
          {profileOpen ? (
            <div className="popover menu" style={{ right: 0, top: "calc(100% + 8px)", width: 288 }}>
              <div style={{ padding: "8px 10px 10px", display: "flex", gap: 10, alignItems: "center" }}>
                <span className={`avatar lg tone-${tintFor(displayUser.email)}`}>{initials(displayUser.name)}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <b style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 500 }}>{displayUser.name}</b>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                    {displayUser.email}
                  </span>
                </span>
              </div>
              <div className="menu-sep" />
              <div className="menu-label">View as · demo accounts</div>
              {personas.map((persona) => (
                <button
                  key={persona.email}
                  onClick={() => {
                    void switchPersona(persona.role, persona.email);
                    setProfileOpen(false);
                  }}
                >
                  <Icon name="user" size={13} />
                  <span style={{ flex: 1 }}>{persona.label}</span>
                  {user?.email === persona.email ? <Icon name="check" size={12} /> : null}
                </button>
              ))}
              <div className="menu-sep" />
              <button
                onClick={() => {
                  navigate("/settings");
                  setProfileOpen(false);
                }}
              >
                <Icon name="settings" size={13} /> Preferences
              </button>
              <button
                onClick={() => {
                  navigate("/login");
                  setProfileOpen(false);
                }}
              >
                <Icon name="shield" size={13} /> Switch identity
              </button>
              <div className="menu-sep" />
              <button
                className="menu-signout"
                onClick={() => {
                  signOut();
                  setProfileOpen(false);
                  navigate("/login", { replace: true });
                }}
              >
                <Icon name="arrowLeft" size={13} /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
