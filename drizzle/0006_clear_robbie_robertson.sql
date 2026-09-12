ALTER TABLE `tasks` ADD `due_time` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `assignee` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `is_recurring` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_frequency` text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_interval` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_days_of_week` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_day_of_month` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_end_type` text DEFAULT 'NEVER' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_end_date` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_count` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_occurrence` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_series_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_occurrence_id` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `completed_at` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_assignee_status` ON `tasks` (`assignee`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_series` ON `tasks` (`recurrence_series_id`,`recurrence_occurrence`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tasks_parent_occurrence` ON `tasks` (`parent_occurrence_id`);--> statement-breakpoint
PRAGMA optimize;
