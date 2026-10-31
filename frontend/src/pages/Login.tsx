import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, demoLogin, loginWithPassword, type LoginResult } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import { Icon } from "../components/Icon";
import { TileMark, TileSpinner } from "../components/TileMark";
import { initials, tintFor } from "../lib/persona";

const DEMO_PASSWORD = "Tessera@2027";

const CAMPUS_PHOTO = "/media/campus-tower.jpg";

export default function Login() {
  const { user, personas, signIn, signInLocal, status } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/mosaic";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<"password" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                    <TileSpinner size={17} label="Signing in" /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

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
