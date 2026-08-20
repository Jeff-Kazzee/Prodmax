/**
 * Prodmax database schema — binding to planning/architecture.md §2.1–2.10.
 *
 * Conventions (architecture §2):
 * - PKs: `id TEXT` = UUIDv7 generated app-side (src/db/ids.ts), except
 *   activity_events and event_log which use INTEGER PRIMARY KEY AUTOINCREMENT.
 * - Timestamps: INTEGER Unix milliseconds. Dates: TEXT `YYYY-MM-DD`.
 * - Booleans: INTEGER 0/1. JSON payloads: TEXT containing JSON.
 * - Soft delete: deleted_at INTEGER NULL. Archive: archived_at INTEGER NULL.
 * - Every workspace-scoped row carries workspace_id (§7 scoping predicate).
 * - FKs: ON DELETE CASCADE unless noted (SET NULL where marked below).
 * - version INTEGER NOT NULL DEFAULT 1 on hot mutable entities (issues,
 *   pages, blocks) for optimistic concurrency.
 *
 * Composite FKs (parent workspace_id + id) are not expressible in Drizzle;
 * cross-workspace parenting is enforced in the service layer, backed by
 * src/db/scope.ts (assertWorkspaceScope).
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ meta */

/** Key/value store for schema-level metadata (schema_version, flags). */
export const meta = sqliteTable("_meta", {
  key: text("key").primaryKey(),
  value: text("value"),
});

/* ------------------------------------------------- §2.1 identity & access */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  avatarSeed: text("avatar_seed").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastSeenAt: integer("last_seen_at"),
}, (t) => [
  uniqueIndex("users_email_unique").on(t.email),
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // SHA-256 of cookie token; raw token never stored
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  revokedAt: integer("revoked_at"),
}, (t) => [
  index("sessions_user_id_idx").on(t.userId),
]);

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  settings: text("settings").notNull().default("{}"), // json
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  uniqueIndex("workspaces_slug_unique").on(t.slug),
  check("workspaces_slug_format", sql`slug GLOB '[a-z0-9-][a-z0-9-][a-z0-9-]*' AND length(slug) BETWEEN 3 AND 40`),
]);

export const workspaceMembers = sqliteTable("workspace_members", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  uniqueIndex("workspace_members_ws_user_unique").on(t.workspaceId, t.userId),
  index("workspace_members_workspace_id_idx").on(t.workspaceId),
  index("workspace_members_user_id_idx").on(t.userId),
  check("workspace_members_role_check", sql`role IN ('owner','admin','member','guest')`),
]);

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(), // tag only; no email is sent in v1
  role: text("role").notNull(),
  teamId: text("team_id").references((): AnySQLiteColumn => teams.id, {
    onDelete: "cascade",
  }), // required for guest invites (scope boundary)
  tokenHash: text("token_hash").notNull(), // SHA-256 of invite code
  createdBy: text("created_by").notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(), // 7 d
  acceptedAt: integer("accepted_at"),
  revokedAt: integer("revoked_at"),
}, (t) => [
  uniqueIndex("invites_token_hash_unique").on(t.tokenHash),
  index("invites_workspace_email_idx").on(t.workspaceId, t.email),
  check("invites_role_check", sql`role IN ('owner','admin','member','guest')`),
]);

