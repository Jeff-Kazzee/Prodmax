/**
 * Command palette (§7; FM-041; AT-037): Cmd/Ctrl+K, `/` search mode,
 * keyboard-native (cmdk), focus-trapped dialog. Only real commands —
 * navigation, theme/density/sidebar toggles, workspace switch, help, sign out.
 * Recents surface on the empty query (localStorage, last 8).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronsUpDown,
  CircleCheckBig,
  CircleDot,
  Inbox,
  Keyboard,
  LayoutGrid,
  LogOut,
  PanelLeft,
  Rows3,
  Search,
  Settings,
  SunMoon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@island/components/ui/command";
import { Kbd } from "@island/components/ui/kbd";
import { PRIMARY_NAV } from "./nav-items";
import { useSession } from "@island/app/session";
import { useDensity, useTheme, nextTheme } from "@/lib/theme";
import { useShellState } from "./shell-state";
import { toastOk } from "@island/app/toast";

const RECENTS_KEY = "pmx-palette-recents";

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as string[]).slice(0, 8) : [];
  } catch {
    return [];
  }
}

const EXTRA_NAV = [
  { id: "nav-projects", label: "Projects", path: "/projects", icon: LayoutGrid },
  { id: "nav-cycle", label: "Current cycle", path: "/cycle/current", icon: CircleDot },
  { id: "nav-triage", label: "Triage", path: "/triage", icon: Inbox },
  { id: "nav-archive", label: "Archive", path: "/archive", icon: CircleCheckBig },
  { id: "nav-search", label: "Search", path: "/search", icon: Search },
  { id: "nav-settings", label: "Settings", path: "/settings/profile", icon: Settings },
] as const;

export function CommandPalette() {
  const session = useSession();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { density, toggleDensity } = useDensity();
  const {
    paletteOpen,
    paletteMode,
    openPalette,
    closePalette,
    collapsed,
    toggleCollapsed,
    setHelpOpen,
  } = useShellState();
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    if (paletteOpen) setRecents(readRecents());
    else setQuery("");
  }, [paletteOpen]);

  const remember = useCallback((id: string) => {
    const next = [id, ...readRecents().filter((r) => r !== id)].slice(0, 8);
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      // storage disabled — recents stay session-only
    }
  }, []);

  const run = useCallback(
    (id: string, action: () => void) => {
      remember(id);
      action();
      closePalette();
    },
    [closePalette, remember],
  );

  const go = useCallback(
    (id: string, path: string) => run(id, () => navigate(path)),
    [navigate, run],
  );

  const onSignOut = useCallback(() => {
    run("action-signout", () => {
      void session.logout().then(() => {
        toastOk("Signed out");
        navigate("/login", { replace: true });
      });
    });
  }, [navigate, run, session]);

  const emptyQuery = query.trim().length === 0;

  const navItems = useMemo(
    () => [
      ...PRIMARY_NAV.map((n) => ({
        id: `nav-${n.id}`,
        label: n.label,
        path: n.path,
        icon: n.icon,
        shortcut: n.id === "home" ? "G H" : undefined,
      })),
      ...EXTRA_NAV.map((n) => ({ ...n, shortcut: undefined })),
    ],
    [],
  );

  const byId = useMemo(() => {
    const map = new Map<string, { label: string; action: () => void }>();
    for (const n of navItems) map.set(n.id, { label: n.label, action: () => go(n.id, n.path) });
    map.set("action-theme", { label: "Cycle theme", action: () => setTheme(nextTheme(theme)) });
    map.set("action-density", {
      label: `Density: ${density} → ${density === "comfortable" ? "compact" : "comfortable"}`,
      action: toggleDensity,
    });
    map.set("action-sidebar", {
      label: collapsed ? "Expand sidebar" : "Collapse sidebar",
      action: toggleCollapsed,
    });
    map.set("action-help", { label: "Keyboard shortcuts", action: () => setHelpOpen(true) });
    map.set("action-signout", { label: "Sign out", action: onSignOut });
    return map;
  }, [navItems, go, setTheme, theme, density, toggleDensity, collapsed, toggleCollapsed, setHelpOpen, onSignOut]);

  return (
    <CommandDialog
      open={paletteOpen}
      onOpenChange={(open) => (open ? openPalette(paletteMode) : closePalette())}
      title="Command palette"
      description="Search or run a command"
      showCloseButton={false}
      className="top-[12vh] w-[calc(100%-2rem)] translate-y-0 gap-0 sm:max-w-[640px]"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={paletteMode === "search" ? "Search…" : "Search or run a command…"}
      />
      <CommandList>
        <CommandEmpty>No matches for '{query}'.</CommandEmpty>
        {emptyQuery && recents.length > 0 ? (
          <CommandGroup heading="Recent">
            {recents
              .map((id) => ({ id, item: byId.get(id) }))
              .filter((r): r is { id: string; item: { label: string; action: () => void } } => r.item !== undefined)
              .map(({ id, item }) => (
                <CommandItem key={id} onSelect={() => run(id, item.action)}>
                  {item.label}
                </CommandItem>
              ))}
          </CommandGroup>
        ) : null}
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem key={item.id} onSelect={() => go(item.id, item.path)}>
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
              {item.shortcut ? (
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {item.shortcut}
                </span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
        {session.workspaces.length > 1 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch workspace">
              {session.workspaces.map((ws) => (
                <CommandItem
                  key={ws.id}
                  value={`switch-workspace ${ws.name}`}
                  onSelect={() =>
                    run(`ws-${ws.id}`, () => {
                      if (ws.id !== session.activeWorkspace?.id) {
                        session.switchWorkspace(ws.id);
                        toastOk(`Switched to ${ws.name}`);
                      }
                    })
                  }
                >
                  <ChevronsUpDown className="size-4" aria-hidden="true" />
                  {ws.name}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {ws.role}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run("action-theme", () => setTheme(nextTheme(theme)))}>
            <SunMoon className="size-4" aria-hidden="true" />
            Cycle theme
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {theme ?? "dark"} → {nextTheme(theme)}
            </span>
          </CommandItem>
          <CommandItem onSelect={() => run("action-density", toggleDensity)}>
            <Rows3 className="size-4" aria-hidden="true" />
            Toggle density
            <span className="ml-auto font-mono text-xs text-muted-foreground">{density}</span>
          </CommandItem>
          <CommandItem onSelect={() => run("action-sidebar", toggleCollapsed)}>
            <PanelLeft className="size-4" aria-hidden="true" />
            {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            <span className="ml-auto font-mono text-xs text-muted-foreground">⌘\</span>
          </CommandItem>
          <CommandItem onSelect={() => run("action-help", () => setHelpOpen(true))}>
            <Keyboard className="size-4" aria-hidden="true" />
            Keyboard shortcuts
            <span className="ml-auto font-mono text-xs text-muted-foreground">?</span>
          </CommandItem>
          <CommandItem onSelect={onSignOut}>
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> select
        </span>
        <span className="flex items-center gap-1">
          <Kbd>esc</Kbd> close
        </span>
      </div>
    </CommandDialog>
  );
}
