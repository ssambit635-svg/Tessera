import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { WorkspaceProvider, useWorkspace } from "./lib/workspace";
import { UiProvider } from "./lib/ui";
import { AppShell } from "./components/AppShell";
import { TileMark, TileSpinner } from "./components/TileMark";
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
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

function Boot() {
  return (
    <div className="boot">
      <div className="boot-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: "var(--text-inverse)" }}>
            <TileMark size={44} animated />
          </span>
          <div>
            <div className="boot-wordmark">TESSERA</div>
            <div className="boot-sub">Intelligent campus scheduling</div>
          </div>
        </div>
        <div className="boot-status">
          <TileSpinner size={26} label="Assembling the campus" />
          <span>Assembling the campus — spaces, people and time.</span>
        </div>
        <div className="boot-lines" aria-hidden="true">
          <i style={{ animationDelay: "0ms" }} />
          <i style={{ animationDelay: "120ms" }} />
          <i style={{ animationDelay: "240ms" }} />
          <i style={{ animationDelay: "360ms" }} />
          <i style={{ animationDelay: "480ms" }} />
        </div>
      </div>
    </div>
  );
}

function Gate() {
  const { status } = useWorkspace();
  if (status === "loading") return <Boot />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* The calendar board is the front door: it is the screen the reference describes. */}
        <Route index element={<Navigate to="/mosaic" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="mosaic" element={<Mosaic />} />
        <Route path="ripple" element={<Ripple />} />
        <Route path="discovery" element={<Discovery />} />
        <Route path="availability" element={<Availability />} />
        <Route path="people" element={<People />} />
        <Route path="bookings" element={<Bookings />} />
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

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <UiProvider>
          <Gate />
        </UiProvider>
      </WorkspaceProvider>
    </BrowserRouter>
  );
}
