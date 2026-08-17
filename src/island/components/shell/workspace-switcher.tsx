/**
 * SB-01 Workspace switcher: my workspaces (active check), switch silently
 * via ?wsId= (session cache drop + refetch happens in the session store),
 * workspace settings link, real create-workspace dialog (POST /api/workspaces).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@island/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@island/components/ui/dialog";
import { Input } from "@island/components/ui/input";
import { Label } from "@island/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@island/components/ui/popover";
import { Separator } from "@island/components/ui/separator";
import { useSession } from "@island/app/session";
import { apiPost } from "@island/app/api";
import { toastApiError, toastOk } from "@island/app/toast";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function WorkspaceSwitcher() {
  const session = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const active = session.activeWorkspace;

  const onSwitch = (wsId: string, wsName: string) => {
    if (wsId === active?.id) {
      setMenuOpen(false);
      return;
    }
    session.switchWorkspace(wsId);
    setMenuOpen(false);
    toastOk(`Switched to ${wsName}`);
  };

  const onCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await apiPost<{ workspace: { id: string; name: string } }>(
        "/api/workspaces",
        { name: newName.trim() },
      );
      await session.refresh();
      session.switchWorkspace(res.workspace.id);
      setCreateOpen(false);
      setNewName("");
      toastOk(`${res.workspace.name} is ready`, "Default team and workflow included.");
    } catch (err) {
      toastApiError(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            data-shell="workspace-switcher"
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label={`Workspace: ${active?.name ?? "none"}. Activate to switch.`}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border bg-secondary font-mono text-[10px] font-medium text-secondary-foreground">
              {active ? initials(active.name) : "—"}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {active?.name ?? "No workspace"}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workspaces
          </p>
          {session.workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              role="menuitemradio"
              aria-checked={ws.id === active?.id}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
              onClick={() => onSwitch(ws.id, ws.name)}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border bg-secondary font-mono text-[10px] text-secondary-foreground">
                {initials(ws.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{ws.name}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {ws.role}
                </span>
              </span>
              {ws.id === active?.id ? (
                <Check className="size-4 shrink-0" aria-hidden="true" />
              ) : null}
            </button>
          ))}
          <Separator className="my-1" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
            onClick={() => {
              setMenuOpen(false);
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Create workspace…
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
            onClick={() => {
              setMenuOpen(false);
              navigate("/settings/workspace");
            }}
          >
            <Check className="size-4 opacity-0" aria-hidden="true" />
            Workspace settings
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
            <DialogDescription>
              A default team and workflow come with it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-ws-name">Name</Label>
            <Input
              id="new-ws-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Acme Fabrication"
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onCreate()} disabled={!newName.trim() || creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
