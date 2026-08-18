/** Cursor-paged issue list with optimistic PATCH + rollback. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FilterNode } from "@/lib/validation/views";
import { encodeF, isEmptyFilter } from "./filter-ast";
import { listIssues, patchIssue } from "./api";
import type { IssueListItem } from "./types";

export function useIssuesList(opts: {
  wsId: string | null;
  filters: FilterNode;
  sort: string;
}) {
  const filterKey = encodeF(opts.filters);
  const { wsId, sort } = opts;
  const [items, setItems] = useState<IssueListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetching = useRef(false);

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!wsId || fetching.current) return;
      fetching.current = true;
      if (!append) setLoading(true);
      setError(null);
      try {
        const page = await listIssues({
          wsId,
          filters: isEmptyFilter(opts.filters) ? undefined : opts.filters,
          sort,
          cursor,
        });
        setItems((prev) => (append ? [...prev, ...page.data] : page.data));
        setNextCursor(page.nextCursor);
      } catch {
        setError("Something broke on our side.");
      } finally {
        fetching.current = false;
        setLoading(false);
      }
    },
    [wsId, filterKey, sort, opts.filters],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void load(null, false);
  }, [load]);

  const loadMore = useCallback(() => {
    if (nextCursor) void load(nextCursor, true);
  }, [load, nextCursor]);

  const applyLocal = useCallback((id: string, body: Record<string, unknown>) => {
    setItems((prev) =>
      prev.map((issue) => (issue.id === id ? ({ ...issue, ...body } as IssueListItem) : issue)),
    );
  }, []);

  const optimisticPatch = useCallback(
    async (id: string, body: Record<string, unknown>, previous: Record<string, unknown>) => {
      if (!wsId) return;
      applyLocal(id, body);
      try {
        const res = await patchIssue(wsId, id, body);
        setItems((prev) => prev.map((issue) => (issue.id === id ? { ...issue, ...res.issue } : issue)));
      } catch (err) {
        applyLocal(id, previous);
        throw err;
      }
    },
    [applyLocal, wsId],
  );

  return { items, loading, error, nextCursor, loadMore, reload: () => void load(null, false), optimisticPatch, setItems };
}
