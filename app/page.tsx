"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, FileDown, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import {
  ProcessEvolutionChart,
  ProcessStatusChart,
  type MonthlyProcessPoint,
  type ProcessStatusPoint,
} from "@/components/dashboard-charts";
import { Button } from "@/components/ui/button";

type SyncRun = {
  id?: number;
  attemptedAt: string;
  succeededAt: string | null;
  status: string;
  oab?: string;
  oabUf?: string;
  historical?: boolean;
  firstSyncCompleted?: boolean;
  periodStart?: string | null;
  periodEnd?: string | null;
  lastPeriodProcessed?: string | null;
  receivedCount: number;
  totalFound?: number;
  totalUniqueProcesses?: number;
  newCount: number;
  existingCount: number;
  updatedCount?: number;
  duplicateCount?: number;
  pagesProcessed?: number;
  periodsProcessed?: number;
  minDate?: string | null;
  maxDate?: string | null;
  recordsByYear?: string;
  excludedSajulbra: number;
  error: string | null;
};

type Intimation = {
  id: number;
  processNumber: string | null;
  processId: number | null;
  court: string | null;
  availabilityDate: string | null;
  summary: string;
  actionType: string | null;
  classification: string;
  status: string;
};

type Deadline = {
  kind: "CALENDAR";
  id: number;
  title: string;
  dueDate: string;
  dueTime: string | null;
  legalType: string;
  color: string | null;
  processId: number | null;
  processNumber: string | null;
};

type ChartPeriod = 6 | 12 | 24;

type DashboardData = {
  success: true;
  metrics: {
    totalProcesses: number;
    activeProcesses: number;
    pendingIntimations: number;
    deadlinesToday: number;
    sajulbra: number;
    newProcessesThisMonth: number;
    newProcessesPreviousMonth: number;
    closedProcesses: number;
    avgActiveAgeDays: number | null;
    newProcessTrend: number | null;
    closedRate: number;
  };
  intimations: Intimation[];
  deadlines: Deadline[];
  periodMonths: ChartPeriod;
  monthly: MonthlyProcessPoint[];
  statusBreakdown: ProcessStatusPoint[];
  lastSync: SyncRun | null;
  lastAttempt: SyncRun | null;
};

type ErrorResponse = { success: false; error?: string };

const classificationLabels: Record<string, string> = {
  UNKNOWN: "Publicação",
  INFORMATION: "Informação",
  POSSIBLE_DEADLINE: "Possível prazo",
  HEARING: "Audiência",
  PAYMENT: "Pagamento",
  DOCUMENT_REQUEST: "Documento",
  PROCEDURAL_ACTION: "Providência",
};

const statusLabels: Record<string, string> = {
  NEW: "Nova",
  IN_REVIEW: "Em análise",
  NEEDS_CONFIRMATION: "Confirmação necessária",
};

function formatNumber(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("pt-BR").format(value);
}

function parseDate(value: string) {
  const normalized = value.includes("T") ? value : value.includes(" ") ? `${value.replace(" ", "T")}Z` : `${value}T12:00:00Z`;
  return new Date(normalized);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Ainda não sincronizado";
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeZone: "America/Sao_Paulo" };
  if (value.includes("T") || value.includes(" ")) options.timeStyle = "short";
  return new Intl.DateTimeFormat("pt-BR", options).format(date);
}

function formatDeadlineDate(value: string) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return { month: "—", day: "—" };
  return {
    month: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).format(date).replace(".", "").toUpperCase(),
    day: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" }).format(date),
  };
}

function formatDuration(days: number | null) {
  if (days == null || days < 0) return "—";
  if (days < 60) return `${Math.max(1, Math.round(days))} dias`;
  if (days < 730) return `${(days / 30.44).toFixed(1).replace(".", ",")} meses`;
  return `${(days / 365.25).toFixed(1).replace(".", ",")} anos`;
}

function formatSyncPeriod(run: SyncRun | null | undefined) {
  if (!run?.periodStart && !run?.periodEnd) return "—";
  return `${formatDateTime(run.periodStart)} até ${formatDateTime(run.periodEnd)}`;
}

