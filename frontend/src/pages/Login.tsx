import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, demoLogin, loginWithPassword, type LoginResult } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { TileMark, TileSpinner } from "../components/TileMark";
import { initials, roomImage, tintFor } from "../lib/persona";
import { DAY_LONG, plural } from "../lib/format";

const DEMO_PASSWORD = "Tessera@2027";

/** One glyph per seat at the table — clearer than derived initials on two admin accounts. */
function identityIcon(role: string, label: string): string {
  if (/second|approver/i.test(label)) return "check";
  if (role === "admin") return "shield";
  if (role === "department_coordinator") return "clipboard";
  if (role === "faculty") return "book";
  if (role === "club") return "ticket";
  return "user";
}

/** Editorial numerals: a figure and its unit, set like a printed ledger. */
function Ledger({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="ledger-item">
      <span className="ledger-value serif">{value}</span>
      <span className="ledger-label">{label}</span>
      {note ? <span className="ledger-note mono">{note}</span> : null}
    </div>
  );
}

export default function Login() {
  const { data, source, user, personas, signIn, signInLocal, status } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/mosaic";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<"password" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = data.summary;
  const teachingDays = data.calendar.days;
  const photo = roomImage("CS-LAB-1", "lab_cs");

  const ledger = useMemo(
    () => [
      { value: String(summary.rooms), label: "spaces", note: "rooms & labs" },
      { value: String(summary.faculty), label: "faculty", note: "teaching hours" },
      { value: String(summary.sessions), label: "sessions", note: "this week" },
      { value: String(summary.exams), label: "exams", note: "scheduled" },
    ],
    [summary.exams, summary.faculty, summary.rooms, summary.sessions],
  );

  const online = source.reachable ?? source.mode === "live";

  const enter = async (login: LoginResult) => {
    await signIn(login);
    navigate(next, { replace: true });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your campus email and password.");
      return;
    }
    setBusy("password");
    try {
      const login = await loginWithPassword(email, password);
      await enter(login);
    } catch (failure) {
      const message =
        failure instanceof ApiError
          ? failure.status === 401
            ? "That email and password do not match an account on this campus."
            : failure.status === 0
              ? "The scheduling API is not reachable from here — use a demo identity below."
              : failure.message
          : "Sign-in failed. Try again, or use a demo identity below.";
      setError(message);
    } finally {
      setBusy(null);
    }
  };

  const demo = async (role: string, personaEmail: string, label: string) => {
    if (busy) return;
    setError(null);
    setBusy(personaEmail);
    try {
      const login = await demoLogin(role, personaEmail);
      await enter(login);
    } catch {
      // No API: step into the labelled snapshot instead of stranding the visitor here.
      signInLocal({ email: personaEmail, name: label, role });
      navigate(next, { replace: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="login">
      {/* ------------------------------------------------------------ editorial */}
      <section className="login-editorial">
        <div className="le-grain" aria-hidden="true" />
        <div className="le-tile-field" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span /><span />
        </div>

        <header className="le-brand">
          <span className="le-mark">
            <TileMark size={30} />
          </span>
          <span className="le-wordmark">
            <b>TESSERA</b>
            <span>Campus scheduling &amp; resource intelligence</span>
          </span>
          <span className="le-source mono">
            <i className={online ? "live" : ""} />
            {online ? "API live" : "Snapshot"}
          </span>
        </header>

        <div className="le-main">
          <p className="eyebrow le-kicker">
            Week 7 · {data.calendar.festWeek?.replace(/^Week \d+ \((.*)\)$/, "$1") ?? "teaching week"} ·{" "}
            {teachingDays.length} teaching days
          </p>

          <h1 className="le-title">
            Every room,
            <br />
            every hour,
            <br />
            <em>accounted for.</em>
          </h1>

          <p className="le-lede">
            One board for the whole campus: who teaches, who studies, which room is free — and what a
            change costs before anyone commits it.
          </p>

          <div className="le-ledger">
            {ledger.map((item) => (
              <div key={item.label} className="ledger-cell">
                <Ledger value={item.value} label={item.label} note={item.note} />
              </div>
            ))}
            <div className="ledger-cell ledger-cell-badge">
              <span className="ledger-badge">
                <Icon name="shield" size={13} strokeWidth={1.8} />
                <span>
                  <b>{data.dashboard.conflicts.hard}</b> hard conflicts
                </span>
              </span>
              <span className="ledger-note mono">
                {plural(data.dashboard.soft.total, "soft penalty", "soft penalties")} logged
              </span>
            </div>
          </div>
        </div>

        <footer className="le-foot">
          <span className="le-folio serif">no. 01</span>
          <div className="le-foot-meta">
            <span className="mono">{data.datasetId}</span>
            <span className="mono">·</span>
            <span className="mono">fictional campus</span>
            <span className="mono">·</span>
            <span className="mono">{DAY_LONG[teachingDays[0]] ?? "MON"}–{DAY_LONG[teachingDays[teachingDays.length - 1]] ?? "FRI"}</span>
          </div>
          <p className="le-foot-line">
            Signed-in roles decide what you can change. Move a session and TESSERA names every person and
            room it touches — before anything is written.
          </p>
        </footer>

        <figure className="le-photo">
          <img src={photo} alt="" />
          <figcaption className="mono">CS-LAB-1 · academic core</figcaption>
        </figure>
      </section>

      {/* ----------------------------------------------------------------- panel */}
      <section className="login-panel" aria-labelledby="signin-title">
        <div className="panel-top">
          <span className="mono panel-hint">
            <Icon name="lock" size={11} /> Secure session
          </span>
          {user ? (
            <Link className="panel-link" to={next}>
              Skip to the board <Icon name="arrowRight" size={12} />
            </Link>
          ) : null}
        </div>

        <div className="panel-inner">
          <p className="eyebrow panel-kicker">Sign in</p>
          <h2 id="signin-title" className="panel-title serif">
            Welcome <em>back.</em>
          </h2>
          <p className="panel-sub">
            Use your campus credentials, or step into a demo identity to see the workspace from that
            role&rsquo;s point of view.
          </p>

          {user && status === "ready" ? (
            <div className="panel-session">
              <span className={`avatar sm tone-${tintFor(user.email)}`}>{initials(user.name)}</span>
              <span className="ps-body">
                <b>{user.name}</b>
                <span className="mono">{user.email}</span>
              </span>
              <button className="btn primary sm" onClick={() => navigate(next, { replace: true })}>
                Continue
              </button>
            </div>
          ) : null}

          <form className="panel-form" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="email">Campus email</label>
              <div className="field-well">
                <Icon name="user" size={14} />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@cit.edu"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(error)}
                  spellCheck={false}
                  autoFocus
                />
              </div>
            </div>

            <div className="field">
              <div className="field-head">
                <label htmlFor="password">Password</label>
                <button
                  type="button"
                  className="field-action"
                  onClick={() => {
                    setEmail((current) => current || "admin@cit.edu");
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                >
                  Use demo credentials
                </button>
              </div>
              <div className="field-well">
                <Icon name="lock" size={14} />
                <input
                  id="password"
                  name="password"
                  type={reveal ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(error)}
                />
                <button
                  type="button"
                  className="field-reveal"
                  onClick={() => setReveal((current) => !current)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  aria-pressed={reveal}
                >
                  <Icon name="eye" size={14} />
                </button>
              </div>
            </div>

            {error ? (
              <p className="panel-error" role="alert">
                <Icon name="alert" size={13} /> {error}
              </p>
            ) : null}

            <button className="panel-submit" type="submit" disabled={busy !== null}>
              {busy === "password" ? (
                <>
                  <TileSpinner size={18} label="Signing in" /> Signing in…
                </>
              ) : (
                <>
                  Enter the workspace <Icon name="arrowRight" size={15} strokeWidth={2.2} />
                </>
              )}
            </button>
          </form>

          <div className="panel-rule">
            <span className="mono">or continue as</span>
          </div>

          <ul className="identity-list">
            {personas.map((persona) => {
              const working = busy === persona.email;
              return (
                <li key={persona.email}>
                  <button
                    className="identity"
                    onClick={() => void demo(persona.role, persona.email, persona.label)}
                    disabled={busy !== null}
                    aria-busy={working}
                  >
                    <span className={`identity-mark tone-${tintFor(persona.email)}`}>
                      <Icon name={identityIcon(persona.role, persona.label)} size={15} strokeWidth={1.7} />
                    </span>
                    <span className="identity-body">
                      <b>{persona.label}</b>
                      <span className="mono">{persona.email}</span>
                    </span>
                    <span className="identity-role mono">{persona.role.replace(/_/g, " ")}</span>
                    {working ? (
                      <TileSpinner size={15} label="Signing in" />
                    ) : (
                      <Icon name="chevronRight" size={14} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="panel-note">
            Demo identities issue a real signed token — no password typing. The password for every demo
            account is <code>{DEMO_PASSWORD}</code>.
          </p>
        </div>

        <footer className="panel-foot">
          <span className="mono">
            <i className={online ? "live" : ""} />
            {online
              ? "Scheduling API online — identities receive a real token"
              : "API offline — identities enter the bundled snapshot"}
          </span>
          <span className="mono">TESSERA · Voltryx</span>
        </footer>
      </section>
    </div>
  );
}
