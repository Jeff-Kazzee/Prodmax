/**
 * `?` keyboard help overlay (FM-028; AT-035): searchable list of the
 * REAL shortcuts (src/lib/keyboard/bindings.ts) — it never lists a
 * binding that is not wired. Esc closes; focus returns to prior element.
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@island/components/ui/dialog";
import { Input } from "@island/components/ui/input";
import { Kbd } from "@island/components/ui/kbd";
import { SHORTCUTS } from "@/lib/keyboard/bindings";
import { formatChord, isMacPlatform } from "@/lib/keyboard/hotkeys";
import { useShellState } from "./shell-state";

export function ShortcutsHelp() {
  const { helpOpen, setHelpOpen } = useShellState();
  const [query, setQuery] = useState("");
  const isMac = isMacPlatform();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUTS;
    return SHORTCUTS.filter(
      (s) =>
        s.action.toLowerCase().includes(q) ||
        formatChord(s.keys, isMac).toLowerCase().includes(q) ||
        s.keys.toLowerCase().includes(q),
    );
  }, [query, isMac]);

  const sections = useMemo(() => {
    return {
      global: filtered.filter((s) => s.section === "global"),
      navigation: filtered.filter((s) => s.section === "navigation"),
    };
  }, [filtered]);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Every shortcut on this screen is live. Platform:{" "}
            {isMac ? "⌘ = Command" : "Ctrl"}.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Search shortcuts"
          placeholder="Search shortcuts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="max-h-80 overflow-y-auto">
          {sections.global.length > 0 ? (
            <section aria-label="Global shortcuts">
              <p className="px-1 py-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Global
              </p>
              <ul>
                {sections.global.map((s) => (
                  <li key={s.keys} className="flex items-center justify-between gap-4 px-1 py-1.5 text-sm">
                    <span>{s.action}</span>
                    <span className="flex shrink-0 gap-1">
                      {formatChord(s.keys, isMac)
                        .split(" ")
                        .map((step, i) => (
                          <Kbd key={i}>{step}</Kbd>
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {sections.navigation.length > 0 ? (
            <section aria-label="Navigation shortcuts" className="mt-2">
              <p className="px-1 py-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Go to (G then key)
              </p>
              <ul>
                {sections.navigation.map((s) => (
                  <li key={s.keys} className="flex items-center justify-between gap-4 px-1 py-1.5 text-sm">
                    <span>{s.action}</span>
                    <span className="flex shrink-0 gap-1">
                      {formatChord(s.keys, isMac)
                        .split(" ")
                        .map((step, i) => (
                          <Kbd key={i}>{step}</Kbd>
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {filtered.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted-foreground">
              No shortcuts match "{query}".
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
