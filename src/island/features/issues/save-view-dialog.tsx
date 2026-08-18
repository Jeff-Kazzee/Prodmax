/** SV-02 save-as dialog. */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@island/components/ui/dialog";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import { Label } from "@island/components/ui/label";
import type { IssueLayout } from "./types";

export function SaveViewDialog({
  open,
  defaultName,
  defaultLayout,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  defaultName: string;
  defaultLayout: IssueLayout;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { name: string; scope: "workspace" | "team" | "project"; layout: IssueLayout; favorite: boolean }) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [scope, setScope] = useState<"workspace" | "team" | "project">("workspace");
  const [layout, setLayout] = useState<IssueLayout>(defaultLayout);
  const [favorite, setFavorite] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="view-name">Name</Label>
            <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Scope
            <select
              aria-label="View scope"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value as "workspace" | "team" | "project")}
            >
              <option value="workspace">Workspace</option>
              <option value="team">Team</option>
              <option value="project">Project</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Layout
            <select
              aria-label="Default layout"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={layout}
              onChange={(e) => setLayout(e.target.value as IssueLayout)}
            >
              <option value="list">List</option>
              <option value="board">Board</option>
              <option value="table">Table</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
            Favorite
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) return;
              onSave({ name: name.trim(), scope, layout, favorite });
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
