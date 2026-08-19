/**
 * Projects, milestones and project-updates client (architecture §3.5).
 *
 * Note the wsId asymmetry, which is real and not an oversight here: the
 * project and update routes take `?wsId=`, while the milestone routes resolve
 * the workspace from the row itself and reject an unknown id with 404.
 */
import { apiDelete, apiGet, apiPatch, apiPost } from "@island/app/api";
import type {
  CreateProjectBody,
  MilestoneDto,
  Page,
  PatchProjectBody,
  ProjectDto,
  ProjectUpdateDto,
  UpdateHealth,
} from "./types";

const q = encodeURIComponent;

export function listProjects(wsId: string, archived?: boolean): Promise<Page<ProjectDto>> {
  const params = new URLSearchParams({ wsId });
  if (archived !== undefined) params.set("archived", String(archived));
  return apiGet<Page<ProjectDto>>(`/api/projects?${params.toString()}`);
}

export function getProject(wsId: string, id: string): Promise<{ project: ProjectDto }> {
  return apiGet<{ project: ProjectDto }>(`/api/projects/${q(id)}?wsId=${q(wsId)}`);
}

export function createProject(wsId: string, body: CreateProjectBody): Promise<{ project: ProjectDto }> {
  return apiPost<{ project: ProjectDto }>(`/api/projects?wsId=${q(wsId)}`, body);
}

export function patchProject(
  wsId: string,
  id: string,
  body: PatchProjectBody,
): Promise<{ project: ProjectDto }> {
  return apiPatch<{ project: ProjectDto }>(`/api/projects/${q(id)}?wsId=${q(wsId)}`, body);
}

export function trashProject(wsId: string, id: string): Promise<{ project: ProjectDto }> {
  return apiDelete<{ project: ProjectDto }>(`/api/projects/${q(id)}?wsId=${q(wsId)}`);
}

/** Workspace comes from the project row, so these four carry no wsId. */
export function listMilestones(projectId: string): Promise<Page<MilestoneDto>> {
  return apiGet<Page<MilestoneDto>>(`/api/projects/${q(projectId)}/milestones`);
}

export function createMilestone(
  projectId: string,
  body: { name: string; targetDate?: string | null },
): Promise<{ milestone: MilestoneDto }> {
  return apiPost<{ milestone: MilestoneDto }>(`/api/projects/${q(projectId)}/milestones`, body);
}

export function patchMilestone(
  id: string,
  body: { name?: string; targetDate?: string | null; position?: string },
): Promise<{ milestone: MilestoneDto }> {
  return apiPatch<{ milestone: MilestoneDto }>(`/api/milestones/${q(id)}`, body);
}

export function trashMilestone(id: string): Promise<{ milestone: MilestoneDto }> {
  return apiDelete<{ milestone: MilestoneDto }>(`/api/milestones/${q(id)}`);
}

export function listUpdates(
  wsId: string,
  projectId: string,
  cursor?: string | null,
): Promise<Page<ProjectUpdateDto>> {
  const params = new URLSearchParams({ wsId });
  if (cursor) params.set("cursor", cursor);
  return apiGet<Page<ProjectUpdateDto>>(`/api/projects/${q(projectId)}/updates?${params.toString()}`);
}

/**
 * `progressSnapshot` is deliberately not sent: the server snapshots the
 * project's materialized progress_cache at post time, which is the number the
 * update is a report about. A client-computed value could disagree with it.
 */
export function postUpdate(
  wsId: string,
  projectId: string,
  body: { health: UpdateHealth; bodyMd: string },
): Promise<{ update: ProjectUpdateDto }> {
  return apiPost<{ update: ProjectUpdateDto }>(
    `/api/projects/${q(projectId)}/updates?wsId=${q(wsId)}`,
    body,
  );
}

export function deleteUpdate(wsId: string, id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/project-updates/${q(id)}?wsId=${q(wsId)}`);
}
