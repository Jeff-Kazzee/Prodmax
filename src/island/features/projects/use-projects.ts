/**
 * Data hooks for S-15. One hook per screen, composed from per-resource
 * fetchers, each in the `{data, loading, error, reload}` shape `useIssuesList`
 * established.
 *
 * Refresh choreography is explicit rather than cache-driven, because this
 * codebase has no query cache. Every mutation names what it can move:
 * posting an update also re-reads the project, because `lastUpdateAt` and the
 * header health chip are derived server-side. Issue writes anywhere in the app
 * come through the `onIssuesChanged` bus, which is what advances the
 * materialized progress counters after the Issues tab changes a state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@island/app/api";
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
  const seq = useRef(0);

  const reloadProject = useCallback(async () => {
    if (!wsId || !projectId) return;
    const my = ++seq.current;
    try {
      const res = await getProject(wsId, projectId);
      if (my !== seq.current) return;
      setProject(res.project);
      setStatus("ready");
    } catch (err) {
      if (my !== seq.current) return;
      setStatus(err instanceof ApiError && err.code === "NOT_FOUND" ? "missing" : "error");
    }
  }, [wsId, projectId]);

  const reloadMilestones = useCallback(async () => {
    if (!projectId) return;
    try {
      const page = await listMilestones(projectId);
      setMilestones(page.data);
    } catch {
      setMilestones([]);
    }
  }, [projectId]);

  const reloadUpdates = useCallback(async () => {
    if (!wsId || !projectId) return;
    try {
      const page = await listUpdates(wsId, projectId);
      setUpdates(page.data);
      setUpdatesCursor(page.nextCursor);
    } catch {
      setUpdates([]);
      setUpdatesCursor(null);
    }
  }, [wsId, projectId]);

  const loadMoreUpdates = useCallback(async () => {
    if (!wsId || !projectId || !updatesCursor) return;
    const page = await listUpdates(wsId, projectId, updatesCursor);
    setUpdates((prev) => [...prev, ...page.data]);
    setUpdatesCursor(page.nextCursor);
  }, [wsId, projectId, updatesCursor]);

  useEffect(() => {
    setStatus("loading");
    setProject(null);
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
