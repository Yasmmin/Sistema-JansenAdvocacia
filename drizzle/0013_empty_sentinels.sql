CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`role` text DEFAULT 'ADMIN' NOT NULL,
	`google_id` text,
	`avatar_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_google_id` ON `users` (`google_id`);