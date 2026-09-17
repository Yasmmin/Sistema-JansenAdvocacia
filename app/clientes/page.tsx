"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDownUp, BriefcaseBusiness, Check, Clock3, ExternalLink, FolderOpen, History, LoaderCircle, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { officialProcessPortal } from "@/lib/legal";

type ClientRow = {
  id: number; name: string; cpf: string | null; phone: string | null; email: string | null; driveFolderUrl: string | null;
  status: "ACTIVE" | "ATTENTION_REQUIRED" | "NO_RECENT_ACTIVITY" | "PROSPECT" | "CLOSED";
  activeProcessCount: number; lastMovementAt: string | null; nextDeadline: string | null; mainArea: string | null;
  hasAction: number; hasNewMovement: number; processNumbers: string | null; processStatuses: string | null; areas: string | null; parties: string | null; actionTypes: string | null;
};
type Filter = "ALL" | "ACTION" | "NEW" | "QUIET" | "PROSPECT" | "CLOSED";
type Sort = "PRIORITY" | "NAME" | "MOVEMENT" | "DEADLINE" | "PROCESSES";
type PortfolioRun = { id: number; status: string; coverageStart: string; coverageEnd: string; lastPeriod: string | null; recordsScanned: number; processesFound: number; activeProcesses: number; excludedSajulbra: number; clientsCreated: number; clientsUpdated: number; processesCreated: number; processesUpdated: number; confidentialProcesses: number; errors: number };
type PendingProcess = { id: number; processNumber: string; title: string | null; court: string | null; judicialBody: string | null; confidential: boolean; status: string; lastMovementAt: string | null; reason: string };

const clientStatus: Record<ClientRow["status"], string> = { ACTIVE: "Ativo", ATTENTION_REQUIRED: "Ação necessária", NO_RECENT_ACTIVITY: "Sem novidades", PROSPECT: "Em prospecção", CLOSED: "Encerrado" };

