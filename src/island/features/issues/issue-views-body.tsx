/** Layout body for IssueViewsScreen — keeps the screen file under the write cap. */
import { IssuesEmpty } from "@/components/issues/issues-empty";
import { Button } from "@island/components/ui/button";
import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import { TableView } from "./table-view";
import type { IssueGroup } from "./grouping";
import type { IssueLayout, IssueListItem, LookupMaps, OrderBy, OrderDir } from "./types";

export function IssueViewsBody(props: {
  error: string | null;
  loading: boolean;
  items: IssueListItem[];
  filterEmpty: boolean;
  layout: IssueLayout;
  groups: IssueGroup[];
  lookup: LookupMaps;
  collapsed: Record<string, boolean>;
  showPoints: boolean;
  selectedSet: Set<string>;
  nextCursor: string | null;
  orderBy: OrderBy;
  orderDir: OrderDir;
  onRetry: () => void;
  onClear: () => void;
  onToggleGroup: (id: string) => void;
  onTogglePoints: () => void;
  onToggleSelect: (id: string, shift: boolean) => void;
  onPatch: (id: string, body: Record<string, unknown>, previous: Record<string, unknown>) => void;
  onLoadMore: () => void;
  onBoardDrop: (issueId: string, groupId: string) => void;
  onOpenIssue: (identifier: string) => void;
  onSort: (field: OrderBy) => void;
  onAddInColumn: (groupId: string) => void;
}) {
  if (props.error) {
    return (
      <div className="p-6" role="alert">
        <p>Something broke on our side.</p>
        <Button className="mt-2" size="sm" onClick={props.onRetry}>
          Retry
        </Button>
        <p className="mt-1 font-mono text-xs text-muted-foreground">INTERNAL</p>
      </div>
    );
  }
  if (props.items.length === 0 && !props.loading) {
    return (
      <IssuesEmpty
        title={props.filterEmpty ? "The bench is clear." : "No issues match these filters"}
        explainer={
          props.filterEmpty
            ? "Create an issue to get started."
            : "Try clearing chips or broadening the query."
        }
        actionLabel={props.filterEmpty ? undefined : "Clear filters"}
        onAction={props.filterEmpty ? undefined : props.onClear}
      />
    );
  }
  if (props.layout === "board") {
    return (
      <BoardView
        groups={props.groups}
        lookup={props.lookup}
        loading={props.loading}
        onDropIssue={props.onBoardDrop}
        onOpenIssue={props.onOpenIssue}
        onAddInColumn={props.onAddInColumn}
      />
    );
  }
  if (props.layout === "table") {
    return (
      <TableView
        issues={props.items}
        lookup={props.lookup}
        loading={props.loading}
        selectedIds={props.selectedSet}
        orderBy={props.orderBy}
        orderDir={props.orderDir}
        onToggleSelect={props.onToggleSelect}
        onPatch={props.onPatch}
        onSort={props.onSort}
      />
    );
  }
  return (
    <ListView
      groups={props.groups}
      collapsed={props.collapsed}
      showPoints={props.showPoints}
      lookup={props.lookup}
      selectedIds={props.selectedSet}
      loadedCount={props.items.length}
      totalHint={null}
      hasNext={Boolean(props.nextCursor)}
      loading={props.loading}
      onToggleGroup={props.onToggleGroup}
      onTogglePoints={props.onTogglePoints}
      onToggleSelect={props.onToggleSelect}
      onPatch={props.onPatch}
      onLoadMore={props.onLoadMore}
      onDropOnGroup={(groupId, issueId) => void props.onBoardDrop(issueId, groupId)}
    />
  );
}