/* --------------------------------------- §2.2 teams, workflow, labels */

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // identifier prefix, [A-Z][A-Z0-9]{1,5}
  name: text("name").notNull(),
  description: text("description"),
  timezone: text("timezone"), // falls back to workspace
  position: text("position").notNull(), // fractional index (sidebar order)
  defaultStateId: text("default_state_id").references((): AnySQLiteColumn => states.id),
  triageEnabled: integer("triage_enabled").notNull().default(0),
  triageStateId: text("triage_state_id").references((): AnySQLiteColumn => states.id),
  cyclesEnabled: integer("cycles_enabled").notNull().default(1),
  cycleLengthDays: integer("cycle_length_days").notNull().default(14),
  cycleStartDay: integer("cycle_start_day").notNull().default(1), // 0=Sun
  cooldownLengthDays: integer("cooldown_length_days").notNull().default(2),
  autoAddToCycle: integer("auto_add_to_cycle").notNull().default(0),
  nextCycleNumber: integer("next_cycle_number").notNull().default(1),
  estimateScale: text("estimate_scale").notNull().default("off"),
  estimateAllowZero: integer("estimate_allow_zero").notNull().default(0),
  autoArchiveDays: integer("auto_archive_days"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  archivedAt: integer("archived_at"),
}, (t) => [
  uniqueIndex("teams_ws_key_unique").on(t.workspaceId, t.key),
  check("teams_key_format", sql`key GLOB '[A-Z][A-Z0-9]*' AND length(key) BETWEEN 2 AND 6`),
  check("teams_estimate_scale_check", sql`estimate_scale IN ('off','linear','fibonacci','exponential','tshirt')`),
]);

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  uniqueIndex("team_members_team_user_unique").on(t.teamId, t.userId),
  index("team_members_user_id_idx").on(t.userId),
]);

export const states = sqliteTable("states", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  position: text("position").notNull(), // fractional; reorder within category only
  color: text("color"),
}, (t) => [
  uniqueIndex("states_team_name_unique").on(t.teamId, t.name),
  index("states_team_id_idx").on(t.teamId),
  check("states_category_check", sql`category IN ('backlog','unstarted','started','completed','canceled','triage')`),
]);

export const labelGroups = sqliteTable("label_groups", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: text("position").notNull(),
}, (t) => [
  uniqueIndex("label_groups_ws_name_unique").on(t.workspaceId, t.name),
]);

export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }), // NULL = workspace label
  name: text("name").notNull(),
  color: text("color"),
  description: text("description"),
  groupId: text("group_id").references(() => labelGroups.id, { onDelete: "set null" }),
  archivedAt: integer("archived_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("labels_workspace_id_idx").on(t.workspaceId),
  // (workspace_id, team_id, name) uniqueness enforced in service layer
  // (SQL NULL semantics make a composite unique index unreliable here).
]);

/* ----------------------------------------------------- §2.3 issues spine */

/** Identifier allocation (§2.10): one row per team, bumped transactionally. */
export const teamCounters = sqliteTable("team_counters", {
  teamId: text("team_id").primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  nextNumber: integer("next_number").notNull().default(1),
});

export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  identifier: text("identifier").notNull(), // e.g. PRO-123
  title: text("title").notNull(),
  descriptionMd: text("description_md").notNull().default(""), // markdown, not blocks (§2.3)
  stateId: text("state_id").notNull()
    .references(() => states.id),
  priority: integer("priority").notNull().default(0), // 0 none … 4 urgent
  estimate: integer("estimate"), // points per team scale
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  creatorId: text("creator_id").notNull()
    .references(() => users.id),
  projectId: text("project_id").references((): AnySQLiteColumn => projects.id, {
    onDelete: "set null",
  }),
  milestoneId: text("milestone_id").references((): AnySQLiteColumn => milestones.id, {
    onDelete: "set null",
  }),
  cycleId: text("cycle_id").references((): AnySQLiteColumn => cycles.id, {
    onDelete: "set null",
  }),
  parentId: text("parent_id").references((): AnySQLiteColumn => issues.id, {
    onDelete: "cascade",
  }), // sub-issues
  dueDate: text("due_date"), // YYYY-MM-DD
  position: text("position").notNull(), // fractional index (manual order, per team)
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  triagedAt: integer("triaged_at"),
  version: integer("version").notNull().default(1),
  archivedAt: integer("archived_at"),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  uniqueIndex("issues_ws_identifier_unique").on(t.workspaceId, t.identifier),
  index("issues_ws_team_number_idx").on(t.workspaceId, t.teamId, t.number),
  index("issues_ws_updated_idx").on(t.workspaceId, t.updatedAt),
  index("issues_assignee_idx").on(t.assigneeId),
  index("issues_state_idx").on(t.stateId),
  index("issues_project_idx").on(t.projectId),
  index("issues_cycle_idx").on(t.cycleId),
  index("issues_milestone_idx").on(t.milestoneId),
  index("issues_parent_idx").on(t.parentId),
  index("issues_ws_deleted_idx").on(t.workspaceId, t.deletedAt),
  index("issues_ws_priority_idx").on(t.workspaceId, t.priority),
  index("issues_ws_due_idx").on(t.workspaceId, t.dueDate),
  check("issues_priority_check", sql`priority >= 0 AND priority <= 4`),
]);

