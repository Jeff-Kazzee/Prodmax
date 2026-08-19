/**
 * S-13 new-issue modal. Autofocus title, Cmd+Enter creates, Esc saves a
 * local draft (no drafts endpoint in T-002), create-another keeps the dialog.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@island/components/ui/dialog";
import { PRIORITY_LABELS, type StateOption, type TeamOption } from "@island/features/issues/types";
import { toastApiError, toastOk } from "@island/app/toast";
import { MarkdownEditor } from "@island/features/issue-detail/markdown";
import { checkDedup, createIssue, type DedupSuggestion } from "./api";
import type { CreatePrefill } from "./commands";
import { notifyIssuesChanged } from "./commands";
import { clearDraft, saveDraft, saveLastTeamId, type IssueDraft } from "./draft";

export function NewIssueModal({
  open,
  full,
  wsId,
  teams,
  states,
  prefill,
  initial,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  full: boolean;
  wsId: string;
  teams: TeamOption[];
  states: StateOption[];
  prefill: CreatePrefill;
  initial: IssueDraft | null;
  onOpenChange: (open: boolean) => void;
  onCreated?: (identifier: string) => void;
}) {
  const defaultTeamId = prefill.teamId ?? initial?.teamId ?? teams[0]?.id ?? "";
  const [teamId, setTeamId] = useState(defaultTeamId);
  const [title, setTitle] = useState(prefill.title ?? initial?.title ?? "");
  const [descriptionMd, setDescriptionMd] = useState(initial?.descriptionMd ?? "");
  const [showDesc, setShowDesc] = useState(full || Boolean(initial?.descriptionMd));
  const [priority, setPriority] = useState(prefill.priority ?? initial?.priority ?? 0);
  const [stateId, setStateId] = useState(prefill.stateId ?? initial?.stateId ?? "");
  const [createAnother, setCreateAnother] = useState(initial?.createAnother ?? false);
  const [suggestions, setSuggestions] = useState<DedupSuggestion[]>([]);

  const teamStates = useMemo(() => states.filter((s) => s.teamId === teamId), [states, teamId]);
  const team = teams.find((t) => t.id === teamId);

  useEffect(() => {
    if (!teamId && teams[0]) setTeamId(prefill.teamId ?? teams[0].id);
  }, [teamId, teams, prefill.teamId]);

  useEffect(() => {
    if (!open || title.trim().length < 3 || !teamId) return;
    const timer = window.setTimeout(() => {
      void checkDedup(wsId, { teamId, title, description: descriptionMd })
        .then(setSuggestions)
        .catch((err) => {
          toastApiError(err);
          setSuggestions([]);
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [open, title, teamId, descriptionMd, wsId]);

  const snapshot = (): IssueDraft => ({
    teamId,
    title,
    descriptionMd,
    priority,
    stateId: stateId || undefined,
    createAnother,
  });

  const submit = async () => {
    if (!title.trim() || !teamId) return;
    try {
      const res = await createIssue(wsId, {
        teamId,
        title: title.trim(),
        descriptionMd: descriptionMd || undefined,
        priority,
        stateId: stateId || undefined,
        parentId: prefill.parentId,
      });
      saveLastTeamId(wsId, teamId);
      clearDraft(wsId);
      toastOk(`Created ${res.issue.identifier}`);
      notifyIssuesChanged();
      if (res.suggestions.length) setSuggestions(res.suggestions);
      onCreated?.(res.issue.identifier);
      if (createAnother) {
        setTitle("");
        setDescriptionMd("");
        setSuggestions(res.suggestions);
        return;
      }
      onOpenChange(false);
    } catch (err) {
      toastApiError(err);
    }
  };

  const requestClose = (next: boolean) => {
    if (!next && title.trim()) {
      saveDraft(wsId, snapshot());
      toastOk("Draft saved", "Resume from C");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        data-new-issue-modal
        className={full ? "sm:max-w-[880px]" : "sm:max-w-lg"}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>New issue</DialogTitle>
          <DialogDescription>Title and a team are enough. Cmd+Enter creates.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Team
            <select
              aria-label="Team"
              className="h-9 rounded-md border bg-transparent px-2"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key} · {t.name}
                </option>
              ))}
            </select>
          </label>
          {title.trim() && team ? (
            <p className="font-mono text-xs text-muted-foreground">{team.key}-…</p>
          ) : null}
          <Input aria-label="Issue title" placeholder="Title…" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          {suggestions[0] ? (
            <div className="rounded-md border border-dashed px-2 py-1 text-sm" data-dedup-banner>
              Similar to {suggestions[0].identifier ?? suggestions[0].issueId}
              {suggestions[0].score != null ? ` (${Math.round(suggestions[0].score * 100)}%)` : ""}
            </div>
          ) : null}
          {showDesc || full ? (
            <MarkdownEditor ariaLabel="Issue description" value={descriptionMd} onChange={setDescriptionMd} />
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowDesc(true)}>
              Add description
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            <select aria-label="State" className="h-8 rounded-md border bg-transparent px-1 text-xs" value={stateId} onChange={(e) => setStateId(e.target.value)}>
              <option value="">Default state</option>
              {teamStates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select aria-label="Priority" className="h-8 rounded-md border bg-transparent px-1 text-xs" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              {PRIORITY_LABELS.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <label className="mr-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createAnother}
              aria-label="Create another"
              onChange={(e) => setCreateAnother(e.target.checked)}
            />
            Create another
          </label>
          <Button type="button" variant="ghost" onClick={() => requestClose(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!title.trim() || !teamId}>
            Create issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
