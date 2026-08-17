/**
 * Shell UI state (SB-06/SB-09 persistence, palette + help surfaces).
 * Kept in one context so the keyboard layer, topbar, sidebar and palette
 * share a single source of truth.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

export type PaletteMode = "command" | "search";

const COLLAPSED_KEY = "pmx-sidebar-collapsed";
const WIDTH_KEY = "pmx-sidebar-w";

export const SIDEBAR_MIN_W = 200;
export const SIDEBAR_MAX_W = 320;
export const SIDEBAR_DEFAULT_W = 240;

interface ShellStateValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;
  /** Tablet overlay drawer (768–1023, §3.6). */
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  paletteOpen: boolean;
  paletteMode: PaletteMode;
  openPalette: (mode?: PaletteMode) => void;
  closePalette: () => void;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
}

const ShellStateContext = createContext<ShellStateValue | null>(null);

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  return v === null ? fallback : v === "1";
}

function readWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_W;
  const v = Number(window.localStorage.getItem(WIDTH_KEY));
  if (!Number.isFinite(v)) return SIDEBAR_DEFAULT_W;
  return Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, v));
}

export function ShellStateProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(() => readBool(COLLAPSED_KEY, false));
  const [sidebarWidth, setSidebarWidthState] = useState(readWidth);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [helpOpen, setHelpOpen] = useState(false);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      // storage disabled — session-only
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  const setSidebarWidth = useCallback((w: number) => {
    const clamped = Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, w));
    setSidebarWidthState(clamped);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      // storage disabled — session-only
    }
  }, []);

  const openPalette = useCallback((mode: PaletteMode = "command") => {
    setPaletteMode(mode);
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Close the drawer when the viewport grows past tablet width.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const value = useMemo<ShellStateValue>(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed,
      sidebarWidth,
      setSidebarWidth,
      drawerOpen,
      setDrawerOpen,
      paletteOpen,
      paletteMode,
      openPalette,
      closePalette,
      helpOpen,
      setHelpOpen,
    }),
    [
      collapsed,
      setCollapsed,
      toggleCollapsed,
      sidebarWidth,
      setSidebarWidth,
      drawerOpen,
      paletteOpen,
      paletteMode,
      openPalette,
      closePalette,
      helpOpen,
    ],
  );

  return <ShellStateContext.Provider value={value}>{children}</ShellStateContext.Provider>;
}

export function useShellState(): ShellStateValue {
  const ctx = useContext(ShellStateContext);
  if (!ctx) throw new Error("useShellState must be used within ShellStateProvider");
  return ctx;
}
