/**
 * PJ-05 updates tab: reverse-chron health reports plus the composer.
 *
 * The composer never sends `progressSnapshot`. The server snapshots the
 * project's materialized `progress_cache` at post time, and that is the number
 * the update is a report about; a client-computed one could disagree with it.
 */
import { useState } from "react";
import { Button } from "@island/components/ui/button";
import { toastApiError, toastOk } from "@island/app/toast";
import { renderMarkdown } from "@island/features/issue-detail/markdown";
import type { MemberOption } from "@island/features/issues/types";
import { HEALTH_LABELS, type ProjectUpdateDto, type UpdateHealth } from "./types";

const HEALTHS: readonly UpdateHealth[] = ["on_track", "at_risk", "off_track"] as const;

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function UpdatesTab({
  updates,
  members,
  currentUserId,
  hasMore,
  onPost,
  onDelete,
  onLoadMore,
}: {
  updates: ProjectUpdateDto[];
  members: MemberOption[];
  currentUserId: string;
  hasMore: boolean;
  onPost: (health: UpdateHealth, bodyMd: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
}) {
  const [health, setHealth] = useState<UpdateHealth>("on_track");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = body.trim();
  const canPost = trimmed.length > 0 && !busy;

  const post = async () => {
    if (!canPost) return;
    setBusy(true);
    try {
      await onPost(health, trimmed);
      setBody("");
      setHealth("on_track");
      toastOk("Update posted");
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (userId: string): string =>
    members.find((m) => m.userId === userId)?.name ?? "Someone";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-tab="updates">
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">Health</span>
            <select
              aria-label="Health"
              className="h-8 rounded-md border bg-transparent px-2 text-sm"
              value={health}
              onChange={(e) => setHealth(e.target.value as UpdateHealth)}
            >
              {HEALTHS.map((h) => (
                <option key={h} value={h}>
                  {HEALTH_LABELS[h]}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!canPost}
            onClick={() => void post()}
          >
            Post update
          </Button>
        </div>
        <textarea
          aria-label="Update body"
          className="min-h-[88px] w-full rounded-md border bg-transparent p-2 text-sm"
          placeholder="What moved, what is stuck, what is next."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void post();
            }
          }}
        />
      </div>

      {updates.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No updates yet. The first one sets the baseline.
        </p>
      ) : (
        <ul>
          {updates.map((update) => (
            <li key={update.id} className="flex flex-col gap-1 border-b px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-sm border px-1.5 py-0.5 text-xs">
                  {HEALTH_LABELS[update.health]}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {nameOf(update.authorId)} · {formatDate(update.createdAt)}
                  {update.progressSnapshot !== null ? ` · ${update.progressSnapshot}%` : ""}
                </span>
                {update.authorId === currentUserId ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="ml-auto"
                    aria-label={`Delete update from ${formatDate(update.createdAt)}`}
                    onClick={() => {
                      void onDelete(update.id)
                        .then(() => toastOk("Update deleted"))
                        .catch(toastApiError);
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
              <div
                className="text-sm"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(update.bodyMd) }}
              />
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="px-4 py-3">
          <Button size="sm" variant="outline" onClick={() => void onLoadMore()}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
