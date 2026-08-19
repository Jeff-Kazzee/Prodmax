/**
 * Sidebar (§3.2): workspace switcher, primary nav, teams section,
 * collapse toggle (SB-06), resize handle (SB-09, 200–320px, persisted),
 * footer user card with sign-out. Favorites/Pages/Recents belong to later
 * modules and are deliberately absent.
 */
import { useCallback, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut, PanelLeftClose, Settings } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@island/components/ui/tooltip";
import { MORE_NAV, PRIMARY_NAV } from "./nav-items";
import { TeamsSection } from "./teams-section";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useTeamsData } from "./use-workspace-data";
import { useShellState } from "./shell-state";
import { useSession } from "@island/app/session";
import { toastOk } from "@island/app/toast";

/** SB-09: drag to resize, double-click resets to the 240px default. */
function ResizeHandle() {
  const { sidebarWidth, setSidebarWidth } = useShellState();
  const [dragging, setDragging] = useState(false);
  const frame = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      const startX = e.clientX;
      const startW = sidebarWidth;
      const onMove = (ev: PointerEvent) => {
        window.cancelAnimationFrame(frame.current);
        frame.current = window.requestAnimationFrame(() => {
          setSidebarWidth(startW + (ev.clientX - startX));
        });
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setSidebarWidth, sidebarWidth],
  );

  return (
    <div
      className="pmx-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      data-dragging={dragging}
      onPointerDown={onPointerDown}
      onDoubleClick={() => setSidebarWidth(240)}
    />
  );
}

export function Sidebar({ onCollapse }: { onCollapse?: () => void }) {
  const session = useSession();
  const navigate = useNavigate();
  const { collapsed, setCollapsed, sidebarWidth } = useShellState();
  const { teams, error, statesByTeam, loadStates } = useTeamsData();

  const collapse = () => (onCollapse ? onCollapse() : setCollapsed(true));

  const onLogout = async () => {
    await session.logout();
    toastOk("Signed out");
    navigate("/login", { replace: true });
  };

  return (
    <div className="pmx-sidebar relative" style={{ width: sidebarWidth }}>
      <div className="relative flex items-center gap-1 p-2">
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-key="mod+\\"
              onClick={collapse}
              className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <PanelLeftClose className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Toggle sidebar · ⌘\</TooltipContent>
        </Tooltip>
      </div>

      <nav aria-label="Workspace sections" className="flex-1 overflow-y-auto px-2 pb-2">
        <ul>
          {/*
            MORE_NAV joins the sidebar with T-006: Projects and Current cycle
            are live screens now, and until this they reached the sidebar
            nowhere. Only the mobile bottom nav and the palette listed them.
          */}
          {[...PRIMARY_NAV, ...MORE_NAV].map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground ${isActive ? "bg-accent text-foreground" : ""}`
                }
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-2">
          <TeamsSection
            teams={teams}
            error={error}
            statesByTeam={statesByTeam}
            onExpand={loadStates}
          />
        </div>
      </nav>

      <div className="border-t border-border p-2">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border bg-secondary font-mono text-[10px] text-secondary-foreground">
            {(session.user?.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs">{session.user?.name}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/settings/profile"
                aria-label="Settings"
                className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Settings className="size-4" aria-hidden="true" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Sign out"
                onClick={() => void onLogout()}
                className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ResizeHandle />
    </div>
  );
}
