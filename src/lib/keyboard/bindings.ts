/**
 * Shell keyboard bindings (ux-spec §6.1) — only chords that are REAL in M2.
 * Later modules extend this table; the `?` help overlay renders it verbatim
 * so help never lists a shortcut that does not work (AT-035).
 */

export interface ShortcutSpec {
  keys: string;
  action: string;
  section: "global" | "navigation";
}

export const SHORTCUTS: readonly ShortcutSpec[] = [
  { keys: "mod+k", action: "Open command palette", section: "global" },
  { keys: "/", action: "Search", section: "global" },
  { keys: "mod+shift+f", action: "Search everything", section: "global" },
  { keys: "?", action: "Keyboard shortcuts", section: "global" },
  { keys: "esc", action: "Close the topmost layer", section: "global" },
  { keys: "mod+\\", action: "Toggle sidebar", section: "global" },
  { keys: "f1", action: "Jump to workspace switcher", section: "global" },
  { keys: "c", action: "New issue", section: "global" },
  { keys: "v", action: "New issue (full editor)", section: "global" },
  { keys: "g h", action: "Go to Home", section: "navigation" },
  { keys: "g i", action: "Go to All issues", section: "navigation" },
  { keys: "g m", action: "Go to My issues", section: "navigation" },
  { keys: "g p", action: "Go to Projects", section: "navigation" },
  { keys: "g c", action: "Go to Current cycle", section: "navigation" },
  { keys: "g d", action: "Go to Docs", section: "navigation" },
  { keys: "g n", action: "Go to Inbox", section: "navigation" },
  { keys: "g b", action: "Go to Triage", section: "navigation" },
  { keys: "g t", action: "Go to Triage", section: "navigation" },
  { keys: "g a", action: "Go to Insights", section: "navigation" },
  { keys: "g l", action: "Go to AI center", section: "navigation" },
  { keys: "g s", action: "Go to Settings", section: "navigation" },
] as const;

/** G-prefix navigation map (ux-spec §6.1). */
export const GOTO_ROUTES: Readonly<Record<string, string>> = {
  h: "/",
  i: "/issues",
  m: "/my-issues",
  p: "/projects",
  c: "/cycle/current",
  d: "/docs",
  n: "/inbox",
  b: "/triage",
  t: "/triage",
  a: "/insights",
  l: "/ai",
  s: "/settings/profile",
} as const;
