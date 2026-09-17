ALTER TABLE `tasks` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `attachments` text DEFAULT '[]' NOT NULL;