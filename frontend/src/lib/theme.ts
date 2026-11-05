/** Tessera's two dresses.
 *
 *  Black and red is the page; it is also the default — nothing here reads the OS
 *  preference, because the front door is a designed thing and it opens the same
 *  way for everyone. The cream page is opt-in: one click, remembered, and applied
 *  to <html> before first paint (see the head script in index.html) so a reload
 *  never flashes black first.
 *
 *  The choice is one value for the whole product: the landing, the long-form
 *  pages and the workspace behind sign-in all read and write the same key, so
 *  the switch in the nav and the switch in the top bar are the same switch.
 */
import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

/** Which page is wearing the theme — the landing paints the body cream so the
 *  overscroll matches; the workspace sits in its own frame and leaves it alone. */
export type Dress = "landing" | "app";

const KEY = "tessera.theme";

/** Stored choice, or the page's own default. */
export function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: the choice simply does not survive the tab */
  }
}

/** Paint the theme where the browser chrome can see it too: the root element
 *  (overscroll, the address bar's theme-color) and the body wash behind the page. */
export function applyTheme(theme: Theme, dress: Dress = "landing") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const light = theme === "light";
  // The landing is one sheet of paper, so the root and body go cream with it
  // (the head script already did the root, before first paint). The workspace
  // keeps its dark frame in both dresses and lets the tokens do the rest.
  const cream = dress === "landing" && light;
  root.style.backgroundColor = cream ? "#f4f1e8" : "";
  document.body.style.backgroundColor = cream ? "#f4f1e8" : "";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", cream ? "#f4f1e8" : light ? "#111112" : "#0a0a0b");
}

/** Undo the body wash when leaving the landing page — the rest of the app has
 *  its own palette and should not inherit cream. */
export function clearThemePaint() {
  if (typeof document === "undefined") return;
  document.body.style.backgroundColor = "";
}

/* ----------------------------------------------------------------- the store */

let current: Theme = readTheme();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(next: Theme) {
  if (next === current) return;
  current = next;
  saveTheme(next);
  emit();
}

export function toggleTheme() {
  setTheme(current === "light" ? "dark" : "light");
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// A second tab flipping the switch flips this one too.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    const next = readTheme();
    if (next === current) return;
    current = next;
    emit();
  });
}

const getServerTheme = (): Theme => "dark";

/** Read and change the theme from anywhere; no provider needed. This does not
 *  paint anything — the page root does that once, through `useThemePaint`. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  return { theme, light: theme === "light", setTheme, toggle: toggleTheme };
}
