/**
 * Create-issue types and a small in-process list-reload bus.
 * Openers live on ShellState so C/V, topbar, and the modal share one overlay.
 */
export interface CreatePrefill {
  teamId?: string;
  teamKey?: string;
  title?: string;
  priority?: number;
  stateId?: string;
  parentId?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onIssuesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyIssuesChanged(): void {
  for (const listener of listeners) listener();
}
