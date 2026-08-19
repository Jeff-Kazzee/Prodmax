/**
 * PJ-08 "Add issues". Two real paths, both a single request:
 * attach an existing issue (PATCH projectId) or create one already in the
 * project (POST with projectId, which `createIssueSchema` accepts).
 *
 * This dialog matters more than its size suggests. The issue detail panel
 * still omits its project chip pending these lookups, so until T-030 lands
 * this is the only way in the app to put an issue into a project.
 */
import { useMemo, useState } from "react";
import { Button } from "@island/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@island/components/ui/dialog";
import { Input } from "@island/components/ui/input";
import { apiPost } from "@island/app/api";
import { toastApiError, toastOk } from "@island/app/toast";
import { notifyIssuesChanged } from "@island/features/issue-create/commands";
import { patchIssue } from "@island/features/issues/api";
import { useIssuesList } from "@island/features/issues/use-issues";
import type { IssueListItem, TeamOption } from "@island/features/issues/types";

/** Issues that are not already in this project, matched by identifier or title. */
function candidates(items: IssueListItem[], projectId: string, query: string): IssueListItem[] {
  const q = query.trim().toLowerCase();
  return items
    .filter((i) => i.projectId !== projectId)
    .filter(
      (i) =>
        q.length === 0 ||
        i.identifier.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q),
    )
    .slice(0, 25);
}

export function AddIssuesDialog({
  open,
  onOpenChange,
  wsId,
  projectId,
  teams,
  onAttached,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  projectId: string;
  teams: TeamOption[];
  onAttached: () => void;
}) {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);

  const emptyFilter = useMemo(() => ({ combinator: "and" as const, children: [] }), []);
  const { items } = useIssuesList({ wsId, filters: emptyFilter, sort: "updated:desc" });
  const rows = useMemo(() => candidates(items, projectId, query), [items, projectId, query]);
  const team = teamId || teams[0]?.id || "";

  const attach = async (issue: IssueListItem) => {
    setBusy(true);
    try {
      await patchIssue(wsId, issue.id, { projectId });
      notifyIssuesChanged();
      onAttached();
      toastOk(`${issue.identifier} added to the project`);
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0 || team === "" || busy) return;
    setBusy(true);
    try {
      const res = await apiPost<{ issue: IssueListItem }>(
        `/api/issues?wsId=${encodeURIComponent(wsId)}`,
        { teamId: team, title: trimmed, projectId },
      );
      setTitle("");
      notifyIssuesChanged();
      onAttached();
      toastOk(`${res.issue.identifier} created in the project`);
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add issues</DialogTitle>
          <DialogDescription>
            Attach an issue that already exists, or create one straight into this project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Input
            aria-label="Search issues"
            placeholder="Search by identifier or title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {/*
            There is no issue search endpoint, so this filters the most
            recently updated page on the client. The copy says so rather than
            claiming the issue does not exist. Create below always works.
          */}
          <p className="text-xs text-muted-foreground">
            Searches the most recently updated issues, not the whole workspace.
          </p>
          <ul className="max-h-56 overflow-y-auto rounded-md border">
            {rows.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">
                No match among the recent issues. Create one below instead.
              </li>
            ) : (
              rows.map((issue) => (
                <li key={issue.id} className="flex items-center gap-2 border-b px-2 py-1.5 last:border-b-0">
                  <span className="font-mono text-xs text-muted-foreground">{issue.identifier}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    aria-label={`Add ${issue.identifier} to the project`}
                    onClick={() => void attach(issue)}
                  >
                    Add
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">Or create a new one</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Team</span>
              <select
                aria-label="Team"
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
                value={team}
                onChange={(e) => setTeamId(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.key}
                  </option>
                ))}
              </select>
            </label>
            <Input
              aria-label="New issue title"
              className="h-8 w-64"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void create();
                }
              }}
            />
            <Button
              size="sm"
              disabled={title.trim().length === 0 || team === "" || busy}
              onClick={() => void create()}
            >
              Create in project
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
