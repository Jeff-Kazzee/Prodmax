/**
 * S-07…S-11 issue views. Rows set `?issue=` only — the panel is T-004.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { IssuesEmpty } from "@/components/issues/issues-empty";
import { useSession } from "@island/app/session";
import { toastApiError, toastOk } from "@island/app/toast";
import { useShellState } from "@island/components/shell/shell-state";
import { BulkBar } from "./bulk-bar";
import { FilterBar } from "./filter-bar";
import { isEmptyFilter, resolveFilter } from "./filter-ast";
import {
  ensureStatusColumns,
  groupIssues,
  loadCollapsed,
  persistCollapsed,
  propertyPatchForGroup,
  toggleCollapsed,
} from "./grouping";
import { IssueViewsBody } from "./issue-views-body";
import { layoutFromPath, mergeFilters, pathForLayout, presetForPath } from "./presets";
import { SaveViewDialog } from "./save-view-dialog";
import { clearSelection, EMPTY_SELECTION, selectRange, toggleId } from "./selection";
import type { GroupBy, IssueLayout, IssueListItem, OrderBy, OrderDir, SavedView } from "./types";
import { bulkIssues, createView, favoriteView, getView, patchView, undoToken } from "./api";
import { useFilterUrl } from "./use-filter-url";
import { useIssueViewKeys } from "./use-issue-keys";
import { useIssuesList } from "./use-issues";
import { useLookups } from "./use-lookups";
import { ViewChrome } from "./view-chrome";

const NEXT_LAYOUT: Record<IssueLayout, IssueLayout> = {
  list: "board",
  board: "table",
  table: "list",
};

export function IssueViewsScreen() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const session = useSession();
  const { openNewIssue } = useShellState();
  const wsId = session.activeWorkspace?.id ?? null;
  const userId = session.user?.id ?? "";
  const { filter, setFilter, openIssue } = useFilterUrl();
  const { lookup, states, teamIdByKey } = useLookups(wsId);
  const preset = useMemo(
    () => presetForPath(pathname, { userId, teamIdByKey }),
    [pathname, userId, teamIdByKey],
  );

  const [saved, setSaved] = useState<SavedView | null>(null);
  const [viewStatus, setViewStatus] = useState<"idle" | "loading" | "ready" | "missing">("idle");
  const [saveOpen, setSaveOpen] = useState(false);
  const [layout, setLayout] = useState<IssueLayout>(preset.defaultLayout);
  const [groupBy, setGroupBy] = useState<GroupBy>(preset.defaultGroupBy);
  const [orderBy, setOrderBy] = useState<OrderBy>(preset.defaultOrderBy);
  const [orderDir, setOrderDir] = useState<OrderDir>(preset.defaultOrderDir);
  const [showPoints, setShowPoints] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const viewKey = params.viewId ?? pathname;

  useEffect(() => {
    setCollapsed(loadCollapsed(viewKey));
    setSelection(EMPTY_SELECTION);
    if (pathname.startsWith("/v/")) return;
    setGroupBy(preset.defaultGroupBy);
    setOrderBy(preset.defaultOrderBy);
    setOrderDir(preset.defaultOrderDir);
    setLayout(pathname.startsWith("/issues") ? layoutFromPath(pathname) : preset.defaultLayout);
  }, [pathname, viewKey, preset]);

  useEffect(() => {
    if (!wsId || !params.viewId) {
      setSaved(null);
      setViewStatus("idle");
      return;
    }
    setViewStatus("loading");
    void getView(wsId, params.viewId)
      .then((res) => {
        setSaved(res.view);
        setLayout(res.view.layout);
        setGroupBy((res.view.groupBy as GroupBy) ?? "none");
        setOrderBy(res.view.orderBy);
        setOrderDir(res.view.orderDir);
        if (isEmptyFilter(filter)) setFilter(res.view.filters);
        setViewStatus("ready");
      })
      .catch(() => {
        setSaved(null);
        setViewStatus("missing");
      });
  }, [wsId, params.viewId]);

  const merged = useMemo(
    () => mergeFilters(preset.extra, resolveFilter(filter, userId)),
    [preset.extra, filter, userId],
  );
  const { items, loading, error, nextCursor, loadMore, reload, optimisticPatch } = useIssuesList({
    wsId,
    filters: merged,
    sort: `${orderBy}:${orderDir}`,
  });
  const groups = useMemo(() => {
    const grouped = groupIssues(items, groupBy, lookup);
    return groupBy === "status" ? ensureStatusColumns(grouped, states) : grouped;
  }, [items, groupBy, lookup, states]);
  const selectedSet = useMemo(() => new Set(selection.ids), [selection.ids]);
  const orderedIds = useMemo(() => items.map((i) => i.id), [items]);
  const dirty = Boolean(
    saved &&
      (JSON.stringify(filter) !== JSON.stringify(saved.filters) ||
        layout !== saved.layout ||
        groupBy !== (saved.groupBy ?? "none")),
  );

  const cycleLayout = useCallback(() => {
    const next = NEXT_LAYOUT[layout];
    setLayout(next);
    const path = pathForLayout(pathname, next);
    if (path !== pathname) navigate({ pathname: path, search: window.location.search });
  }, [layout, pathname, navigate]);

  useIssueViewKeys({
    orderedIds,
    setSelection,
    setFilter,
    filter,
    onCycleLayout: cycleLayout,
    onSaveAs: () => setSaveOpen(true),
  });

  const onPatch = async (id: string, body: Record<string, unknown>, previous: Record<string, unknown>) => {
    try {
      await optimisticPatch(id, body, previous);
    } catch (err) {
      toastApiError(err);
    }
  };

  const onBoardDrop = async (issueId: string, groupId: string) => {
    const issue = items.find((i) => i.id === issueId);
    if (!issue) return;
    const body = propertyPatchForGroup(groupBy, groupId);
    const previous = dropPrevious(groupBy, issue);
    if (!body) return;
    await onPatch(issueId, body, previous);
    toast.success(`Moved ${issue.identifier}`, {
      duration: 4500,
      action: { label: "Undo", onClick: () => void onPatch(issueId, previous, body) },
    });
  };

  const selectToggle = (id: string, shift: boolean) =>
    setSelection((s) => (shift ? selectRange(s, orderedIds, id) : toggleId(s, id)));

  if (viewStatus === "missing") {
    return (
      <IssuesEmpty
        title="This view was deleted."
        explainer="Browse all issues or pick another saved view."
        actionLabel="Browse all issues"
        onAction={() => navigate("/issues")}
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-screen="Issues">
      <ViewChrome
        title={saved?.name ?? preset.title}
        layout={layout}
        groupBy={groupBy}
        orderBy={orderBy}
        orderDir={orderDir}
        dirty={dirty}
        view={saved}
        onLayout={(next) => {
          setLayout(next);
          const path = pathForLayout(pathname, next);
          if (path !== pathname) navigate({ pathname: path, search: window.location.search });
        }}
        onGroupBy={setGroupBy}
        onOrderBy={setOrderBy}
        onOrderDir={setOrderDir}
        onSave={() => {
          if (!wsId || !saved) return;
          void patchView(wsId, saved.id, { filters: filter, layout, groupBy, orderBy, orderDir }).then((res) => {
            setSaved(res.view);
            toastOk("View saved");
          });
        }}
        onSaveAs={() => setSaveOpen(true)}
        onFavorite={() => {
          if (!wsId || !saved) return;
          void favoriteView(wsId, saved.id).then((res) => setSaved({ ...saved, favorited: res.favorited }));
        }}
        onCopyUrl={() => {
          void navigator.clipboard.writeText(saved ? `${window.location.origin}/v/${saved.id}` : window.location.href);
          toastOk("View link copied");
        }}
      />
      <FilterBar filter={filter} count={items.length} onChange={setFilter} />
      <IssueViewsBody
        error={error}
        loading={loading}
        items={items}
        filterEmpty={isEmptyFilter(filter)}
        layout={layout}
        groups={groups}
        lookup={lookup}
        collapsed={collapsed}
        showPoints={showPoints}
        selectedSet={selectedSet}
        nextCursor={nextCursor}
        orderBy={orderBy}
        orderDir={orderDir}
        onRetry={reload}
        onClear={() => setFilter({ combinator: "and", children: [] })}
        onToggleGroup={(id) => {
          const next = toggleCollapsed(collapsed, id);
          setCollapsed(next);
          persistCollapsed(viewKey, next);
        }}
        onTogglePoints={() => setShowPoints((v) => !v)}
        onToggleSelect={selectToggle}
        onPatch={onPatch}
        onLoadMore={loadMore}
        onBoardDrop={onBoardDrop}
        onOpenIssue={openIssue}
        onAddInColumn={(groupId) => openNewIssue({ stateId: groupId })}
        onSort={(field) => {
          if (orderBy === field) setOrderDir(orderDir === "asc" ? "desc" : "asc");
          else setOrderBy(field);
        }}
      />
      <BulkBar
        count={selection.ids.length}
        states={states}
        onClear={() => setSelection(clearSelection())}
        onAction={(action, value) => {
          if (!wsId) return;
          void bulkIssues(wsId, { ids: selection.ids, action, value })
            .then((res) => {
              toast.success(`Updated ${res.updated} issues`, {
                duration: 4500,
                action: { label: "Undo", onClick: () => void undoToken(wsId, res.undoToken).then(reload) },
              });
              reload();
              setSelection(clearSelection());
            })
            .catch(toastApiError);
        }}
      />
      <SaveViewDialog
        open={saveOpen}
        defaultName={preset.title}
        defaultLayout={layout}
        onOpenChange={setSaveOpen}
        onSave={(input) => {
          if (!wsId) return;
          void createView(wsId, {
            name: input.name,
            scope: input.scope,
            layout: input.layout,
            filters: filter,
            groupBy,
            orderBy,
            orderDir,
          }).then(async (res) => {
            if (input.favorite) await favoriteView(wsId, res.view.id);
            setSaveOpen(false);
            toastOk("View created");
            navigate(`/v/${res.view.id}`);
          });
        }}
      />
    </div>
  );
}

function dropPrevious(
  groupBy: GroupBy,
  issue: IssueListItem,
): Record<string, unknown> {
  if (groupBy === "status") return { stateId: issue.stateId };
  if (groupBy === "assignee") return { assigneeId: issue.assigneeId };
  if (groupBy === "priority") return { priority: issue.priority };
  if (groupBy === "project") return { projectId: issue.projectId };
  if (groupBy === "cycle") return { cycleId: issue.cycleId };
  return {};
}
