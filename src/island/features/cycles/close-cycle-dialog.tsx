/**
 * CY-06 close cycle, with the rollover preview the ticket asks for.
 *
 * There is no preview endpoint, so the count shown is computed on the client
 * by re-applying `closeCycle`'s own rule to the scoped issues already loaded.
 * Two things keep that honest rather than a guess:
 *
 *  - it is labelled "as of now", and says "at least" when the scoped list is
 *    paged, because then the client is looking at a prefix, not the set;
 *  - the receipt reports the server's returned `rollover.count`, and names the
 *    disagreement when it differs from the preview. The preview never gets to
 *    be the last word about what happened.
 */
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@island/components/ui/alert-dialog";
import { toastApiError, toastOk } from "@island/app/toast";
import type { IssueListItem, LookupMaps } from "@island/features/issues/types";
import { rolloverSet, rolloverTarget } from "./cycle-stats";
import { cycleName, type CycleDto } from "./types";

export function CloseCycleDialog({
  open,
  onOpenChange,
  cycle,
  cycles,
  scoped,
  scopedTruncated,
  lookup,
  onConfirm,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: CycleDto;
  cycles: CycleDto[];
  scoped: IssueListItem[];
  /** True when the scoped list has another page, so the preview is a floor. */
  scopedTruncated: boolean;
  lookup: LookupMaps;
  onConfirm: () => Promise<{
    rollover: { count: number; nextCycleId: string; nextCycleCreated: boolean };
  }>;
  onClosed: (nextCycleId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const rolling = rolloverSet(scoped, lookup);
  const target = rolloverTarget(cycle, cycles);
  const previewCount = rolling.length;
  const scopeTotal = cycle.stats.scope.issues;
  // Partial when the list is paged, and also when the server counts more
  // issues than arrived: triage-state rows never reach this component.
  const partial = scopedTruncated || scoped.length < scopeTotal;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await onConfirm();
      const actual = res.rollover.count;
      const drifted = actual !== previewCount;
      toastOk(
        `${cycleName(cycle)} closed`,
        [
          `${actual} ${actual === 1 ? "issue" : "issues"} rolled over`,
          drifted ? `preview said ${previewCount}` : null,
          res.rollover.nextCycleCreated ? "next cycle created" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      onOpenChange(false);
      onClosed(res.rollover.nextCycleId);
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close {cycleName(cycle)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Closing freezes this cycle's stats and moves its open issues on. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1 text-sm">
          {/*
            The denominator is the SERVER's scope count, not the length of the
            loaded page. Those differ whenever the cycle is scoped past one
            page, and printing a page length as "of N scoped issues" states a
            size the client does not know.
          */}
          <p data-testid="cy-rollover-preview">
            {partial ? "At least " : ""}
            {previewCount} of {scopeTotal} scoped {scopeTotal === 1 ? "issue" : "issues"} would roll
            over, as of now.
          </p>
          {partial ? (
            <p className="text-xs text-muted-foreground" data-testid="cy-rollover-partial">
              The preview counted the {scoped.length} issues loaded here, so the real number can be
              higher.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground" data-testid="cy-rollover-target">
            {target
              ? `Destination: ${cycleName(target)}.`
              : "No later cycle exists yet, so one will be created."}
          </p>
          {rolling.length > 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              {rolling
                .slice(0, 5)
                .map((i) => i.identifier)
                .join(", ")}
              {rolling.length > 5 ? ` +${rolling.length - 5} more` : ""}
            </p>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              // Keep the dialog mounted until the request settles, so a
              // failure can surface instead of closing over a silent error.
              e.preventDefault();
              void confirm();
            }}
          >
            Close cycle
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