function displayStatus(client: ClientRow) {
  if (client.hasAction) return { key: "ACTION", label: "Ação necessária", style: "border-red-200 bg-red-50 text-red-800" };
  if (client.hasNewMovement) return { key: "NEW", label: "Nova movimentação", style: "border-blue-200 bg-blue-50 text-blue-800" };
  return { key: client.status, label: clientStatus[client.status], style: client.status === "PROSPECT" ? "border-amber-200 bg-amber-50 text-amber-800" : client.status === "CLOSED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-700" };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [area, setArea] = useState("ALL");
  const [processStatus, setProcessStatus] = useState("ALL");
  const [sort, setSort] = useState<Sort>("PRIORITY");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portfolioRun, setPortfolioRun] = useState<PortfolioRun | null>(null);
  const [pendingProcesses, setPendingProcesses] = useState<PendingProcess[]>([]);
  const [pendingToDelete, setPendingToDelete] = useState<PendingProcess | null>(null);
  const [deletingPending, setDeletingPending] = useState(false);
  const [syncingPortfolio, setSyncingPortfolio] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/clients", { cache: "no-store" });
      const data = await response.json() as { clients: ClientRow[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os clientes.");
      setClients(data.clients);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar clientes."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); void fetch("/api/portfolio-sync", { cache: "no-store" }).then(async (response) => await response.json() as { run?: PortfolioRun; pending?: PendingProcess[] }).then((data) => { setPortfolioRun(data.run || null); setPendingProcesses(data.pending || []); }).catch(() => undefined); }, [load]);

  async function syncPortfolio() {
    if (syncingPortfolio) return;
    setSyncingPortfolio(true); setError("");
    let runId = portfolioRun?.status === "RUNNING" ? portfolioRun.id : undefined;
    try {
      for (let step = 0; step < 100; step += 1) {
        const response = await fetch("/api/portfolio-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) });
        const data = await response.json() as { success: boolean; done?: boolean; run?: PortfolioRun; runId?: number; error?: string };
        if (data.run) { setPortfolioRun(data.run); runId = data.run.id; }
        if (!response.ok || !data.success) throw new Error(data.error || "Não foi possível continuar a sincronização histórica.");
        if (data.done) { await load(); const pendingResponse = await fetch("/api/portfolio-sync", { cache: "no-store" }); const pendingData = await pendingResponse.json() as { pending?: PendingProcess[] }; setPendingProcesses(pendingData.pending || []); break; }
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha na sincronização histórica."); }
    finally { setSyncingPortfolio(false); }
  }

  async function removePending() {
    if (!pendingToDelete || deletingPending) return;
    setDeletingPending(true); setError("");
    try {
      const response = await fetch(`/api/pending-processes/${pendingToDelete.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível remover o vínculo pendente.");
      setPendingProcesses((items) => items.filter((item) => item.id !== pendingToDelete.id));
      setPendingToDelete(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível remover o vínculo pendente."); }
    finally { setDeletingPending(false); }
  }

  const areas = useMemo(() => [...new Set(clients.flatMap((client) => (client.areas || "").split(",")).filter(Boolean))].sort(), [clients]);
  const visible = useMemo(() => clients.filter((client) => {
    const status = displayStatus(client);
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const matchesSearch = !query || [client.name, client.cpf, client.processNumbers, client.parties, client.actionTypes].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(query);
    const matchesFilter = filter === "ALL" || (filter === "ACTION" && status.key === "ACTION") || (filter === "NEW" && status.key === "NEW") || (filter === "QUIET" && !client.hasAction && !client.hasNewMovement && ["ACTIVE", "NO_RECENT_ACTIVITY"].includes(client.status)) || (filter === "PROSPECT" && client.status === "PROSPECT") || (filter === "CLOSED" && client.status === "CLOSED");
    const matchesArea = area === "ALL" || (client.areas || "").split(",").includes(area);
    const matchesProcess = processStatus === "ALL" || (client.processStatuses || "").split(",").includes(processStatus);
    return matchesSearch && matchesFilter && matchesArea && matchesProcess;
  }).sort((a, b) => {
    if (sort === "NAME") return a.name.localeCompare(b.name, "pt-BR");
    if (sort === "MOVEMENT") return String(b.lastMovementAt || "").localeCompare(String(a.lastMovementAt || ""));
    if (sort === "DEADLINE") return String(a.nextDeadline || "9999").localeCompare(String(b.nextDeadline || "9999"));
    if (sort === "PROCESSES") return Number(b.activeProcessCount) - Number(a.activeProcessCount);
    return Number(b.hasAction) - Number(a.hasAction) || Number(b.hasNewMovement) - Number(a.hasNewMovement) || String(b.lastMovementAt || "").localeCompare(String(a.lastMovementAt || ""));
  }), [clients, search, filter, area, processStatus, sort]);

  const metrics = useMemo(() => ({
    active: clients.filter((client) => client.status !== "CLOSED" && client.status !== "PROSPECT").length,
    action: clients.filter((client) => Boolean(client.hasAction)).length,
    newMovement: clients.filter((client) => Boolean(client.hasNewMovement)).length,
    processes: clients.reduce((sum, client) => sum + Number(client.activeProcessCount), 0),
  }), [clients]);

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { client: ClientRow; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível cadastrar o cliente.");
      setDialogOpen(false); router.push(`/clientes/${data.client.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao cadastrar cliente."); }
    finally { setSaving(false); }
  }

  const filterOptions: Array<[Filter, string]> = [["ALL", "Todos"], ["ACTION", "Ação necessária"], ["NEW", "Nova movimentação"], ["QUIET", "Sem novidades"], ["PROSPECT", "Em prospecção"]];
  const indicators: Array<{ label: string; value: number; Icon: LucideIcon }> = [
    { label: "Clientes ativos", value: metrics.active, Icon: BriefcaseBusiness },
    { label: "Ação necessária", value: metrics.action, Icon: AlertCircle },
    { label: "Novas movimentações", value: metrics.newMovement, Icon: Sparkles },
    { label: "Processos ativos", value: metrics.processes, Icon: Clock3 },
  ];

  return <div className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Carteira particular</p>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.035em] text-[#111a2d]">Clientes</h1>
        <p className="mt-2 text-sm text-slate-500">Clientes e processos particulares acompanhados pelo escritório.</p>
      </div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void syncPortfolio()} disabled={syncingPortfolio} className="h-11">{syncingPortfolio ? <LoaderCircle className="animate-spin" /> : <History />}{syncingPortfolio ? `Consultando ${portfolioRun?.lastPeriod || "histórico"}...` : portfolioRun?.status === "RUNNING" ? "Continuar sincronização" : "Sincronizar carteira completa"}</Button><Button onClick={() => setDialogOpen(true)} className="h-11 self-start bg-[#112b3d] px-5 hover:bg-[#1c4057]"><Plus />Novo cliente</Button></div>
    </header>

    {error && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}
    {portfolioRun && <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Sincronização da carteira</h2><p className="mt-1 text-sm text-slate-500">Cobertura consultada: desde 01/01/2021 até {formatDate(portfolioRun.coverageEnd)}{portfolioRun.lastPeriod ? ` · último período: ${portfolioRun.lastPeriod}` : ""}</p></div><Badge variant="outline">{portfolioRun.status === "SUCCESS" ? "Concluída" : "Em andamento"}</Badge></div><dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4 lg:grid-cols-8">{[["Registros", portfolioRun.recordsScanned], ["Processos", portfolioRun.processesFound], ["Ativos confirmados", portfolioRun.activeProcesses], ["SAJULBRA", portfolioRun.excludedSajulbra], ["Clientes criados", portfolioRun.clientsCreated], ["Clientes atualizados", portfolioRun.clientsUpdated], ["Processos criados", portfolioRun.processesCreated], ["Sigilosos", portfolioRun.confidentialProcesses]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd className="mt-1 text-lg font-bold">{value}</dd></div>)}</dl></section>}

    {pendingProcesses.length > 0 && <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">Vínculos pendentes ({pendingProcesses.length})</h2><p className="mt-1 text-sm text-amber-800">Abra o processo correto no eproc, faça o cadastro necessário e depois remova o item da lista.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{pendingProcesses.map((process) => { const portalUrl = officialProcessPortal(process.court, process.judicialBody, process.processNumber); return <div key={process.id} className="rounded-lg border border-amber-200 bg-white p-4"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-bold">{process.processNumber}</p>{process.confidential && <Badge variant="outline">🔒 Sigiloso</Badge>}</div><p className="mt-1 text-sm text-slate-600">{process.title || "Tipo da ação pendente"}</p><p className="mt-1 text-xs text-slate-500">{[process.court, process.judicialBody, formatDate(process.lastMovementAt)].filter((value) => value && value !== "—").join(" · ")}</p><div className="mt-4 flex flex-wrap gap-2">{portalUrl ? <Button asChild size="sm" className="bg-[#112b3d]"><a href={portalUrl} target="_blank" rel="noreferrer">Abrir este processo <ExternalLink /></a></Button> : <Button size="sm" variant="outline" disabled>Link direto indisponível</Button>}<Button size="sm" variant="outline" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setPendingToDelete(process)}><Trash2 />Remover da lista</Button></div></div>; })}</div></section>}

    <section aria-label="Indicadores" className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 lg:grid-cols-4">
      {indicators.map(({ label, value, Icon }) => <div key={label} className="bg-white p-4 sm:p-5"><div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="size-4" />{label}</div><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
    </section>

    <section className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-lg"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, CPF, processo, parte ou ação" className="h-11 pl-9" /></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={area} onValueChange={setArea}><SelectTrigger className="h-11 min-w-40"><SelectValue placeholder="Área" /></SelectTrigger><SelectContent><SelectItem value="ALL">Todas as áreas</SelectItem>{areas.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
            <Select value={processStatus} onValueChange={setProcessStatus}><SelectTrigger className="h-11 min-w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Todos os processos</SelectItem><SelectItem value="ACTIVE">Ativos</SelectItem><SelectItem value="SUSPENDED">Suspensos</SelectItem><SelectItem value="ARCHIVED">Arquivados</SelectItem><SelectItem value="CLOSED">Encerrados</SelectItem><SelectItem value="AWAITING_COMPLIANCE">Aguardando cumprimento</SelectItem><SelectItem value="ON_APPEAL">Em recurso</SelectItem><SelectItem value="UNKNOWN">Status desconhecido</SelectItem></SelectContent></Select>
            <Select value={sort} onValueChange={(value) => setSort(value as Sort)}><SelectTrigger className="h-11 min-w-44"><ArrowDownUp className="size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PRIORITY">Prioridade</SelectItem><SelectItem value="NAME">Nome</SelectItem><SelectItem value="MOVEMENT">Última movimentação</SelectItem><SelectItem value="DEADLINE">Próximo prazo</SelectItem><SelectItem value="PROCESSES">Qtd. de processos</SelectItem></SelectContent></Select>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{filterOptions.map(([value, label]) => <Button key={value} variant={filter === value ? "default" : "outline"} size="sm" onClick={() => setFilter(value)} className={filter === value ? "bg-[#112b3d]" : ""}>{label}</Button>)}</div>
      </div>

      {loading ? <div className="flex items-center justify-center gap-3 p-16 text-slate-500"><LoaderCircle className="size-5 animate-spin" />Carregando clientes...</div> : visible.length === 0 ? <div className="px-6 py-16 text-center"><BriefcaseBusiness className="mx-auto size-9 text-slate-400" /><h2 className="mt-4 text-lg font-bold">{clients.length ? "Nenhum cliente corresponde aos filtros" : "Nenhum cliente particular cadastrado"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{clients.length ? "Ajuste a busca ou os filtros para visualizar outros clientes." : "Cadastre o primeiro cliente para organizar seus processos, links, intimações e tarefas."}</p>{!clients.length && <Button onClick={() => setDialogOpen(true)} className="mt-5 bg-[#112b3d]"><Plus />Cadastrar cliente</Button>}</div> : <>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full border-collapse text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr>{["Cliente", "Processos", "Status", "Última movimentação", "Área", "Próximo prazo", "Ações"].map((heading) => <th key={heading} className="px-5 py-3.5 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{visible.map((client) => { const status = displayStatus(client); return <tr key={client.id} onClick={() => router.push(`/clientes/${client.id}`)} className="cursor-pointer hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{client.name}</p>{client.cpf && <p className="mt-1 text-xs text-slate-500">CPF {client.cpf}</p>}</td><td className="px-5 py-4 text-sm font-medium">{client.activeProcessCount} {Number(client.activeProcessCount) === 1 ? "processo" : "processos"}</td><td className="px-5 py-4"><Badge variant="outline" className={status.style}>{status.label}</Badge></td><td className="px-5 py-4 text-sm">{formatDate(client.lastMovementAt)}</td><td className="px-5 py-4 text-sm">{client.mainArea || "—"}</td><td className="px-5 py-4 text-sm font-medium">{formatDate(client.nextDeadline)}</td><td className="px-5 py-4"><div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>{client.driveFolderUrl && <Button asChild variant="ghost" size="icon" title="Abrir Drive"><a href={client.driveFolderUrl} target="_blank" rel="noreferrer"><FolderOpen /></a></Button>}<Button variant="ghost" size="sm" onClick={() => router.push(`/clientes/${client.id}`)}>Abrir</Button></div></td></tr>; })}</tbody></table></div>
        <div className="divide-y divide-slate-200 lg:hidden">{visible.map((client) => { const status = displayStatus(client); return <button key={client.id} onClick={() => router.push(`/clientes/${client.id}`)} className="block w-full p-5 text-left hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{client.name}</p><p className="mt-1 text-sm text-slate-500">{client.activeProcessCount} {Number(client.activeProcessCount) === 1 ? "processo ativo" : "processos ativos"}</p></div><Badge variant="outline" className={status.style}>{status.label}</Badge></div><dl className="mt-4 grid grid-cols-2 gap-4"><div><dt>Última movimentação</dt><dd>{formatDate(client.lastMovementAt)}</dd></div><div><dt>Próximo prazo</dt><dd>{formatDate(client.nextDeadline)}</dd></div><div><dt>Área</dt><dd>{client.mainArea || "—"}</dd></div><div><dt>Acesso</dt><dd className="text-[#315f7c]">Abrir ficha <ExternalLink className="ml-1 inline size-3" /></dd></div></dl></button>; })}</div>
      </>}
    </section>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><form onSubmit={createClient}><DialogHeader><DialogTitle>Novo cliente</DialogTitle><DialogDescription>Somente o nome é obrigatório. Os demais dados podem ser preenchidos depois.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="space-y-2 sm:col-span-2"><Label htmlFor="name">Nome *</Label><Input id="name" name="name" required autoFocus /></label><label className="space-y-2"><Label htmlFor="cpf">CPF</Label><Input id="cpf" name="cpf" /></label><label className="space-y-2"><Label htmlFor="phone">Telefone</Label><Input id="phone" name="phone" /></label><label className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" /></label><label className="space-y-2"><Label htmlFor="status">Status</Label><select id="status" name="status" defaultValue="ACTIVE" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="ACTIVE">Ativo</option><option value="ATTENTION_REQUIRED">Ação necessária</option><option value="NO_RECENT_ACTIVITY">Sem novidades</option><option value="PROSPECT">Em prospecção</option><option value="CLOSED">Encerrado</option></select></label><label className="space-y-2 sm:col-span-2"><Label htmlFor="driveFolderUrl">Pasta do Google Drive</Label><Input id="driveFolderUrl" name="driveFolderUrl" type="url" placeholder="https://drive.google.com/..." /></label><label className="space-y-2 sm:col-span-2"><Label htmlFor="notes">Observações</Label><Textarea id="notes" name="notes" rows={3} /></label></div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-[#112b3d]">{saving && <LoaderCircle className="animate-spin" />}Cadastrar cliente</Button></DialogFooter></form></DialogContent></Dialog>
    <AlertDialog open={Boolean(pendingToDelete)} onOpenChange={(open) => !open && !deletingPending && setPendingToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover este vínculo pendente?</AlertDialogTitle><AlertDialogDescription>O processo sairá desta lista e não voltará nas próximas sincronizações. A publicação original continuará normalmente no Monitor DJEN.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={deletingPending} onClick={() => void removePending()} className="bg-red-700 hover:bg-red-800">{deletingPending ? <LoaderCircle className="animate-spin" /> : <Check />}Confirmar remoção</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
