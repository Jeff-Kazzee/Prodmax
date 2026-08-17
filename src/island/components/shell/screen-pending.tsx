/**
 * Shared pending screen (M2 pattern): every registered route whose screen
 * belongs to a later module renders this — honest, no fake controls,
 * no invented feature copy (voice: §11 — dry, warm-terse).
 */
import type { LucideIcon } from "lucide-react";
import { Hourglass } from "lucide-react";
import { Kbd } from "@island/components/ui/kbd";

export function ScreenPending({
  screen,
  icon: Icon = Hourglass,
}: {
  screen: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-lg border bg-card">
        <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight" data-screen={screen}>
        {screen}
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Still on the bench — this screen ships in an upcoming module.
      </p>
      <p className="text-xs text-muted-foreground">
        Press <Kbd>?</Kbd> for shortcuts, <Kbd>⌘K</Kbd> for the palette.
      </p>
    </div>
  );
}
