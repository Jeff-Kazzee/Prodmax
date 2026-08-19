/**
 * New project dialog for R-17. Only the fields the create endpoint accepts,
 * so nothing here is a control that the server would ignore.
 */
import { useState } from "react";
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
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from "./types";

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; status: ProjectStatus }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("backlog");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const submit = async () => {
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    try {
      await onCreate({ name: trimmed, status });
      setName("");
      setStatus("backlog");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setName("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Name it now. Lead, dates and colour are editable on the project itself.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pj-new-name">Project name</Label>
            <Input
              id="pj-new-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pj-new-status">Status</Label>
            <select
              id="pj-new-status"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={trimmed.length === 0 || busy} onClick={() => void submit()}>
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
