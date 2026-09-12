CREATE TABLE `intimations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`process_number` text,
	`court` text,
	`judicial_body` text,
	`availability_date` text,
	`publication_date` text,
	`recipient` text,
	`lawyer_name` text,
	`oab` text NOT NULL,
	`oab_uf` text NOT NULL,
	`content` text NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`classification` text DEFAULT 'UNKNOWN' NOT NULL,
	`source_url` text,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_intimations_external_id` ON `intimations` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_intimations_fingerprint` ON `intimations` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_intimations_status_date` ON `intimations` (`status`,`availability_date`);--> statement-breakpoint
CREATE INDEX `idx_intimations_classification` ON `intimations` (`classification`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attempted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`succeeded_at` text,
	`status` text NOT NULL,
	`received_count` integer DEFAULT 0 NOT NULL,
	`new_count` integer DEFAULT 0 NOT NULL,
	`existing_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
PRAGMA optimize;
