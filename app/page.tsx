"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, ExternalLink, FileSearch, LoaderCircle, RefreshCw, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Status = "NEW" | "IN_REVIEW" | "REVIEWED" | "NO_ACTION" | "COMPLETED" | "NEEDS_CONFIRMATION";
type Classification = "UNKNOWN" | "INFORMATION" | "POSSIBLE_DEADLINE" | "HEARING" | "PAYMENT" | "DOCUMENT_REQUEST" | "PROCEDURAL_ACTION";
type Intimation = {
  id: number; externalId: string; processNumber: string | null; processId: number | null; clientId: number | null; clientName: string | null; court: string | null; judicialBody: string | null;
  availabilityDate: string | null; publicationDate: string | null; recipient: string | null; lawyerName: string | null;
  oab: string; oabUf: string; content: string; summary: string; status: Status; classification: Classification;
  sourceUrl: string | null; firstSeenAt: string; reviewedAt: string | null; updatedAt: string;
};
type Dashboard = { counts: { new: number; inReview: number; possibleDeadlines: number; hearings: number; reviewed: number; total: number }; lastSync: SyncRun | null };
type SyncRun = { attemptedAt: string; succeededAt: string | null; status: string; receivedCount: number; newCount: number; existingCount: number; error: string | null };
type Filter = "ALL" | "NEW" | "IN_REVIEW" | "POSSIBLE_DEADLINE" | "HEARING" | "NO_ACTION" | "COMPLETED";