function syncStatusLabel(run: SyncRun | null | undefined) {
  if (!run) return "Sem histórico";
  if (run.status === "RUNNING") return "Em andamento";
  if (run.status === "ERROR") return "Com erro";
  if (run.firstSyncCompleted) return "Histórico completo";
  return "Período processado";
}

const calendarTypeLabels: Record<string, string> = { HEARING: "Audiência", DEADLINE: "Prazo", MEETING: "Reunião", DILIGENCE: "Diligência", EXPERT_EXAM: "Perícia", ORAL_ARGUMENT: "Sustentação", CLIENT_SERVICE: "Atendimento", OTHER: "Outro" };

function calendarTime(value: string | null) {
  if (!value) return null;
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
}

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodMonths, setPeriodMonths] = useState<ChartPeriod>(12);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?months=${periodMonths}`, { cache: "no-store" });
      const payload = await response.json() as DashboardData | ErrorResponse;
      if (!response.ok || payload.success !== true) throw new Error("error" in payload ? payload.error || "Não foi possível carregar o dashboard." : "Não foi possível carregar o dashboard.");
      setDashboard(payload);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar o dashboard.");
    } finally {
      setLoading(false);
    }
  }, [periodMonths]);

  useEffect(() => {
    // A primeira leitura sincroniza o estado local com os dados externos do dashboard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function syncOab() {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Não foi possível concluir a sincronização do DJEN.");
      await load();
    } catch (caught) {
      await load().catch(() => undefined);
      setError(caught instanceof Error ? caught.message : "Falha ao sincronizar o DJEN.");
    } finally {
      setSyncing(false);
    }
  }

  const metrics = dashboard?.metrics;
  const monthly = dashboard?.monthly || [];
  const syncRun = dashboard?.lastAttempt || dashboard?.lastSync;
  const needsHistoricalSync = !dashboard?.lastSync?.firstSyncCompleted;

  return (
    <div className="min-h-screen bg-[#f6f8fa]">
      <section className="h-auto px-4 pb-10 pt-[34px] sm:px-8 lg:min-h-[780px]">
        <div className="mx-auto max-w-[1196px]">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-[26px] font-bold leading-tight tracking-[-0.035em] text-[#111a2d]">Dashboard Executivo</h1>
              <p className="mt-1 text-sm font-medium text-[#60738f]">Jansen Advocacia • Dr. Francisco</p>
              <p className="mt-2 text-xs text-[#8da0ba]" aria-live="polite">
                {syncing ? (needsHistoricalSync ? "Sincronização histórica da OAB em andamento…" : "Sincronização DJEN/DataJud em andamento…") : dashboard?.lastSync ? `Última sincronização: ${formatDateTime(dashboard.lastSync.succeededAt)}` : "Sincronize o DJEN para carregar os indicadores."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => void syncOab()}
                disabled={syncing}
                aria-busy={syncing}
                className="h-[43px] rounded-xl border-[#9dbbd7] bg-white px-4 text-sm font-medium text-[#334258] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-[#fafbfd] disabled:cursor-wait disabled:opacity-70"
              >
                {syncing ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4 text-[#637791]" aria-hidden="true" />}
                {syncing ? (needsHistoricalSync ? "Carregando histórico…" : "Sincronizando OAB…") : `Sincronizar OAB (${formatNumber(metrics?.totalProcesses)})`}
              </Button>
              <Button asChild className="h-[43px] rounded-xl bg-[#09111f] px-5 text-sm font-medium text-white shadow-[0_2px_4px_rgba(9,17,31,0.16)] hover:bg-[#142037]">
                <Link href="/demandas/nova"><Plus className="size-4" aria-hidden="true" />Nova Demanda</Link>
              </Button>
            </div>
          </header>

          {error && <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}</div>}

          {syncRun && <section aria-label="Status da sincronização" className="mt-5">
            
            
            {syncRun.status === "ERROR" && syncRun.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{syncRun.error}</p>}
          </section>}

          <section aria-label="Indicadores" className="mt-[21px] grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
            <article className="h-[122px] rounded-2xl border border-[#dee4eb] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
              <p className="text-xs font-semibold text-[#61738d]">Total de Processos</p>
              <p className="mt-2 text-[32px] font-bold leading-none tracking-[-0.04em] text-[#111a2d]">{loading ? "—" : formatNumber(metrics?.totalProcesses)}</p>
              <p className="mt-2 text-xs text-[#8da0ba]">Processos particulares monitorados</p>
            </article>
            <article className="h-[122px] rounded-2xl border border-[#dee4eb] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
              <p className="text-xs font-semibold text-[#61738d]">Intimações Pendentes</p>
              <p className="mt-2 text-[32px] font-bold leading-none tracking-[-0.04em] text-[#f49a00]">{loading ? "—" : formatNumber(metrics?.pendingIntimations)}</p>
              <p className="mt-2 text-xs text-[#8da0ba]">Novas, em análise ou confirmação</p>
            </article>
            <article className="h-[122px] rounded-2xl border border-[#dee4eb] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
              <p className="text-xs font-semibold text-[#61738d]">Prazos Hoje</p>
              <p className="mt-2 text-[32px] font-bold leading-none tracking-[-0.04em] text-[#f04444]">{loading ? "—" : formatNumber(metrics?.deadlinesToday)}</p>
              <p className="mt-2 text-xs text-[#8da0ba]">Tarefas e prazos fatais em aberto</p>
            </article>
            <article className="h-[122px] rounded-2xl border border-[#dee4eb] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
              <p className="text-xs font-semibold text-[#61738d]">Sajulbra</p>
              <p className="mt-2 text-[32px] font-bold leading-none tracking-[-0.04em] text-[#111a2d]">{loading ? "—" : formatNumber(metrics?.sajulbra)}</p>
              <p className="mt-2 text-xs text-[#8da0ba]">Quantidade de processos SAJULBRA</p>
            </article>
          </section>

          <div className="mt-[26px] grid gap-6 xl:grid-cols-[minmax(0,2.08fr)_minmax(330px,1fr)]">
            <section>
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-base font-bold tracking-[-0.015em] text-[#111a2d]">Últimas Intimações</h2>
                <Link href="/intimacoes" className="rounded-md px-1 py-1 text-xs font-semibold text-[#e68e00] hover:text-[#b97000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a000]">Ver todas</Link>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[#dee4eb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
                {loading ? <div className="p-10 text-center text-sm text-[#687a92]">Carregando publicações…</div> : dashboard?.intimations.length ? dashboard.intimations.map((item) => (
                  <article key={item.id} className="min-h-[149px] border-b border-[#e8ecf1] px-5 py-[18px] last:border-b-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[#607793]">{[item.court, item.processNumber].filter(Boolean).join(" • ") || "Publicação sem processo identificado"}</p>
                        <h3 className="mt-2 text-[16px] font-bold leading-tight text-[#111a2d]">{item.actionType || classificationLabels[item.classification] || "Publicação"}</h3>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#687a92]">{item.summary}</p>
                      </div>
                      <time className="shrink-0 pt-0.5 text-xs text-[#8ca0bb]">{formatDateTime(item.availabilityDate)}</time>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.processId ? <Button asChild variant="secondary" size="sm" className="h-[29px] rounded-lg bg-[#edf2f7] px-3 text-xs font-semibold text-[#334258] hover:bg-[#e4ebf2]"><Link href={`/processos/${item.processId}`}>Ver Processo</Link></Button> : <Button variant="secondary" size="sm" disabled className="h-[29px] rounded-lg px-3 text-xs">Processo não vinculado</Button>}
                      <span className="inline-flex h-[29px] items-center rounded-lg bg-[#fff7e8] px-3 text-xs font-medium text-[#9a6500]">{statusLabels[item.status] || classificationLabels[item.classification] || "Acompanhar"}</span>
                    </div>
                  </article>
                )) : <div className="p-10 text-center text-sm text-[#687a92]">Nenhuma publicação sincronizada ainda.</div>}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-base font-bold tracking-[-0.015em] text-[#111a2d]">Próximos Prazos</h2>
                <Link href="/calendario" className="rounded-md px-1 py-1 text-xs font-semibold text-[#e68e00] hover:text-[#b97000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a000]">Calendário</Link>
              </div>
              <div className="space-y-3">
                {loading ? <div className="rounded-2xl border border-[#dee4eb] bg-white p-8 text-center text-sm text-[#687a92]">Carregando prazos…</div> : dashboard?.deadlines.length ? dashboard.deadlines.slice(0, 3).map((item) => {
                  const date = formatDeadlineDate(item.dueDate);
                  const time = calendarTime(item.dueTime);
                  return <Link key={`${item.kind}-${item.id}`} href="/calendario" className="grid min-h-[82px] grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[#dee4eb] bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.035)] transition-colors hover:border-[#cad3de] hover:bg-[#fcfdfe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d66a3]"><span className="grid h-[50px] place-items-center rounded-xl border border-[#edf0f4] bg-[#f7f9fb] leading-none"><span className="mt-2 text-[9px] font-bold text-[#8092a9]">{date.month}</span><span className="-mt-1 text-base font-bold text-[#132039]">{date.day}</span></span><span className="min-w-0"><span className="block truncate text-xs font-bold text-[#162238]">{item.title}</span><span className="mt-1 block truncate text-[10px] text-[#90a1b8]">{item.processNumber || "Agenda"}{time ? ` · ${time}` : " · Dia inteiro"}</span></span><span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600"><span className="size-2 rounded-full" style={{ backgroundColor: item.color || "#039be5" }} />{calendarTypeLabels[item.legalType] || "Outro"}</span></Link>;
                }) : <div className="rounded-2xl border border-dashed border-[#d9e0e8] bg-white p-8 text-center text-sm text-[#687a92]">Nenhum prazo em aberto cadastrado.</div>}
                <Button asChild variant="outline" className="h-[42px] w-full rounded-2xl border-[#dee4eb] bg-white text-xs font-semibold text-[#43536a] shadow-[0_1px_2px_rgba(15,23,42,0.035)] hover:bg-[#fafbfd]"><Link href="/calendario">Ver Calendário Completo</Link></Button>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section id="relatorios" className="border-t border-[#edf0f3] bg-white">
        <div className="min-h-[87px] border-b border-[#dde3ea]">
          <div className="mx-auto flex min-h-[87px] max-w-[1196px] flex-col justify-center gap-3 px-4 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.03em] text-[#111a2d]">Relatórios e Estatísticas de Processos</h2>
              <p className="mt-1 text-xs text-[#60738f]">Jansen Advocacia • Dr. Francisco • Visão Gerencial e Desempenho Operacional</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative">
                <span className="sr-only">Período dos gráficos</span>
                <select
                  value={periodMonths}
                  onChange={(event) => setPeriodMonths(Number(event.target.value) as ChartPeriod)}
                  className="h-[44px] min-w-[166px] cursor-pointer appearance-none rounded-lg border border-[#dbe1e8] bg-white px-3 pr-9 text-xs font-semibold text-[#415168] shadow-[0_1px_2px_rgba(15,23,42,0.035)] outline-none transition-colors hover:border-[#c5ced9] focus-visible:border-[#2d66a3] focus-visible:ring-2 focus-visible:ring-[#2d66a3]/25"
                >
                  <option value={6}>Últimos 6 meses</option>
                  <option value={12}>Últimos 12 meses</option>
                  <option value={24}>Últimos 24 meses</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#708198]" aria-hidden="true">▼</span>
              </label>
              <span className="flex h-[44px] items-center gap-2 rounded-lg border border-[#dbe1e8] bg-white px-3 text-xs font-semibold text-[#415168] shadow-[0_1px_2px_rgba(15,23,42,0.035)]"><FileDown className="size-3.5 text-[#708198]" aria-hidden="true" />Dados do dashboard</span>
            </div>
          </div>
        </div>

        <div className="min-h-[741px] bg-[#f6f8fa] px-4 py-8 sm:px-8">
          <div className="mx-auto max-w-[1196px]">
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <article className="min-h-[158px] rounded-2xl border border-[#e4e8ed] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
                <div className="flex items-start justify-between gap-3"><p className="max-w-[150px] text-xs font-medium leading-4 text-[#60738f]">Total de Processos<br />Ativos</p>{metrics?.newProcessTrend != null && <span className={`rounded px-2 py-1 text-[10px] font-bold ${metrics.newProcessTrend >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{metrics.newProcessTrend >= 0 ? "↑" : "↓"} {Math.abs(metrics.newProcessTrend)}%</span>}</div>
                <p className="mt-3 text-[31px] font-bold leading-none tracking-[-0.04em] text-[#111a2d]">{loading ? "—" : formatNumber(metrics?.activeProcesses)}</p>
                <p className="mt-3 text-[11px] leading-4 text-[#91a2b9]">Processos ativos e em<br />acompanhamento</p>
              </article>
              <article className="min-h-[158px] rounded-2xl border border-[#e4e8ed] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
                <div className="flex items-start justify-between gap-3"><p className="text-xs font-medium leading-4 text-[#60738f]">Novos Processos (Mês)</p><span className="text-[10px] font-medium text-[#91a2b9]">Período atual</span></div>
                <p className="mt-3 text-[31px] font-bold leading-none tracking-[-0.04em] text-[#f49a00]">{loading ? "—" : formatNumber(metrics?.newProcessesThisMonth)}</p>
                <p className="mt-3 text-[11px] leading-4 text-[#91a2b9]">Processos criados no mês<br />corrente</p>
              </article>
              <article className="min-h-[158px] rounded-2xl border border-[#e4e8ed] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
                <div className="flex items-start justify-between gap-3"><p className="max-w-[150px] text-xs font-medium leading-4 text-[#60738f]">Processos Baixados /<br />Concluídos</p><span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold leading-3 text-blue-600">{loading ? "—" : `${metrics?.closedRate}%`}<br />do total</span></div>
                <p className="mt-3 text-[31px] font-bold leading-none tracking-[-0.04em] text-[#111a2d]">{loading ? "—" : formatNumber(metrics?.closedProcesses)}</p>
                <p className="mt-3 text-[11px] leading-4 text-[#91a2b9]">Status arquivado ou<br />encerrado</p>
              </article>
              <article className="min-h-[158px] rounded-2xl border border-[#e4e8ed] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
                <div className="flex items-start justify-between gap-3"><p className="max-w-[150px] text-xs font-medium leading-4 text-[#60738f]">Tempo Médio em<br />Carteira</p><span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold leading-3 text-slate-600">Dados<br />operacionais</span></div>
                <p className="mt-3 text-[31px] font-bold leading-none tracking-[-0.04em] text-[#111a2d]">{loading ? "—" : formatDuration(metrics?.avgActiveAgeDays ?? null)}</p>
                <p className="mt-3 text-[11px] leading-4 text-[#91a2b9]">Média desde o cadastro<br />dos processos ativos</p>
              </article>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2.08fr)_minmax(320px,1fr)]">
              <article className="min-h-[430px] min-w-0 overflow-hidden rounded-2xl border border-[#e4e8ed] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
                <div className="flex flex-col gap-4 border-b border-[#edf0f4] pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div><h3 className="text-base font-bold leading-6 text-[#111a2d]">Evolução Mensal de Processos e <br />Publicações</h3><p className="mt-1 max-w-sm text-xs leading-4 text-[#91a2b9]">Novos processos, publicações DJEN e encerramentos<br />nos últimos {periodMonths} meses</p></div>
                  <span className="h-fit rounded-md bg-[#edf2f7] px-2.5 py-1.5 text-[10px] font-semibold text-[#43536a]">Dados mensais</span>
                </div>
                <div className="mt-3">
                  <ProcessEvolutionChart monthly={monthly} loading={loading} periodMonths={periodMonths} />
                </div>
              </article>

              <article className="min-h-[430px] overflow-hidden rounded-2xl border border-[#e4e8ed] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
                <div className="border-b border-[#edf0f4] pb-4"><h3 className="text-base font-bold text-[#111a2d]">Status Processuais</h3><p className="mt-1 text-xs text-[#91a2b9]">Distribuição da carteira atual</p></div>
                <div className="grid place-items-center py-9"><ProcessStatusChart statuses={dashboard?.statusBreakdown || []} total={metrics?.totalProcesses || 0} loading={loading} /></div>
                <div className="space-y-3 border-t border-[#edf0f4] pt-4 text-xs">{dashboard?.statusBreakdown.map((phase) => <div key={phase.key} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-[#40516a]"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: phase.color }} aria-hidden="true" />{phase.label}</span><strong className="shrink-0 text-[#111a2d]">{phase.percentage}% <span className="font-medium text-[#91a2b9]">({formatNumber(phase.count)})</span></strong></div>)}</div>
              </article>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
