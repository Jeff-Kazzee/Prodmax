CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_id` text,
	`actor_kind` text NOT NULL,
	`verb` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`summary` text,
	`data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "activity_events_actor_kind_check" CHECK(actor_kind IN ('user','system','ai'))
);
--> statement-breakpoint
CREATE INDEX `activity_events_ws_id_idx` ON `activity_events` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `activity_events_entity_idx` ON `activity_events` (`entity_type`,`entity_id`,`id`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text,
	`feature` text NOT NULL,
	`engine` text NOT NULL,
	`input_hash` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`outcome` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ai_runs_feature_check" CHECK(feature IN (
    'nlq','dedup','triage','summarize','ask','draft','related','hygiene',
    'meeting','cluster','chat'))
);
--> statement-breakpoint
CREATE INDEX `ai_runs_ws_feature_created_idx` ON `ai_runs` (`workspace_id`,`feature`,`created_at`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text,
	`key_hash` text NOT NULL,
	`scopes` text DEFAULT '["read"]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`comment_id` text,
	`uploader_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`name` text,
	`size_bytes` integer,
	`mime` text,
	`local_path` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attachments_kind_check" CHECK(kind IN ('link','file'))
);
--> statement-breakpoint
CREATE INDEX `attachments_issue_idx` ON `attachments` (`issue_id`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`page_id` text NOT NULL,
	`parent_id` text,
	`type` text NOT NULL,
	`props` text DEFAULT '{}' NOT NULL,
	`position` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`created_by` text NOT NULL,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "blocks_type_check" CHECK(type IN (
    'paragraph','heading_1','heading_2','heading_3','bulleted_list','numbered_list',
    'todo','toggle','quote','callout','divider','code','image','file','bookmark',
    'embed','table','issue_view','page_link'))
);
--> statement-breakpoint
CREATE INDEX `blocks_page_parent_position_idx` ON `blocks` (`page_id`,`parent_id`,`position`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`parent_id` text,
	`author_id` text NOT NULL,
	`body_md` text NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "comments_entity_type_check" CHECK(entity_type IN ('issue','page','project_update'))
);
--> statement-breakpoint
CREATE INDEX `comments_entity_created_idx` ON `comments` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`team_id` text NOT NULL,
	`number` integer NOT NULL,
	`name` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text NOT NULL,
	`closed_at` integer,
	`stats_snapshot` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cycles_status_check" CHECK(status IN ('future','active','completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cycles_team_number_unique` ON `cycles` (`team_id`,`number`);--> statement-breakpoint
CREATE INDEX `cycles_team_starts_idx` ON `cycles` (`team_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `event_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_log_ws_id_idx` ON `event_log` (`workspace_id`,`id`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`team_id` text,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invites_role_check" CHECK(role IN ('owner','admin','member','guest'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_workspace_email_idx` ON `invites` (`workspace_id`,`email`);--> statement-breakpoint
CREATE TABLE `issue_description_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`body_md` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `issue_description_versions_issue_idx` ON `issue_description_versions` (`issue_id`);--> statement-breakpoint
CREATE TABLE `issue_history` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`actor_id` text,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `issue_history_issue_created_idx` ON `issue_history` (`issue_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `issue_labels` (
	`issue_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`issue_id`, `label_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `issue_labels_label_idx` ON `issue_labels` (`label_id`);--> statement-breakpoint
CREATE TABLE `issue_redirects` (
	`old_identifier` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `issue_redirects_issue_idx` ON `issue_redirects` (`issue_id`);--> statement-breakpoint
CREATE TABLE `issue_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`related_issue_id` text NOT NULL,
	`type` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "issue_relations_type_check" CHECK(type IN ('related','blocked_by','blocking','duplicate'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issue_relations_triple_unique` ON `issue_relations` (`issue_id`,`related_issue_id`,`type`);--> statement-breakpoint
CREATE INDEX `issue_relations_issue_idx` ON `issue_relations` (`issue_id`);--> statement-breakpoint
CREATE INDEX `issue_relations_related_idx` ON `issue_relations` (`related_issue_id`);--> statement-breakpoint
CREATE TABLE `issue_subscribers` (
	`issue_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`issue_id`, `user_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "issue_subscribers_reason_check" CHECK(reason IN ('created','assigned','mentioned','manual'))
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`team_id` text NOT NULL,
	`number` integer NOT NULL,
	`identifier` text NOT NULL,
	`title` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`state_id` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`estimate` integer,
	`assignee_id` text,
	`creator_id` text NOT NULL,
	`project_id` text,
	`milestone_id` text,
	`cycle_id` text,
	`parent_id` text,
	`due_date` text,
	`position` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`triaged_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "issues_priority_check" CHECK(priority >= 0 AND priority <= 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issues_ws_identifier_unique` ON `issues` (`workspace_id`,`identifier`);--> statement-breakpoint
CREATE INDEX `issues_ws_team_number_idx` ON `issues` (`workspace_id`,`team_id`,`number`);--> statement-breakpoint
CREATE INDEX `issues_ws_updated_idx` ON `issues` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `issues_assignee_idx` ON `issues` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `issues_state_idx` ON `issues` (`state_id`);--> statement-breakpoint
CREATE INDEX `issues_project_idx` ON `issues` (`project_id`);--> statement-breakpoint
CREATE INDEX `issues_cycle_idx` ON `issues` (`cycle_id`);--> statement-breakpoint
CREATE INDEX `issues_milestone_idx` ON `issues` (`milestone_id`);--> statement-breakpoint
CREATE INDEX `issues_parent_idx` ON `issues` (`parent_id`);--> statement-breakpoint
CREATE INDEX `issues_ws_deleted_idx` ON `issues` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `issues_ws_priority_idx` ON `issues` (`workspace_id`,`priority`);--> statement-breakpoint
CREATE INDEX `issues_ws_due_idx` ON `issues` (`workspace_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `label_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`position` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `label_groups_ws_name_unique` ON `label_groups` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`team_id` text,
	`name` text NOT NULL,
	`color` text,
	`description` text,
	`group_id` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `label_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `labels_workspace_id_idx` ON `labels` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`comment_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`target_date` text,
	`position` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `milestones_project_idx` ON `milestones` (`project_id`);--> statement-breakpoint
CREATE TABLE `notification_prefs` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`prefs` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`actor_id` text,
	`read_at` integer,
	`snoozed_until` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notifications_ws_user_idx` ON `notifications` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_created_idx` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`parent_id` text,
	`path` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`icon` text,
	`creator_id` text NOT NULL,
	`position` text NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pages_ws_parent_position_idx` ON `pages` (`workspace_id`,`parent_id`,`position`);--> statement-breakpoint
CREATE INDEX `pages_ws_path_idx` ON `pages` (`workspace_id`,`path`);--> statement-breakpoint
CREATE TABLE `presence_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`viewing_type` text,
	`viewing_id` text,
	`connected_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`disconnected_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `presence_ws_last_seen_idx` ON `presence_sessions` (`workspace_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `project_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`author_id` text NOT NULL,
	`health` text NOT NULL,
	`body_md` text NOT NULL,
	`progress_snapshot` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "project_updates_health_check" CHECK(health IN ('on_track','at_risk','off_track'))
);
--> statement-breakpoint
CREATE INDEX `project_updates_project_idx` ON `project_updates` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description_md` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`lead_id` text,
	`target_start_date` text,
	`target_end_date` text,
	`color` text,
	`brief_page_id` text,
	`position` text NOT NULL,
	`progress_cache` integer DEFAULT 0 NOT NULL,
	`progress_points_cache` text,
	`update_cadence` text DEFAULT 'off' NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`brief_page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "projects_status_check" CHECK(status IN ('backlog','planned','started','completed','canceled')),
	CONSTRAINT "projects_update_cadence_check" CHECK(update_cadence IN ('off','daily','weekly','biweekly'))
);
--> statement-breakpoint
CREATE INDEX `projects_workspace_id_idx` ON `projects` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`user_agent` text,
	`ip_hash` text,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `states` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`position` text NOT NULL,
	`color` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "states_category_check" CHECK(category IN ('backlog','unstarted','started','completed','canceled','triage'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `states_team_name_unique` ON `states` (`team_id`,`name`);--> statement-breakpoint
CREATE INDEX `states_team_id_idx` ON `states` (`team_id`);--> statement-breakpoint
CREATE TABLE `team_counters` (
	`team_id` text PRIMARY KEY NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_team_user_unique` ON `team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `team_members_user_id_idx` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`timezone` text,
	`position` text NOT NULL,
	`default_state_id` text,
	`triage_enabled` integer DEFAULT 0 NOT NULL,
	`triage_state_id` text,
	`cycles_enabled` integer DEFAULT 1 NOT NULL,
	`cycle_length_days` integer DEFAULT 14 NOT NULL,
	`cycle_start_day` integer DEFAULT 1 NOT NULL,
	`cooldown_length_days` integer DEFAULT 2 NOT NULL,
	`auto_add_to_cycle` integer DEFAULT 0 NOT NULL,
	`next_cycle_number` integer DEFAULT 1 NOT NULL,
	`estimate_scale` text DEFAULT 'off' NOT NULL,
	`estimate_allow_zero` integer DEFAULT 0 NOT NULL,
	`auto_archive_days` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`triage_state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "teams_key_format" CHECK(key GLOB '[A-Z][A-Z0-9]*' AND length(key) BETWEEN 2 AND 6),
	CONSTRAINT "teams_estimate_scale_check" CHECK(estimate_scale IN ('off','linear','fibonacci','exponential','tshirt'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_ws_key_unique` ON `teams` (`workspace_id`,`key`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`team_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`data` text NOT NULL,
	`position` text NOT NULL,
	`recurrence` text,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "templates_kind_check" CHECK(kind IN ('issue','page'))
);
--> statement-breakpoint
CREATE INDEX `templates_ws_kind_idx` ON `templates` (`workspace_id`,`kind`);--> statement-breakpoint
CREATE TABLE `triage_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`user_id` text,
	`suggestion` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "triage_feedback_action_check" CHECK(action IN ('accepted','rejected','modified','ignored'))
);
--> statement-breakpoint
CREATE INDEX `triage_feedback_issue_idx` ON `triage_feedback` (`issue_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`avatar_seed` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `view_favorites` (
	`view_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`view_id`, `user_id`),
	FOREIGN KEY (`view_id`) REFERENCES `views`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `view_user_prefs` (
	`view_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`view_id`, `user_id`),
	FOREIGN KEY (`view_id`) REFERENCES `views`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `views` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`scope` text NOT NULL,
	`team_id` text,
	`project_id` text,
	`name` text NOT NULL,
	`layout` text DEFAULT 'list' NOT NULL,
	`filters` text NOT NULL,
	`group_by` text,
	`sub_group_by` text,
	`order_by` text DEFAULT 'created' NOT NULL,
	`order_dir` text DEFAULT 'desc',
	`display` text DEFAULT '{}' NOT NULL,
	`position` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "views_scope_check" CHECK(scope IN ('workspace','team','project')),
	CONSTRAINT "views_layout_check" CHECK(layout IN ('list','board','table')),
	CONSTRAINT "views_order_dir_check" CHECK(order_dir IS NULL OR order_dir IN ('asc','desc'))
);
--> statement-breakpoint
CREATE INDEX `views_ws_scope_idx` ON `views` (`workspace_id`,`scope`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`event_name` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`response_status` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_retry_at` integer,
	`delivered_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "webhook_deliveries_status_check" CHECK(status IN ('pending','success','failed'))
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_webhook_idx` ON `webhook_deliveries` (`webhook_id`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`events` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_members_role_check" CHECK(role IN ('owner','admin','member','guest'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_ws_user_unique` ON `workspace_members` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `workspace_members_workspace_id_idx` ON `workspace_members` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `workspace_members_user_id_idx` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "workspaces_slug_format" CHECK(slug GLOB '[a-z0-9-][a-z0-9-][a-z0-9-]*' AND length(slug) BETWEEN 3 AND 40)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);