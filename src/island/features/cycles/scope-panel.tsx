/**
 * CY-03/CY-04 scoping. Add and remove go through POST /api/cycles/:id/scope,
 * which is one logical operation and returns the resulting counts.
 *
 * The counts rendered here come from that response, never from the length of
 * the on-screen list: the list is one page of issues, and the server's scope
 * count is the whole cycle.
 *
 * Planning drag (CY-03) is not here. Drop targets live inside the issue view
 * engine, which this ticket does not own, so scoping is buttons plus undo
 * toasts. See T-030.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import { StateDot } from "@/components/issues/state-dot";
import type { IssueListItem, LookupMaps } from "@island/features/issues/types";
import type { CycleCounts, CycleDto } from "./types";

function IssueLine({ issue, lookup }: { issue: IssueListItem; lookup: LookupMaps }) {
  const state = lookup.states[issue.stateId];
  return (
    <>
      {state ? <StateDot name={state.name} color={state.color} /> : null}
      <span className="font-mono text-xs text-muted-foreground">{issue.identifier}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
      {issue.estimate !== null ? (
        <span className="font-mono text-xs text-muted-foreground">{issue.estimate}</span>
      ) : null}
    </>
  );
}

export function ScopePanel({
  cycle,
  scoped,
  backlog,
  lookup,
  onScope,
}: {
  cycle: CycleDto;
  scoped: IssueListItem[];
  backlog: IssueListItem[];
  lookup: LookupMaps;
  onScope: (body: { add?: string[]; remove?: string[] }) => Promise<CycleCounts>;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const frozen = cycle.status === "completed";

  const q = query.trim().toLowerCase();
  const candidates = backlog
    .filter(
      (i) =>
        q.length === 0 ||
        i.identifier.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q),
    )
    .slice(0, 25);

  /**
   * `undo` is optional, and the undo of an undo does not get one. A toast
   * whose Undo button is wired to a no-op is a placeholder control, which
   * AGENTS.md bans, and the user can always press the row button again.
   *
   * The catch is not decoration either. `onScope` toasts and rethrows so the
   * caller can stop, and every call site here is a click handler, so without
   * this a failed scope escapes as an unhandled rejection.
   */
  const run = async (
    body: { add?: string[]; remove?: string[] },
    label: string,
    undo?: () => void,
  ) => {
    setBusy(true);
    try {
      await onScope(body);
      toast.success(label, {
        duration: 4500,
        ...(undo ? { action: { label: "Undo", onClick: undo } } : {}),
      });
    } catch {
      // onScope already surfaced the server's message.
    } finally {
      setBusy(false);
    }
  };

  const add = (issue: IssueListItem) =>
    run({ add: [issue.id] }, `${issue.identifier} scoped`, () => {
      void run({ remove: [issue.id] }, `${issue.identifier} removed`);
    });

  const remove = (issue: IssueListItem) =>
    run({ remove: [issue.id] }, `${issue.identifier} removed`, () => {
      void run({ add: [issue.id] }, `${issue.identifier} scoped`);
    });

  return (
    <section aria-label="Cycle scope" className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          Scoped
          <span className="font-mono text-xs normal-case" data-testid="cy-scope-stat">
            {cycle.stats.scope.issues} issues · {cycle.stats.scope.points} pts
          </span>
        </h2>
        {scoped.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nothing scoped yet. Add from the backlog.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {scoped.map((issue) => (
              <li key={issue.id} className="flex items-center gap-2 border-b px-1 py-1.5 last:border-b-0">
                <IssueLine issue={issue} lookup={lookup} />
                {frozen ? null : (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Remove ${issue.identifier} from cycle`}
                    onClick={() => void remove(issue)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {frozen ? null : (
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Backlog
          </h2>
          <Input
            aria-label="Search backlog"
            placeholder="Search loaded issues"
            className="my-2 h-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {candidates.length === 0 ? (
            // Deliberately not "no unscoped issues on this team". This list is
            // one page of the team's open issues, filtered here, so emptiness
            // is a fact about what was loaded and nothing more.
            <p className="text-sm text-muted-foreground">
              {query.length > 0
                ? "No match among the loaded issues."
                : "No unscoped issues among the ones loaded."}
            </p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {candidates.map((issue) => (
                <li key={issue.id} className="flex items-center gap-2 border-b px-1 py-1.5 last:border-b-0">
                  <IssueLine issue={issue} lookup={lookup} />
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    aria-label={`Add ${issue.identifier} to cycle`}
                    onClick={() => void add(issue)}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
