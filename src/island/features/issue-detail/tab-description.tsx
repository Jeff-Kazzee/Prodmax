/** Description tab: Write/Preview + version restore. */
import { useEffect, useState } from "react";
import { Button } from "@island/components/ui/button";
import { toastApiError, toastOk } from "@island/app/toast";
import { listDescriptionVersions, restoreDescriptionVersion } from "./api";
import { MarkdownEditor } from "./markdown";
import type { DescriptionVersion, IssueDetail } from "./types";

export function DescriptionTab({
  wsId,
  issue,
  active,
  onPatch,
}: {
  wsId: string;
  issue: IssueDetail;
  active: boolean;
  onPatch: (body: Record<string, unknown>, previous: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(issue.descriptionMd);
  const [versions, setVersions] = useState<DescriptionVersion[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setDraft(issue.descriptionMd);
  }, [issue.id, issue.descriptionMd]);

  useEffect(() => {
    if (!draft || draft === issue.descriptionMd) return;
    const timer = window.setTimeout(() => {
      onPatch({ descriptionMd: draft }, { descriptionMd: issue.descriptionMd });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [draft, issue.descriptionMd, issue.id, onPatch]);

  const loadHistory = async () => {
    setShowHistory(true);
    if (versions) return;
    try {
      const res = await listDescriptionVersions(wsId, issue.identifier);
      setVersions(res.data);
    } catch (err) {
      toastApiError(err);
      setVersions([]);
    }
  };

  if (!active) return null;
  return (
    <div className="flex flex-col gap-2 p-3">
      <MarkdownEditor ariaLabel="Description" value={draft} onChange={setDraft} />
      <Button type="button" size="xs" variant="ghost" onClick={() => void loadHistory()}>
        Description history
      </Button>
      {showHistory ? (
        <ul aria-label="Description versions" className="flex flex-col gap-1 text-sm">
          {(versions ?? []).length === 0 ? (
            <li className="text-muted-foreground">No earlier versions.</li>
          ) : (
            (versions ?? []).map((v) => (
              <li key={v.id} className="flex items-center gap-2 rounded-md border px-2 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{v.bodyMd || "(empty)"}</span>
                <Button
                  type="button"
                  size="xs"
                  onClick={() => {
                    void restoreDescriptionVersion(wsId, issue.identifier, v.id)
                      .then((res) => {
                        setDraft(res.issue.descriptionMd);
                        toastOk("Description restored");
                      })
                      .catch(toastApiError);
                  }}
                >
                  Restore
                </Button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
