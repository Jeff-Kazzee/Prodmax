/**
 * Mobile bottom nav (§3.6, <768): Home · Inbox · New · Docs · More.
 * "More" opens a bottom sheet with remaining surfaces + theme cycle.
 */
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { BookOpen, Home, Inbox, Menu, Plus, SunMoon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@island/components/ui/dialog";
import { MORE_NAV } from "./nav-items";
import { nextTheme, useTheme } from "@/lib/theme";
import { useShellState } from "./shell-state";

export function BottomNav() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { openNewIssue } = useShellState();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = [
    { id: "home", label: "Home", path: "/", icon: Home },
    { id: "inbox", label: "Inbox", path: "/inbox", icon: Inbox },
    { id: "docs", label: "Docs", path: "/docs", icon: BookOpen },
  ];

  return (
    <nav aria-label="Primary" className="pmx-bottom-nav h-14 items-stretch">
      {items.slice(0, 2).map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          end={item.path === "/"}
          className={({ isActive }) =>
            `flex min-w-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] ${isActive ? "text-foreground" : "text-muted-foreground"}`
          }
        >
          <item.icon className="size-5" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
      <button
        type="button"
        className="flex min-w-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] text-foreground"
        aria-label="New issue"
        onClick={() => openNewIssue()}
      >
        <Plus className="size-5" aria-hidden="true" />
        New
      </button>
      {items.slice(2).map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          end={item.path === "/"}
          className={({ isActive }) =>
            `flex min-w-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] ${isActive ? "text-foreground" : "text-muted-foreground"}`
          }
        >
          <item.icon className="size-5" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
      <button
        type="button"
        className="flex min-w-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground"
        aria-haspopup="dialog"
        onClick={() => setMoreOpen(true)}
      >
        <Menu className="size-5" aria-hidden="true" />
        More
      </button>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          className="top-auto bottom-0 left-1/2 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 translate-y-0 rounded-b-none pb-6"
          aria-describedby="more-sheet-desc"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>More</DialogTitle>
            <DialogDescription id="more-sheet-desc">
              Remaining surfaces
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col">
            {MORE_NAV.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setMoreOpen(false);
                    navigate(item.path);
                  }}
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  {item.label}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-accent"
                onClick={() => setTheme(nextTheme(theme))}
              >
                <SunMoon className="size-4" aria-hidden="true" />
                Cycle theme
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {theme ?? "dark"} → {nextTheme(theme)}
                </span>
              </button>
            </li>
          </ul>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
