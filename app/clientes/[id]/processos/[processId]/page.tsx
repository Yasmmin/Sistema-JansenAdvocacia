"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarClock, ExternalLink, FileText, LoaderCircle, LockKeyhole, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function Link({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) { return <a href={href} {...props} />; }
type Process = { id: number; clientId: number; processNumber: string; title: string | null; parties: string | null; court: string | null; judicialBody: string | null; area: string | null; actionType: string | null; status: string; priority: string; eprocUrl: string | null; driveUrl: string | null; lastMovementAt: string | null; lastMovementDescription: string | null; fatalDeadline: string | null; notes: string | null; confidential: boolean; partiesSource: string | null; enrichmentStatus: string | null };
type Client = { id: number; name: string };
type Intimation = { id: number; availabilityDate: string | null; summary: string; content: string; status: string; classification: string; sourceUrl: string | null };
type Task = { id: number; title: string; status: string; priority: string; dueDate: string | null };
type Detail = { process: Process; client: Client | null; intimations: Intimation[]; tasks: Task[] };

const areas = ["Cível", "Família", "Sucessões", "Consumidor", "Empresarial", "Trabalhista", "Previdenciário", "Administrativo", "Tributário", "Criminal", "Constitucional", "Imobiliário", "Outra"];
const courts = ["TJRS", "TJSC", "TJPR", "TJSP", "TJPE", "TRF4", "TRF5", "TRT4", "STJ", "STF", "Outro"];
const processStatuses: Record<string, string> = { ACTIVE: "Ativo", SUSPENDED: "Suspenso", ARCHIVED: "Arquivado", CLOSED: "Encerrado", AWAITING_COMPLIANCE: "Aguardando cumprimento", ON_APPEAL: "Em recurso", UNKNOWN: "Status desconhecido" };
const priorities: Record<string, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente" };
const classifications: Record<string, string> = { UNKNOWN: "Não classificada", INFORMATION: "Informação", POSSIBLE_DEADLINE: "Possível prazo", HEARING: "Audiência", PAYMENT: "Pagamento", DOCUMENT_REQUEST: "Documento", PROCEDURAL_ACTION: "Providência" };
const taskStatuses: Record<string, string> = { TODO: "A fazer", NOT_STARTED: "A fazer", IN_PROGRESS: "Em andamento", COMPLETED: "Concluída" };
function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(`${value.slice(0, 10)}T12:00:00Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date); }
function Field({ name, label, value, type = "text", className = "" }: { name: string; label: string; value?: string | null; type?: string; className?: string }) { return <label className={`space-y-2 ${className}`}><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} defaultValue={value || ""} /></label>; }

export default function ProcessDetailPage() {
  const params = useParams<{ id: string; processId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [processResponse, clientsResponse] = await Promise.all([fetch(`/api/processes/${params.processId}`, { cache: "no-store" }), fetch("/api/clients", { cache: "no-store" })]);
      const data = await processResponse.json() as Detail & { error?: string };
      const clientData = await clientsResponse.json() as { clients?: Client[] };
      if (!processResponse.ok || (params.id && String(data.process?.clientId) !== String(params.id))) throw new Error(data.error || "Processo não encontrado.");
      setDetail(data); setClients(clientData.clients || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar o processo."); }
    finally { setLoading(false); }
  }, [params.id, params.processId]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(`/api/processes/${params.processId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { process?: Process; error?: string };
      if (!response.ok || !data.process) throw new Error(data.error || "Não foi possível editar o processo.");
      setEditing(false);
      if (String(data.process.clientId) !== String(params.id) && data.process.clientId) window.location.href = `/clientes/${data.process.clientId}/processos/${data.process.id}`;
      else await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível editar o processo."); }
    finally { setSaving(false); }
  }

  async function enrich() {
    setEnriching(true); setError("");
    try {
      const response = await fetch(`/api/processes/${params.processId}/enrich`, { method: "POST" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível buscar os dados no eproc.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível buscar os dados no eproc."); }
    finally { setEnriching(false); }
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center gap-3 text-slate-500"><LoaderCircle className="size-5 animate-spin" />Carregando processo...</div>;
  if (!detail) return <div className="mx-auto max-w-3xl px-5 py-16"><Link href={`/clientes/${params.id}`} className="text-sm font-semibold text-[#315f7c]">← Voltar para o cliente</Link><div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5 text-red-900">{error}</div></div>;
  const { process, client, intimations, tasks } = detail;

  return <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
    <Link href={client ? `/clientes/${client.id}` : "/clientes"} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#112b3d]"><ArrowLeft className="size-4" />{client?.name || "Clientes"}</Link>
    <header className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="font-mono text-2xl font-bold tracking-tight text-[#112b3d] sm:text-3xl">{process.processNumber}</h1><Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">{processStatuses[process.status] || process.status}</Badge>{process.confidential && <Badge variant="outline"><LockKeyhole />Processo sigiloso</Badge>}</div><p className="mt-2 text-lg font-semibold text-slate-800">{process.title || process.actionType || "Processo sem título"}</p><p className="mt-1 text-sm text-slate-500">Cliente: {client?.name || "Não identificado"}</p></div><div className="flex flex-wrap gap-2">{process.confidential && <Button variant="outline" disabled={enriching} onClick={() => void enrich()}>{enriching ? <LoaderCircle className="animate-spin" /> : <LockKeyhole />}{enriching ? "Consultando eproc..." : "Buscar dados no eproc"}</Button>}<Button variant="outline" onClick={() => setEditing(true)}><Pencil />Editar processo</Button>{process.eprocUrl && <Button asChild className="bg-[#112b3d]"><a href={process.eprocUrl} target="_blank" rel="noreferrer">Abrir tribunal <ExternalLink /></a></Button>}{process.driveUrl && <Button asChild variant="outline"><a href={process.driveUrl} target="_blank" rel="noreferrer">Abrir Drive <ExternalLink /></a></Button>}</div></header>
    {error && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}
    <section className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold">Dados do processo</h2></div><dl className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">{[["Área", process.area], ["Tipo da ação", process.actionType], ["Tribunal", process.court], ["Órgão", process.judicialBody], ["Partes", process.parties || (process.confidential ? "🔒 Processo sigiloso" : null)], ["Fonte das partes", process.partiesSource === "EPROC_AUTHENTICATED" ? "eproc autenticado" : process.partiesSource], ["Última movimentação", formatDate(process.lastMovementAt)], ["Próximo prazo", formatDate(process.fatalDeadline)], ["Prioridade", priorities[process.priority] || process.priority]].map(([label, value]) => <div key={label} className="bg-white px-5 py-4"><dt>{label}</dt><dd className="break-words">{value || "—"}</dd></div>)}</dl>{process.notes && <div className="border-t border-slate-200 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{process.notes}</p></div>}</section>
    <div className="mt-8 grid gap-7 lg:grid-cols-[1.6fr_1fr]">
      <section><div className="flex items-center gap-2"><FileText className="size-5 text-slate-500" /><h2 className="text-xl font-bold">Intimações e movimentações</h2></div><div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">{intimations.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Nenhuma publicação do DJEN vinculada a este processo.</div> : <div className="divide-y divide-slate-200">{intimations.map((item) => <article key={item.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><Badge variant="outline">{classifications[item.classification] || item.classification}</Badge><Badge variant="outline" className={item.status === "NEW" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-slate-50 text-slate-700"}>{item.status === "NEW" ? "Nova" : "Analisada"}</Badge></div><time className="text-sm font-medium text-slate-600">{formatDate(item.availabilityDate)}</time></div><p className="mt-3 text-sm font-semibold leading-6 text-slate-800">{item.summary}</p><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{item.content}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#315f7c]">Abrir publicação <ExternalLink className="size-3" /></a>}</article>)}</div>}</div></section>
      <section><div className="flex items-center gap-2"><CalendarClock className="size-5 text-slate-500" /><h2 className="text-xl font-bold">Tarefas</h2></div><div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">{tasks.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma tarefa vinculada.</div> : <div className="divide-y divide-slate-200">{tasks.map((task) => <div key={task.id} className="p-4"><p className="font-semibold">{task.title}</p><p className="mt-1 text-sm text-slate-500">{taskStatuses[task.status]}{task.dueDate ? ` · ${formatDate(task.dueDate)}` : ""}</p></div>)}</div>}</div></section>
    </div>
    <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"><form onSubmit={save}><DialogHeader><DialogTitle>Editar processo</DialogTitle><DialogDescription>Os dados administrativos preenchidos aqui serão preservados nas próximas sincronizações.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Field name="processNumber" label="Número CNJ" value={process.processNumber} className="sm:col-span-2" />
      <label className="space-y-2"><Label>Cliente</Label><select name="clientId" required defaultValue={process.clientId} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <Field name="title" label="Título" value={process.title} /><Field name="actionType" label="Tipo da ação" value={process.actionType} />
      <label className="space-y-2"><Label>Área</Label><select name="area" defaultValue={process.area || ""} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Não definida</option>{areas.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="space-y-2"><Label>Tribunal</Label><select name="court" defaultValue={process.court || ""} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Não definido</option>{courts.map((item) => <option key={item}>{item}</option>)}</select></label>
      <Field name="judicialBody" label="Órgão" value={process.judicialBody} /><Field name="parties" label="Partes" value={process.parties} className="sm:col-span-2" />
      <Field name="eprocUrl" label="Link do tribunal/eproc" value={process.eprocUrl} type="url" /><Field name="driveUrl" label="Link do Drive" value={process.driveUrl} type="url" />
      <Field name="fatalDeadline" label="Próximo prazo" value={process.fatalDeadline} type="date" />
      <label className="space-y-2"><Label>Status</Label><select name="status" defaultValue={process.status} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(processStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-2"><Label>Prioridade</Label><select name="priority" defaultValue={process.priority} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-2 sm:col-span-2"><Label>Observações</Label><Textarea name="notes" defaultValue={process.notes || ""} rows={5} /></label>
    </div><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-[#112b3d]">{saving && <LoaderCircle className="animate-spin" />}Salvar alterações</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
