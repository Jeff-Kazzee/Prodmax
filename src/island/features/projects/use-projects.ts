/**
 * Data hooks for S-15. One hook per screen, composed from per-resource
 * fetchers, each in the `{data, loading, error, reload}` shape `useIssuesList`
 * established.
 *
 * Refresh choreography is explicit rather than cache-driven, because this
 * codebase has no query cache. Every mutation names what it can move: posting
 * an update also re-reads the project, because `lastUpdateAt` and the header
 * health chip are derived server-side.
 *
 * On the `onIssuesChanged` bus, precisely. It fires for issue CREATE, from the
 * new-issue modal and from this feature's own picker. It does NOT fire when an
 * issue's state changes, because `useIssuesList.optimisticPatch` and the detail
 * panel never call it, and that is the write which moves `progress_cache`. So
 * the bus alone does not keep this screen current, and `ProjectScreen` re-reads
 * the project row whenever the Overview section is entered. Wiring the bus into
 * the issue write path belongs to whoever owns `features/issues` (T-030).
 *
 * A failed read is never rendered as an empty one. "No updates yet" on a 500
 * is a false statement about the project, and it is the statement the header's
 * health chip is derived from.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@island/app/api";
import { toastApiError } from "@island/app/toast";
import { onIssuesChanged } from "@island/features/issue-create/commands";
import {
  createMilestone as apiCreateMilestone,
  deleteUpdate as apiDeleteUpdate,
  getProject,
  listMilestones,
  listProjects,
  listUpdates,
  patchMilestone as apiPatchMilestone,
  patchProject,
  postUpdate,
  trashMilestone as apiTrashMilestone,
} from "./api";
import type {
  MilestoneDto,
  PatchProjectBody,
  ProjectDto,
  ProjectUpdateDto,
  UpdateHealth,
} from "./types";

export type LoadStatus = "loading" | "ready" | "missing" | "error";

export interface ProjectsList {
  projects: ProjectDto[];
  status: LoadStatus;
  reload: () => void;
}

/** R-17. Server position order is preserved; grouping happens in the screen. */
export function useProjectsList(wsId: string | null): ProjectsList {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const load = useCallback(async () => {
    if (!wsId) return;
    setStatus("loading");
    try {
      const page = await listProjects(wsId);
      setProjects(page.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [wsId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { projects, status, reload: () => void load() };
}

export interface ProjectScreenState {
  project: ProjectDto | null;
  status: LoadStatus;
  milestones: MilestoneDto[];
  updates: ProjectUpdateDto[];
  updatesCursor: string | null;
  /** True when the last read failed, so the UI says so instead of "none". */
  milestonesFailed: boolean;
  updatesFailed: boolean;
  reloadProject: () => Promise<void>;
  reloadMilestones: () => Promise<void>;
  reloadUpdates: () => Promise<void>;
  loadMoreUpdates: () => Promise<void>;
  patchProject: (body: PatchProjectBody) => Promise<void>;
  createMilestone: (name: string, targetDate: string | null) => Promise<void>;
  renameMilestone: (id: string, name: string) => Promise<void>;
  trashMilestone: (id: string) => Promise<void>;
  postUpdate: (health: UpdateHealth, bodyMd: string) => Promise<void>;
  deleteUpdate: (id: string) => Promise<void>;
}

/**
 * R-18. The project row loads on every mount and after any issue write, so the
 * materialized counters the header renders stay current without ever scanning
 * issues. Milestones and updates load alongside it: both lists are small, and
 * the header needs the latest update's health before the Updates tab is ever
 * opened.
 */
export function useProjectScreen(wsId: string | null, projectId: string): ProjectScreenState {
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [milestones, setMilestones] = useState<MilestoneDto[]>([]);
  const [updates, setUpdates] = useState<ProjectUpdateDto[]>([]);
  const [updatesCursor, setUpdatesCursor] = useState<string | null>(null);
  const [milestonesFailed, setMilestonesFailed] = useState(false);
  const [updatesFailed, setUpdatesFailed] = useState(false);
  // One counter PER resource. A single shared counter would make the three
  // mount-time loads cancel each other: project takes 1, milestones takes 2,
  // and project then sees 1 !== 2 and discards its own response.
  const projectSeq = useRef(0);
  const milestoneSeq = useRef(0);
  const updateSeq = useRef(0);

  const reloadProject = useCallback(async () => {
    if (!wsId || !projectId) return;
    const my = ++projectSeq.current;
    try {
      const res = await getProject(wsId, projectId);
      if (my !== projectSeq.current) return;
      setProject(res.project);
      setStatus("ready");
    } catch (err) {
      if (my !== projectSeq.current) return;
      setStatus(err instanceof ApiError && err.code === "NOT_FOUND" ? "missing" : "error");
    }
  }, [wsId, projectId]);

  const reloadMilestones = useCallback(async () => {
    if (!projectId) return;
    const my = ++milestoneSeq.current;
    try {
      const page = await listMilestones(projectId);
      if (my !== milestoneSeq.current) return;
      setMilestones(page.data);
      setMilestonesFailed(false);
    } catch {
      if (my !== milestoneSeq.current) return;
      // Keep whatever is on screen and say the read failed. Emptying the list
      // would tell the user this project has no milestones, which is a claim
      // about their data made out of a network error.
      setMilestonesFailed(true);
    }
  }, [projectId]);

  const reloadUpdates = useCallback(async () => {
    if (!wsId || !projectId) return;
    const my = ++updateSeq.current;
    try {
      const page = await listUpdates(wsId, projectId);
      if (my !== updateSeq.current) return;
      setUpdates(page.data);
      setUpdatesCursor(page.nextCursor);
      setUpdatesFailed(false);
    } catch {
      if (my !== updateSeq.current) return;
      setUpdatesFailed(true);
    }
  }, [wsId, projectId]);

  const loadMoreUpdates = useCallback(async () => {
    if (!wsId || !projectId || !updatesCursor) return;
    try {
      const page = await listUpdates(wsId, projectId, updatesCursor);
      setUpdates((prev) => [...prev, ...page.data]);
      setUpdatesCursor(page.nextCursor);
    } catch (err) {
      // Without this the button is a click that produces an unhandled
      // rejection and no feedback at all.
      toastApiError(err);
    }
  }, [wsId, projectId, updatesCursor]);

  useEffect(() => {
    setStatus("loading");
    setProject(null);
    // A different project's rows must not linger under the new header.
    setMilestones([]);
    setUpdates([]);
    setUpdatesCursor(null);
    void reloadProject();
    void reloadMilestones();
    void reloadUpdates();
  }, [reloadProject, reloadMilestones, reloadUpdates]);

  // An issue write anywhere moves the materialized counters, so re-read the
  // project row. Milestone progress is derived per read, so it moves too.
  useEffect(() => {
    return onIssuesChanged(() => {
      void reloadProject();
      void reloadMilestones();
    });
  }, [reloadProject, reloadMilestones]);

  return {
    project,
    status,
    milestones,
    updates,
    updatesCursor,
    milestonesFailed,
    updatesFailed,
    reloadProject,
    reloadMilestones,
    reloadUpdates,
    loadMoreUpdates,
    patchProject: async (body) => {
      if (!wsId) return;
      const res = await patchProject(wsId, projectId, body);
      setProject(res.project);
    },
    createMilestone: async (name, targetDate) => {
      await apiCreateMilestone(projectId, { name, targetDate });
      await reloadMilestones();
    },
    renameMilestone: async (id, name) => {
      await apiPatchMilestone(id, { name });
      await reloadMilestones();
    },
    trashMilestone: async (id) => {
      await apiTrashMilestone(id);
      await reloadMilestones();
    },
    postUpdate: async (health, bodyMd) => {
      if (!wsId) return;
      await postUpdate(wsId, projectId, { health, bodyMd });
      // The project row carries the derived lastUpdateAt the header reads.
      await Promise.all([reloadUpdates(), reloadProject()]);
    },
    deleteUpdate: async (id) => {
      if (!wsId) return;
      await apiDeleteUpdate(wsId, id);
      await Promise.all([reloadUpdates(), reloadProject()]);
    },
  };
}
