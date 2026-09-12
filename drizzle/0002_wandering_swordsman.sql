ALTER TABLE `clients` ADD `normalized_name` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clients_normalized_name` ON `clients` (`normalized_name`);--> statement-breakpoint
ALTER TABLE `intimations` ADD `action_type` text;--> statement-breakpoint
ALTER TABLE `legal_processes` ADD `notes` text;