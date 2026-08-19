/** Comments tab: composer Cmd+Enter, resolve/reopen, convert to sub-issue. */
import { useEffect, useState } from "react";
import { Button } from "@island/components/ui/button";
import { toastApiError, toastOk } from "@island/app/toast";
import { createComment, createSubIssue, listComments, patchComment } from "./api";
import { MarkdownEditor } from "./markdown";
import type { IssueComment, IssueDetail } from "./types";

export function CommentsTab({
  wsId,
  issue,
  userId,
  active,
}: {
  wsId: string;
  issue: IssueDetail;
  userId: string;
  active: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<IssueComment[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!active || loaded) return;
    void listComments(wsId, issue.identifier)
      .then((res) => {
        setRows(res.data);
        setLoaded(true);
      })
      .catch((err) => {
        toastApiError(err);
        setLoaded(true);
      });
  }, [active, loaded, wsId, issue.identifier]);

  const post = async () => {
    const bodyMd = draft.trim();
    if (!bodyMd) return;
    try {
      const res = await createComment(wsId, issue.identifier, { bodyMd });
      setRows((prev) => [...prev, res.comment]);
      setDraft("");
      toastOk("Comment posted");
    } catch (err) {
      toastApiError(err);
    }
  };

  if (!active) return null;
  return (
    <div className="flex flex-col gap-3 p-3" data-tab="comments">
      <MarkdownEditor
        ariaLabel="Comment"
        minRows={3}
        value={draft}
        onChange={setDraft}
        onSubmit={() => void post()}
        placeholder="Write a comment. @userId mentions a member. Cmd+Enter posts."
      />
      <Button type="button" size="sm" onClick={() => void post()}>
        Comment
      </Button>
      <ul aria-label="Comments" className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border p-2 text-sm" data-comment-id={row.id}>
            {row.resolvedAt ? (
              <p className="text-xs text-muted-foreground">Resolved</p>
            ) : null}
            <p className="whitespace-pre-wrap">{row.bodyMd}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  const resolvedAt = row.resolvedAt ? null : Date.now();
                  void patchComment(row.id, { resolvedAt })
                    .then((res) => setRows((prev) => prev.map((c) => (c.id === row.id ? res.comment : c))))
                    .catch(toastApiError);
                }}
              >
                {row.resolvedAt ? "Reopen" : "Resolve"}
              </Button>
              {row.authorId === userId ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    void createSubIssue(wsId, {
                      teamId: issue.teamId,
                      title: row.bodyMd.slice(0, 80),
                      parentId: issue.id,
                    })
                      .then((res) => toastOk(`Created ${res.issue.identifier}`))
                      .catch(toastApiError);
                  }}
                >
                  Convert to sub-issue
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
