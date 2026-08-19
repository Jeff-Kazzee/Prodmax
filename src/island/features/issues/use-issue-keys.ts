/** Issue-view chords: F / Shift+F / Shift+Alt+F, Cmd+B, Alt+V, Esc, Cmd+A. */
import { useEffect } from "react";
import type { FilterNode } from "@/lib/validation/views";
import { isTypingTarget } from "@/lib/keyboard/hotkeys";
import { useShellState } from "@island/components/shell/shell-state";
import { chipNodes, removeChip } from "./filter-ast";
import { clearSelection, selectAll, type SelectionState } from "./selection";

export function useIssueViewKeys(opts: {
  orderedIds: string[];
  setSelection: (fn: (s: SelectionState) => SelectionState) => void;
  setFilter: (n: FilterNode) => void;
  filter: FilterNode;
  onCycleLayout: () => void;
  onSaveAs: () => void;
}): void {
  const { orderedIds, setSelection, setFilter, filter, onCycleLayout, onSaveAs } = opts;
  const { createOpen, panelOpen } = useShellState();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "b") {
        event.preventDefault();
        onCycleLayout();
        return;
      }
      if (event.altKey && key === "v") {
        event.preventDefault();
        onSaveAs();
        return;
      }
      if (key === "f" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (event.shiftKey && event.altKey) {
          setFilter({ combinator: "and", children: [] });
          return;
        }
        if (event.shiftKey) {
          const chips = chipNodes(filter);
          if (chips.length) setFilter(removeChip(filter, chips.length - 1));
          return;
        }
        const el = document.querySelector<HTMLElement>("[data-filter-add]");
        el?.focus();
        el?.click();
        return;
      }
      if (key === "escape") {
        if (createOpen || panelOpen) return;
        setSelection(() => clearSelection());
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "a") {
        event.preventDefault();
        setSelection(() => selectAll(orderedIds));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderedIds, setSelection, setFilter, filter, onCycleLayout, onSaveAs, createOpen, panelOpen]);
}
