/**
 * Topbar (§3.3): breadcrumb (SB-10), search trigger (SB-16), theme toggle
 * (SB-17), density toggle (SB-18), sync dot (SB-19 — "synced" only until
 * the SSE module lands). Presence/AI/inbox/new-issue are later modules.
 */
import { Link, useLocation } from "react-router-dom";
import { Monitor, Moon, Plus, Search, Sun } from "lucide-react";
import { Button } from "@island/components/ui/button";
import { Kbd } from "@island/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@island/components/ui/tooltip";
import { crumbsFor } from "@island/app/routes";
import { useSession } from "@island/app/session";
import {
  NEXT_THEME_LABEL,
  nextTheme,
  themeToggleLabel,
  useDensity,
  useTheme,
} from "@/lib/theme";
import { useShellState } from "./shell-state";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mode = NEXT_THEME_LABEL[(theme ?? "dark") as keyof typeof NEXT_THEME_LABEL] ?? "dark";
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={themeToggleLabel(theme)}
          data-key="theme-cycle"
          onClick={() => setTheme(nextTheme(theme))}
          className="size-9"
        >
          <Icon className="size-4" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Theme: {mode} → {NEXT_THEME_LABEL[nextTheme(theme)]}</TooltipContent>
    </Tooltip>
  );
}

function DensityToggle() {
  const { density, toggleDensity } = useDensity();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Density: ${density}. Activate for ${density === "comfortable" ? "compact" : "comfortable"} rows`}
          data-key="density-toggle"
          onClick={toggleDensity}
          className="size-9"
        >
          <span className="flex flex-col gap-[3px]" aria-hidden="true">
            <span className="block h-[2px] w-4 rounded-full bg-current" />
            <span className="block h-[2px] w-4 rounded-full bg-current" />
            <span className="block h-[2px] w-4 rounded-full bg-current" />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Density: {density} → {density === "comfortable" ? "compact" : "comfortable"}
      </TooltipContent>
    </Tooltip>
  );
}

/** SB-19 — synced (still, success) is the only real state until M8. */
function SyncDot() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex size-9 items-center justify-center" tabIndex={0}>
          <span className="pmx-sync-dot" aria-hidden="true" />
          <span role="status" aria-label="Synced" className="sr-only">
            Synced
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>Synced · live</TooltipContent>
    </Tooltip>
  );
}

/** SB-16 — never a real input: one search surface, always the palette. */
function SearchTrigger() {
  const { openPalette } = useShellState();
  return (
    <button
      type="button"
      aria-label="Command palette (Ctrl K)"
      data-key="/"
      onClick={() => openPalette("search")}
      className="hidden h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground hover:bg-accent md:flex"
    >
      <Search className="size-4" aria-hidden="true" />
      <span className="flex-1 text-left">Search…</span>
      <Kbd>/</Kbd>
    </button>
  );
}

export function Topbar() {
  const { pathname } = useLocation();
  const session = useSession();
  const crumbs = crumbsFor(pathname, session.activeWorkspace?.name ?? "Prodmax");
  const { openNewIssue } = useShellState();

  return (
    <header
      className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-2 md:px-4"
      data-topbar
    >
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2 text-sm">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-2">
                {i > 0 ? (
                  <span className="text-muted-foreground/60" aria-hidden="true">
                    /
                  </span>
                ) : null}
                {last || crumb.to === null ? (
                  <span className="truncate font-medium text-foreground" aria-current={last ? "page" : undefined}>
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.to}
                    className="truncate text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <SearchTrigger />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="New issue"
            data-key="c"
            onClick={() => openNewIssue()}
            className="size-9"
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New issue</TooltipContent>
      </Tooltip>
      <div className="flex items-center gap-1">
        <SyncDot />
        <DensityToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
