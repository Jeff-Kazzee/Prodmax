/**
 * Global keyboard layer (§6.1; FM-028): palette keys, `?` help, G-prefix
 * navigation, sidebar toggle, F1 switcher focus. Overlays (palette/help)
 * handle their own Esc; while one is open, only mod-chords stay live here
 * — single-key bindings pause (palette focus is an input anyway).
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GOTO_ROUTES } from "@/lib/keyboard/bindings";
import { useHotkeys } from "@/lib/keyboard/hotkeys";
import type { HotkeyBinding } from "@/lib/keyboard/hotkeys";
import { useShellState } from "./shell-state";

export function KeyboardLayer() {
  const navigate = useNavigate();
  const { openPalette, setHelpOpen, toggleCollapsed, paletteOpen, helpOpen } = useShellState();

  const bindings = useMemo<HotkeyBinding[]>(() => {
    const base: HotkeyBinding[] = [
      {
        keys: "mod+k",
        label: "Open command palette",
        section: "global",
        allowInInput: true,
        handler: () => openPalette("command"),
      },
      {
        keys: "/",
        label: "Search",
        section: "global",
        handler: () => openPalette("search"),
      },
      {
        keys: "mod+shift+f",
        label: "Search everything",
        section: "global",
        allowInInput: true,
        handler: () => openPalette("search"),
      },
      {
        keys: "?",
        label: "Keyboard shortcuts",
        section: "global",
        handler: () => setHelpOpen(true),
      },
      {
        keys: "mod+\\",
        label: "Toggle sidebar",
        section: "global",
        allowInInput: true,
        handler: () => toggleCollapsed(),
      },
      {
        keys: "f1",
        label: "Jump to workspace switcher",
        section: "global",
        handler: () => {
          const el = document.querySelector<HTMLElement>('[data-shell="workspace-switcher"]');
          el?.focus();
        },
      },
    ];
    for (const [suffix, path] of Object.entries(GOTO_ROUTES)) {
      base.push({
        keys: `g ${suffix}`,
        label: `Go to ${path}`,
        section: "navigation",
        handler: () => navigate(path),
      });
    }
    return base;
  }, [navigate, openPalette, setHelpOpen, toggleCollapsed]);

  // While an overlay is open, single-key bindings pause (§3.4: all other
  // shortcuts suppressed except Esc and palette keys). Mod chords stay live.
  useHotkeys(bindings, !paletteOpen && !helpOpen);

  return null;
}
