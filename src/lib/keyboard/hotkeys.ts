/**
 * Hotkey manager (ux-spec §6; AT-035).
 * - Normalized chords: "mod+k" (Cmd on mac, Ctrl elsewhere), "?", "esc",
 *   "f1", and space-separated sequences like "g i" (G-prefix nav).
 * - Single-key bindings and sequences are suppressed while typing in
 *   inputs/textareas/contenteditable; mod-chords stay live.
 * - The manager never binds browser-owned chords (Cmd+↑/↓ etc.) —
 *   unbound keys pass through untouched.
 */
import { useEffect, useRef } from "react";

export interface HotkeyBinding {
  /** Normalized chord, e.g. "mod+k", "?", "g i". Case-insensitive. */
  keys: string;
  /** Action label for the `?` help overlay (§6.1 wording). */
  label: string;
  /** Help section: "global" | "navigation". */
  section?: "global" | "navigation";
  /** Fire even when focus is in an input/editor. Default false. */
  allowInInput?: boolean;
  handler: (event: KeyboardEvent) => void;
}

const SEQUENCE_TIMEOUT_MS = 1000;

/** Normalize a KeyboardEvent to a comparable chord string. */
export function eventChord(event: KeyboardEvent): string {
  const raw = event.key.toLowerCase();
  const key = raw === "escape" ? "esc" : raw;
  const mods: string[] = [];
  if (event.ctrlKey || event.metaKey) mods.push("mod");
  if (event.altKey) mods.push("alt");
  // Shift counts as a modifier only alongside other modifiers — a bare
  // shift produces the shifted character itself ("?", "K"), which is the
  // binding's own shape.
  if (event.shiftKey && (event.ctrlKey || event.metaKey || event.altKey)) mods.push("shift");
  return mods.length > 0 ? `${mods.join("+")}+${key}` : key;
}

/** Normalize a binding string ("Cmd+K", "G I", "⌘K") to canonical form. */
export function normalizeBinding(binding: string): string {
  return binding
    .toLowerCase()
    .replace(/⌘\s*/g, "mod+")
    .replace(/cmd|command|ctrl|control/g, "mod")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s+/g, " ")
    .replace(/escape/g, "esc")
    .trim();
}

/** True while the user is composing text (§6: single-key shortcuts off). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.getAttribute("contenteditable") === "true") return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function chordIsSingleKey(chord: string): boolean {
  const first = chord.split(" ")[0] ?? chord;
  return !first.includes("+") && first.length === 1;
}

interface SequenceState {
  prefix: string;
  expiresAt: number;
}

/**
 * Register global hotkeys for the lifetime of the component.
 * Sequences ("g i") resolve within a 1s window; a mismatched key resets.
 */
export function useHotkeys(bindings: HotkeyBinding[], enabled = true): void {
  const ref = useRef(bindings);
  ref.current = bindings;
  const sequence = useRef<SequenceState>({ prefix: "", expiresAt: 0 });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const chord = eventChord(event);
      const current = ref.current;
      const now = Date.now();
      if (sequence.current.prefix && now > sequence.current.expiresAt) {
        sequence.current = { prefix: "", expiresAt: 0 };
      }

      const typing = isTypingTarget(event.target);
      const mod = chord.startsWith("mod+");
      // Mod chords stay live while typing; bare keys/sequences do not.
      const eligible = mod || !typing;
      if (!eligible) return;

      const pending = sequence.current.prefix
        ? `${sequence.current.prefix} ${chord}`
        : chord;
      const exact = current.find((b) => normalizeBinding(b.keys) === pending);
      if (exact && (mod || !typing || exact.allowInInput)) {
        sequence.current = { prefix: "", expiresAt: 0 };
        event.preventDefault();
        exact.handler(event);
        return;
      }

      const partial = current.some(
        (b) => normalizeBinding(b.keys).startsWith(`${pending} `),
      );
      if (partial && chordIsSingleKey(pending)) {
        sequence.current = { prefix: pending, expiresAt: now + SEQUENCE_TIMEOUT_MS };
        event.preventDefault();
        return;
      }

      // No match: let the browser default run (never swallowed blindly).
      sequence.current = { prefix: "", expiresAt: 0 };
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

const MAC_DISPLAY: Record<string, string> = {
  mod: "⌘",
  alt: "Alt",
  shift: "⇧",
  esc: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

const WIN_DISPLAY: Record<string, string> = {
  mod: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  esc: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

/** Format a chord for display: "mod+k" → "⌘K" (mac) / "Ctrl K" (win). */
export function formatChord(binding: string, isMac: boolean): string {
  const display = isMac ? MAC_DISPLAY : WIN_DISPLAY;
  return normalizeBinding(binding)
    .split(" ")
    .map((step) =>
      step
        .split("+")
        .map((part) => display[part] ?? part.toUpperCase())
        .join(isMac ? "" : " "),
    )
    .join(" ");
}

/** Platform helper (exposed for tests). */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

/** Sort helper: sequences after single chords, alphabetical within group. */
export function sortBindings<T extends { keys: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aSeq = a.keys.includes(" ");
    const bSeq = b.keys.includes(" ");
    if (aSeq !== bSeq) return aSeq ? 1 : -1;
    return a.keys.localeCompare(b.keys);
  });
}
