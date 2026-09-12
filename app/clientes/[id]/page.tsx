"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, ExternalLink, FolderOpen, LoaderCircle, LockKeyhole, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClientTaskModule } from "@/components/client-task-module";
import type { TaskRecord } from "@/lib/tasks";

function Link({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...props} />;
}

type Client = { id: number; name: string; cpf: string | null; rg: string | null; birthDate: string | null; phone: string | null; email: string | null; nationality: string | null; driveFolderUrl: string | null; notes: string | null; status: string };
type Process = { id: number; processNumber: string; title: string | null; parties: string | null; court: string | null; judicialBody: string | null; area: string | null; actionType: string | null; status: string; priority: string; eprocUrl: string | null; driveUrl: string | null; lastMovementAt: string | null; lastMovementDescription: string | null; fatalDeadline: string | null; confidential: boolean; partiesSource: string | null };
type Intimation = { id: number; processId: number | null; processNumber: string | null; availabilityDate: string | null; summary: string; status: string; classification: string };
type Detail = { client: Client; processes: Process[]; tasks: TaskRecord[]; intimations: Intimation[] };
type DialogMode = "EDIT" | "PROCESS" | null;

const clientStatuses: Record<string, string> = { ACTIVE: "Ativo", ATTENTION_REQUIRED: "Ação necessária", NO_RECENT_ACTIVITY: "Sem novidades", PROSPECT: "Em prospecção", CLOSED: "Encerrado" };
const processStatuses: Record<string, string> = { ACTIVE: "Ativo", SUSPENDED: "Suspenso", ARCHIVED: "Arquivado", CLOSED: "Encerrado", AWAITING_COMPLIANCE: "Aguardando cumprimento", ON_APPEAL: "Em recurso", UNKNOWN: "Status desconhecido" };
const processAreas = ["Cível", "Família", "Sucessões", "Consumidor", "Empresarial", "Trabalhista", "Previdenciário", "Administrativo", "Tributário", "Criminal", "Constitucional", "Imobiliário", "Outra"];
const processCourts = ["TJRS", "TJSC", "TJPR", "TJSP", "TJPE", "TRF4", "TRF5", "TRT4", "STJ", "STF", "Outro"];
function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/clients/${params.id}`, { cache: "no-store" });
      const data = await response.json() as Detail & { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar o cliente.");
      setDetail(data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar cliente."); }
    finally { setLoading(false); }
  }, [params.id]);
  useEffect(() => { void load(); }, [load]);

  const overview = useMemo(() => {
    if (!detail) return null;
    const active = detail.processes.filter((process) => ["ACTIVE", "AWAITING_COMPLIANCE", "ON_APPEAL"].includes(process.status));
    const latest = [...detail.intimations].sort((a, b) => String(b.availabilityDate || "").localeCompare(String(a.availabilityDate || "")))[0];
    const nextDeadline = active.map((process) => process.fatalDeadline).filter(Boolean).sort()[0] || null;
    const hasAction = detail.intimations.some((item) => !["COMPLETED", "REVIEWED", "NO_ACTION"].includes(item.status) && (item.classification === "POSSIBLE_DEADLINE" || item.status === "NEEDS_CONFIRMATION"));
    const hasNew = detail.intimations.some((item) => item.status === "NEW");
    return { active, latest, nextDeadline, status: hasAction ? "Ação necessária" : hasNew ? "Nova movimentação" : clientStatuses[detail.client.status] || detail.client.status };
  }, [detail]);

  async function submit(event: FormEvent<HTMLFormElement>, mode: Exclude<DialogMode, null>) {
    event.preventDefault(); setSaving(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const endpoint = mode === "EDIT" ? `/api/clients/${params.id}` : `/api/clients/${params.id}/processes`;
    try {
      const response = await fetch(endpoint, { method: mode === "EDIT" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setDialog(null); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar."); }
    finally { setSaving(false); }
  }

  async function deleteClient(ignoreFutureImports: boolean) {
    setDeleting(true); setError("");
    try {
      const response = await fetch(`/api/clients/${params.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ignoreFutureImports }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir o cliente.");
      window.location.href = "/clientes";
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível excluir o cliente."); setDeleteOpen(false); }
    finally { setDeleting(false); }
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center gap-3 text-slate-500"><LoaderCircle className="size-5 animate-spin" />Carregando ficha...</div>;
  if (!detail || !overview) return <div className="mx-auto max-w-3xl px-5 py-16"><Link href="/clientes" className="text-sm font-semibold text-[#315f7c]">← Voltar para clientes</Link><div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5 text-red-900">{error || "Cliente não encontrado."}</div></div>;

  const { client, processes, tasks, intimations } = detail;
  const statusStyle = overview.status === "Ação necessária" ? "border-red-200 bg-red-50 text-red-800" : overview.status === "Nova movimentação" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-slate-100 text-slate-700";

  return <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
    <Link href="/clientes" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#112b3d]"><ArrowLeft className="size-4" />Clientes</Link>
    <header className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{client.name}</h1><Badge variant="outline" className={statusStyle}>{overview.status}</Badge></div><p className="mt-2 text-slate-600">{overview.active.length} {overview.active.length === 1 ? "processo ativo" : "processos ativos"}</p></div><div className="flex flex-wrap gap-2">{client.driveFolderUrl && <Button asChild variant="outline"><a href={client.driveFolderUrl} target="_blank" rel="noreferrer"><FolderOpen />Abrir Drive</a></Button>}<Button variant="outline" onClick={() => setDialog("EDIT")}><Pencil />Editar cliente</Button><Button variant="outline" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setDeleteOpen(true)}><Trash2 />Excluir cliente</Button></div></header>
    {error && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}

    <section className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold">Visão geral</h2></div><dl className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">{[["Status", overview.status], ["Área principal", overview.active.find((process) => process.area)?.area || "—"], ["Processos ativos", String(overview.active.length)], ["Última movimentação", formatDate(overview.latest?.availabilityDate || null)], ["Próximo prazo", formatDate(overview.nextDeadline)], ["Telefone", client.phone || "—"], ["E-mail", client.email || "—"], ["Tarefas pendentes", String(tasks.filter((task) => task.status !== "COMPLETED").length)]].map(([label, value]) => <div key={label} className="bg-white px-5 py-4"><dt>{label}</dt><dd className="break-words">{value}</dd></div>)}</dl></section>

    <section className="mt-8"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Processos</h2><p className="mt-1 text-sm text-slate-500">Acompanhamento processual e acessos rápidos.</p></div><Button onClick={() => setDialog("PROCESS")} className="bg-[#112b3d]"><Plus />Adicionar processo</Button></div>
      <div className="mt-4 space-y-3">{processes.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><BriefcaseBusiness className="mx-auto size-8 text-slate-400" /><p className="mt-3 font-semibold">Nenhum processo cadastrado</p><p className="mt-1 text-sm text-slate-500">Adicione o primeiro processo deste cliente.</p></div> : processes.map((process) => { const pubs = intimations.filter((item) => item.processId === process.id); const hasAction = pubs.some((item) => item.classification === "POSSIBLE_DEADLINE" || item.status === "NEEDS_CONFIRMATION"); const hasNew = pubs.some((item) => item.status === "NEW"); return <article key={process.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2"><Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{processStatuses[process.status]}</Badge>{process.confidential && <Badge variant="outline"><LockKeyhole />Processo sigiloso</Badge>}{hasAction ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">Ação necessária</Badge> : hasNew ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">Nova movimentação</Badge> : null}</div><h3 className="mt-3 font-mono text-lg font-bold text-[#112b3d]">{process.processNumber}</h3><p className="mt-1 font-medium text-slate-700">{process.title || process.actionType || "Processo sem título"}</p><p className="mt-1 text-sm text-slate-500">{[process.area, process.court, process.judicialBody].filter(Boolean).join(" · ") || "Dados processuais pendentes"}</p>{process.confidential && !process.parties && <p className="mt-2 text-sm text-slate-500"><LockKeyhole className="mr-1 inline size-4" />Partes pendentes de consulta autenticada</p>}{process.lastMovementAt && <p className="mt-4 text-sm text-slate-600"><span className="font-semibold">Última movimentação:</span> {formatDate(process.lastMovementAt)}{process.lastMovementDescription ? ` — ${process.lastMovementDescription}` : ""}</p>}</div><div className="flex shrink-0 flex-wrap gap-2">{process.eprocUrl && <Button asChild variant="outline" size="sm"><a href={process.eprocUrl} target="_blank" rel="noreferrer">Abrir eproc <ExternalLink /></a></Button>}{process.driveUrl && <Button asChild variant="outline" size="sm"><a href={process.driveUrl} target="_blank" rel="noreferrer">Abrir Drive <ExternalLink /></a></Button>}<Button asChild size="sm" className="bg-[#112b3d]"><Link href={`/clientes/${client.id}/processos/${process.id}`}>Ver processo</Link></Button></div></div></article>; })}</div>
    </section>

    <ClientTaskModule clientId={client.id} tasks={tasks} processes={processes.map(({ id, processNumber }) => ({ id, processNumber }))} reload={load} reportError={setError} />

    <section className="mt-8 grid gap-5 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4"><UserRound className="size-4 text-slate-500" /><h2 className="font-bold">Dados do cliente</h2></div><dl className="grid grid-cols-2 gap-5 p-5">{[["CPF", client.cpf], ["RG", client.rg], ["Data de nascimento", formatDate(client.birthDate)], ["Nacionalidade", client.nationality], ["Telefone", client.phone], ["E-mail", client.email]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="break-words">{value || "—"}</dd></div>)}</dl></div><div className="rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold">Observações</h2></div><p className="whitespace-pre-wrap p-5 text-sm leading-6 text-slate-600">{client.notes || "Nenhuma observação cadastrada."}</p></div></section>

    <Dialog open={dialog === "PROCESS"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><form onSubmit={(event) => void submit(event, "PROCESS")}><DialogHeader><DialogTitle>Adicionar processo</DialogTitle><DialogDescription>Informe o número CNJ. Os dados disponíveis nas publicações já sincronizadas serão preenchidos automaticamente.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field name="processNumber" label="Número do processo *" required className="sm:col-span-2" /><Field name="title" label="Título" /><Field name="actionType" label="Tipo da ação" /><label className="space-y-2"><Label>Área</Label><select name="area" defaultValue="" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Preencher automaticamente</option>{processAreas.map((item) => <option key={item}>{item}</option>)}</select></label><label className="space-y-2"><Label>Tribunal</Label><select name="court" defaultValue="" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Preencher automaticamente</option>{processCourts.map((item) => <option key={item}>{item}</option>)}</select></label><Field name="parties" label="Partes" className="sm:col-span-2" /><Field name="judicialBody" label="Órgão" /><Field name="eprocUrl" label="Link do tribunal/eproc" type="url" /><Field name="driveUrl" label="Link do Drive" type="url" /><Field name="fatalDeadline" label="Próximo prazo" type="date" /><label className="space-y-2"><Label>Status</Label><select name="status" defaultValue="ACTIVE" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(processStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="space-y-2"><Label>Prioridade</Label><select name="priority" defaultValue="MEDIUM" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></label><label className="space-y-2 sm:col-span-2"><Label>Observações</Label><Textarea name="notes" rows={4} /></label></div><SaveFooter saving={saving} cancel={() => setDialog(null)} /></form></DialogContent></Dialog>

    <Dialog open={dialog === "EDIT"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><form onSubmit={(event) => void submit(event, "EDIT")}><DialogHeader><DialogTitle>Editar cliente</DialogTitle><DialogDescription>Atualize os dados cadastrais e de acompanhamento.</DialogDescription></DialogHeader><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field name="name" label="Nome *" required defaultValue={client.name} className="sm:col-span-2" /><Field name="cpf" label="CPF" defaultValue={client.cpf} /><Field name="rg" label="RG" defaultValue={client.rg} /><Field name="birthDate" label="Data de nascimento" type="date" defaultValue={client.birthDate} /><Field name="nationality" label="Nacionalidade" defaultValue={client.nationality} /><Field name="phone" label="Telefone" defaultValue={client.phone} /><Field name="email" label="E-mail" type="email" defaultValue={client.email} /><Field name="driveFolderUrl" label="Pasta do Google Drive" type="url" defaultValue={client.driveFolderUrl} className="sm:col-span-2" /><label className="space-y-2"><Label>Status</Label><select name="status" defaultValue={client.status} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="ACTIVE">Ativo</option><option value="ATTENTION_REQUIRED">Ação necessária</option><option value="NO_RECENT_ACTIVITY">Sem novidades</option><option value="PROSPECT">Em prospecção</option><option value="CLOSED">Encerrado</option></select></label><label className="space-y-2 sm:col-span-2"><Label>Observações</Label><Textarea name="notes" defaultValue={client.notes || ""} rows={4} /></label></div><SaveFooter saving={saving} cancel={() => setDialog(null)} /></form></DialogContent></Dialog>
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Tem certeza que deseja excluir este cliente?</AlertDialogTitle><AlertDialogDescription>Os processos e tarefas vinculados serão removidos da carteira, mas as publicações originais continuarão no Monitor DJEN.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="flex-col sm:flex-row"><AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={() => void deleteClient(false)} className="bg-slate-700 hover:bg-slate-800">Excluir apenas agora</AlertDialogAction><AlertDialogAction disabled={deleting} onClick={() => void deleteClient(true)} className="bg-red-700 hover:bg-red-800">Excluir e ignorar futuras importações</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Field({ name, label, type = "text", required, defaultValue, className }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string | null; className?: string }) {
  return <label className={`space-y-2 ${className || ""}`}><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} required={required} defaultValue={defaultValue || ""} /></label>;
}

function SaveFooter({ saving, cancel }: { saving: boolean; cancel: () => void }) {
  return <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={cancel}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-[#112b3d]">{saving && <LoaderCircle className="animate-spin" />}Salvar</Button></DialogFooter>;
}
