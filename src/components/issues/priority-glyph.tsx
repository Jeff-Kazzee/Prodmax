/**
 * Priority bars glyph (design-system §5.3) — color is never the only signal.
 */
import { cn } from "@/lib/utils";

const PRIORITY_LABELS = ["No priority", "Low", "Medium", "High", "Urgent"] as const;

const FILLED = [0, 1, 2, 3, 4] as const;

export function PriorityGlyph({
  priority,
  className,
}: {
  priority: number;
  className?: string;
}) {
  const n = Math.min(4, Math.max(0, priority));
  const label = PRIORITY_LABELS[n] ?? "No priority";
  return (
    <span
      className={cn("inline-flex items-end gap-px", className)}
      title={label}
      aria-label={label}
    >
      {FILLED.map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-sm",
            i === 0 ? "h-[5px]" : i === 1 ? "h-[7px]" : i === 2 ? "h-[9px]" : i === 3 ? "h-[11px]" : "h-[13px]",
            i < n ? "bg-foreground" : "bg-border",
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
