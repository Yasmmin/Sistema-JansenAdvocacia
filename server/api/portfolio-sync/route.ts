import { and, desc, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { pendingLegalProcesses, portfolioSyncPeriods, portfolioSyncRuns } from "@/db/schema";
import { syncDjen } from "@/lib/sync";

export const dynamic = "force-dynamic";
const COVERAGE_START = "2021-01-01";

function currentDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function monthAfter(period: string) { const [year, month] = period.split("-").map(Number); const date = new Date(Date.UTC(year, month, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
function range(period: string, coverageEnd: string) { const [year, month] = period.split("-").map(Number); const last = new Date(Date.UTC(year, month, 0)).getUTCDate(); return { startDate: `${period}-01`, endDate: `${period}-${String(last).padStart(2, "0")}` > coverageEnd ? coverageEnd : `${period}-${String(last).padStart(2, "0")}` }; }

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("source") === "SAJULBRA" ? "SAJULBRA" : "PRIVATE";
  const db = getDb();
  const [run] = await db.select().from(portfolioSyncRuns).where(eq(portfolioSyncRuns.source, source)).orderBy(desc(portfolioSyncRuns.id)).limit(1);
  const liveMetrics = await getD1().prepare(`SELECT
    COUNT(*) AS processesFound,
    SUM(CASE WHEN status IN ('ACTIVE', 'AWAITING_COMPLIANCE', 'ON_APPEAL') THEN 1 ELSE 0 END) AS activeProcesses,
    SUM(CASE WHEN confidential = 1 THEN 1 ELSE 0 END) AS confidentialProcesses
    FROM legal_processes WHERE source = ?`).bind(source).first<{ processesFound: number; activeProcesses: number; confidentialProcesses: number }>();
  const currentRun = run ? {
    ...run,
    processesFound: Number(liveMetrics?.processesFound || 0),
    activeProcesses: Number(liveMetrics?.activeProcesses || 0),
    confidentialProcesses: Number(liveMetrics?.confidentialProcesses || 0),
  } : null;
  const pendingReason = source === "SAJULBRA" ? "SEGUNDO_GRAU_REVISAO" : "VINCULO_PENDENTE";
  const pending = (await db.select().from(pendingLegalProcesses)
    .where(eq(pendingLegalProcesses.reason, pendingReason))
    .orderBy(desc(pendingLegalProcesses.lastMovementAt), desc(pendingLegalProcesses.id))
    .limit(150))
    .filter((process) => !["ARCHIVED", "CLOSED"].includes(process.status));
  return Response.json({ success: true, run: currentRun, pending, coverageAvailableFrom: COVERAGE_START }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { runId?: number; source?: "PRIVATE" | "SAJULBRA" };
  const source = body.source === "SAJULBRA" ? "SAJULBRA" : "PRIVATE";
  const db = getDb();
  const coverageEnd = currentDate();
  let run = body.runId ? (await db.select().from(portfolioSyncRuns).where(and(eq(portfolioSyncRuns.id, Number(body.runId)), eq(portfolioSyncRuns.source, source))).limit(1))[0] : null;
  if (!run) [run] = await db.insert(portfolioSyncRuns).values({ coverageStart: COVERAGE_START, coverageEnd, status: "RUNNING", source }).returning();
  if (run.status === "SUCCESS") return Response.json({ success: true, done: true, run });
  const period = run.lastPeriod ? monthAfter(run.lastPeriod) : COVERAGE_START.slice(0, 7);
  if (`${period}-01` > run.coverageEnd) {
    const [finished] = await db.update(portfolioSyncRuns).set({ status: "SUCCESS", finishedAt: new Date().toISOString() }).where(eq(portfolioSyncRuns.id, run.id)).returning();
    return Response.json({ success: true, done: true, run: finished });
  }
  const d1 = getD1();
  const existing = await d1.prepare("SELECT id, status FROM portfolio_sync_periods WHERE run_id = ? AND period = ?").bind(run.id, period).first<{ id: number; status: string }>();
  if (existing?.status === "SUCCESS") return Response.json({ success: true, done: false, run, nextPeriod: monthAfter(period) });
  if (!existing) await db.insert(portfolioSyncPeriods).values({ runId: run.id, period, status: "RUNNING" });
  try {
    const { startDate, endDate } = range(period, run.coverageEnd);
    const result = await syncDjen({ startDate, endDate, historical: true });
    if ("skipped" in result && result.skipped) {
      return Response.json({
        success: false,
        error: "Já existe uma sincronização da OAB em andamento. Tente continuar em alguns minutos.",
        runId: run.id,
        period,
      }, { status: 409 });
    }
    const outcomeStatements = result.processOutcomes.map((outcome) => d1.prepare(`INSERT INTO portfolio_sync_processes
      (run_id, process_number, status, excluded_reason, confidential) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(run_id, process_number) DO UPDATE SET
      status = excluded.status, excluded_reason = excluded.excluded_reason, confidential = excluded.confidential`)
      .bind(run.id, outcome.processNumber, outcome.status, outcome.excludedReason, outcome.confidential));
    for (let index = 0; index < outcomeStatements.length; index += 50) await d1.batch(outcomeStatements.slice(index, index + 50));
    await d1.batch([
      d1.prepare("UPDATE portfolio_sync_periods SET status = 'SUCCESS' WHERE run_id = ? AND period = ?").bind(run.id, period),
      d1.prepare(`UPDATE portfolio_sync_runs SET last_period = ?, records_scanned = records_scanned + ?,
        processes_found = (SELECT COUNT(*) FROM legal_processes WHERE source = ?),
        active_processes = (SELECT COUNT(*) FROM legal_processes WHERE source = ? AND status IN ('ACTIVE', 'AWAITING_COMPLIANCE', 'ON_APPEAL')),
        excluded_sajulbra = (SELECT COUNT(*) FROM portfolio_sync_processes WHERE run_id = ? AND excluded_reason = 'SAJULBRA_ADAMO'), clients_created = clients_created + ?,
        clients_updated = clients_updated + ?, processes_created = processes_created + ?, processes_updated = processes_updated + ?,
        confidential_processes = (SELECT COUNT(*) FROM legal_processes WHERE source = ? AND confidential = 1), errors = errors + ? WHERE id = ?`)
        .bind(period, result.received, source, source, run.id, result.importedClients,
          result.updatedClients, result.importedProcesses, result.updatedProcesses, source, result.dataJudErrors, run.id),
    ]);
    const [updated] = await db.select().from(portfolioSyncRuns).where(eq(portfolioSyncRuns.id, run.id)).limit(1);
    const done = `${monthAfter(period)}-01` > updated.coverageEnd;
    if (done) {
      const [finished] = await db.update(portfolioSyncRuns).set({ status: "SUCCESS", finishedAt: new Date().toISOString() }).where(eq(portfolioSyncRuns.id, run.id)).returning();
      return Response.json({ success: true, done: true, run: finished });
    }
    return Response.json({ success: true, done: false, period, nextPeriod: monthAfter(period), run: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada";
    await d1.batch([
      d1.prepare("UPDATE portfolio_sync_periods SET status = 'FAILED' WHERE run_id = ? AND period = ?").bind(run.id, period),
      d1.prepare("UPDATE portfolio_sync_runs SET errors = errors + 1, error_details = ? WHERE id = ?").bind(message.slice(0, 1000), run.id),
    ]);
    return Response.json({ success: false, error: "Não foi possível consultar este período. Tente continuar a sincronização.", runId: run.id, period }, { status: 502 });
  }
}
