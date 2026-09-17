import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type IntimationStatus = "NEW" | "IN_REVIEW" | "REVIEWED" | "NO_ACTION" | "COMPLETED" | "NEEDS_CONFIRMATION";
export type IntimationClassification = "UNKNOWN" | "INFORMATION" | "POSSIBLE_DEADLINE" | "HEARING" | "PAYMENT" | "DOCUMENT_REQUEST" | "PROCEDURAL_ACTION";
export type ClientStatus = "ACTIVE" | "ATTENTION_REQUIRED" | "NO_RECENT_ACTIVITY" | "PROSPECT" | "CLOSED";
export type ClientSource = "PRIVATE" | "SAJULBRA";
export type ProcessStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED" | "CLOSED" | "AWAITING_COMPLIANCE" | "ON_APPEAL" | "UNKNOWN";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskStatus = "TODO" | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type TaskAssignee = "Bruno Boff" | "Yasmmin Flávia" | "Francisco Jansen";
export type RecurrenceFrequency = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
export type RecurrenceEndType = "NEVER" | "DATE" | "COUNT";
export type CalendarEventType = "HEARING" | "DEADLINE" | "MEETING" | "DILIGENCE" | "EXPERT_EXAM" | "ORAL_ARGUMENT" | "CLIENT_SERVICE" | "OTHER";
export type CalendarEventOrigin = "JANSEN" | "GOOGLE";
export type CalendarEventSyncStatus = "PENDING" | "SYNCED" | "ERROR";

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name"),
  cpf: text("cpf"),
  rg: text("rg"),
  birthDate: text("birth_date"),
  phone: text("phone"),
  email: text("email"),
  nationality: text("nationality"),
  driveFolderUrl: text("drive_folder_url"),
  notes: text("notes"),
  status: text("status").$type<ClientStatus>().notNull().default("ACTIVE"),
  source: text("source").$type<ClientSource>().notNull().default("PRIVATE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_clients_source_status").on(table.source, table.status),
  index("idx_clients_name").on(table.name),
  uniqueIndex("idx_clients_normalized_name").on(table.normalizedName),
]);

export const legalProcesses = sqliteTable("legal_processes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  processNumber: text("process_number").notNull(),
  title: text("title"),
  parties: text("parties"),
  court: text("court"),
  judicialBody: text("judicial_body"),
  area: text("area"),
  actionType: text("action_type"),
  status: text("status").$type<ProcessStatus>().notNull().default("ACTIVE"),
  priority: text("priority").$type<Priority>().notNull().default("MEDIUM"),
  eprocUrl: text("eproc_url"),
  driveUrl: text("drive_url"),
  lastMovementAt: text("last_movement_at"),
  lastMovementDescription: text("last_movement_description"),
  fatalDeadline: text("fatal_deadline"),
  notes: text("notes"),
  confidential: integer("confidential", { mode: "boolean" }).notNull().default(false),
  partiesSource: text("parties_source"),
  lastEnrichedAt: text("last_enriched_at"),
  enrichmentStatus: text("enrichment_status"),
  source: text("source").$type<ClientSource>().notNull().default("PRIVATE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_legal_processes_number").on(table.processNumber),
  index("idx_legal_processes_client_status").on(table.clientId, table.status),
  index("idx_legal_processes_source").on(table.source),
]);

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").$type<TaskStatus>().notNull().default("NOT_STARTED"),
  priority: text("priority").$type<Priority>().notNull().default("MEDIUM"),
  dueDate: text("due_date"),
  dueTime: text("due_time"),
  assignee: text("assignee").$type<TaskAssignee>(),
  isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
  recurrenceFrequency: text("recurrence_frequency").$type<RecurrenceFrequency>().notNull().default("NONE"),
  recurrenceInterval: integer("recurrence_interval").notNull().default(1),
  recurrenceDaysOfWeek: text("recurrence_days_of_week"),
  recurrenceDayOfMonth: integer("recurrence_day_of_month"),
  recurrenceEndType: text("recurrence_end_type").$type<RecurrenceEndType>().notNull().default("NEVER"),
  recurrenceEndDate: text("recurrence_end_date"),
  recurrenceCount: integer("recurrence_count"),
  recurrenceOccurrence: integer("recurrence_occurrence").notNull().default(1),
  recurrenceSeriesId: text("recurrence_series_id"),
  parentOccurrenceId: integer("parent_occurrence_id"),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
  processId: integer("process_id").references(() => legalProcesses.id, { onDelete: "cascade" }),
  tags: text("tags").notNull().default("[]"),
  attachments: text("attachments").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (table) => [
  index("idx_tasks_client_status").on(table.clientId, table.status),
  index("idx_tasks_process_status").on(table.processId, table.status),
  index("idx_tasks_due_date").on(table.dueDate),
  index("idx_tasks_assignee_status").on(table.assignee, table.status),
  index("idx_tasks_series").on(table.recurrenceSeriesId, table.recurrenceOccurrence),
  uniqueIndex("idx_tasks_parent_occurrence").on(table.parentOccurrenceId),
]);

