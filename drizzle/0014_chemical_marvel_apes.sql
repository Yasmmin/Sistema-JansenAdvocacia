ALTER TABLE `intimations` ADD `source` text DEFAULT 'PRIVATE' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_intimations_source_date` ON `intimations` (`source`,`availability_date`);