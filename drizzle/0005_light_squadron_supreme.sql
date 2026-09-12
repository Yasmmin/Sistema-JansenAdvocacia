CREATE TABLE `portfolio_sync_processes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`process_number` text NOT NULL,
	`status` text,
	`excluded_reason` text,
	`confidential` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `portfolio_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_portfolio_sync_process_run_number` ON `portfolio_sync_processes` (`run_id`,`process_number`);--> statement-breakpoint
CREATE INDEX `idx_portfolio_sync_process_exclusion` ON `portfolio_sync_processes` (`run_id`,`excluded_reason`);