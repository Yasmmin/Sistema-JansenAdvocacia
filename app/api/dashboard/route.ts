import { getD1 } from "@/db";
import { normalizeOfficialLabel, normalizeOfficialText, stripHtml } from "@/lib/djen";
import { lastAttempt, lastSync } from "@/lib/sync";

export const dynamic = "force-dynamic";

type MonthlyRow = { month: string; kind: "NEW" | "ACTIVITY" | "CLOSED"; count: number | string | null };
type StatusRow = { status: string; count: number | string | null };
type DashboardMetricsRow = {
  totalProcesses: number | string | null;
  activeProcesses: number | string | null;
  pendingIntimations: number | string | null;
  deadlinesToday: number | string | null;
  sajulbra: number | string | null;
  newProcessesThisMonth: number | string | null;
  newProcessesPreviousMonth: number | string | null;
  closedProcesses: number | string | null;
  avgActiveAgeDays: number | string | null;
};

function currentDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toNumber(value: number | string | null | undefined) {
  return Number(value || 0);
}

function monthLabel(monthKey: string, includeYear = false) {
  const date = new Date(`${monthKey}-01T12:00:00Z`);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
  const normalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
  return includeYear ? `${normalizedLabel}/${monthKey.slice(2, 4)}` : normalizedLabel;
}

