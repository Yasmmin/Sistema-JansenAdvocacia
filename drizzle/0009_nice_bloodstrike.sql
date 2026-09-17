CREATE TABLE `calendar_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text DEFAULT 'JANSEN_OFFICE' NOT NULL,
	`calendar_id` text DEFAULT 'primary' NOT NULL,
	`account_email` text,
	`encrypted_refresh_token` text NOT NULL,
	`next_sync_token` text,
	`sync_status` text DEFAULT 'CONNECTED' NOT NULL,
	`last_full_sync_at` text,
	`last_incremental_sync_at` text,
	`last_sync_error` text,
	`channel_id` text,
	`channel_resource_id` text,
	`channel_token_hash` text,
	`channel_expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calendar_connections_owner` ON `calendar_connections` (`owner_key`);--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`google_event_id` text,
	`calendar_id` text DEFAULT 'primary' NOT NULL,
	`responsible` text,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`time_zone` text DEFAULT 'America/Sao_Paulo' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`legal_type` text DEFAULT 'OTHER' NOT NULL,
	`attendees` text DEFAULT '[]' NOT NULL,
	`recurrence` text DEFAULT '[]' NOT NULL,
	`reminders` text DEFAULT '{}' NOT NULL,
	`client_id` integer,
	`process_id` integer,
	`cnj` text,
	`eproc_url` text,
	`google_updated_at` text,
	`google_html_link` text,
	`google_etag` text,
	`last_change_origin` text DEFAULT 'JANSEN' NOT NULL,
	`sync_status` text DEFAULT 'PENDING' NOT NULL,
	`sync_error` text,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`process_id`) REFERENCES `legal_processes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calendar_events_google` ON `calendar_events` (`calendar_id`,`google_event_id`);--> statement-breakpoint
CREATE INDEX `idx_calendar_events_range` ON `calendar_events` (`start_at`,`end_at`);--> statement-breakpoint
CREATE INDEX `idx_calendar_events_client` ON `calendar_events` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_calendar_events_process` ON `calendar_events` (`process_id`);--> statement-breakpoint
CREATE INDEX `idx_calendar_events_sync` ON `calendar_events` (`sync_status`,`last_change_origin`);--> statement-breakpoint
CREATE TABLE `calendar_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
