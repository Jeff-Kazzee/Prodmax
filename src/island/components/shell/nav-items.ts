/**
 * Primary navigation surfaces shared by the sidebar, rail, bottom nav,
 * palette and G-prefix navigation (ux-spec §3.2 SB-06 rail set).
 */
import {
  CircleDot,
  Home,
  Inbox,
  LayoutGrid,
  Sparkles,
  BookOpen,
  ChartNoAxesColumn,
  CircleCheckBig,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { id: "home", label: "Home", path: "/", icon: Home },
  { id: "inbox", label: "Inbox", path: "/inbox", icon: Inbox },
  { id: "my-issues", label: "My issues", path: "/my-issues", icon: CircleCheckBig },
  { id: "all-issues", label: "All issues", path: "/issues", icon: CircleDot },
  { id: "docs", label: "Docs", path: "/docs", icon: BookOpen },
  { id: "insights", label: "Insights", path: "/insights", icon: ChartNoAxesColumn },
  { id: "ai", label: "AI", path: "/ai", icon: Sparkles },
] as const;

export const MORE_NAV: readonly NavItem[] = [
  { id: "projects", label: "Projects", path: "/projects", icon: LayoutGrid },
  {
    id: "cycle",
    label: "Current cycle",
    path: "/cycle/current",
    icon: CircleDot,
  },
  { id: "triage", label: "Triage", path: "/triage", icon: Inbox },
] as const;

export function navByPath(pathname: string): NavItem | undefined {
  return PRIMARY_NAV.find((n) => (n.path === "/" ? pathname === "/" : pathname.startsWith(n.path)));
}
