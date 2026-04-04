CREATE TABLE `delegations` (
	`id` text PRIMARY KEY NOT NULL,
	`dao_id` text NOT NULL,
	`delegator_address` text NOT NULL,
	`delegatee_address` text NOT NULL,
	`delegated_power` integer NOT NULL,
	`aptos_tx_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`dao_id`) REFERENCES `daos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `proposal_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`voter_address` text NOT NULL,
	`support` integer NOT NULL,
	`voting_power` integer NOT NULL,
	`aptos_tx_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`dao_id` text NOT NULL,
	`proposer_address` text NOT NULL,
	`proposal_type` integer DEFAULT 2 NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`yes_power` integer DEFAULT 0 NOT NULL,
	`no_power` integer DEFAULT 0 NOT NULL,
	`total_power` integer DEFAULT 0 NOT NULL,
	`aptos_tx_hash` text,
	`voting_deadline` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`dao_id`) REFERENCES `daos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stakes` (
	`id` text PRIMARY KEY NOT NULL,
	`staker_address` text NOT NULL,
	`amount` integer NOT NULL,
	`tier` integer DEFAULT 0 NOT NULL,
	`boost_bps` integer DEFAULT 150 NOT NULL,
	`staked_at` integer NOT NULL,
	`unlock_at` integer NOT NULL,
	`aptos_tx_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stakes_staker_address_unique` ON `stakes` (`staker_address`);