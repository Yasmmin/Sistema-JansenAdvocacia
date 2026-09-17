import { and, desc, eq, inArray } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { clients, ignoredImports, intimations, legalProcesses, pendingLegalProcesses, syncRuns } from "@/db/schema";
import { DJEN_HISTORY_FLOOR, DJEN_LOOKBACK_DAYS, MONITORED_LAWYER, dateInSaoPaulo, queryDjenRange, subtractDays } from "@/lib/djen";
import { queryDataJud, type DataJudProcess } from "@/lib/datajud";
import { allowedCourt, inferArea, normalizePersonName, normalizeProcessNumber, processDigits } from "@/lib/legal";

type SyncOptions = { startDate?: string; endDate?: string; historical?: boolean };

export async function syncDjen(options: SyncOptions = {}) {
  const db = getDb();
  const explicitRange = Boolean(options.startDate && options.endDate);
  const [completedFirstSync] = await db.select({ id: syncRuns.id }).from(syncRuns).where(and(
    eq(syncRuns.status, "SUCCESS"),
    eq(syncRuns.oab, MONITORED_LAWYER.oab),
    eq(syncRuns.oabUf, MONITORED_LAWYER.uf),
    eq(syncRuns.firstSyncCompleted, true),
  )).limit(1);
  const [priorSuccess] = await db.select({ succeededAt: syncRuns.succeededAt }).from(syncRuns).where(and(
    eq(syncRuns.status, "SUCCESS"),
    eq(syncRuns.oab, MONITORED_LAWYER.oab),
    eq(syncRuns.oabUf, MONITORED_LAWYER.uf),
    eq(syncRuns.firstSyncCompleted, true),
  )).orderBy(desc(syncRuns.succeededAt), desc(syncRuns.id)).limit(1);
  const historical = options.historical === true;
  const officialHistorical = historical && !explicitRange;
  const periodEnd = options.endDate || dateInSaoPaulo(new Date());
  const periodStart = options.startDate || (historical ? DJEN_HISTORY_FLOOR : subtractDays(periodEnd, DJEN_LOOKBACK_DAYS));
  const [attempt] = await db.insert(syncRuns).values({
    status: "RUNNING",
    oab: MONITORED_LAWYER.oab,
    oabUf: MONITORED_LAWYER.uf,
    historical,
    firstSyncCompleted: false,
    periodStart,
    periodEnd,
  }).returning();
  try {
    const result = await queryDjenRange(periodStart, periodEnd);
    const ids = result.publications.map((item) => item.externalId);
    const normalizedProcessNumbers = [...new Set(result.publications.map((item) => item.processNumber ? normalizeProcessNumber(item.processNumber) : null).filter((value): value is string => Boolean(value)))];
    const matchingProcesses: Array<{ id: number; processNumber: string; clientId: number | null }> = [];
    for (let index = 0; index < normalizedProcessNumbers.length; index += 50) {
      matchingProcesses.push(...await db.select({ id: legalProcesses.id, processNumber: legalProcesses.processNumber, clientId: legalProcesses.clientId }).from(legalProcesses).where(inArray(legalProcesses.processNumber, normalizedProcessNumbers.slice(index, index + 50))));
    }
    const processMap = new Map(matchingProcesses.map((process) => [processDigits(process.processNumber), process.id]));
    const processRows = new Map(matchingProcesses.map((process) => [processDigits(process.processNumber), process]));
    const matchingPending: Array<{ id: number; processNumber: string }> = [];
    for (let index = 0; index < normalizedProcessNumbers.length; index += 50) {
      matchingPending.push(...await db.select({ id: pendingLegalProcesses.id, processNumber: pendingLegalProcesses.processNumber }).from(pendingLegalProcesses).where(inArray(pendingLegalProcesses.processNumber, normalizedProcessNumbers.slice(index, index + 50))));
    }
    const pendingMap = new Map(matchingPending.map((process) => [processDigits(process.processNumber), process.id]));
    const existing: Array<{ externalId: string; fingerprint: string }> = [];
    for (let index = 0; index < ids.length; index += 50) {
      const batchIds = ids.slice(index, index + 50);
      existing.push(
        ...await db
          .select({ externalId: intimations.externalId, fingerprint: intimations.fingerprint })
          .from(intimations)
          .where(inArray(intimations.externalId, batchIds)),
      );
    }
    const known = new Set(existing.map((item) => item.externalId));
    const fingerprints = result.publications.map((item) => item.fingerprint);
    const existingFingerprints: Array<{ externalId: string; fingerprint: string }> = [];
    for (let index = 0; index < fingerprints.length; index += 50) {
      existingFingerprints.push(
        ...await db
          .select({ externalId: intimations.externalId, fingerprint: intimations.fingerprint })
          .from(intimations)
          .where(inArray(intimations.fingerprint, fingerprints.slice(index, index + 50))),
      );
    }
    const fingerprintOwners = new Map(existingFingerprints.map((item) => [item.fingerprint, item.externalId]));
    const databaseDuplicates = result.publications.filter((item) => fingerprintOwners.has(item.fingerprint) && fingerprintOwners.get(item.fingerprint) !== item.externalId).length;
    const publicationsToPersist = result.publications.filter((item) => !fingerprintOwners.has(item.fingerprint) || fingerprintOwners.get(item.fingerprint) === item.externalId);
    const now = new Date().toISOString();

    const publicationGroups = new Map<string, typeof result.publications>();
    for (const publication of result.publications) {
      const digits = processDigits(publication.processNumber);
      if (!digits) continue;
      publicationGroups.set(digits, [...(publicationGroups.get(digits) || []), publication]);
    }
    const ignored = await db.select({ kind: ignoredImports.kind, normalizedValue: ignoredImports.normalizedValue }).from(ignoredImports);
    const ignoredProcesses = new Set(ignored.filter((item) => item.kind === "PROCESS").map((item) => item.normalizedValue));
    const ignoredClients = new Set(ignored.filter((item) => item.kind === "CLIENT").map((item) => item.normalizedValue));
    const dataJudMap = new Map<string, DataJudProcess>();
    const dataJudErrors = 0;
    const byCourt = new Map<string, string[]>();
    for (const publication of result.publications) {
      if (!publication.processNumber || !publication.court) continue;
      byCourt.set(publication.court, [...(byCourt.get(publication.court) || []), publication.processNumber]);
    }
    for (const [court, numbers] of byCourt) {
      for (const [digits, data] of await queryDataJud(court, numbers)) dataJudMap.set(digits, data);
    }
    const currentClients = await db.select({ id: clients.id, name: clients.name, normalizedName: clients.normalizedName }).from(clients).where(eq(clients.source, "PRIVATE"));
    const clientMap = new Map<string, number>();
    for (const client of currentClients) clientMap.set(client.normalizedName || normalizePersonName(client.name), client.id);
    let importedClients = 0;
    let importedProcesses = 0;
    let excludedProcesses = 0;
    let updatedClients = 0;
    let updatedProcesses = 0;
    let activeProcesses = 0;
    let confidentialProcesses = 0;
    const processOutcomes: Array<{ processNumber: string; status: string | null; excludedReason: string | null; confidential: boolean }> = [];

    for (const [digits, publications] of publicationGroups) {
      if (publications.some((publication) => publication.hasAdamo)) {
        excludedProcesses += 1;
        processOutcomes.push({ processNumber: digits, status: null, excludedReason: "SAJULBRA_ADAMO", confidential: publications.some((publication) => publication.confidential) });
        continue;
      }
      if (ignoredProcesses.has(digits)) continue;
      const latest = [...publications].sort((a, b) => String(b.availabilityDate || "").localeCompare(String(a.availabilityDate || "")))[0];
      const official = dataJudMap.get(digits);
      const existingProcess = processRows.get(digits);
      if (official && ["CLOSED", "ARCHIVED"].includes(official.status)) {
        processOutcomes.push({ processNumber: digits, status: official.status, excludedReason: null, confidential: Boolean(official.confidential) });
        if (existingProcess) await db.update(legalProcesses).set({ status: official.status, lastMovementAt: official.lastMovementAt, lastMovementDescription: official.lastMovementDescription, updatedAt: now }).where(eq(legalProcesses.id, existingProcess.id));
        const pendingId = pendingMap.get(digits);
        if (pendingId) await db.update(pendingLegalProcesses).set({ status: official.status, lastMovementAt: official.lastMovementAt, lastMovementDescription: official.lastMovementDescription, updatedAt: now }).where(eq(pendingLegalProcesses.id, pendingId));
        continue;
      }
      if (official?.status === "ACTIVE") activeProcesses += 1;
      const confidential = publications.some((publication) => publication.confidential) || Boolean(official?.confidential);
      if (confidential) confidentialProcesses += 1;
      const clientNames = publications.map((publication) => publication.representedClient).filter((value): value is string => Boolean(value));
      const clientName = clientNames.sort((a, b) => clientNames.filter((name) => normalizePersonName(name) === normalizePersonName(b)).length - clientNames.filter((name) => normalizePersonName(name) === normalizePersonName(a)).length)[0] || null;
      if (clientName && ignoredClients.has(normalizePersonName(clientName))) continue;
      let clientId = clientName ? clientMap.get(normalizePersonName(clientName)) ?? null : null;
      if (clientName && !clientId) {
        const [created] = await db.insert(clients).values({ name: clientName, normalizedName: normalizePersonName(clientName), source: "PRIVATE", status: "ACTIVE", updatedAt: now }).onConflictDoNothing().returning({ id: clients.id });
        if (created) { clientId = created.id; importedClients += 1; }
        else {
          const [found] = await db.select({ id: clients.id }).from(clients).where(eq(clients.normalizedName, normalizePersonName(clientName))).limit(1);
          clientId = found?.id ?? null;
        }
        if (clientId) clientMap.set(normalizePersonName(clientName), clientId);
      } else if (clientId) {
        updatedClients += 1;
      }
      const parties = latest.recipients.filter((recipient) => normalizePersonName(recipient.name) !== "SIGILO").map((recipient) => `${recipient.pole ? `${recipient.pole}: ` : ""}${recipient.name}`).join(" • ") || null;
      const processNumber = normalizeProcessNumber(latest.processNumber || digits);
      const inferredCourt = allowedCourt(latest.court);
      const actionType = official?.actionType || latest.actionType;
      const judicialBody = official?.judicialBody || latest.judicialBody;
      const inferredArea = inferArea(actionType, judicialBody);
      const movementAt = official?.lastMovementAt || latest.availabilityDate;
      const movementDescription = official?.lastMovementDescription || latest.summary;
       const officialStatus = official?.status || (historical ? "UNKNOWN" : "ACTIVE");
      processOutcomes.push({ processNumber: digits, status: officialStatus, excludedReason: null, confidential });
      if (!clientId) {
        await db.insert(pendingLegalProcesses).values({
          processNumber, title: actionType, parties, court: inferredCourt, judicialBody, area: inferredArea, actionType,
          status: officialStatus, confidential, lastMovementAt: movementAt, lastMovementDescription: movementDescription,
          reason: "VINCULO_PENDENTE", enrichmentStatus: confidential && !parties ? "PENDING" : null, updatedAt: now,
        }).onConflictDoUpdate({ target: pendingLegalProcesses.processNumber, set: {
          title: actionType, parties, court: inferredCourt, judicialBody, area: inferredArea, actionType,
          status: officialStatus, confidential, lastMovementAt: movementAt, lastMovementDescription: movementDescription,
          enrichmentStatus: confidential && !parties ? "PENDING" : null, updatedAt: now,
        } });
        continue;
      }
      if (!existingProcess) {
        const [created] = await db.insert(legalProcesses).values({
          clientId, processNumber, title: actionType, parties, court: inferredCourt, judicialBody,
          area: inferredArea, actionType, status: officialStatus, priority: "MEDIUM", source: "PRIVATE",
          lastMovementAt: movementAt, lastMovementDescription: movementDescription, confidential,
          partiesSource: parties ? "DJEN" : null, enrichmentStatus: confidential && !parties ? "PENDING" : null, updatedAt: now,
        }).onConflictDoNothing().returning({ id: legalProcesses.id, clientId: legalProcesses.clientId });
        if (created) {
          processMap.set(digits, created.id); processRows.set(digits, { id: created.id, processNumber, clientId: created.clientId }); importedProcesses += 1;
        }
      } else {
        await getD1().prepare(`UPDATE legal_processes SET
          client_id = COALESCE(client_id, ?), title = COALESCE(NULLIF(title, ''), ?), parties = COALESCE(NULLIF(parties, ''), ?),
          court = COALESCE(NULLIF(court, ''), ?), judicial_body = COALESCE(NULLIF(judicial_body, ''), ?),
          area = COALESCE(NULLIF(area, ''), ?), action_type = COALESCE(NULLIF(action_type, ''), ?),
          last_movement_at = ?, last_movement_description = ?, confidential = CASE WHEN ? THEN 1 ELSE confidential END,
          parties_source = COALESCE(parties_source, ?), enrichment_status = COALESCE(enrichment_status, ?),
          status = CASE WHEN ? IS NOT NULL THEN ? ELSE status END, updated_at = ? WHERE id = ?`)
          .bind(clientId, actionType, parties, inferredCourt, judicialBody, inferredArea, actionType, movementAt, movementDescription,
            confidential, parties ? "DJEN" : null, confidential && !parties ? "PENDING" : null,
            official?.status || null, official?.status || null, now, existingProcess.id).run();
        updatedProcesses += 1;
      }
      const pendingId = pendingMap.get(digits);
      if (pendingId) await db.delete(pendingLegalProcesses).where(eq(pendingLegalProcesses.id, pendingId));
    }

    const d1 = getD1();
    const sql = `INSERT INTO intimations (
      external_id, fingerprint, process_number, process_id, court, judicial_body, availability_date, publication_date,
      recipient, lawyer_name, oab, oab_uf, content, summary, status, classification, source_url, action_type, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      fingerprint = excluded.fingerprint, process_number = excluded.process_number, process_id = excluded.process_id, court = excluded.court,
      judicial_body = excluded.judicial_body, availability_date = excluded.availability_date,
      publication_date = excluded.publication_date, recipient = excluded.recipient, lawyer_name = excluded.lawyer_name,
      content = excluded.content, summary = excluded.summary, source_url = excluded.source_url,
      action_type = excluded.action_type, updated_at = excluded.updated_at`;
    const statements = publicationsToPersist.map((item) => d1.prepare(sql).bind(
      item.externalId, item.fingerprint, item.processNumber ? normalizeProcessNumber(item.processNumber) : null,
      processMap.get(processDigits(item.processNumber)) ?? null, item.court, item.judicialBody, item.availabilityDate,
      item.publicationDate, item.recipient, item.lawyerName, item.oab, item.oabUf, item.content, item.summary,
      item.classification, item.sourceUrl, item.actionType, now,
    ));
    for (let index = 0; index < statements.length; index += 50) {
      await d1.batch(statements.slice(index, index + 50));
    }
    const touchedProcessIds = [...new Set(result.publications.map((item) => processMap.get(processDigits(item.processNumber))).filter((value): value is number => Boolean(value)))];
    const movementUpdates = touchedProcessIds.map((processId) => d1.prepare(`UPDATE legal_processes SET
      last_movement_at = (SELECT availability_date FROM intimations WHERE process_id = ? ORDER BY availability_date DESC, id DESC LIMIT 1),
      last_movement_description = (SELECT summary FROM intimations WHERE process_id = ? ORDER BY availability_date DESC, id DESC LIMIT 1),
      updated_at = ? WHERE id = ?`).bind(processId, processId, now, processId));
    for (let index = 0; index < movementUpdates.length; index += 50) await d1.batch(movementUpdates.slice(index, index + 50));

    const newCount = result.publications.filter((item) => !known.has(item.externalId) && !fingerprintOwners.has(item.fingerprint)).length;
    const existingCount = result.publications.filter((item) => known.has(item.externalId)).length;
    const duplicateCount = result.duplicateCount + databaseDuplicates;
    const firstSyncCompleted = Boolean(completedFirstSync || priorSuccess || officialHistorical || !historical);
    await db.update(syncRuns).set({
      status: "SUCCESS", succeededAt: now, receivedCount: result.received, totalFound: result.total,
      totalUniqueProcesses: publicationGroups.size, newCount, existingCount, updatedCount: existingCount,
      duplicateCount, pagesProcessed: result.pagesProcessed, periodsProcessed: 1,
      minDate: result.minDate, maxDate: result.maxDate, recordsByYear: JSON.stringify(result.recordsByYear),
      lastPeriodProcessed: periodEnd, firstSyncCompleted, excludedSajulbra: excludedProcesses,
    }).where(eq(syncRuns.id, attempt.id));
    return { success: true, rawTotal: result.total, received: result.received, validated: result.publications.length, new: newCount, existing: existingCount,
      updated: existingCount, duplicates: duplicateCount, pagesProcessed: result.pagesProcessed, recordsByYear: result.recordsByYear,
      processesFound: publicationGroups.size, activeProcesses, importedClients, updatedClients, importedProcesses, updatedProcesses,
      excludedProcesses, confidentialProcesses, dataJudErrors, processOutcomes, firstSyncCompleted, historical,
      period: { start: result.startDate, end: result.endDate }, coverage: { minDate: result.minDate, maxDate: result.maxDate } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada";
    try {
      await db.update(syncRuns).set({ status: "ERROR", error: message.slice(0, 500) }).where(eq(syncRuns.id, attempt.id));
    } catch (logError) {
      console.error("[SYNC] Não foi possível registrar a falha:", logError);
    }
    throw error;
  }
}

export async function lastSync() {
  const db = getDb();
  const [run] = await db.select().from(syncRuns).where(eq(syncRuns.status, "SUCCESS")).orderBy(desc(syncRuns.succeededAt), desc(syncRuns.id)).limit(1);
  return run ?? null;
}

export async function lastAttempt() {
  const db = getDb();
  const [run] = await db.select().from(syncRuns).orderBy(desc(syncRuns.attemptedAt), desc(syncRuns.id)).limit(1);
  return run ?? null;
}
