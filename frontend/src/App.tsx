import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { WorkspaceProvider, useWorkspace } from "./lib/workspace";
import { UiProvider } from "./lib/ui";
import { AppShell } from "./components/AppShell";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import LedgerPage from "./pages/site/LedgerPage";
import NumbersPage from "./pages/site/NumbersPage";
import SeatingPage from "./pages/site/SeatingPage";
import SpacesPage from "./pages/site/SpacesPage";
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
      {/* public long-form pages: readable without a session, linked from the front door */}
      <Route path="ledger" element={<LedgerPage />} />
      <Route path="seating" element={<SeatingPage />} />
      <Route path="spaces" element={<SpacesPage />} />
        <Route path="numbers" element={<NumbersPage />} />
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

const REVEAL_MS = 1050;

/** The assembly and workspace load together; neither can reveal the page prematurely. */
function Intro() {
  const { status } = useWorkspace();
  const ready = status !== "loading";
  const [reducedMotion] = useState(() => {
    let savedPreference = false;
    try {
      savedPreference = window.localStorage.getItem("tessera.motion") === "reduced";
    } catch {
      // Storage can be unavailable in private browsing; the system preference still applies.
    }
    return savedPreference || Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  });
  const [complete, setComplete] = useState(reducedMotion);
  const [gone, setGone] = useState(false);
  const finishIntro = useCallback(() => setComplete(true), []);
  const open = ready && complete;

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setGone(true), reducedMotion ? 0 : REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [open, reducedMotion]);

  return (
    <>
      {ready ? (
        <div className={`app-reveal ${open ? "is-open" : ""} ${reducedMotion ? "is-reduced" : ""}`}>
          <Gate />
        </div>
      ) : null}
      {gone ? null : (
        <Preloader state={open ? "leaving" : "loading"} ready={ready} complete={complete}
          reducedMotion={reducedMotion} onComplete={finishIntro} />
      )}
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
