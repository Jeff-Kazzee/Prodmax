/** Cursor-paged issue list with optimistic PATCH + rollback. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterNode } from "@/lib/validation/views";
import { onIssuesChanged } from "@island/features/issue-create/commands";
import { encodeF, isEmptyFilter } from "./filter-ast";
import { mergeFilters } from "./presets";
import { listIssues, patchIssue } from "./api";
import type { IssueListItem } from "./types";

const HIDE_TRIAGE: FilterNode = {
  combinator: "and",
  children: [{ field: "statusCategory", op: "neq", value: "triage" }],
};

export function useIssuesList(opts: {
  wsId: string | null;
  filters: FilterNode;
  sort: string;
  /** Triage inbox sets this; normal views hide triage rows (S-14). */
  includeTriage?: boolean;
}) {
  const filters = useMemo(() => {
    if (opts.includeTriage) return opts.filters;
    return mergeFilters(HIDE_TRIAGE, opts.filters);
  }, [opts.filters, opts.includeTriage]);
  const filterKey = encodeF(filters);
  const { wsId, sort } = opts;
  const [items, setItems] = useState<IssueListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!wsId) return;
      const my = ++seq.current;
      if (!append) setLoading(true);
      setError(null);
      try {
        const page = await listIssues({
          wsId,
          filters: isEmptyFilter(filters) ? undefined : filters,
          sort,
          cursor,
        });
        if (my !== seq.current) return;
        setItems((prev) => (append ? [...prev, ...page.data] : page.data));
        setNextCursor(page.nextCursor);
      } catch {
        if (my !== seq.current) return;
        setError("Something broke on our side.");
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [wsId, filterKey, sort, filters],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void load(null, false);
  }, [load]);

  useEffect(() => {
    return onIssuesChanged(() => void load(null, false));
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
