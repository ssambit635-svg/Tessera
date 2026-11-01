import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, demoLogin, loginWithPassword, type LoginResult } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { TileMark, TileSpinner } from "../components/TileMark";
import { initials, tintFor } from "../lib/persona";

const DEMO_PASSWORD = "Tessera@2027";

const CAMPUS_PHOTO = "/media/campus-tower.jpg";

/** The glyph each seat gets — the role's job, not a generic avatar. */
function seatGlyph(role: string, label: string): string {
  if (/second|approver/i.test(label)) return "check";
  if (role === "admin") return "shield";
  if (role === "department_coordinator") return "clipboard";
  if (role === "faculty") return "book";
  if (role === "club") return "ticket";
  return "user";
}

/** Five seats have to sit on one row, so the labels are short on purpose. */
function shortSeat(label: string, role: string): string {
  if (/second|approver/i.test(label)) return "Dean";
  if (role === "admin") return "Admin";
  if (role === "department_coordinator") return "Coord.";
  if (role === "faculty") return "Faculty";
  if (role === "club") return "Club";
  return role.replace(/_/g, " ");
}

/** Every failure gets a sentence a person can act on - never "Request failed (500)". */
function describeFailure(failure: unknown): string {
  if (failure instanceof ApiError) {
    if (failure.status === 401) return "That email and password do not match an account on this campus.";
    if (failure.status === 0) {
      return "The scheduling API did not wake up in time. It sleeps on the free tier and can take a minute on the first visit — try once more, or step in with a demo identity (offline preview).";
    }
    if (failure.status >= 500) {
      return "Sign-in failed: the scheduling API answered with an error — it is probably still starting up. Wait a second and try again, or step in with a demo identity (offline preview).";
    }
    if (failure.status === 422) return "That does not look like a campus email address.";
    return failure.message;
  }
  return "Sign-in failed. Check your connection, then try again or use a demo identity below.";
}

export default function Login() {
  const { user, personas, signIn, signInLocal, status } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/mosaic";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<"password" | string | null>(null);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* A free-tier instance can take most of a minute to wake. After two seconds of waiting the
     button admits what is happening instead of spinning silently. */
  useEffect(() => {
    if (!busy) {
      setWaking(false);
      return;
    }
    const timer = window.setTimeout(() => setWaking(true), 2000);
    return () => window.clearTimeout(timer);
  }, [busy]);

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
      const message = describeFailure(failure);
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
            <TileMark size={25} accent={false} />
          </span>
          <span className="sf-wordmark">
            <b>TESSERA</b>
            <i>campus scheduling</i>
          </span>
        </header>

        <main className="sf-stage">
          <div className="sf-card">
            <h1>Sign in</h1>
            <p className="sf-sub">Please enter your details</p>

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
                    <TileSpinner size={17} label="Signing in" />
                    {waking ? "Waking the solver…" : "Signing in…"}
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            {waking && busy ? (
              <p className="sf-hint" role="status">
                Free-tier API is starting up. This can take up to a minute on the first visit.
              </p>
            ) : null}

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
                          <TileSpinner size={15} label="Signing in" />
                        ) : (
                          <Icon name={seatGlyph(persona.role, persona.label)} size={17} strokeWidth={1.6} />
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
            Are you new?{" "}
            <button
              type="button"
              onClick={() => void demo(personas[0]?.role ?? "admin", personas[0]?.email ?? "admin@cit.edu", personas[0]?.label ?? "Admin")}
            >
              Open the demo workspace
            </button>
          </p>
        </main>

      </div>

      {/* ---------------------------------------------------------------- photo */}
      <figure className="sf-photo">
        <span className="sf-photo-veil" aria-hidden="true" />
        <img
          src={CAMPUS_PHOTO}
          alt="The academic block at golden hour: sandstone louvre fins and recessed glass balconies against a pale sky."
        />
      </figure>
    </div>
  );
}
