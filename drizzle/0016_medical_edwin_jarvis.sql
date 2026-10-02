CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`user_name` text NOT NULL,
	`user_email` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`response_status` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_user_date` ON `audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_path_date` ON `audit_logs` (`path`,`created_at`);--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `created_by_user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `updated_by_user_id` integer REFERENCES users(id);