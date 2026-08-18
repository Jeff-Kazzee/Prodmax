/** E-empty card used by issue views (L-14). */
import { Button } from "@island/components/ui/button";

export function IssuesEmpty({
  title,
  explainer,
  actionLabel,
  onAction,
}: {
  title: string;
  explainer: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center" data-empty="issues">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{explainer}</p>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
