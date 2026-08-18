/**
 * S-11 view chrome: layout toggle, group/order menus, unsaved-dot, save-as.
 */
import { Button } from "@island/components/ui/button";
import { Kbd } from "@island/components/ui/kbd";
import type { GroupBy, IssueLayout, OrderBy, OrderDir, SavedView } from "./types";

const LAYOUTS: IssueLayout[] = ["list", "board", "table"];
const GROUPS: GroupBy[] = ["none", "status", "assignee", "priority", "team", "label", "project", "cycle"];
const ORDERS: OrderBy[] = ["updated", "created", "status", "priority", "due", "manual"];

export function ViewChrome({
  title,
  layout,
  groupBy,
  orderBy,
  orderDir,
  dirty,
  view,
  onLayout,
  onGroupBy,
  onOrderBy,
  onOrderDir,
  onSave,
  onSaveAs,
  onFavorite,
  onCopyUrl,
}: {
  title: string;
  layout: IssueLayout;
  groupBy: GroupBy;
  orderBy: OrderBy;
  orderDir: OrderDir;
  dirty: boolean;
  view: SavedView | null;
  onLayout: (layout: IssueLayout) => void;
  onGroupBy: (groupBy: GroupBy) => void;
  onOrderBy: (orderBy: OrderBy) => void;
  onOrderDir: (dir: OrderDir) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onFavorite: () => void;
  onCopyUrl: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5" data-view-chrome>
      <h1 className="flex items-center gap-2 text-sm font-semibold">
        {title}
        {dirty ? (
          <span className="size-1.5 rounded-full bg-primary" aria-label="Unsaved changes" />
        ) : null}
      </h1>
      <div role="radiogroup" aria-label="Layout" className="flex rounded-md border">
        {LAYOUTS.map((item) => (
          <Button
            key={item}
            variant={layout === item ? "secondary" : "ghost"}
            size="xs"
            role="radio"
            aria-checked={layout === item}
            onClick={() => onLayout(item)}
          >
            {item}
          </Button>
        ))}
      </div>
      <label className="flex items-center gap-1 text-xs">
        Group
        <select
          aria-label="Group by"
          className="h-7 rounded-md border bg-background px-1 text-xs"
          value={groupBy}
          onChange={(e) => onGroupBy(e.target.value as GroupBy)}
        >
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs">
        Order
        <select
          aria-label="Order by"
          className="h-7 rounded-md border bg-background px-1 text-xs"
          value={orderBy}
          onChange={(e) => onOrderBy(e.target.value as OrderBy)}
        >
          {ORDERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="font-mono text-[11px]"
          aria-label="Toggle sort direction"
          onClick={() => onOrderDir(orderDir === "asc" ? "desc" : "asc")}
        >
          {orderDir === "asc" ? "↑" : "↓"}
        </button>
      </label>
      <span className="ml-auto flex items-center gap-1">
        {view ? (
          <Button variant="ghost" size="xs" aria-pressed={view.favorited} onClick={onFavorite}>
            {view.favorited ? "★" : "☆"}
          </Button>
        ) : null}
        {dirty && view ? (
          <Button size="xs" onClick={onSave}>
            Save changes
          </Button>
        ) : null}
        <Button variant="outline" size="xs" onClick={onSaveAs}>
          Save as <Kbd className="ml-1">Alt+V</Kbd>
        </Button>
        {view ? (
          <Button variant="ghost" size="xs" onClick={onCopyUrl}>
            Copy URL
          </Button>
        ) : null}
      </span>
    </div>
  );
}
