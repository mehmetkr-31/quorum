CREATE TABLE `dao_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`dao_id` text NOT NULL,
	`member_address` text NOT NULL,
	`voting_power` integer DEFAULT 1 NOT NULL,
	`approved_contributions` integer DEFAULT 0 NOT NULL,
	`total_contributions` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`dao_id`) REFERENCES `daos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `daos` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`slug` text NOT NULL,
	`owner_address` text NOT NULL,
	`treasury_address` text NOT NULL,
	`image_url` text,
	`on_chain_id` text,
	`voting_window_seconds` integer DEFAULT 172800 NOT NULL,
	`quorum_threshold` integer DEFAULT 60 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daos_slug_unique` ON `daos` (`slug`);--> statement-breakpoint
ALTER TABLE `datasets` ADD `dao_id` text NOT NULL REFERENCES daos(id);