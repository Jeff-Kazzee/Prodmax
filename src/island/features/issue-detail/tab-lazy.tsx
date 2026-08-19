/** Activity, relations, sub-issues, attachments — lazy on first visit. */
import { useEffect, useState } from "react";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import { toastApiError, toastOk } from "@island/app/toast";
import type { IssueListItem } from "@island/features/issues/types";
import { listIssues } from "@island/features/issues/api";
import { addRelation, createSubIssue, listHistory, listRelations } from "./api";
import type { HistoryRow, IssueDetail, RelationRow } from "./types";

export function ActivityTab({
  wsId,
  issueId,
  active,
}: {
  wsId: string;
  issueId: string;
  active: boolean;
}) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    if (!active || rows) return;
    void listHistory(wsId, issueId)
      .then((res) => setRows(res.data))
      .catch(() => setRows([]));
  }, [active, rows, wsId, issueId]);
  if (!active) return null;
  return (
    <ul aria-label="Activity" className="flex flex-col gap-1 p-3 text-sm">
      {(rows ?? []).length === 0 ? (
        <li className="text-muted-foreground">No activity yet.</li>
      ) : (
        (rows ?? []).map((row) => (
          <li key={row.id} className="font-mono text-xs">
            {row.field} · {row.newValue ?? "—"}
          </li>
        ))
      )}
    </ul>
  );
}

export function RelationsTab({
  wsId,
  issue,
  active,
  onBanner,
}: {
  wsId: string;
  issue: IssueDetail;
  active: boolean;
  onBanner: (text: string | null) => void;
}) {
  const [rows, setRows] = useState<RelationRow[] | null>(null);
  const [relatedId, setRelatedId] = useState("");
  const [type, setType] = useState<RelationRow["type"]>("related");
  useEffect(() => {
    if (!active || rows) return;
    void listRelations(wsId, issue.identifier)
      .then((res) => {
        setRows(res.data);
        const blocked = res.data.find((r) => r.type === "blocked_by");
        onBanner(blocked ? `Blocked by ${blocked.relatedIssueId}` : null);
      })
      .catch(() => setRows([]));
  }, [active, rows, wsId, issue.identifier, onBanner]);
  if (!active) return null;
  return (
    <div className="flex flex-col gap-2 p-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!relatedId.trim()) return;
          void addRelation(wsId, issue.identifier, { relatedIssueId: relatedId.trim(), type })
            .then((res) => {
              setRows((prev) => [...(prev ?? []), res.relation]);
              setRelatedId("");
              toastOk("Relation added");
            })
            .catch(toastApiError);
        }}
      >
        <Input aria-label="Related issue" value={relatedId} onChange={(e) => setRelatedId(e.target.value)} placeholder="Issue id" />
        <select aria-label="Relation type" className="h-9 rounded-md border bg-transparent px-1 text-sm" value={type} onChange={(e) => setType(e.target.value as RelationRow["type"])}>
          <option value="related">Related</option>
          <option value="blocked_by">Blocked by</option>
          <option value="blocking">Blocking</option>
          <option value="duplicate">Duplicate</option>
        </select>
        <Button type="submit" size="sm">Add relation</Button>
      </form>
      <ul aria-label="Relations" className="text-sm">
        {(rows ?? []).map((row) => (
          <li key={row.id} className="font-mono text-xs">
            {row.type} → {row.relatedIssueId}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SubissuesTab({
  wsId,
  issue,
  active,
}: {
  wsId: string;
  issue: IssueDetail;
  active: boolean;
}) {
  const [rows, setRows] = useState<IssueListItem[] | null>(null);
  const [title, setTitle] = useState("");
  const [paste, setPaste] = useState("");
  useEffect(() => {
    if (!active || rows) return;
    void listIssues({ wsId, limit: 200 })
      .then((res) => setRows(res.data.filter((i) => i.parentId === issue.id)))
      .catch(() => setRows([]));
  }, [active, rows, wsId, issue.id]);
  const createOne = async (line: string) => {
    const res = await createSubIssue(wsId, { teamId: issue.teamId, title: line, parentId: issue.id });
    setRows((prev) => [...(prev ?? []), res.issue]);
    return res.issue;
  };
  if (!active) return null;
  return (
    <div className="flex flex-col gap-2 p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void createOne(title.trim()).then(() => setTitle("")).catch(toastApiError);
        }}
      >
        <Input aria-label="Sub-issue title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" size="sm">Add</Button>
      </form>
      <textarea
        aria-label="Paste sub-issue titles"
        className="min-h-16 rounded-md border bg-transparent px-2 py-1 text-sm"
        placeholder="Paste one title per line"
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          const lines = paste.split(/\n/).map((l) => l.trim()).filter(Boolean);
          if (lines.length === 0) return;
          if (!window.confirm(`Create ${lines.length} sub-issues?`)) return;
          void Promise.all(lines.map(createOne)).then(() => {
            setPaste("");
            toastOk(`Created ${lines.length} sub-issues`);
          }).catch(toastApiError);
        }}
      >
        Create from paste
      </Button>
      <ul aria-label="Sub-issues" className="text-sm">
        {(rows ?? []).map((row) => (
          <li key={row.id} className="font-mono text-xs">
            {row.identifier} {row.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AttachmentsTab({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <p className="p-3 text-sm text-muted-foreground" data-tab="attachments">
      No attachments on this issue.
    </p>
  );
}
