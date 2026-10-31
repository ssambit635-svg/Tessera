import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { isoDate } from "./format";

interface UiState {
  activeDate: string;
  setActiveDate: (date: Date) => void;
  selectedSession: string | null;
  openSession: (id: string | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  /** A face of the same change, shown on the Ripple page. */
  rippleFocus: string | null;
  setRippleFocus: (id: string | null) => void;
}

const UiContext = createContext<UiState | null>(null);

/** The displayed teaching week. Anchored to today so the app never looks stale —
 * if today is a weekend, we open on the next teaching day instead of an empty board. */
function teachingAnchor(today: Date): Date {
  const day = today.getDay();
  if (day === 6) return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
  if (day === 0) return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return today;
}

const anchor = teachingAnchor(new Date());

export function UiProvider({ children }: { children: ReactNode }) {
  const [activeDate, setActiveDateState] = useState<string>(() => isoDate(anchor));
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [rippleFocus, setRippleFocus] = useState<string | null>(null);

  const setActiveDate = useCallback((date: Date) => setActiveDateState(isoDate(date)), []);

  const value = useMemo<UiState>(
    () => ({
      activeDate,
      setActiveDate,
      selectedSession,
      openSession: setSelectedSession,
      paletteOpen,
      setPaletteOpen,
      mobileNavOpen,
      setMobileNavOpen,
      rippleFocus,
      setRippleFocus,
    }),
    [activeDate, setActiveDate, selectedSession, paletteOpen, mobileNavOpen, rippleFocus],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiState {
  const context = useContext(UiContext);
  if (!context) throw new Error("useUi must be used inside UiProvider");
  return context;
}

export function dateFromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
