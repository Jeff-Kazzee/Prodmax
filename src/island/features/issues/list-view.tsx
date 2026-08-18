/**
 * S-07 list: sticky group headers, collapse persistence, virtualized rows,
 * cursor sentinel. Selection and patches bubble to the screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@island/components/ui/skeleton";
import { IssueRow } from "./issue-row";
import { shouldFetchNext, virtualWindow } from "./virtualize";
import type { IssueGroup } from "./grouping";
import type { IssueListItem, LookupMaps } from "./types";

const ROW_FALLBACK = 36;

export function ListView({
  groups,
  collapsed,
  showPoints,
  lookup,
  selectedIds,
  loadedCount,
  totalHint,
  hasNext,
  loading,
  onToggleGroup,
  onTogglePoints,
  onToggleSelect,
  onPatch,
  onLoadMore,
  onDropOnGroup,
}: {
  groups: IssueGroup[];
  collapsed: Record<string, boolean>;
  showPoints: boolean;
  lookup: LookupMaps;
  selectedIds: Set<string>;
  loadedCount: number;
  totalHint: number | null;
  hasNext: boolean;
  loading: boolean;
  onToggleGroup: (id: string) => void;
  onTogglePoints: () => void;
  onToggleSelect: (id: string, shift: boolean) => void;
  onPatch: (id: string, body: Record<string, unknown>, previous: Record<string, unknown>) => void;
  onLoadMore: () => void;
  onDropOnGroup?: (groupId: string, issueId: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const rowHeight = rowHeightPx();

  const flat = useMemo(() => flatten(groups, collapsed), [groups, collapsed]);
  const windowed = virtualWindow({
    scrollTop,
    viewportHeight,
    rowHeight,
    count: flat.length,
  });
  const slice = flat.slice(windowed.start, windowed.end);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
      if (
        shouldFetchNext({
          scrollTop: el.scrollTop,
          viewportHeight: el.clientHeight,
          totalHeight: flat.length * rowHeight,
          hasNext,
        })
      ) {
        onLoadMore();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [flat.length, hasNext, onLoadMore, rowHeight]);

  if (loading && loadedCount === 0) {
    return (
      <div className="flex flex-col gap-1 p-3" aria-busy="true" aria-label="Loading issues">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="w-full" style={{ height: "var(--row-h)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-[60vh] max-h-[calc(100dvh-12rem)] flex-1 overflow-auto" data-issue-list>
        <div style={{ height: windowed.totalHeight, position: "relative" }}>
          <div style={{ transform: `translateY(${windowed.offsetY}px)` }}>
            {slice.map((item) =>
              item.kind === "header" ? (
                <GroupHeader
                  key={`h-${item.group.id}`}
                  group={item.group}
                  collapsed={Boolean(collapsed[item.group.id])}
                  showPoints={showPoints}
                  onToggle={() => onToggleGroup(item.group.id)}
                  onTogglePoints={onTogglePoints}
                  onDrop={onDropOnGroup}
                />
              ) : (
                <IssueRow
                  key={item.issue.id}
                  issue={item.issue}
                  lookup={lookup}
                  selected={selectedIds.has(item.issue.id)}
                  onToggleSelect={(shift) => onToggleSelect(item.issue.id, shift)}
                  onPatch={onPatch}
                />
              ),
            )}
          </div>
        </div>
        <div data-cursor-sentinel className="h-8" aria-hidden="true" />
      </div>
      <p className="border-t px-3 py-1 font-mono text-[11px] tabular-nums text-muted-foreground">
        1–{loadedCount}
        {totalHint !== null ? ` of ${totalHint}` : ""} · {groups.length} groups
      </p>
    </div>
  );
}

type FlatItem =
  | { kind: "header"; group: IssueGroup }
  | { kind: "row"; issue: IssueListItem };

function flatten(groups: IssueGroup[], collapsed: Record<string, boolean>): FlatItem[] {
  const out: FlatItem[] = [];
  for (const group of groups) {
    out.push({ kind: "header", group });
    if (!collapsed[group.id]) {
      for (const issue of group.issues) out.push({ kind: "row", issue });
    }
  }
  return out;
}

function GroupHeader({
  group,
  collapsed,
  showPoints,
  onToggle,
  onTogglePoints,
  onDrop,
}: {
  group: IssueGroup;
  collapsed: boolean;
  showPoints: boolean;
  onToggle: () => void;
  onTogglePoints: () => void;
  onDrop?: (groupId: string, issueId: string) => void;
}) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <div
      role="rowheader"
      data-group-id={group.id}
      className="sticky top-0 z-[1] flex items-center gap-2 border-b bg-background px-2 text-sm"
      style={{ height: "var(--row-h)" }}
      onDragOver={(e) => {
        if (onDrop) e.preventDefault();
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("text/issue-id");
        if (id && onDrop) onDrop(group.id, id);
      }}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.label}`}
        onClick={onToggle}
        className="flex items-center gap-1 font-medium"
      >
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        {group.label}
      </button>
      <button
        type="button"
        className="ml-auto font-mono text-xs tabular-nums text-muted-foreground"
        onClick={onTogglePoints}
        aria-label="Toggle count and points"
      >
        {showPoints ? `${group.points} pts` : `${group.issues.length}`}
      </button>
    </div>
  );
}

function rowHeightPx(): number {
  if (typeof window === "undefined") return ROW_FALLBACK;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--row-h");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : ROW_FALLBACK;
}