export async function GET(request: Request) {
  try {
    const db = getD1();
    const requestedMonths = Number(new URL(request.url).searchParams.get("months"));
    const periodMonths = [6, 12, 24].includes(requestedMonths) ? requestedMonths : 12;
    const today = currentDate();
    const currentMonth = today.slice(0, 7);
    const previousMonth = shiftMonth(currentMonth, -1);
    const chartStart = `${shiftMonth(currentMonth, -(periodMonths - 1))}-01`;

    const [metricsRow, latestResult, deadlinesResult, monthlyResult, statusResult, successfulSync, attemptedSync] = await Promise.all([
      db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM legal_processes WHERE source = 'PRIVATE') AS totalProcesses,
          (SELECT COUNT(*) FROM legal_processes WHERE source = 'PRIVATE' AND status IN ('ACTIVE', 'AWAITING_COMPLIANCE', 'ON_APPEAL')) AS activeProcesses,
          (SELECT COUNT(*) FROM intimations WHERE status IN ('NEW', 'IN_REVIEW', 'NEEDS_CONFIRMATION')) AS pendingIntimations,
          (SELECT COUNT(*) FROM tasks WHERE due_date = ? AND status <> 'COMPLETED') +
            (SELECT COUNT(*) FROM legal_processes WHERE source = 'PRIVATE' AND fatal_deadline = ? AND status IN ('ACTIVE', 'AWAITING_COMPLIANCE', 'ON_APPEAL')) AS deadlinesToday,
          COALESCE((SELECT excluded_sajulbra FROM sync_runs WHERE status = 'SUCCESS' ORDER BY succeeded_at DESC, id DESC LIMIT 1), 0) AS sajulbra,
          (SELECT COUNT(*) FROM legal_processes WHERE source = 'PRIVATE' AND substr(created_at, 1, 7) = ?) AS newProcessesThisMonth,
          (SELECT COUNT(*) FROM legal_processes WHERE source = 'PRIVATE' AND substr(created_at, 1, 7) = ?) AS newProcessesPreviousMonth,
          (SELECT COUNT(*) FROM legal_processes WHERE source = 'PRIVATE' AND status IN ('CLOSED', 'ARCHIVED')) AS closedProcesses,
          (SELECT AVG(julianday(?) - julianday(substr(created_at, 1, 10))) FROM legal_processes WHERE source = 'PRIVATE' AND status IN ('ACTIVE', 'AWAITING_COMPLIANCE', 'ON_APPEAL')) AS avgActiveAgeDays
      `).bind(today, today, currentMonth, previousMonth, today).first<DashboardMetricsRow>(),
      db.prepare(`
        SELECT id, process_number AS processNumber, process_id AS processId, court, availability_date AS availabilityDate,
          summary, action_type AS actionType, classification, status
        FROM intimations
        ORDER BY availability_date DESC, id DESC
        LIMIT 3
      `).all(),
      db.prepare(`
        SELECT 'CALENDAR' AS kind, e.id, e.title, e.start_at AS dueDate,
          CASE WHEN e.all_day = 1 THEN NULL ELSE e.start_at END AS dueTime,
          e.legal_type AS legalType, e.google_color AS color,
          e.process_id AS processId, COALESCE(p.process_number, e.cnj) AS processNumber
        FROM calendar_events e
        LEFT JOIN legal_processes p ON p.id = e.process_id
        WHERE e.deleted_at IS NULL AND e.status <> 'cancelled' AND date(e.start_at) >= ?
        ORDER BY e.start_at ASC, e.id ASC
        LIMIT 6
      `).bind(today).all(),
      db.prepare(`
        SELECT substr(created_at, 1, 7) AS month, 'NEW' AS kind, COUNT(*) AS count
        FROM legal_processes
        WHERE source = 'PRIVATE' AND created_at >= ?
        GROUP BY substr(created_at, 1, 7)
        UNION ALL
        SELECT substr(availability_date, 1, 7) AS month, 'ACTIVITY' AS kind, COUNT(*) AS count
        FROM intimations
        WHERE availability_date >= ?
        GROUP BY substr(availability_date, 1, 7)
        UNION ALL
        SELECT substr(updated_at, 1, 7) AS month, 'CLOSED' AS kind, COUNT(*) AS count
        FROM legal_processes
        WHERE source = 'PRIVATE' AND status IN ('CLOSED', 'ARCHIVED') AND updated_at >= ?
        GROUP BY substr(updated_at, 1, 7)
      `).bind(chartStart, chartStart, chartStart).all<MonthlyRow>(),
      db.prepare(`
        SELECT status, COUNT(*) AS count
        FROM legal_processes
        WHERE source = 'PRIVATE'
        GROUP BY status
      `).all<StatusRow>(),
      lastSync(),
      lastAttempt(),
    ]);

    const metrics = {
      totalProcesses: toNumber(metricsRow?.totalProcesses),
      activeProcesses: toNumber(metricsRow?.activeProcesses),
      pendingIntimations: toNumber(metricsRow?.pendingIntimations),
      deadlinesToday: toNumber(metricsRow?.deadlinesToday),
      sajulbra: toNumber(metricsRow?.sajulbra),
      newProcessesThisMonth: toNumber(metricsRow?.newProcessesThisMonth),
      newProcessesPreviousMonth: toNumber(metricsRow?.newProcessesPreviousMonth),
      closedProcesses: toNumber(metricsRow?.closedProcesses),
      avgActiveAgeDays: metricsRow?.avgActiveAgeDays == null ? null : toNumber(metricsRow.avgActiveAgeDays),
    };

    const previousNew = metrics.newProcessesPreviousMonth;
    const newProcessTrend = previousNew > 0
      ? Math.round(((metrics.newProcessesThisMonth - previousNew) / previousNew) * 100)
      : null;
    const closedRate = metrics.totalProcesses > 0
      ? Math.round((metrics.closedProcesses / metrics.totalProcesses) * 100)
      : 0;

    const monthlyMap = new Map<string, { fresh: number; progress: number; done: number }>();
    for (let index = 0; index < periodMonths; index += 1) {
      monthlyMap.set(shiftMonth(currentMonth, index - (periodMonths - 1)), { fresh: 0, progress: 0, done: 0 });
    }
    for (const row of monthlyResult.results as MonthlyRow[]) {
      const month = monthlyMap.get(row.month);
      if (!month) continue;
      const count = toNumber(row.count);
      if (row.kind === "NEW") month.fresh = count;
      if (row.kind === "ACTIVITY") month.progress = count;
      if (row.kind === "CLOSED") month.done = count;
    }
    const monthly = [...monthlyMap.entries()].map(([month, values]) => ({
      month,
      label: monthLabel(month, periodMonths > 12),
      ...values,
    }));

    const statusCounts = new Map((statusResult.results as StatusRow[]).map((row) => [row.status, toNumber(row.count)]));
    const statusTotal = metrics.totalProcesses || 1;
    const statusBreakdown = [
      { key: "IN_PROGRESS", label: "Em andamento", count: (statusCounts.get("ACTIVE") || 0) + (statusCounts.get("AWAITING_COMPLIANCE") || 0) + (statusCounts.get("ON_APPEAL") || 0), color: "#071a3b" },
      { key: "SUSPENDED", label: "Suspensos", count: statusCounts.get("SUSPENDED") || 0, color: "#3b82f6" },
      { key: "CLOSED", label: "Baixados / concluídos", count: (statusCounts.get("CLOSED") || 0) + (statusCounts.get("ARCHIVED") || 0), color: "#10adc4" },
      { key: "UNKNOWN", label: "Status não informado", count: statusCounts.get("UNKNOWN") || 0, color: "#f59e0b" },
    ].map((item) => ({ ...item, percentage: Math.round((item.count / statusTotal) * 100) }));

    const latestIntimations = latestResult.results.map((item) => {
      const row = item as { actionType?: string | null; summary?: string | null };
      return {
        ...item,
        actionType: row.actionType ? normalizeOfficialLabel(row.actionType) : row.actionType,
        summary: row.summary ? normalizeOfficialText(stripHtml(row.summary)) : row.summary,
      };
    });

    return Response.json({
      success: true,
      metrics: { ...metrics, newProcessTrend, closedRate },
      intimations: latestIntimations,
      deadlines: deadlinesResult.results,
      periodMonths,
      monthly,
      statusBreakdown,
      lastSync: successfulSync,
      lastAttempt: attemptedSync,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[DASHBOARD_GET]", error);
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Falha ao carregar painel." }, { status: 500 });
  }
}
