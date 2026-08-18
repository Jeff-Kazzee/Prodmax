/**
 * L-04 selection semantics: toggle, shift-range, Cmd/Ctrl+A over loaded ids.
 * Selection is a set of issue ids so it survives pagination and SSE inserts.
 */

export interface SelectionState {
  ids: string[];
  anchorId: string | null;
}

export const EMPTY_SELECTION: SelectionState = { ids: [], anchorId: null };

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function isSelected(state: SelectionState, id: string): boolean {
  return state.ids.includes(id);
}

export function toggleId(state: SelectionState, id: string): SelectionState {
  if (state.ids.includes(id)) {
    const ids = state.ids.filter((x) => x !== id);
    return { ids, anchorId: ids.includes(state.anchorId ?? "") ? state.anchorId : (ids.at(-1) ?? null) };
  }
  return { ids: [...state.ids, id], anchorId: id };
}

/** Shift+click / Shift+X: inclusive range from anchor to `toId` on `orderedIds`. */
export function selectRange(state: SelectionState, orderedIds: string[], toId: string): SelectionState {
  const anchor = state.anchorId ?? toId;
  const a = orderedIds.indexOf(anchor);
  const b = orderedIds.indexOf(toId);
  if (a < 0 || b < 0) return { ids: unique([...state.ids, toId]), anchorId: toId };
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const range = orderedIds.slice(lo, hi + 1);
  return { ids: unique([...state.ids, ...range]), anchorId: anchor };
}

export function selectAll(orderedIds: string[]): SelectionState {
  return { ids: unique(orderedIds), anchorId: orderedIds[0] ?? null };
}

export function clearSelection(): SelectionState {
  return EMPTY_SELECTION;
}

export function pruneSelection(state: SelectionState, knownIds: Set<string>): SelectionState {
  const ids = state.ids.filter((id) => knownIds.has(id));
  const anchorId = state.anchorId && knownIds.has(state.anchorId) ? state.anchorId : (ids.at(-1) ?? null);
  return { ids, anchorId };
}
