import { Outlet, useLocation } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "./Toaster";
import { useAppTheme } from "../lib/useLandingTheme";

export function AppShell() {
  const { railCollapsed } = useWorkspace();
  // The workspace wears the same dress as the front door: black and red unless
  // the visitor asked for the cream page. Painted here, once, for every route.
  useAppTheme();
  const location = useLocation();
  const flush = location.pathname.startsWith("/mosaic") || location.pathname.startsWith("/intelligence");

  return (
    <div className={`app-frame ${railCollapsed ? "is-collapsed" : ""}`}>
      <Sidebar />
      <main className="canvas">
        <TopBar />
        <div className={`canvas-body ${flush ? "flush" : ""}`}>
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <Toaster />
    </div>
  );
}
