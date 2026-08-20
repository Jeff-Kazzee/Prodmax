CREATE TABLE `favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "favorites_entity_type_check" CHECK(entity_type IN ('project'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_entity_unique` ON `favorites` (`user_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `favorites_user_type_idx` ON `favorites` (`user_id`,`entity_type`);