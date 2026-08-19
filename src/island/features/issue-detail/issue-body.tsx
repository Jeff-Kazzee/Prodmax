/**
 * S-12 issue body shared by the 480px panel and the 720px full page.
 * Tabs lazy-load; property edits are optimistic with rollback.
 */
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@island/components/ui/button";
import { Skeleton } from "@island/components/ui/skeleton";
import { toastApiError, toastOk } from "@island/app/toast";
import { isTypingTarget } from "@/lib/keyboard/hotkeys";
import { useLookups } from "@island/features/issues/use-lookups";
import { addSubscriber, getIssue, listSubscribers, patchIssueDetail, removeSubscriber } from "./api";
import { TitleInput } from "./markdown";
import { PROPERTY_KEYS, PropertyStrip, focusProperty } from "./property-strip";
import { CommentsTab } from "./tab-comments";
import { DescriptionTab } from "./tab-description";
import { ActivityTab, AttachmentsTab, RelationsTab, SubissuesTab } from "./tab-lazy";
import { ISSUE_TABS, type IssueDetail, type IssueTab } from "./types";

export function IssueBody({
  wsId,
  userId,
  identifier,
  onClose,
  variant,
  redirectedFrom,
}: {
  wsId: string;
  userId: string;
  identifier: string;
  onClose?: () => void;
  variant: "panel" | "page";
  redirectedFrom?: string | null;
}) {
  const { lookup } = useLookups(wsId);
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<IssueTab>("description");
  const [titleDraft, setTitleDraft] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    setError(null);
    setIssue(null);
    setSubscribed(false);
    void getIssue(wsId, identifier)
      .then((res) => {
        setIssue(res.issue);
        setTitleDraft(res.issue.title);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "This issue was deleted.");
      });
    void listSubscribers(wsId, identifier)
      .then((res) => setSubscribed(res.data.some((s) => s.userId === userId)))
      .catch(() => setSubscribed(false));
  }, [wsId, identifier, userId]);

  const onPatch = useCallback(
    async (body: Record<string, unknown>, previous: Record<string, unknown>) => {
      setIssue((current) => {
        if (!current) return current;
        return { ...current, ...body } as IssueDetail;
      });
      const id = identifier;
      try {
        const res = await patchIssueDetail(wsId, id, body);
        setIssue(res.issue);
      } catch (err) {
        setIssue((current) => {
          if (!current) return current;
          return { ...current, ...previous } as IssueDetail;
        });
        toastApiError(err);
      }
    },
    [identifier, wsId],
  );

  useEffect(() => {
    if (!issue) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const prop = PROPERTY_KEYS[event.key.toLowerCase()];
      if (prop) {
        event.preventDefault();
        focusProperty(prop);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [issue]);

  if (error) {
    return (
      <div className="p-4" role="alert">
        <p>{error}</p>
      </div>
    );
  }
  if (!issue) {
    return (
      <div className="flex flex-col gap-2 p-4" aria-busy="true" aria-label="Loading issue">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const copyId = () => {
    void navigator.clipboard.writeText(issue.identifier);
    toastOk("Copied ID");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {redirectedFrom && redirectedFrom !== issue.identifier ? (
        <p className="border-b bg-accent px-3 py-1 text-xs" role="status">
          Redirected from {redirectedFrom}
        </p>
      ) : null}
      {banner ? (
        <p className="border-b px-3 py-1 text-xs text-destructive" role="alert">
          {banner}
        </p>
      ) : null}
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <button type="button" className="font-mono text-xs text-muted-foreground hover:underline" onClick={copyId}>
          {issue.identifier}
        </button>
        <span className="ml-auto" />
        {onClose ? (
          <Button type="button" size="icon-xs" variant="ghost" aria-label="Close issue panel" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        ) : null}
      </header>
      <div className="px-3 py-2">
        <TitleInput
          value={titleDraft}
          onChange={setTitleDraft}
          onCommit={() => {
            const next = titleDraft.trim();
            if (next && next !== issue.title) void onPatch({ title: next }, { title: issue.title });
          }}
          onRevert={() => setTitleDraft(issue.title)}
        />
      </div>
      <PropertyStrip issue={issue} lookup={lookup} onPatch={(body, prev) => void onPatch(body, prev)} />
      <div className="flex min-h-0 flex-1 flex-col">
        <div role="tablist" aria-label="Issue sections" className="flex flex-wrap gap-1 border-b px-2 py-1">
          {ISSUE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`rounded-md px-2 py-1 text-xs ${tab === t.id ? "bg-accent text-foreground" : "text-muted-foreground"}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <DescriptionTab wsId={wsId} issue={issue} active={tab === "description"} onPatch={(b, p) => void onPatch(b, p)} />
          <CommentsTab wsId={wsId} issue={issue} userId={userId} active={tab === "comments"} />
          <ActivityTab wsId={wsId} issueId={issue.identifier} active={tab === "activity"} />
          <RelationsTab wsId={wsId} issue={issue} active={tab === "relations"} onBanner={setBanner} />
          <SubissuesTab wsId={wsId} issue={issue} active={tab === "subissues"} />
          <AttachmentsTab active={tab === "attachments"} />
        </div>
      </div>
      <footer className="flex items-center gap-2 border-t px-3 py-2 text-xs">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-pressed={subscribed}
          onClick={() => {
            const next = !subscribed;
            setSubscribed(next);
            const op = next ? addSubscriber(wsId, issue.identifier) : removeSubscriber(wsId, issue.identifier, userId);
            void op.catch(toastApiError);
          }}
        >
          {subscribed ? "Subscribed" : "Subscribe"}
        </Button>
        <span className="ml-auto font-mono text-muted-foreground">{variant === "page" ? "Full page" : "Panel"}</span>
      </footer>
    </div>
  );
}
