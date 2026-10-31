import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, demoLogin, loginWithPassword, type LoginResult } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { TileMark, TileSpinner } from "../components/TileMark";
import { initials, tintFor } from "../lib/persona";
import { instituteName, plural } from "../lib/format";

const DEMO_PASSWORD = "Tessera@2027";

function seatGlyph(role: string, label: string): string {
  if (/second|approver/i.test(label)) return "check";
  if (role === "admin") return "shield";
  if (role === "department_coordinator") return "clipboard";
  if (role === "faculty") return "book";
  if (role === "club") return "ticket";
  return "user";
}

/** Short seat names — five of them have to sit on one line. */
function shortSeat(label: string, role: string): string {
  if (/second|approver/i.test(label)) return "Dean";
  if (role === "admin") return "Admin";
  if (role === "department_coordinator") return "Coord.";
  if (role === "faculty") return "Faculty";
  if (role === "club") return "Club";
  return role.replace(/_/g, " ");
}

const CAMPUS_PHOTO = "/media/campus-glass.jpg";

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
      setError("Enter your campus email and password to continue.");
      return;
    }
    setBusy("password");
    try {
      await enter(await loginWithPassword(email, password));
    } catch (failure) {
      const message =
        failure instanceof ApiError
          ? failure.status === 401
            ? "That email and password do not match an account on this campus."
            : failure.status === 0
              ? "The scheduling service is not reachable from here. Step in with a demo identity below."
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
      await enter(await demoLogin(role, personaEmail));
    } catch {
      // No API: step into the labelled snapshot rather than stranding the visitor here.
      signInLocal({ email: personaEmail, name: label, role });
      navigate(next, { replace: true });
    } finally {
      setBusy(null);
    }
  };

  const fillDemo = () => {
    setEmail("admin@cit.edu");
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <div className="signin">
      {/* ------------------------------------------------------------ form side */}
      <div className="sf-side">
        <header className="sf-brand">
          <span className="sf-mark">
            <TileMark size={22} />
          </span>
          <span className="sf-wordmark">
            <b>TESSERA</b>
            <i>campus scheduling</i>
          </span>
        </header>

        <main className="sf-stage">
          <div className="sf-card">
            <h1>Sign in</h1>
            <p className="sf-sub">
              Campus scheduling &amp; resource intelligence for {instituteName(data.institute)}.
            </p>

            {user && status === "ready" ? (
              <div className="sf-session">
                <span className={`avatar sm tone-${tintFor(user.email)}`}>{initials(user.name)}</span>
                <span className="sf-session-copy">
                  <b>{user.name}</b>
                  <span>{user.email}</span>
                </span>
                <button className="sf-continue" onClick={() => navigate(next, { replace: true })}>
                  Continue <Icon name="arrowRight" size={13} />
                </button>
              </div>
            ) : null}

            <form onSubmit={submit} noValidate>
              <label className="sf-field" htmlFor="email">
                <span>Campus email</span>
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
                />
              </label>

              <label className="sf-field" htmlFor="password">
                <span>Password</span>
                <span className="sf-input-wrap">
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
                    className="sf-reveal"
                    onClick={() => setReveal((current) => !current)}
                    aria-label={reveal ? "Hide password" : "Show password"}
                    aria-pressed={reveal}
                    tabIndex={-1}
                  >
                    <Icon name="eye" size={15} strokeWidth={1.6} />
                  </button>
                </span>
              </label>

              <div className="sf-field-row">
                <button type="button" className="sf-link" onClick={fillDemo}>
                  Use demo credentials
                </button>
              </div>

              {error ? (
                <p className="sf-error" role="alert">
                  <Icon name="alert" size={13} /> {error}
                </p>
              ) : null}

              <button className="sf-submit" type="submit" disabled={busy !== null}>
                {busy === "password" ? (
                  <>
                    <TileSpinner size={17} label="Signing in" /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <div className="sf-divider">
              <span>or step in as</span>
            </div>

            <ul className="sf-identities">
              {personas.map((persona) => {
                const working = busy === persona.email;
                return (
                  <li key={persona.email}>
                    <button
                      className="sf-identity"
                      onClick={() => void demo(persona.role, persona.email, persona.label)}
                      disabled={busy !== null}
                      aria-busy={working}
                      aria-label={`Sign in as ${persona.label} (${persona.email})`}
                      title={`${persona.label} · ${persona.email}`}
                    >
                      <span className="sf-identity-mark">
                        {working ? (
                          <TileSpinner size={14} label="Signing in" />
                        ) : (
                          <Icon name={seatGlyph(persona.role, persona.label)} size={14} strokeWidth={1.5} />
                        )}
                      </span>
                      <span className="sf-identity-label">{shortSeat(persona.label, persona.role)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="sf-new">
            No account?{" "}
            <button
              type="button"
              onClick={() => void demo(personas[0]?.role ?? "admin", personas[0]?.email ?? "admin@cit.edu", personas[0]?.label ?? "Admin")}
            >
              Enter the demo workspace
            </button>
          </p>
        </main>

        <footer className="sf-foot">
          <span className="mono">
            <i className={online ? "live" : ""} />
            {data.datasetId || "cit-public-v1"}
          </span>
          <span className="mono">{plural(data.summary.sessions, "session")}</span>
          <span className="mono">{data.dashboard.conflicts.hard} conflicts</span>
          <span className="sf-foot-spacer" />
          <Link className="mono sf-foot-link" to="/mosaic">
            Board <Icon name="arrowUpRight" size={11} />
          </Link>
        </footer>
      </div>

      {/* ---------------------------------------------------------------- photo */}
      <figure className="sf-photo">
        <span className="sf-photo-veil" aria-hidden="true" />
        <img src={CAMPUS_PHOTO} alt="The academic core at golden hour: louvred sandstone and glass facades over a paved court." />
        <figcaption>
          <span className="sf-photo-rule" aria-hidden="true" />
          <span className="sf-photo-copy">
            <b>Academic Core</b>
            <span>
              {data.summary.rooms} rooms and laboratories · {instituteName(data.institute)}
            </span>
          </span>
          <span className="mono sf-photo-coord">
            {data.datasetId || "cit-public-v1"} · 13.0827° N 80.2707° E
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