export const issueLabels = sqliteTable("issue_labels", {
  issueId: text("issue_id").notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  labelId: text("label_id").notNull()
    .references(() => labels.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.issueId, t.labelId] }),
  index("issue_labels_label_idx").on(t.labelId),
]);

export const issueRelations = sqliteTable("issue_relations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  issueId: text("issue_id").notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  relatedIssueId: text("related_issue_id").notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  createdBy: text("created_by").notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  uniqueIndex("issue_relations_triple_unique").on(t.issueId, t.relatedIssueId, t.type),
  index("issue_relations_issue_idx").on(t.issueId),
  index("issue_relations_related_idx").on(t.relatedIssueId),
  check("issue_relations_type_check", sql`type IN ('related','blocked_by','blocking','duplicate')`),
]);

export const issueSubscribers = sqliteTable("issue_subscribers", {
  issueId: text("issue_id").notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  primaryKey({ columns: [t.issueId, t.userId] }),
  check("issue_subscribers_reason_check", sql`reason IN ('created','assigned','mentioned','manual')`),
]);

export const issueHistory = sqliteTable("issue_history", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  issueId: text("issue_id").notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => users.id), // NULL = system
  field: text("field").notNull(),
  oldValue: text("old_value"), // json or scalar
  newValue: text("new_value"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("issue_history_issue_created_idx").on(t.issueId, t.createdAt),
]);

export const issueDescriptionVersions = sqliteTable("issue_description_versions", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  bodyMd: text("body_md").notNull(),
  createdBy: text("created_by").notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("issue_description_versions_issue_idx").on(t.issueId),
]);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  issueId: text("issue_id").notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  commentId: text("comment_id").references((): AnySQLiteColumn => comments.id, {
    onDelete: "cascade",
  }),
  uploaderId: text("uploader_id").notNull()
    .references(() => users.id),
  kind: text("kind").notNull(),
  url: text("url").notNull(),
  name: text("name"),
  sizeBytes: integer("size_bytes"),
  mime: text("mime"),
  localPath: text("local_path"), // under data/uploads/<wsId>/
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("attachments_issue_idx").on(t.issueId),
  check("attachments_kind_check", sql`kind IN ('link','file')`),
]);

/* ------------------------------------- §2.4 projects, milestones, cycles */

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  descriptionMd: text("description_md"),
  status: text("status").notNull().default("backlog"),
  leadId: text("lead_id").references(() => users.id, { onDelete: "set null" }),
  targetStartDate: text("target_start_date"),
  targetEndDate: text("target_end_date"),
  color: text("color"),
  briefPageId: text("brief_page_id").references((): AnySQLiteColumn => pages.id, {
    onDelete: "set null",
  }),
  position: text("position").notNull(),
  progressCache: integer("progress_cache").notNull().default(0), // 0–100, §9
  progressPointsCache: text("progress_points_cache"), // json {done,total}
  updateCadence: text("update_cadence").notNull().default("off"),
  archivedAt: integer("archived_at"),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("projects_workspace_id_idx").on(t.workspaceId),
  check("projects_status_check", sql`status IN ('backlog','planned','started','completed','canceled')`),
  check("projects_update_cadence_check", sql`update_cadence IN ('off','daily','weekly','biweekly')`),
]);

