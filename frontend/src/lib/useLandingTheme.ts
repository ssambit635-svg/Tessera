import { useCallback, useEffect, useState } from "react";
import { applyTheme, clearThemePaint, readTheme, saveTheme, type Theme } from "./theme";

/** The landing (and the long-form pages that share its dress) wear one of two
 *  themes. The choice is read once, painted on <html> straight away, and stored
 *  so the next visit opens the same way. `dark` is the default. */
export function useLandingTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    return clearThemePaint;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    saveTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === "light" ? "dark" : "light";
      saveTheme(next);
      return next;
    });
  }, []);

  return { theme, light: theme === "light", setTheme, toggle };
}
