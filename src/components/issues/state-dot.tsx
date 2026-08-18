/** State color dot + accessible name (P7: color is never the only signal). */
export function StateDot({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  return (
    <span className={className ?? "inline-flex items-center gap-1.5"}>
      <span
        className="inline-block size-2 shrink-0 rounded-full border border-border"
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden="true"
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
