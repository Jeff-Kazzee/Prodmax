/**
 * App shell layout (§3.1): CSS grid [sidebar | main | panel-slot], topbar,
 * independent scroll regions, skip link + ARIA landmarks (§3.5), auth gate
 * (AT-007), tablet overlay drawer + mobile bottom nav (§3.6), and the
 * global palette/help/keyboard layers.
 */
import { useEffect } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { Button } from "@island/components/ui/button";
import { Skeleton } from "@island/components/ui/skeleton";
import { useSession } from "@island/app/session";
import { crumbsFor } from "@island/app/routes";
import { Sidebar } from "./sidebar";
import { SidebarRail } from "./sidebar-rail";
import { Topbar } from "./topbar";
import { BottomNav } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { ShortcutsHelp } from "./shortcuts-help";
import { KeyboardLayer } from "./keyboard-layer";
import { useShellState } from "./shell-state";
import { useViewport } from "./use-viewport";
import { IssuePanelHost } from "@island/features/issue-detail";
import { IssueCreateHost } from "@island/features/issue-create";

function ShellSkeleton() {
  return (
    <div className="pmx-shell-grid" data-sidebar="full" aria-busy="true" aria-label="Loading">
      <div className="pmx-sidebar p-2">
        <Skeleton className="h-9 w-full" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-32" />
          ))}
        </div>
      </div>
      <div className="pmx-main-col">
        <div className="flex h-11 items-center border-b bg-card px-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-4 h-4 w-full max-w-md" />
        </div>
      </div>
    </div>
  );
}

function BootstrapError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold">Something broke on our bench. It's been logged.</h1>
      <Button onClick={onRetry}>Retry</Button>
      <Link to="/login" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}

/** Tablet drawer (768–1023): sidebar as overlay, scrim + Esc close. */
function TabletDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0" style={{ zIndex: "var(--z-sidebar)" }}>
      <div className="pmx-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="pmx-panel-slide-left absolute inset-y-0 left-0 max-w-[320px]"
        role="dialog"
        aria-modal="true"
        aria-label="Workspace navigation"
      >
        <Sidebar onCollapse={onClose} />
      </div>
    </div>
  );
}

export function ShellLayout() {
  const session = useSession();
  const { pathname, search } = useLocation();
  const viewport = useViewport();
  const { collapsed, drawerOpen, setDrawerOpen } = useShellState();

  if (session.status === "loading") return <ShellSkeleton />;
  if (session.status === "error") return <BootstrapError onRetry={() => void session.refresh()} />;
  if (session.status === "anon") {
    const next = encodeURIComponent(`${pathname}${search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const dataSidebar =
    viewport === "mobile" ? "hidden" : viewport === "tablet" || collapsed ? "rail" : "full";

  const title = crumbsFor(pathname, session.activeWorkspace?.name ?? "Prodmax").at(-1)?.label ?? "Prodmax";

  return (
    <>
      <a href="#main-content" className="pmx-skip-link rounded-md border bg-card px-3 py-2 text-sm">
        Skip to content
      </a>
      <div className="pmx-shell-grid" data-sidebar={dataSidebar}>
        <Sidebar />
        <SidebarRail
          onExpand={viewport === "tablet" ? () => setDrawerOpen(true) : undefined}
        />
        <div className="pmx-main-col">
          <Topbar />
          <main
            id="main-content"
            aria-label={title}
            className="pmx-content"
            tabIndex={-1}
          >
            <Outlet />
          </main>
          <BottomNav />
        </div>
      </div>

      {/* Issue panel slot: overlays content, never reflows (§3.1). */}
      <div className="pmx-panel-slot" data-panel-slot aria-hidden="true" />

      {viewport === "tablet" ? (
        <TabletDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      ) : null}

      <KeyboardLayer />
      <IssueCreateHost />
      <IssuePanelHost />
      <CommandPalette />
      <ShortcutsHelp />
    </>
  );
}
