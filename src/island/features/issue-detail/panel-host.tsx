/**
 * S-12 panel: portals into `pmx-panel-slot` when `?issue=` is set.
 * Esc closes, restores focus to the originating row, and drops the param.
 */
import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "@island/app/session";
import { useShellState } from "@island/components/shell/shell-state";
import { IssueBody } from "./issue-body";

const ORIGIN_ATTR = "data-identifier";

function restoreRowFocus(identifier: string): void {
  const row = document.querySelector<HTMLElement>(`[${ORIGIN_ATTR}="${CSS.escape(identifier)}"]`);
  const target = row?.querySelector<HTMLElement>("a") ?? row;
  target?.focus();
}

export function IssuePanelHost() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const identifier = params.get("issue");
  const wsId = session.activeWorkspace?.id ?? null;
  const userId = session.user?.id ?? "";
  const fullPage = /^\/issue\//.test(location.pathname);
  const { createOpen, setPanelOpen } = useShellState();
  const open = Boolean(identifier) && !fullPage;

  const close = useCallback(() => {
    if (!identifier) return;
    const next = new URLSearchParams(params);
    next.delete("issue");
    const search = next.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
    restoreRowFocus(identifier);
  }, [identifier, params, navigate, location.pathname]);

  useEffect(() => {
    setPanelOpen(open);
    return () => setPanelOpen(false);
  }, [open, setPanelOpen]);

  useEffect(() => {
    const slot = document.querySelector<HTMLElement>("[data-panel-slot]");
    if (!slot) return;
    slot.setAttribute("aria-hidden", open ? "false" : "true");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (createOpen) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, createOpen, close]);

  if (!identifier || !wsId || fullPage) return null;
  const slot = typeof document !== "undefined" ? document.querySelector("[data-panel-slot]") : null;
  const panel = (
    <aside
      className="pmx-panel-slide flex h-full w-full flex-col border-l bg-card shadow-lg"
      role="complementary"
      aria-label="Issue details"
      data-issue-panel
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !createOpen) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <IssueBody
        wsId={wsId}
        userId={userId}
        identifier={identifier}
        onClose={close}
        variant="panel"
        redirectedFrom={identifier}
      />
    </aside>
  );
  return slot ? createPortal(panel, slot) : panel;
}
