CREATE TABLE `pending_legal_processes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`process_number` text NOT NULL,
	`title` text,
	`parties` text,
	`court` text,
	`judicial_body` text,
	`area` text,
	`action_type` text,
	`status` text DEFAULT 'UNKNOWN' NOT NULL,
	`confidential` integer DEFAULT false NOT NULL,
	`last_movement_at` text,
	`last_movement_description` text,
	`reason` text DEFAULT 'VINCULO_PENDENTE' NOT NULL,
	`enrichment_status` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pending_legal_process_number` ON `pending_legal_processes` (`process_number`);--> statement-breakpoint
CREATE INDEX `idx_pending_legal_process_status` ON `pending_legal_processes` (`status`,`confidential`);