export const calendarConnections = sqliteTable("calendar_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull().default("JANSEN_OFFICE"),
  calendarId: text("calendar_id").notNull().default("primary"),
  accountEmail: text("account_email"),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  nextSyncToken: text("next_sync_token"),
  syncStatus: text("sync_status").notNull().default("CONNECTED"),
  lastFullSyncAt: text("last_full_sync_at"),
  lastIncrementalSyncAt: text("last_incremental_sync_at"),
  lastSyncError: text("last_sync_error"),
  channelId: text("channel_id"),
  channelResourceId: text("channel_resource_id"),
  channelTokenHash: text("channel_token_hash"),
  channelExpiresAt: text("channel_expires_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_calendar_connections_owner").on(table.ownerKey),
]);

export const googleCalendars = sqliteTable("google_calendars", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connection_id").notNull().references(() => calendarConnections.id, { onDelete: "cascade" }),
  calendarId: text("calendar_id").notNull(),
  summary: text("summary"),
  primary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  accessRole: text("access_role").notNull().default("reader"),
  backgroundColor: text("background_color"),
  foregroundColor: text("foreground_color"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  nextSyncToken: text("next_sync_token"),
  channelId: text("channel_id"),
  channelResourceId: text("channel_resource_id"),
  channelTokenHash: text("channel_token_hash"),
  channelExpiresAt: text("channel_expires_at"),
  lastFullSyncAt: text("last_full_sync_at"),
  lastIncrementalSyncAt: text("last_incremental_sync_at"),
  lastSyncError: text("last_sync_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_google_calendars_connection_calendar").on(table.connectionId, table.calendarId),
  uniqueIndex("idx_google_calendars_channel").on(table.channelId),
  index("idx_google_calendars_active").on(table.connectionId, table.active),
]);

export const calendarOAuthStates = sqliteTable("calendar_oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const calendarEvents = sqliteTable("calendar_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  googleEventId: text("google_event_id"),
  calendarId: text("calendar_id").notNull().default("primary"),
  responsible: text("responsible"),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
  timeZone: text("time_zone").notNull().default("America/Sao_Paulo"),
  status: text("status").notNull().default("confirmed"),
  legalType: text("legal_type").$type<CalendarEventType>().notNull().default("OTHER"),
  attendees: text("attendees").notNull().default("[]"),
  recurrence: text("recurrence").notNull().default("[]"),
  reminders: text("reminders").notNull().default("{}"),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  processId: integer("process_id").references(() => legalProcesses.id, { onDelete: "set null" }),
  cnj: text("cnj"),
  eprocUrl: text("eproc_url"),
  googleUpdatedAt: text("google_updated_at"),
  googleHtmlLink: text("google_html_link"),
  googleEtag: text("google_etag"),
  googleColor: text("google_color"),
  googleForegroundColor: text("google_foreground_color"),
  lastChangeOrigin: text("last_change_origin").$type<CalendarEventOrigin>().notNull().default("JANSEN"),
  syncStatus: text("sync_status").$type<CalendarEventSyncStatus>().notNull().default("PENDING"),
  syncError: text("sync_error"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_calendar_events_google").on(table.calendarId, table.googleEventId),
  index("idx_calendar_events_range").on(table.startAt, table.endAt),
  index("idx_calendar_events_client").on(table.clientId),
  index("idx_calendar_events_process").on(table.processId),
  index("idx_calendar_events_sync").on(table.syncStatus, table.lastChangeOrigin),
]);

