import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  eventChord,
  formatChord,
  isTypingTarget,
  normalizeBinding,
  useHotkeys,
} from "@/lib/keyboard/hotkeys";
import { GOTO_ROUTES, SHORTCUTS } from "@/lib/keyboard/bindings";

function keyEvent(init: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
}

describe("chord normalization", () => {
  it("normalizes keyboard events to canonical chords", () => {
    expect(eventChord(keyEvent({ key: "k", metaKey: true }))).toBe("mod+k");
    expect(eventChord(keyEvent({ key: "K", ctrlKey: true, shiftKey: true }))).toBe("mod+shift+k");
    expect(eventChord(keyEvent({ key: "?" }))).toBe("?");
    expect(eventChord(keyEvent({ key: "/" }))).toBe("/");
    expect(eventChord(keyEvent({ key: "Escape" }))).toBe("esc");
    expect(eventChord(keyEvent({ key: "F1" }))).toBe("f1");
  });

  it("normalizes binding spellings (Cmd/Ctrl/⌘ → mod)", () => {
    expect(normalizeBinding("Cmd+K")).toBe("mod+k");
    expect(normalizeBinding("Ctrl+K")).toBe("mod+k");
    expect(normalizeBinding("⌘K")).toBe("mod+k");
    expect(normalizeBinding("Escape")).toBe("esc");
    expect(normalizeBinding("G I")).toBe("g i");
  });

  it("formats chords per platform", () => {
    expect(formatChord("mod+k", true)).toBe("⌘K");
    expect(formatChord("mod+k", false)).toBe("Ctrl K");
    expect(formatChord("g i", true)).toBe("G I");
  });

  it("detects typing targets", () => {
    const input = document.createElement("input");
    const div = document.createElement("div");
    const editable = document.createElement("div");
    // Attribute form — portable across jsdom/happy-dom property reflection.
    editable.setAttribute("contenteditable", "true");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("useHotkeys", () => {
  it("fires single chords and prevents default", () => {
    const handler = vi.fn();
    function Probe() {
      useHotkeys([{ keys: "?", label: "help", handler }]);
      return <input aria-label="probe" />;
    }
    const { getByLabelText } = render(<Probe />);
    const event = keyEvent({ key: "?" });
    fireEvent(window, event);
    expect(handler).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    // Sanity: the probe input renders (harness alive).
    expect(getByLabelText("probe")).toBeInTheDocument();
  });

  it("resolves G-prefix sequences within the window", () => {
    const go = vi.fn();
    function Probe() {
      useHotkeys([{ keys: "g i", label: "go issues", handler: go }]);
      return <div />;
    }
    render(<Probe />);
    fireEvent(window, keyEvent({ key: "g" }));
    expect(go).not.toHaveBeenCalled();
    fireEvent(window, keyEvent({ key: "i" }));
    expect(go).toHaveBeenCalledOnce();
  });

  it("suppresses single-key bindings while typing (AT-035)", () => {
    const handler = vi.fn();
    function Probe() {
      useHotkeys([{ keys: "g i", label: "go", handler }]);
      return <input aria-label="editor" />;
    }
    render(<Probe />);
    const input = document.querySelector("input");
    expect(input).not.toBeNull();
    // Dispatch on the input so it IS the event target; the handler on window
    // must see the typing context and suppress the sequence.
    fireEvent(input ?? window, keyEvent({ key: "g" }));
    fireEvent(input ?? window, keyEvent({ key: "i" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps mod chords live while typing", () => {
    const handler = vi.fn();
    function Probe() {
      useHotkeys([{ keys: "mod+k", label: "palette", allowInInput: true, handler }]);
      return <input aria-label="editor2" />;
    }
    render(<Probe />);
    const input = document.querySelector("input");
    fireEvent(input ?? window, keyEvent({ key: "k", metaKey: true }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not swallow unbound keys (browser defaults survive)", () => {
    const handler = vi.fn();
    function Probe() {
      useHotkeys([{ keys: "mod+k", label: "palette", handler }]);
      return <div />;
    }
    render(<Probe />);
    const arrow = keyEvent({ key: "ArrowUp", metaKey: true });
    fireEvent(window, arrow);
    expect(handler).not.toHaveBeenCalled();
    expect(arrow.defaultPrevented).toBe(false);
  });
});

describe("bindings table (§6.1 — real M2 chords only)", () => {
  it("covers every G-prefix destination from ux-spec §6.1 that M2 owns", () => {
    for (const key of ["h", "i", "m", "p", "c", "d", "n", "b", "a", "l", "s"]) {
      expect(GOTO_ROUTES[key]).toBeDefined();
    }
  });

  it("help table entries are unique and carry sections", () => {
    const keys = SHORTCUTS.map((s) => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SHORTCUTS) {
      expect(["global", "navigation"]).toContain(s.section);
    }
  });
});
