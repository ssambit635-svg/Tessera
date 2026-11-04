/** The landing page's two dresses.
 *
 *  Black and red is the page; it is also the default — nothing here reads the OS
 *  preference, because the front door is a designed thing and it opens the same
 *  way for everyone. The cream page is opt-in: one click, remembered, and applied
 *  to <html> before first paint (see the head script in index.html) so a reload
 *  never flashes black first.
 */
export type Theme = "dark" | "light";

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
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.body.style.backgroundColor = theme === "light" ? "#f4f1e8" : "";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f4f1e8" : "#0a0a0b");
}

/** Undo the body wash when leaving the landing page — the rest of the app has
 *  its own palette and should not inherit cream. */
export function clearThemePaint() {
  if (typeof document === "undefined") return;
  document.body.style.backgroundColor = "";
}
