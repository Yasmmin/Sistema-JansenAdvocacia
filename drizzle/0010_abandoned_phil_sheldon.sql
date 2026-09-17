CREATE TABLE `google_calendars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connection_id` integer NOT NULL,
	`calendar_id` text NOT NULL,
	`summary` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`access_role` text DEFAULT 'reader' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`next_sync_token` text,
	`channel_id` text,
	`channel_resource_id` text,
	`channel_token_hash` text,
	`channel_expires_at` text,
	`last_full_sync_at` text,
	`last_incremental_sync_at` text,
	`last_sync_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `calendar_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_google_calendars_connection_calendar` ON `google_calendars` (`connection_id`,`calendar_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_google_calendars_channel` ON `google_calendars` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_google_calendars_active` ON `google_calendars` (`connection_id`,`active`);