export const projectUpdates = sqliteTable("project_updates", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull()
    .references(() => users.id),
  health: text("health").notNull(),
  bodyMd: text("body_md").notNull(),
  progressSnapshot: integer("progress_snapshot"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("project_updates_project_idx").on(t.projectId),
  check("project_updates_health_check", sql`health IN ('on_track','at_risk','off_track')`),
]);

/**
 * Per-user favorites (T-029).
 *
 * A row per (user, entity), not a boolean on the entity. `views.favorited` is
 * a boolean on the view row, which cannot be right for anything more than one
 * person touches: it makes a star a property of the thing rather than of the
 * viewer. A project is far more likely than a saved view to matter to one
 * member and not another, so copying that shape would bake the same mistake
 * into a second table.
 *
 * `entity_type` is here so pages and cycles can join later without a third
 * table. Views are deliberately NOT migrated onto it in this change: that
 * would alter the M3 views payload, which is outside this ticket.
 */
export const favorites = sqliteTable("favorites", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  uniqueIndex("favorites_user_entity_unique").on(t.userId, t.entityType, t.entityId),
  index("favorites_user_type_idx").on(t.userId, t.entityType),
  check("favorites_entity_type_check", sql`entity_type IN ('project')`),
]);

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetDate: text("target_date"),
  position: text("position").notNull(),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
}, (t) => [
  index("milestones_project_idx").on(t.projectId),
]);

export const cycles = sqliteTable("cycles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  name: text("name"), // default "Cycle N"
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at").notNull(),
  status: text("status").notNull(),
  closedAt: integer("closed_at"),
  statsSnapshot: text("stats_snapshot"), // json frozen at close (FM-033)
  createdAt: integer("created_at").notNull(),
}, (t) => [
  uniqueIndex("cycles_team_number_unique").on(t.teamId, t.number),
  index("cycles_team_starts_idx").on(t.teamId, t.startsAt),
  check("cycles_status_check", sql`status IN ('future','active','completed')`),
]);

/* --------------------------------------------------------- §2.5 views */

export const views = sqliteTable("views", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  layout: text("layout").notNull().default("list"),
  filters: text("filters").notNull(), // json filter AST (§4.2)
  groupBy: text("group_by"),
  subGroupBy: text("sub_group_by"),
  orderBy: text("order_by").notNull().default("created"),
  orderDir: text("order_dir").default("desc"),
  display: text("display").notNull().default("{}"), // json display options
  position: text("position"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("views_ws_scope_idx").on(t.workspaceId, t.scope),
  check("views_scope_check", sql`scope IN ('workspace','team','project')`),
  check("views_layout_check", sql`layout IN ('list','board','table')`),
  check("views_order_dir_check", sql`order_dir IS NULL OR order_dir IN ('asc','desc')`),
]);

export const viewFavorites = sqliteTable("view_favorites", {
  viewId: text("view_id").notNull()
    .references(() => views.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.viewId, t.userId] }),
]);

export const viewUserPrefs = sqliteTable("view_user_prefs", {
  viewId: text("view_id").notNull()
    .references(() => views.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  display: text("display").notNull().default("{}"), // personal display overrides
}, (t) => [
  primaryKey({ columns: [t.viewId, t.userId] }),
]);

/* -------------------------------------------------- §2.6 pages & blocks */

export const pages = sqliteTable("pages", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  parentId: text("parent_id").references((): AnySQLiteColumn => pages.id, {
    onDelete: "cascade",
  }),
  path: text("path").notNull(), // materialized /<parentPath>/<id> (§9)
  title: text("title").notNull().default(""),
  icon: text("icon"), // emoji
  creatorId: text("creator_id").notNull()
    .references(() => users.id),
  position: text("position").notNull(), // fractional among siblings
  depth: integer("depth").notNull().default(0), // cap 20
  version: integer("version").notNull().default(1),
  archivedAt: integer("archived_at"),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => users.id),
}, (t) => [
  index("pages_ws_parent_position_idx").on(t.workspaceId, t.parentId, t.position),
  index("pages_ws_path_idx").on(t.workspaceId, t.path),
]);

