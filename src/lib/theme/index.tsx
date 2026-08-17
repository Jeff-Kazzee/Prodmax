/**
 * Theme + density system (design-system §9, §4.2; FM-085, AT-110).
 * Dark default; light/dark/system via next-themes; density via
 * data-density attribute on <html>. Both persisted in localStorage
 * (server-side preferences land with a later module — the users PATCH
 * API currently accepts only name/avatarSeed).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import "@/styles/shell.css";

export type Density = "comfortable" | "compact";

const DENSITY_KEY = "pmx-density";

interface DensityContextValue {
  density: Density;
  setDensity: (d: Density) => void;
  toggleDensity: () => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

function readStoredDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  return window.localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>(readStoredDensity);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try {
      window.localStorage.setItem(DENSITY_KEY, d);
    } catch {
      // Private mode / storage disabled — toggle stays session-only.
    }
  }, []);

  const toggleDensity = useCallback(() => {
    setDensity(density === "comfortable" ? "compact" : "comfortable");
  }, [density, setDensity]);

  const value = useMemo(
    () => ({ density, setDensity, toggleDensity }),
    [density, setDensity, toggleDensity],
  );

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

/** Mount once at the island root: next-themes (dark default) + density. */
export function PmxThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="pmx-theme"
      disableTransitionOnChange
    >
      <DensityProvider>{children}</DensityProvider>
    </NextThemesProvider>
  );
}

export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error("useDensity must be used within PmxThemeProvider");
  return ctx;
}

const THEME_CYCLE = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_CYCLE)[number];

export const NEXT_THEME_LABEL: Record<ThemeMode, string> = {
  light: "light",
  dark: "dark",
  system: "system",
};

/** Cycle light → dark → system (SB-17); returns the next mode. */
export function nextTheme(current: string | undefined): ThemeMode {
  const idx = THEME_CYCLE.indexOf((current ?? "dark") as ThemeMode);
  return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length] ?? "dark";
}

/** SR name per design-system §10.6: "Theme: dark. Activate to switch to light". */
export function themeToggleLabel(current: string | undefined): string {
  const cur = NEXT_THEME_LABEL[(current ?? "dark") as ThemeMode] ?? "dark";
  return `Theme: ${cur}. Activate to switch to ${NEXT_THEME_LABEL[nextTheme(current)]}`;
}

/** Re-export so shell components need one import site for theming. */
export { useTheme };