export const intimations = sqliteTable("intimations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: text("external_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  processNumber: text("process_number"),
  processId: integer("process_id").references(() => legalProcesses.id, { onDelete: "set null" }),
  court: text("court"),
  judicialBody: text("judicial_body"),
  availabilityDate: text("availability_date"),
  publicationDate: text("publication_date"),
  recipient: text("recipient"),
  lawyerName: text("lawyer_name"),
  oab: text("oab").notNull(),
  oabUf: text("oab_uf").notNull(),
  content: text("content").notNull(),
  summary: text("summary").notNull(),
  status: text("status").$type<IntimationStatus>().notNull().default("NEW"),
  classification: text("classification").$type<IntimationClassification>().notNull().default("UNKNOWN"),
  sourceUrl: text("source_url"),
  actionType: text("action_type"),
  firstSeenAt: text("first_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reviewedAt: text("reviewed_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_intimations_external_id").on(table.externalId),
  uniqueIndex("idx_intimations_fingerprint").on(table.fingerprint),
  index("idx_intimations_status_date").on(table.status, table.availabilityDate),
  index("idx_intimations_classification").on(table.classification),
  index("idx_intimations_process_id").on(table.processId),
]);

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  attemptedAt: text("attempted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  succeededAt: text("succeeded_at"),
  status: text("status").notNull(),
  oab: text("oab").notNull().default("103774"),
  oabUf: text("oab_uf").notNull().default("RS"),
  historical: integer("historical", { mode: "boolean" }).notNull().default(false),
  firstSyncCompleted: integer("first_sync_completed", { mode: "boolean" }).notNull().default(false),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  lastPeriodProcessed: text("last_period_processed"),
  receivedCount: integer("received_count").notNull().default(0),
  totalFound: integer("total_found").notNull().default(0),
  totalUniqueProcesses: integer("total_unique_processes").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  existingCount: integer("existing_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  pagesProcessed: integer("pages_processed").notNull().default(0),
  periodsProcessed: integer("periods_processed").notNull().default(0),
  minDate: text("min_date"),
  maxDate: text("max_date"),
  recordsByYear: text("records_by_year").notNull().default("{}"),
  excludedSajulbra: integer("excluded_sajulbra").notNull().default(0),
  error: text("error"),
});

export const ignoredImports = sqliteTable("ignored_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  normalizedValue: text("normalized_value").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_ignored_imports_kind_value").on(table.kind, table.normalizedValue)]);

export const portfolioSyncRuns = sqliteTable("portfolio_sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: text("finished_at"),
  status: text("status").notNull().default("RUNNING"),
  coverageStart: text("coverage_start").notNull(),
  coverageEnd: text("coverage_end").notNull(),
  lastPeriod: text("last_period"),
  recordsScanned: integer("records_scanned").notNull().default(0),
  processesFound: integer("processes_found").notNull().default(0),
  activeProcesses: integer("active_processes").notNull().default(0),
  excludedSajulbra: integer("excluded_sajulbra").notNull().default(0),
  clientsCreated: integer("clients_created").notNull().default(0),
  clientsUpdated: integer("clients_updated").notNull().default(0),
  processesCreated: integer("processes_created").notNull().default(0),
  processesUpdated: integer("processes_updated").notNull().default(0),
  confidentialProcesses: integer("confidential_processes").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  errorDetails: text("error_details"),
});

export const portfolioSyncPeriods = sqliteTable("portfolio_sync_periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull().references(() => portfolioSyncRuns.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  status: text("status").notNull().default("RUNNING"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_portfolio_sync_period").on(table.runId, table.period)]);

export const pendingLegalProcesses = sqliteTable("pending_legal_processes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  processNumber: text("process_number").notNull(),
  title: text("title"),
  parties: text("parties"),
  court: text("court"),
  judicialBody: text("judicial_body"),
  area: text("area"),
  actionType: text("action_type"),
  status: text("status").$type<ProcessStatus>().notNull().default("UNKNOWN"),
  confidential: integer("confidential", { mode: "boolean" }).notNull().default(false),
  lastMovementAt: text("last_movement_at"),
  lastMovementDescription: text("last_movement_description"),
  reason: text("reason").notNull().default("VINCULO_PENDENTE"),
  enrichmentStatus: text("enrichment_status"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_pending_legal_process_number").on(table.processNumber),
  index("idx_pending_legal_process_status").on(table.status, table.confidential),
]);

export const portfolioSyncProcesses = sqliteTable("portfolio_sync_processes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull().references(() => portfolioSyncRuns.id, { onDelete: "cascade" }),
  processNumber: text("process_number").notNull(),
  status: text("status").$type<ProcessStatus>(),
  excludedReason: text("excluded_reason"),
  confidential: integer("confidential", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_portfolio_sync_process_run_number").on(table.runId, table.processNumber),
  index("idx_portfolio_sync_process_exclusion").on(table.runId, table.excludedReason),
]);