export const blocks = sqliteTable("blocks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  pageId: text("page_id").notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  parentId: text("parent_id").references((): AnySQLiteColumn => blocks.id, {
    onDelete: "cascade",
  }), // nesting (list children, toggles, table rows)
  type: text("type").notNull(),
  props: text("props").notNull().default("{}"), // json per type (§2.6 contract)
  position: text("position").notNull(), // fractional among siblings
  text: text("text").notNull().default(""), // extracted plain text (FTS + summaries)
  version: integer("version").notNull().default(1),
  deletedAt: integer("deleted_at"),
  createdBy: text("created_by").notNull()
    .references(() => users.id),
  updatedBy: text("updated_by").references(() => users.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("blocks_page_parent_position_idx").on(t.pageId, t.parentId, t.position),
  check("blocks_type_check", sql`type IN (
    'paragraph','heading_1','heading_2','heading_3','bulleted_list','numbered_list',
    'todo','toggle','quote','callout','divider','code','image','file','bookmark',
    'embed','table','issue_view','page_link')`),
]);

/* ----------------------------------------------------- §2.7 templates */

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  data: text("data").notNull(), // json: issue or page payload (§2.7)
  position: text("position").notNull(),
  recurrence: text("recurrence"), // json {freq,every,next_run_at} (FM-054)
  usageCount: integer("usage_count").notNull().default(0),
  createdBy: text("created_by").notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [
  index("templates_ws_kind_idx").on(t.workspaceId, t.kind),
  check("templates_kind_check", sql`kind IN ('issue','page')`),
]);

/* --------------------------- §2.8 collaboration: comments, notifications */

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  parentId: text("parent_id").references((): AnySQLiteColumn => comments.id, {
    onDelete: "cascade",
  }),
  authorId: text("author_id").notNull()
    .references(() => users.id),
  bodyMd: text("body_md").notNull(),
  resolvedAt: integer("resolved_at"),
  resolvedBy: text("resolved_by").references(() => users.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
}, (t) => [
  index("comments_entity_created_idx").on(t.entityType, t.entityId, t.createdAt),
  check("comments_entity_type_check", sql`entity_type IN ('issue','page','project_update')`),
]);

export const mentions = sqliteTable("mentions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  commentId: text("comment_id").notNull()
    .references(() => comments.id, { onDelete: "cascade" }),
  targetUserId: text("target_user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  readAt: integer("read_at"),
  snoozedUntil: integer("snoozed_until"),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("notifications_ws_user_idx").on(t.workspaceId, t.userId),
  index("notifications_user_read_created_idx").on(t.userId, t.readAt, t.createdAt),
]);

export const notificationPrefs = sqliteTable("notification_prefs", {
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  prefs: text("prefs").notNull().default("{}"), // json {type → {in_app}} (FM-056)
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.userId] }),
]);

export const activityEvents = sqliteTable("activity_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), // strict ordering/replay
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => users.id),
  actorKind: text("actor_kind").notNull(),
  verb: text("verb").notNull(), // e.g. issue.created, ai.suggested_label
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  summary: text("summary"), // human sentence
  data: text("data"), // json
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("activity_events_ws_id_idx").on(t.workspaceId, t.id),
  index("activity_events_entity_idx").on(t.entityType, t.entityId, t.id),
  check("activity_events_actor_kind_check", sql`actor_kind IN ('user','system','ai')`),
]);

/* -------- §2.9 platform: events, presence, API keys, webhooks, AI runs --- */

export const eventLog = sqliteTable("event_log", {
  id: integer("id").primaryKey({ autoIncrement: true }), // = SSE Last-Event-ID (§5)
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  payload: text("payload").notNull(), // json envelope (§4.1)
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("event_log_ws_id_idx").on(t.workspaceId, t.id),
]);

