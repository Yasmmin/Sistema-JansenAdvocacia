ALTER TABLE `sync_runs` ADD `oab` text DEFAULT '103774' NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `oab_uf` text DEFAULT 'RS' NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `historical` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `first_sync_completed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `period_start` text;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `period_end` text;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `last_period_processed` text;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `total_found` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `total_unique_processes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `updated_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `duplicate_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `pages_processed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `periods_processed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `min_date` text;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `max_date` text;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `records_by_year` text DEFAULT '{}' NOT NULL;