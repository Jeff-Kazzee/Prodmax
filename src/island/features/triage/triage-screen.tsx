/**
 * S-14 triage inbox. Queue is statusCategory=triage. Accept/decline PATCH
 * state; duplicate opens a merge dialog; snooze is local until M8 timers.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import { IssuesEmpty } from "@/components/issues/issues-empty";
import { useSession } from "@island/app/session";
import { toastApiError, toastOk } from "@island/app/toast";
import { addRelation, createComment } from "@island/features/issue-detail/api";
import { useIssuesList } from "@island/features/issues/use-issues";
import { useLookups } from "@island/features/issues/use-lookups";
import type { IssueListItem, StateOption } from "@island/features/issues/types";
import { isTypingTarget } from "@/lib/keyboard/hotkeys";

const TRIAGE_FILTER = {
  combinator: "and" as const,
  children: [{ field: "statusCategory" as const, op: "eq" as const, value: "triage" }],
};

const SNOOZE_KEY = "pmx-triage-snooze";

function loadSnoozed(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(SNOOZE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveSnoozed(map: Record<string, number>): void {
  window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}

function defaultState(states: StateOption[], teamId: string): StateOption | undefined {
  const team = states.filter((s) => s.teamId === teamId);
  return team.find((s) => s.category === "unstarted") ?? team.find((s) => s.category !== "triage");
}

function canceledState(states: StateOption[], teamId: string): StateOption | undefined {
  return states.find((s) => s.teamId === teamId && s.category === "canceled");
}

export function TriageScreen() {
  const session = useSession();
  const wsId = session.activeWorkspace?.id ?? null;
  const { lookup, states, teams } = useLookups(wsId);
  const [params, setParams] = useSearchParams();
  const [cursor, setCursor] = useState(0);
  const [noteFor, setNoteFor] = useState<IssueListItem | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [mergeFor, setMergeFor] = useState<IssueListItem | null>(null);
  const [canonical, setCanonical] = useState("");
  const [requirePriority, setRequirePriority] = useState(true);
  const [snoozed, setSnoozed] = useState<Record<string, number>>(loadSnoozed);
  const teamKey = params.get("team");

  const { items, loading, error, reload, optimisticPatch } = useIssuesList({
    wsId,
    filters: TRIAGE_FILTER,
    sort: "created:desc",
    includeTriage: true,
  });

  const visible = useMemo(() => {
    const now = Date.now();
    return items.filter((i) => {
      const until = snoozed[i.id];
      if (until && until > now) return false;
      if (!teamKey) return true;
      const team = lookup.teams[i.teamId];
      return team?.key === teamKey;
    });
  }, [items, snoozed, teamKey, lookup.teams]);

  const focused = visible[cursor] ?? visible[0];

  const act = useCallback(
    async (issue: IssueListItem, kind: "accept" | "decline") => {
      if (!wsId) return;
      if (kind === "accept" && requirePriority && issue.priority === 0) {
        toastOk("Set a priority first");
        return;
      }
      const next =
        kind === "accept" ? defaultState(states, issue.teamId) : canceledState(states, issue.teamId);
      if (!next) return;
      try {
        await optimisticPatch(issue.id, { stateId: next.id }, { stateId: issue.stateId });
        toastOk(kind === "accept" ? `Accepted ${issue.identifier}` : `Declined ${issue.identifier}`);
        if (kind === "accept") {
          setNoteFor(issue);
          setNoteBody("");
        }
      } catch (err) {
        toastApiError(err);
      }
    },
    [wsId, requirePriority, states, optimisticPatch],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "j") setCursor((c) => Math.min(visible.length - 1, c + 1));
      if (key === "k") setCursor((c) => Math.max(0, c - 1));
      if (!focused) return;
      if (key === "1") void act(focused, "accept");
      if (key === "2") setMergeFor(focused);
      if (key === "3") void act(focused, "decline");
      if (key === "h") {
        const next = { ...snoozed, [focused.id]: Date.now() + 60 * 60 * 1000 };
        setSnoozed(next);
        saveSnoozed(next);
        toastOk(`Snoozed ${focused.identifier}`);
      }
      if (key === "x") {
        void Promise.all(visible.map((i) => act(i, "accept")));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, focused, act, snoozed]);

  const activeTeam = teams.find((t) => t.key === teamKey);
  if (activeTeam && activeTeam.triageEnabled === 0) {
    return (
      <IssuesEmpty
        title="Triage is off for this team"
        explainer="Enable it in Team settings → Triage."
        actionLabel="Team settings"
        onAction={() => {
          window.location.assign(`/settings/teams/${activeTeam.key}`);
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="p-6" role="alert">
        <p>Something broke on our side.</p>
        <Button size="sm" className="mt-2" onClick={reload}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-screen="Triage">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h1 className="text-sm font-medium">Triage</h1>
        <select
          aria-label="Triage team"
          className="h-8 rounded-md border bg-transparent px-1 text-sm"
          value={teamKey ?? ""}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("team", e.target.value);
            else next.delete("team");
            setParams(next, { replace: true });
          }}
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.key}>
              {t.key}
            </option>
          ))}
        </select>
        <span className="font-mono text-xs text-muted-foreground">{visible.length}</span>
        <label className="ml-auto flex items-center gap-1 text-xs">
          <input type="checkbox" checked={requirePriority} onChange={(e) => setRequirePriority(e.target.checked)} />
          require priority
        </label>
      </header>
      {visible.length === 0 && !loading ? (
        <IssuesEmpty title="Triage is empty — nice." explainer="Inbound API, CSV, and webhook issues land here." />
      ) : (
        <ul className="flex-1 overflow-auto p-2">
          {visible.map((issue, i) => (
            <li
              key={issue.id}
              data-identifier={issue.identifier}
              className={`mb-2 rounded-md border p-3 ${focused?.id === issue.id ? "ring-1 ring-ring" : ""}`}
              onClick={() => setCursor(i)}
            >
              <p className="font-mono text-xs text-muted-foreground">{issue.identifier}</p>
              <p className="text-sm font-medium">{issue.title}</p>
              <p className="text-xs text-muted-foreground">source: API</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button size="xs" onClick={() => void act(issue, "accept")}>
                  Accept 1
                </Button>
                <Button size="xs" variant="secondary" onClick={() => setMergeFor(issue)}>
                  Duplicate 2
                </Button>
                <Button size="xs" variant="ghost" onClick={() => void act(issue, "decline")}>
                  Decline 3
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {noteFor ? (
        <form
          className="border-t p-2"
          onSubmit={(e) => {
            e.preventDefault();
            const bodyMd = noteBody.trim();
            if (!wsId || !bodyMd) {
              setNoteFor(null);
              return;
            }
            void createComment(wsId, noteFor.identifier, { bodyMd })
              .then(() => {
                toastOk("Note posted");
                setNoteFor(null);
                setNoteBody("");
              })
              .catch(toastApiError);
          }}
        >
          <Input
            aria-label="Triage note"
            placeholder={`Note on ${noteFor.identifier}`}
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
          />
        </form>
      ) : null}
      {mergeFor ? (
        <div className="border-t p-3" role="dialog" aria-label="Merge duplicate">
          <p className="text-sm">
            Merge {mergeFor.identifier} into a canonical issue.
          </p>
          <div className="mt-2 flex gap-2">
            <Input aria-label="Canonical issue" value={canonical} onChange={(e) => setCanonical(e.target.value)} />
            <Button
              size="sm"
              onClick={() => {
                if (!wsId || !canonical.trim()) return;
                void addRelation(wsId, mergeFor.identifier, {
                  relatedIssueId: canonical.trim(),
                  type: "duplicate",
                })
                  .then(() => act(mergeFor, "decline"))
                  .then(() => {
                    toastOk(`Merged into ${canonical}`);
                    setMergeFor(null);
                    setCanonical("");
                  })
                  .catch(toastApiError);
              }}
            >
              Merge
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMergeFor(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
