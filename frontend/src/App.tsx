import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { WorkspaceProvider, useWorkspace } from "./lib/workspace";
import { UiProvider } from "./lib/ui";
import { AppShell } from "./components/AppShell";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import { Preloader } from "./components/Preloader";
import Overview from "./pages/Overview";
import Mosaic from "./pages/Mosaic";
import Ripple from "./pages/Ripple";
import Discovery from "./pages/Discovery";
import Availability from "./pages/Availability";
import People from "./pages/People";
import Bookings from "./pages/Bookings";
import Intelligence from "./pages/Intelligence";
import Reports from "./pages/Reports";
import Departments from "./pages/Departments";
import Groups from "./pages/Groups";
import Locations from "./pages/Locations";
import Approvals from "./pages/Approvals";
import Exams from "./pages/Exams";
import Operations from "./pages/Operations";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

/** The shell is only reachable with a session; signed-out visitors land on the spread. */
function RequireAuth() {
  const { authState } = useWorkspace();
  const location = useLocation();
  if (authState === "signed-out") {
    // The public front door answers first; it carries the sign-in button and the pitch.
    const next = `${location.pathname}${location.search}`;
    const target = location.pathname === "/" ? "/landing" : `/login?next=${encodeURIComponent(next)}`;
    return <Navigate to={target} replace />;
  }
  return <AppShell />;
}

function Gate() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="landing" element={<Landing />} />
      <Route element={<RequireAuth />}>
        {/* The calendar board is the front door: it is the screen the reference describes. */}
        <Route index element={<Navigate to="/mosaic" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="mosaic" element={<Mosaic />} />
        <Route path="ripple" element={<Ripple />} />
        <Route path="discovery" element={<Discovery />} />
        <Route path="availability" element={<Availability />} />
        <Route path="people" element={<People />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="exams" element={<Exams />} />
        <Route path="operations" element={<Operations />} />
        <Route path="intelligence" element={<Intelligence />} />
        <Route path="reports" element={<Reports />} />
        <Route path="departments" element={<Departments />} />
        <Route path="groups" element={<Groups />} />
        <Route path="locations" element={<Locations />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

const INTRO_HOLD_MS = 1000;
const CURTAIN_MS = 820;

/**
 * The brand beat in front of everything: the curtain holds for one beat (or until the
 * workspace is ready, whichever is longer), then lifts and uncovers the page from below.
 * Nothing renders under a loading curtain, so no route can bounce before auth is known.
 */
function Intro() {
  const { status } = useWorkspace();
  const ready = status !== "loading";
  const [held, setHeld] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setHeld(true);
      setGone(true);
      return;
    }
    const timer = window.setTimeout(() => setHeld(true), INTRO_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  /* Derived from state that is already committed: the page renders one commit before the
     curtain starts to lift, so its uncover animation is never swallowed. */
  const lifted = ready && held;

  useEffect(() => {
    if (!lifted) return;
    const timer = window.setTimeout(() => setGone(true), CURTAIN_MS);
    return () => window.clearTimeout(timer);
  }, [lifted]);

  return (
    <>
      {ready ? (
        <div className={`app-reveal ${lifted ? "is-open" : ""}`}>
          <Gate />
        </div>
      ) : null}
      {gone ? null : <Preloader state={lifted ? "leaving" : "loading"} ready={ready} />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <UiProvider>
          <Intro />
        </UiProvider>
      </WorkspaceProvider>
    </BrowserRouter>
  );
}
