/**
 * Small markdown chrome for issue descriptions/comments (design-system §05).
 * Preview is escaped HTML plus a few inline markers — no extra dependency.
 */
import { useState } from "react";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(source: string): string {
  const escaped = escapeHtml(source);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  minRows = 6,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  ariaLabel: string;
  minRows?: number;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Button type="button" size="xs" variant={mode === "write" ? "secondary" : "ghost"} onClick={() => setMode("write")}>
          Write
        </Button>
        <Button type="button" size="xs" variant={mode === "preview" ? "secondary" : "ghost"} onClick={() => setMode("preview")}>
          Preview
        </Button>
      </div>
      {mode === "write" ? (
        <textarea
          aria-label={ariaLabel}
          placeholder={placeholder}
          rows={minRows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="min-h-24 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      ) : (
        <div
          aria-label={`${ariaLabel} preview`}
          className="min-h-24 rounded-md border px-2 py-1.5 text-sm"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || "<span class='text-muted-foreground'>Nothing to preview.</span>" }}
        />
      )}
    </div>
  );
}

export function TitleInput({
  value,
  onChange,
  onCommit,
  onRevert,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onRevert: () => void;
  autoFocus?: boolean;
}) {
  return (
    <Input
      aria-label="Title"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onRevert();
        }
      }}
      className="border-0 px-0 text-base font-medium shadow-none"
    />
  );
}
