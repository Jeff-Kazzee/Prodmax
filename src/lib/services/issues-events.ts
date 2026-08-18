/**
 * Single mutation choke-point per issue write (T-002).
 * T-016 will emit SSE from here; until then this is a documented no-op.
 */
export type IssueMutationKind = "created" | "updated" | "deleted" | "moved";

export interface IssueMutation {
  kind: IssueMutationKind;
  workspaceId: string;
  issueId: string;
  actorId: string;
  patch?: Record<string, unknown>;
}

const listeners: Array<(event: IssueMutation) => void> = [];

/** Test hook; production bus will replace this in T-016. */
export function onIssueMutation(listener: (event: IssueMutation) => void): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function recordIssueMutation(event: IssueMutation): void {
  for (const listener of listeners) listener(event);
}
