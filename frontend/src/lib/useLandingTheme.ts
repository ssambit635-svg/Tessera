import { useEffect } from "react";
import { applyTheme, clearThemePaint, useTheme, type Dress } from "./theme";

/** The page root's copy of the hook: reads the shared choice and paints it on
 *  <html> (and, for the landing, the body) for as long as the page is mounted.
 *  Call it once per page; everything else that needs the value uses `useTheme`. */
export function useThemePaint(dress: Dress) {
  const state = useTheme();

  useEffect(() => {
    applyTheme(state.theme, dress);
    return clearThemePaint;
  }, [state.theme, dress]);

  return state;
}

/** The landing (and the long-form pages that share its dress) wear one of two
 *  themes. The choice is read once, painted on <html> straight away, and stored
 *  so the next visit opens the same way. `dark` is the default. */
export function useLandingTheme() {
  return useThemePaint("landing");
}

/** The workspace behind sign-in wears the same two themes as the front door. */
export function useAppTheme() {
  return useThemePaint("app");
}