const statusLabels: Record<Status, string> = { NEW: "Nova", IN_REVIEW: "Em análise", REVIEWED: "Analisada", NO_ACTION: "Sem providência", COMPLETED: "Concluída", NEEDS_CONFIRMATION: "Necessita conferência" };
const classificationLabels: Record<Classification, string> = { UNKNOWN: "Não classificada", INFORMATION: "Informação", POSSIBLE_DEADLINE: "Possível prazo", HEARING: "Audiência", PAYMENT: "Pagamento", DOCUMENT_REQUEST: "Solicitação de documento", PROCEDURAL_ACTION: "Providência processual" };
const filterLabels: Record<Filter, string> = { ALL: "Todas", NEW: "Novas", IN_REVIEW: "Em análise", POSSIBLE_DEADLINE: "Possíveis prazos", HEARING: "Audiências", NO_ACTION: "Sem providência", COMPLETED: "Concluídas" };
const statusStyle: Record<Status, string> = { NEW: "border-rose-200 bg-rose-50 text-rose-800", IN_REVIEW: "border-amber-200 bg-amber-50 text-amber-800", REVIEWED: "border-sky-200 bg-sky-50 text-sky-800", NO_ACTION: "border-slate-200 bg-slate-100 text-slate-700", COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800", NEEDS_CONFIRMATION: "border-orange-200 bg-orange-50 text-orange-800" };
const classificationStyle: Partial<Record<Classification, string>> = { POSSIBLE_DEADLINE: "border-red-200 bg-red-50 text-red-800", HEARING: "border-violet-200 bg-violet-50 text-violet-800", INFORMATION: "border-blue-200 bg-blue-50 text-blue-800" };

function formatDate(value: string | null, withTime = false) {
  if (!value) return "—";
  const normalized = /T|\s\d{2}:/.test(value) ? value.replace(" ", "T") + (value.includes("Z") ? "" : "Z") : `${value}T12:00:00Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", ...(withTime ? { timeStyle: "short", timeZone: "America/Sao_Paulo" } : { timeZone: "UTC" }) }).format(date);
}

function priority(item: Intimation) {
  if (item.status === "NEW") return 0;
  if (item.classification === "POSSIBLE_DEADLINE") return 1;
  if (item.classification === "HEARING") return 2;
  if (item.status === "IN_REVIEW" || item.status === "NEEDS_CONFIRMATION") return 3;
  if (item.status === "COMPLETED" || item.status === "REVIEWED" || item.status === "NO_ACTION") return 5;
  return 4;
}

export default function Home() {
  const [items, setItems] = useState<Intimation[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selected, setSelected] = useState<Intimation | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const syncLock = useRef(false);

  const load = useCallback(async () => {
    const [intimationsResponse, dashboardResponse] = await Promise.all([fetch("/api/intimations", { cache: "no-store" }), fetch("/api/dashboard", { cache: "no-store" })]);
    const intimationsData = await intimationsResponse.json() as { intimations: Intimation[]; error?: string };
    const dashboardData = await dashboardResponse.json() as Dashboard & { error?: string };
    if (!intimationsResponse.ok || !dashboardResponse.ok) throw new Error(intimationsData.error || dashboardData.error || "Não foi possível carregar o painel.");
    setItems(intimationsData.intimations);
    setDashboard({ counts: dashboardData.counts, lastSync: dashboardData.lastSync });
  }, []);

  const sync = useCallback(async (automatic = false) => {
    if (syncLock.current) return { success: false, skipped: true };
    syncLock.current = true;
    setSyncing(true); setError(""); if (!automatic) setMessage("");
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const data = await response.json() as { success: boolean; new: number; existing: number; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Não foi possível consultar o DJEN agora.");
      setMessage(data.new > 0 ? `${data.new} nova${data.new === 1 ? "" : "s"} intimação${data.new === 1 ? "" : "ões"} encontrada${data.new === 1 ? "" : "s"}.` : "Nenhuma nova publicação encontrada.");
      await load();
      return { success: true, new: data.new, existing: data.existing };
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Falha inesperada.";
      setError(text);
      if (!automatic) throw caught;
      return { success: false, error: text };
    } finally { syncLock.current = false; setSyncing(false); }
  }, [load]);

  useEffect(() => {
    let mounted = true;
    void load().then(async () => {
      if (!mounted) return;
      setLoading(false);
    }).catch((caught) => { if (mounted) { setError(caught instanceof Error ? caught.message : "Falha ao carregar."); setLoading(false); } });
    return () => { mounted = false; };
  }, [load]);

  useEffect(() => {
    if (loading || !dashboard) return;
    const last = dashboard.lastSync?.succeededAt ? new Date(dashboard.lastSync.succeededAt.replace(" ", "T") + "Z").getTime() : 0;
    if (!last || Date.now() - last > 60 * 60 * 1000) void sync(true);
    const interval = window.setInterval(() => void sync(true), 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [dashboard, loading, sync]);

  useEffect(() => {
    const context = typeof document === "undefined" ? undefined : (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try { void Promise.resolve(context.registerTool({ name: "sync_djen", title: "Atualizar DJEN", description: "Sincroniza publicações reais da OAB/RS 103.774, salva somente novidades e atualiza o painel.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: async () => sync(false) }, { signal: lifecycle.signal })).catch(() => undefined); } catch {}
    return () => lifecycle.abort();
  }, [sync]);

  async function updateField(field: "status" | "classification", value: string) {
    if (!selected) return;
    const response = await fetch(`/api/intimations/${selected.id}/${field}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
    const data = await response.json() as { intimation: Intimation; error?: string };
    if (!response.ok) { setError(data.error || "Não foi possível salvar a alteração."); return; }
    setSelected(data.intimation);
    await load();
  }

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      const matchesFilter = filter === "ALL" || (["POSSIBLE_DEADLINE", "HEARING"].includes(filter) ? item.classification === filter : item.status === filter);
      const haystack = [item.processNumber, item.recipient, item.content, item.court, item.judicialBody].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return matchesFilter && (!query || haystack.includes(query));
    }).sort((a, b) => priority(a) - priority(b) || String(b.availabilityDate || "").localeCompare(String(a.availabilityDate || "")));
  }, [items, filter, search]);

  const counts = dashboard?.counts ?? { new: 0, inReview: 0, possibleDeadlines: 0, hearings: 0, reviewed: 0, total: 0 };
  const lastSuccessful = dashboard?.lastSync?.succeededAt || null;
  const indicators: Array<{ label: string; value: number; Icon: LucideIcon }> = [
    { label: "Novas", value: counts.new, Icon: AlertCircle },
    { label: "Em análise", value: counts.inReview, Icon: Clock3 },
    { label: "Possíveis prazos", value: counts.possibleDeadlines, Icon: FileSearch },
    { label: "Audiências", value: counts.hearings, Icon: CalendarDays },
    { label: "Analisadas", value: counts.reviewed, Icon: CheckCircle2 },
  ];

  return (
    <div>
      <div className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
        <header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Monitoramento de intimações</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Publicações do Francisco</h1><p className="mt-2 text-base text-slate-600">Francisco José Barrios Jansen Ferreira · OAB/RS 103.774</p><p className="mt-2 text-sm text-slate-500">Última atualização bem-sucedida: {formatDate(lastSuccessful, true)}</p></div>
          <Button onClick={() => void sync(false).catch(() => undefined)} disabled={syncing} size="lg" className="h-11 self-start bg-[#112b3d] px-5 hover:bg-[#1c4057] lg:self-auto">{syncing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{syncing ? "Consultando DJEN..." : "Atualizar DJEN"}</Button>
        </header>

        <section className={`mb-6 rounded-xl border p-5 sm:p-6 ${counts.new > 0 ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">{counts.new > 0 ? <AlertCircle className="mt-0.5 size-6 shrink-0 text-rose-700" /> : <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-700" />}<div><h2 className="text-lg font-bold">{counts.new > 0 ? `${counts.new} nova${counts.new === 1 ? "" : "s"} intimação${counts.new === 1 ? "" : "ões"} precisa${counts.new === 1 ? "" : "m"} ser analisada${counts.new === 1 ? "" : "s"}` : "Tudo analisado por enquanto."}</h2><p className="mt-1 text-sm text-slate-600">{message || (counts.new > 0 ? "As publicações novas aparecem primeiro na lista." : "Atualize o DJEN para verificar novas publicações.")}</p></div></div>
            {counts.new > 0 && <Button variant="outline" onClick={() => setFilter("NEW")} className="self-start border-rose-300 bg-white">Ver novas</Button>}
          </div>
        </section>

        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">Não foi possível concluir a operação.</p><p className="mt-1">{error}</p>{lastSuccessful && <p className="mt-2 text-red-700">Última atualização bem-sucedida: {formatDate(lastSuccessful, true)}</p>}</div>}

        <section aria-label="Indicadores" className="mb-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-5">
          {indicators.map(({ label, value, Icon }) => <div key={label} className="bg-white p-4 sm:p-5"><div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="size-4" />{label}</div><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="text-xl font-bold">Intimações</h2><p className="mt-1 text-sm text-slate-500">{visibleItems.length} {visibleItems.length === 1 ? "publicação exibida" : "publicações exibidas"}</p></div>
              <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar processo, parte ou conteúdo" className="h-10 pl-9" /></div>
                <div className="sm:hidden"><Select value={filter} onValueChange={(value) => setFilter(value as Filter)}><SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(filterLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              </div>
            </div>
            <div className="mt-4 hidden flex-wrap gap-2 sm:flex">{(Object.keys(filterLabels) as Filter[]).map((value) => <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)} className={filter === value ? "bg-[#112b3d]" : ""}>{filterLabels[value]}</Button>)}</div>
          </div>

          {loading ? <div className="flex items-center justify-center gap-3 p-16 text-slate-500"><LoaderCircle className="size-5 animate-spin" />Carregando histórico...</div> : visibleItems.length === 0 ? <div className="p-12 text-center"><FileSearch className="mx-auto size-8 text-slate-400" /><p className="mt-3 font-semibold">Nenhuma publicação encontrada</p><p className="mt-1 text-sm text-slate-500">Ajuste o filtro ou atualize o DJEN.</p></div> : (
            <div className="divide-y divide-slate-200">
              {visibleItems.map((item) => <button key={item.id} onClick={() => setSelected(item)} className="block w-full px-4 py-5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#315f7c] sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1"><div className="mb-3 flex flex-wrap gap-2"><Badge variant="outline" className={statusStyle[item.status]}>{statusLabels[item.status]}</Badge><Badge variant="outline" className={classificationStyle[item.classification] || "border-slate-200 bg-slate-50 text-slate-700"}>{classificationLabels[item.classification]}</Badge></div><p className="font-mono text-base font-bold tracking-tight text-[#112b3d]">{item.processNumber || "Processo não informado"}</p><p className="mt-2 text-sm font-medium text-slate-700">{[item.court, item.judicialBody].filter(Boolean).join(" · ") || "Órgão não informado"}</p><p className="mt-2 text-sm text-slate-500">{item.clientName ? `Cliente: ${item.clientName}` : "Cliente não identificado"}</p><p className="mt-3 line-clamp-2 max-w-4xl text-base leading-6 text-slate-600">{item.summary || "Conteúdo não informado."}</p>{item.recipient && <p className="mt-3 truncate text-sm text-slate-500">{/^sigilo$/i.test(item.recipient.trim()) ? "🔒 Processo sigiloso" : `Partes: ${item.recipient}`}</p>}</div>
                  <div className="shrink-0 lg:pl-8 lg:text-right"><p className="text-sm font-semibold text-slate-700">{formatDate(item.availabilityDate)}</p><p className="mt-2 text-sm font-semibold text-[#315f7c]">Ver detalhes</p></div>
                </div>
              </button>)}
            </div>
          )}
        </section>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          {selected && <><SheetHeader className="border-b border-slate-200 p-6 pr-12"><div className="mb-2 flex flex-wrap gap-2"><Badge variant="outline" className={statusStyle[selected.status]}>{statusLabels[selected.status]}</Badge><Badge variant="outline" className={classificationStyle[selected.classification] || "border-slate-200 bg-slate-50 text-slate-700"}>{classificationLabels[selected.classification]}</Badge></div><SheetTitle className="font-mono text-xl text-[#112b3d]">{selected.processNumber || "Processo não informado"}</SheetTitle><SheetDescription>{[selected.court, selected.judicialBody].filter(Boolean).join(" · ")}</SheetDescription><div className="mt-2 flex flex-wrap gap-4 text-sm font-semibold text-[#315f7c]">{selected.clientId ? <a href={`/clientes/${selected.clientId}`}>Cliente: {selected.clientName}</a> : <span className="font-normal text-slate-500">Cliente não identificado</span>}{selected.processId && <a href={`/processos/${selected.processId}`}>Abrir processo</a>}</div></SheetHeader>
          <div className="space-y-7 p-6">
            <div className="grid gap-5 sm:grid-cols-2"><label className="space-y-2 text-sm font-semibold text-slate-700">Status<Select value={selected.status} onValueChange={(value) => void updateField("status", value)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label><label className="space-y-2 text-sm font-semibold text-slate-700">Classificação<Select value={selected.classification} onValueChange={(value) => void updateField("classification", value)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(classificationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label></div>
            <dl className="grid gap-x-8 gap-y-5 border-y border-slate-200 py-6 sm:grid-cols-2">
              {selected.availabilityDate && <div><dt>Data de disponibilização</dt><dd>{formatDate(selected.availabilityDate)}</dd></div>}
              {selected.publicationDate && <div><dt>Data de publicação</dt><dd>{formatDate(selected.publicationDate)}</dd></div>}
              {selected.recipient && <div className="sm:col-span-2"><dt>Destinatário / partes</dt><dd>{/^sigilo$/i.test(selected.recipient.trim()) ? "🔒 Processo sigiloso" : selected.recipient}</dd></div>}
              <div className="sm:col-span-2"><dt>Advogado</dt><dd>{selected.lawyerName}<br />OAB {selected.oabUf} {selected.oab}</dd></div>
              <div><dt>Primeira vez encontrada</dt><dd>{formatDate(selected.firstSeenAt, true)}</dd></div>
              <div><dt>ID oficial</dt><dd>{selected.externalId}</dd></div>
            </dl>
            <div><h3 className="font-bold">Conteúdo integral</h3><p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 p-4 text-base leading-7 text-slate-700">{selected.content}</p></div>
            {selected.sourceUrl && <Button asChild variant="outline"><a href={selected.sourceUrl} target="_blank" rel="noreferrer">Abrir publicação de origem <ExternalLink /></a></Button>}
          </div></>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
