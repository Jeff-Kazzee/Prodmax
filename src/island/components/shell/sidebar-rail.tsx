/**
 * Sidebar rail (SB-06 collapsed state): 48px icon column — primary nav
 * icons with tooltips + SR names, then team key tiles (2-letter mono).
 */
import { NavLink } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@island/components/ui/tooltip";
import { PRIMARY_NAV } from "./nav-items";
import { useShellState } from "./shell-state";
import { useTeamsData } from "./use-workspace-data";

export function SidebarRail({ onExpand }: { onExpand?: () => void }) {
  const { setCollapsed } = useShellState();
  const { teams } = useTeamsData();

  const expand = () => (onExpand ? onExpand() : setCollapsed(false));

  return (
    <div className="pmx-sidebar-rail p-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Expand sidebar"
            data-key="mod+\\"
            onClick={expand}
            className="flex h-9 w-full items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Expand sidebar · ⌘\</TooltipContent>
      </Tooltip>

      <nav aria-label="Workspace sections" className="mt-1 flex flex-col items-stretch">
        {PRIMARY_NAV.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <NavLink
                to={item.path}
                end={item.path === "/"}
                aria-label={item.label}
                className={({ isActive }) =>
                  `flex h-9 w-full items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground ${isActive ? "bg-accent text-foreground" : ""}`
                }
              >
                <item.icon className="size-4" aria-hidden="true" />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      {teams && teams.length > 0 ? (
        <div role="group" aria-label="Teams" className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {teams.map((team) => (
            <Tooltip key={team.id}>
              <TooltipTrigger asChild>
                <NavLink
                  to={`/team/${team.key}/all`}
                  className="flex h-7 w-full items-center justify-center rounded-md font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {team.key.slice(0, 2)}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">
                {team.key} · {team.name}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
