CREATE TABLE `eproc_verifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`process_number` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`has_francisco` integer DEFAULT false NOT NULL,
	`has_adamo` integer DEFAULT false NOT NULL,
	`parties` text DEFAULT '[]' NOT NULL,
	`represented_parties` text DEFAULT '[]' NOT NULL,
	`lawyers` text DEFAULT '[]' NOT NULL,
	`error` text,
	`verified_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_eproc_verifications_process` ON `eproc_verifications` (`process_number`);--> statement-breakpoint
CREATE INDEX `idx_eproc_verifications_status` ON `eproc_verifications` (`status`,`updated_at`);