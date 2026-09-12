CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cpf` text,
	`rg` text,
	`birth_date` text,
	`phone` text,
	`email` text,
	`nationality` text,
	`drive_folder_url` text,
	`notes` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`source` text DEFAULT 'PRIVATE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_clients_source_status` ON `clients` (`source`,`status`);--> statement-breakpoint
CREATE INDEX `idx_clients_name` ON `clients` (`name`);--> statement-breakpoint
CREATE TABLE `legal_processes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`process_number` text NOT NULL,
	`title` text,
	`parties` text,
	`court` text,
	`judicial_body` text,
	`area` text,
	`action_type` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`eproc_url` text,
	`drive_url` text,
	`last_movement_at` text,
	`last_movement_description` text,
	`fatal_deadline` text,
	`source` text DEFAULT 'PRIVATE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_legal_processes_number` ON `legal_processes` (`process_number`);--> statement-breakpoint
CREATE INDEX `idx_legal_processes_client_status` ON `legal_processes` (`client_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_legal_processes_source` ON `legal_processes` (`source`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'NOT_STARTED' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`due_date` text,
	`client_id` integer,
	`process_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`process_id`) REFERENCES `legal_processes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_client_status` ON `tasks` (`client_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_process_status` ON `tasks` (`process_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_due_date` ON `tasks` (`due_date`);--> statement-breakpoint
ALTER TABLE `intimations` ADD `process_id` integer REFERENCES legal_processes(id);--> statement-breakpoint
CREATE INDEX `idx_intimations_process_id` ON `intimations` (`process_id`);--> statement-breakpoint
PRAGMA optimize;