export const presenceSessions = sqliteTable("presence_sessions", {
  id: text("id").primaryKey(), // SSE connection id
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  viewingType: text("viewing_type"), // issue/page/board/project/insights…
  viewingId: text("viewing_id"),
  connectedAt: integer("connected_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(), // TTL: invisible after 15 s
  disconnectedAt: integer("disconnected_at"),
}, (t) => [
  index("presence_ws_last_seen_idx").on(t.workspaceId, t.lastSeenAt),
]);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }), // acts as this user
  name: text("name").notNull(),
  keyPrefix: text("key_prefix"), // first 10 chars, display only
  keyHash: text("key_hash").notNull(), // SHA-256 of pmx_… secret
  scopes: text("scopes").notNull().default('["read"]'), // json array
  createdBy: text("created_by").notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
}, (t) => [
  uniqueIndex("api_keys_hash_unique").on(t.keyHash),
]);

export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(), // https enforced in service layer
  secret: text("secret").notNull(), // HMAC key
  events: text("events").notNull(), // json ['issue.created', …] or ['*']
  isActive: integer("is_active").notNull().default(1),
  createdBy: text("created_by").notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id").notNull()
    .references(() => webhooks.id, { onDelete: "cascade" }),
  eventName: text("event_name").notNull(),
  payload: text("payload").notNull(),
  status: text("status").notNull(),
  responseStatus: integer("response_status"),
  attempts: integer("attempts").notNull().default(0),
  nextRetryAt: integer("next_retry_at"),
  deliveredAt: integer("delivered_at"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("webhook_deliveries_webhook_idx").on(t.webhookId),
  check("webhook_deliveries_status_check", sql`status IN ('pending','success','failed')`),
]);

export const aiRuns = sqliteTable("ai_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  feature: text("feature").notNull(),
  engine: text("engine").notNull(), // 'local-deterministic' | 'provider:<id>:<model>'
  inputHash: text("input_hash").notNull(), // SHA-256 of canonicalized input
  durationMs: integer("duration_ms").notNull(),
  outcome: text("outcome").notNull(), // json: result class + counts
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("ai_runs_ws_feature_created_idx").on(t.workspaceId, t.feature, t.createdAt),
  check("ai_runs_feature_check", sql`feature IN (
    'nlq','dedup','triage','summarize','ask','draft','related','hygiene',
    'meeting','cluster','chat')`),
]);

/** Triage suggestion accept/reject feedback (§6.2, FM-064, AT). */
export const triageFeedback = sqliteTable("triage_feedback", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  issueId: text("issue_id").notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  suggestion: text("suggestion").notNull(), // json: the suggestion shown
  action: text("action").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  index("triage_feedback_issue_idx").on(t.issueId),
  check("triage_feedback_action_check", sql`action IN ('accepted','rejected','modified','ignored')`),
]);

/* --------------------------------------- §2.10 schemes: redirects, FTS --- */

/** Old issue identifiers keep resolving after team moves (FM-013). */
export const issueRedirects = sqliteTable("issue_redirects", {
  oldIdentifier: text("old_identifier").primaryKey(),
  issueId: text("issue_id").notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
}, (t) => [
  index("issue_redirects_issue_idx").on(t.issueId),
]);

/** Compensating-action undo tokens for bulk issue mutations (FM-027). */
export const undoTokens = sqliteTable("undo_tokens", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
  consumedAt: integer("consumed_at"),
}, (t) => [
  index("undo_tokens_ws_created_idx").on(t.workspaceId, t.createdAt),
]);

/**
 * search_fts (FTS5 virtual table) and its sync triggers live in
 * src/db/fts.sql — Drizzle cannot express virtual tables. Applied
 * idempotently by scripts/migrate.mjs and createTestDb() (tests/db).
 */
