CREATE TABLE `ignored_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`normalized_value` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ignored_imports_kind_value` ON `ignored_imports` (`kind`,`normalized_value`);--> statement-breakpoint
CREATE TABLE `portfolio_sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`coverage_start` text NOT NULL,
	`coverage_end` text NOT NULL,
	`last_period` text,
	`records_scanned` integer DEFAULT 0 NOT NULL,
	`processes_found` integer DEFAULT 0 NOT NULL,
	`active_processes` integer DEFAULT 0 NOT NULL,
	`excluded_sajulbra` integer DEFAULT 0 NOT NULL,
	`clients_created` integer DEFAULT 0 NOT NULL,
	`clients_updated` integer DEFAULT 0 NOT NULL,
	`processes_created` integer DEFAULT 0 NOT NULL,
	`processes_updated` integer DEFAULT 0 NOT NULL,
	`confidential_processes` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`error_details` text
);
--> statement-breakpoint
CREATE TABLE `portfolio_sync_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `portfolio_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_portfolio_sync_period` ON `portfolio_sync_periods` (`run_id`,`period`);--> statement-breakpoint
ALTER TABLE `legal_processes` ADD `confidential` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `legal_processes` ADD `parties_source` text;--> statement-breakpoint
ALTER TABLE `legal_processes` ADD `last_enriched_at` text;--> statement-breakpoint
ALTER TABLE `legal_processes` ADD `enrichment_status` text;
