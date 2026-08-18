/** Sync `?f=` with the filter AST (FB-06). */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { FilterNode } from "@/lib/validation/views";
import { decodeF, encodeF, isEmptyFilter } from "./filter-ast";

export function useFilterUrl() {
  const [params, setParams] = useSearchParams();
  const filter = decodeF(params.get("f"));

  const setFilter = useCallback(
    (next: FilterNode) => {
      const nextParams = new URLSearchParams(params);
      if (isEmptyFilter(next)) nextParams.delete("f");
      else nextParams.set("f", encodeF(next));
      setParams(nextParams, { replace: true });
    },
    [params, setParams],
  );

  const openIssue = useCallback(
    (identifier: string) => {
      const nextParams = new URLSearchParams(params);
      nextParams.set("issue", identifier);
      setParams(nextParams, { replace: true });
    },
    [params, setParams],
  );

  return { filter, setFilter, openIssue, issueId: params.get("issue") };
}
