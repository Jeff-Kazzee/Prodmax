/**
 * Client-side project shapes consumed by S-15 (R-17/R-18/R-19).
 * Mirrors the T-005 payloads (architecture §3.5) without importing the
 * service layer into the island.
 *
 * `progressPointsCache` is deliberately absent: the server also puts the raw
 * JSON string on the wire, and nothing on the client may parse it. The parsed
 * `progressPoints` is the only counts source, and it is null whenever the
 * stored cache is legacy or malformed (§9, T-025).
 */

export type ProjectStatus = "backlog" | "planned" | "started" | "completed" | "canceled";
export type UpdateCadence = "off" | "daily" | "weekly" | "biweekly";
export type UpdateHealth = "on_track" | "at_risk" | "off_track";

/** The five project statuses in the order S-15 groups them. */
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "backlog",
  "planned",
  "started",
  "completed",
  "canceled",
] as const;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  backlog: "Backlog",
  planned: "Planned",
  started: "Started",
  completed: "Completed",
  canceled: "Canceled",
};

export const UPDATE_CADENCES: readonly UpdateCadence[] = [
  "off",
  "daily",
  "weekly",
  "biweekly",
] as const;

export const CADENCE_LABELS: Record<UpdateCadence, string> = {
  off: "Off",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every two weeks",
};

export const HEALTH_LABELS: Record<UpdateHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};

/** Materialized counters (§9). Never recomputed on read. */
export interface ProgressPoints {
  done: number;
  total: number;
  issuesDone: number;
  issuesTotal: number;
}

export interface ProjectDto {
  id: string;
  workspaceId: string;
  name: string;
  descriptionMd: string | null;
  status: ProjectStatus;
  leadId: string | null;
  /** YYYY-MM-DD. */
  targetStartDate: string | null;
  targetEndDate: string | null;
  color: string | null;
  briefPageId: string | null;
  position: string;
  /** Rounded percent 0-100. The only source the progress bar reads. */
  progressCache: number;
  /** null when the stored cache is legacy or malformed, so counts are unknown. */
  progressPoints: ProgressPoints | null;
  updateCadence: UpdateCadence;
  archivedAt: number | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Derived MAX(project_updates.created_at) (§2.4). */
  lastUpdateAt: number | null;
}

/** Derived on every read, never stored (§2.4). */
export interface MilestoneProgress {
  total: number;
  startedOrCompleted: number;
  completed: number;
  pointsTotal: number;
  pointsDone: number;
}

export interface MilestoneDto {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  targetDate: string | null;
  position: string;
  createdAt: number;
  deletedAt: number | null;
  progress: MilestoneProgress;
}

export interface ProjectUpdateDto {
  id: string;
  workspaceId: string;
  projectId: string;
  authorId: string;
  health: UpdateHealth;
  bodyMd: string;
  progressSnapshot: number | null;
  createdAt: number;
}

/** The three tabs that live on R-18. Issues is a route, not a `?tab=` value. */
export type ProjectTab = "overview" | "milestones" | "updates";

export interface CreateProjectBody {
  name: string;
  status?: ProjectStatus;
  leadId?: string | null;
  targetStartDate?: string | null;
  targetEndDate?: string | null;
  updateCadence?: UpdateCadence;
}

export interface PatchProjectBody {
  name?: string;
  descriptionMd?: string | null;
  status?: ProjectStatus;
  leadId?: string | null;
  targetStartDate?: string | null;
  targetEndDate?: string | null;
  color?: string | null;
  updateCadence?: UpdateCadence;
  archived?: boolean;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}
