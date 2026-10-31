import { Outlet, useLocation } from "react-router-dom";
import { useWorkspace } from "../lib/workspace";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "./Toaster";

export function AppShell() {
  const { railCollapsed } = useWorkspace();
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
