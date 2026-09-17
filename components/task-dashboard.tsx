"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowDownUp, CalendarDays, Check, ChevronDown, ExternalLink, Filter, Link2, LoaderCircle, Paperclip, Plus, RotateCcw, Search, Tag, Trash2, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TaskStatus = "TODO" | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
type SortMode = "date" | "assignee" | "priority" | "space";
type Attachment = { id: string; name: string; url: string };
type Task = {
  id: number; title: string; description: string | null; status: TaskStatus; priority: Priority;
  dueDate: string | null; dueTime: string | null; assignee: string | null; isRecurring: boolean;
  recurrenceFrequency: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY"; recurrenceDaysOfWeek: string | null;
  recurrenceSeriesId: string | null; clientId: number | null; clientName: string | null; processId: number | null;
  processNumber: string | null; processTitle: string | null; eprocUrl: string | null; tags: string[];
  attachments: Attachment[]; createdAt: string; completedAt: string | null;
};
type ClientOption = { id: number; name: string };
type ProcessOption = { id: number; clientId: number; processNumber: string; title: string | null; eprocUrl: string | null };
type FormState = {
  title: string; description: string; status: TaskStatus; priority: Priority; dueDate: string; dueTime: string;
  assignee: string; recurrence: "NONE" | "DAILY" | "WEEKLY" | "FRIDAY" | "MONTHLY";
  tags: string; linkType: "NONE" | "CLIENT" | "PROCESS"; clientId: string; processId: string; attachments: Attachment[];
};

const team = ["Bruno Boff", "Yasmmin Flávia", "Francisco Jansen"];
const priorityLabel: Record<Priority, string> = { URGENT: "Urgente", HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" };
const priorityRank: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const selectClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const emptyForm: FormState = { title: "", description: "", status: "TODO", priority: "MEDIUM", dueDate: "", dueTime: "", assignee: "", recurrence: "NONE", tags: "", linkType: "NONE", clientId: "", processId: "", attachments: [] };

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateLabel(value: string | null, time?: string | null) {
  if (!value) return "Sem prazo";
  const today = localDate();
  const label = value === today ? "Hoje" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: value.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).replace(" de ", " ");
  return time ? `${label}, ${time}` : label;
}
function initials(name: string | null) { return name ? name.split(" ").slice(0, 2).map((part) => part[0]).join("") : "—"; }
function isCompleted(task: Task) { return task.status === "COMPLETED"; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Não foi possível concluir a operação."; }

function taskToForm(task: Task): FormState {
  const recurrence = task.recurrenceFrequency === "WEEKLY" && task.recurrenceDaysOfWeek === "5" ? "FRIDAY" : task.recurrenceFrequency;
  return {
    title: task.title, description: task.description || "", status: task.status === "NOT_STARTED" ? "TODO" : task.status,
    priority: task.priority, dueDate: task.dueDate || "", dueTime: task.dueTime || "", assignee: task.assignee || "",
    recurrence, tags: task.tags.join(", "), linkType: task.processId ? "PROCESS" : task.clientId ? "CLIENT" : "NONE",
    clientId: task.clientId ? String(task.clientId) : "", processId: task.processId ? String(task.processId) : "", attachments: task.attachments,
  };
}

function TaskCard({ task, onOpen, onToggle, busy, draggable, onDragStart, onDragOver, onDrop, onDragEnd }: { task: Task; onOpen: () => void; onToggle: () => void; busy: boolean; draggable?: boolean; onDragStart?: () => void; onDragOver?: (event: React.DragEvent<HTMLElement>) => void; onDrop?: () => void; onDragEnd?: () => void; }) {
  const completed = isCompleted(task);
  const overdue = !completed && Boolean(task.dueDate && task.dueDate < localDate());
  return <article draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} className="group flex min-h-[76px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300 hover:shadow-sm">
    <button type="button" disabled={busy} onClick={onToggle} aria-label={completed ? "Reabrir tarefa" : "Concluir tarefa"} className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-blue-200", completed ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white hover:border-blue-500")}>
      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : completed && <Check className="size-3.5" strokeWidth={3} />}
    </button>
    <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left focus:outline-none">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h3 className={cn("font-semibold leading-5 text-slate-900", completed && "text-slate-400 line-through")}>{task.title}</h3>
        <span className={cn("shrink-0 text-xs font-semibold", overdue ? "text-red-600" : completed ? "text-slate-400" : "text-slate-500")}><CalendarDays className="mr-1 inline size-3.5" />{dateLabel(task.dueDate, task.dueTime)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        {task.assignee && <span className="flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600">{initials(task.assignee)}</span>{task.assignee}</span>}
        {(task.processNumber || task.clientName) && <span className="flex min-w-0 items-center gap-1.5"><Link2 className="size-3.5 shrink-0" /><span className="truncate">{task.processTitle || task.clientName}{task.processNumber ? ` · ${task.processNumber}` : ""}</span></span>}
        {task.attachments.length > 0 && <span className="flex items-center gap-1"><Paperclip className="size-3.5" />{task.attachments.length}</span>}
        {task.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5">{tag}</span>)}
      </div>
    </button>
  </article>;
}

export function TaskDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("ALL");
  const [sort, setSort] = useState<SortMode>("space");
  const [spaceOrder, setSpaceOrder] = useState<Record<"pending" | "completed", number[]>>({ pending: [], completed: [] });
  const [draggedTask, setDraggedTask] = useState<{ id: number; group: "pending" | "completed" } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dueFilter, setDueFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [clientFilter, setClientFilter] = useState("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ name: "", url: "" });

  const syncSpaceOrder = useCallback((nextTasks: Task[]) => {
    setSpaceOrder((current) => {
      const merge = (existing: number[], incoming: number[]) => {
        const seen = new Set(existing);
        return [...existing, ...incoming.filter((id) => !seen.has(id))];
      };

      return {
        pending: merge(current.pending, nextTasks.filter((task) => !isCompleted(task)).map((task) => task.id)),
        completed: merge(current.completed, nextTasks.filter(isCompleted).map((task) => task.id)),
      };
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [tasksResponse, optionsResponse] = await Promise.all([fetch("/api/tasks", { cache: "no-store" }), fetch("/api/calendar/options", { cache: "no-store" })]);
      const tasksData = await tasksResponse.json() as { tasks?: Task[]; error?: string };
      const optionsData = await optionsResponse.json() as { clients?: ClientOption[]; processes?: ProcessOption[]; error?: string };
      if (!tasksResponse.ok) throw new Error(tasksData.error || "Não foi possível carregar as tarefas.");
      if (!optionsResponse.ok) throw new Error(optionsData.error || "Não foi possível carregar clientes e processos.");
      const nextTasks = tasksData.tasks || [];
      setTasks(nextTasks); syncSpaceOrder(nextTasks); setClients(optionsData.clients || []); setProcesses(optionsData.processes || []);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }, [syncSpaceOrder]);
  // The initial request intentionally owns this page's loading state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => tasks.filter((task) => {
    const text = [task.title, task.description, task.clientName, task.processTitle, task.processNumber, ...task.tags].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    const today = localDate();
    const dueMatch = dueFilter === "ALL" || (dueFilter === "OVERDUE" && !isCompleted(task) && Boolean(task.dueDate && task.dueDate < today)) || (dueFilter === "TODAY" && task.dueDate === today) || (dueFilter === "UPCOMING" && Boolean(task.dueDate && task.dueDate > today)) || (dueFilter === "NONE" && !task.dueDate);
    return (!query.trim() || text.includes(query.trim().toLocaleLowerCase("pt-BR"))) && (assignee === "ALL" || task.assignee === assignee) && (priorityFilter === "ALL" || task.priority === priorityFilter) && (clientFilter === "ALL" || (clientFilter === "NONE" ? !task.clientId : task.clientId === Number(clientFilter))) && dueMatch;
  }), [tasks, query, assignee, dueFilter, priorityFilter, clientFilter]);

  const orderedBySpace = useCallback((group: "pending" | "completed", items: Task[]) => {
    const ids = items.map((task) => task.id);
    const orderedIds = [...(spaceOrder[group] ?? []).filter((id) => ids.includes(id)), ...ids.filter((id) => !(spaceOrder[group] ?? []).includes(id))];
    return orderedIds.map((id) => items.find((task) => task.id === id)).filter(Boolean) as Task[];
  }, [spaceOrder]);

  function reorderSpaceGroup(group: "pending" | "completed", taskId: number, targetId: number) {
    if (taskId === targetId) return;
    setSpaceOrder((current) => {
      const existing = current[group];
      const next = existing.length ? [...existing] : tasks.filter((task) => group === "pending" ? !isCompleted(task) : isCompleted(task)).map((task) => task.id);
      const sourceIndex = next.indexOf(taskId);
      const targetIndex = next.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const [item] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, item);
      return { ...current, [group]: next };
    });
  }

  const groups = useMemo(() => {
    const pending = visible.filter((task) => !isCompleted(task));
    const completed = visible.filter(isCompleted);
    const byDate = (items: Task[]) => [...items].sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")) || String(a.dueTime || "99").localeCompare(String(b.dueTime || "99")) || a.id - b.id);
    if (sort === "assignee") return [...team, "Sem responsável"].map((name) => ({ label: name.toUpperCase(), tone: "default", tasks: byDate(pending.filter((task) => name === "Sem responsável" ? !task.assignee : task.assignee === name)) })).concat([{ label: "CONCLUÍDAS", tone: "completed", tasks: byDate(completed) }]);
    if (sort === "priority") return (["URGENT", "HIGH", "MEDIUM", "LOW"] as Priority[]).map((priority) => ({ label: priorityLabel[priority].toUpperCase(), tone: priority === "URGENT" ? "overdue" : "default", tasks: byDate(pending.filter((task) => task.priority === priority)) })).concat([{ label: "CONCLUÍDAS", tone: "completed", tasks: byDate(completed) }]);
    if (sort === "space") return [{ label: "TAREFAS", tone: "default", tasks: orderedBySpace("pending", pending) }, { label: "CONCLUÍDAS", tone: "completed", tasks: orderedBySpace("completed", completed) }];
    const today = localDate();
    return [
      { label: "VENCIDAS", tone: "overdue", tasks: byDate(pending.filter((task) => task.dueDate && task.dueDate < today)) },
      { label: "HOJE", tone: "default", tasks: byDate(pending.filter((task) => task.dueDate === today)) },
      { label: "PRÓXIMAS", tone: "default", tasks: byDate(pending.filter((task) => !task.dueDate || task.dueDate > today)) },
      { label: "CONCLUÍDAS", tone: "completed", tasks: byDate(completed) },
    ];
  }, [visible, sort, orderedBySpace]);

  const activeFilters = [dueFilter !== "ALL", priorityFilter !== "ALL", clientFilter !== "ALL"].filter(Boolean).length;
  const filteredProcesses = form.clientId ? processes.filter((process) => process.clientId === Number(form.clientId)) : processes;
  function update<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function openNew() { setSelected(null); setForm(emptyForm); setAddingLink(false); setLinkDraft({ name: "", url: "" }); setDrawerOpen(true); }
  function openTask(task: Task) { setSelected(task); setForm(taskToForm(task)); setAddingLink(false); setLinkDraft({ name: "", url: "" }); setDrawerOpen(true); }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!form.title.trim() || saving) return;
    setSaving(true); setError("");
    const frequency = form.recurrence === "FRIDAY" ? "WEEKLY" : form.recurrence;
    const body = { ...form, clientId: form.linkType === "NONE" ? null : form.clientId || null, processId: form.linkType === "PROCESS" ? form.processId || null : null, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean), recurrenceFrequency: frequency, recurrenceDaysOfWeek: form.recurrence === "FRIDAY" ? "5" : null, recurrenceInterval: 1, recurrenceEndType: "NEVER", attachments: form.attachments };
    try {
      const response = await fetch(selected ? `/api/tasks/${selected.id}` : "/api/tasks", { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a tarefa.");
      setDrawerOpen(false); await load();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSaving(false); }
  }

  async function toggle(task: Task) {
    setBusyId(task.id); setError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: isCompleted(task) ? "TODO" : "COMPLETED" }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar a tarefa.");
      await load();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusyId(null); }
  }

  async function remove(scope: "THIS" | "FUTURE" = "THIS") {
    if (!selected || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/tasks/${selected.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir a tarefa.");
      setDeleteOpen(false); setDrawerOpen(false); await load();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSaving(false); }
  }

  function addAttachment() {
    if (!linkDraft.name.trim() || !/^https?:\/\//i.test(linkDraft.url.trim())) return;
    update("attachments", [...form.attachments, { id: crypto.randomUUID(), name: linkDraft.name.trim(), url: linkDraft.url.trim() }]);
    setLinkDraft({ name: "", url: "" }); setAddingLink(false);
  }

  return <div className="mx-auto min-h-screen w-full max-w-[1500px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-500">Organização do escritório</p>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.035em] text-[#111a2d]">Painel de Tarefas</h1>
        <p className="mt-2 text-sm text-slate-500">Acompanhe prazos, responsáveis e prioridades em um só lugar.</p>
      </div>
      <Button onClick={openNew} className="h-11 self-start rounded-lg bg-blue-600 px-5 shadow-sm hover:bg-blue-700"><Plus />Nova Tarefa</Button>
    </header>

    {error && <div role="alert" className="mt-6 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span className="flex gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</span><button onClick={() => setError("")} aria-label="Fechar aviso"><X className="size-4" /></button></div>}

    <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
      <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_190px_190px_auto]">
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tarefas..." className="h-11 rounded-lg border-slate-200 pl-10 shadow-sm" /></div>
        <select value={assignee} onChange={(event) => setAssignee(event.target.value)} aria-label="Filtrar por responsável" className={selectClass}><option value="ALL">Filtro: Todos</option>{team.map((name) => <option key={name}>{name}</option>)}</select>
        <div className="relative"><ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="Ordenar tarefas" className={`${selectClass} pl-9`}><option value="date">Ordenar por: Prazo</option><option value="assignee">Ordenar por: Responsável</option><option value="priority">Ordenar por: Prioridade</option><option value="space">Ordem do Espaço</option></select></div>
        <Button type="button" variant="outline" onClick={() => setFiltersOpen((value) => !value)} className={cn("h-11 rounded-lg border-slate-200", filtersOpen && "border-blue-300 bg-blue-50 text-blue-700")}><Filter />Filtros{activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-blue-600 text-[10px] text-white">{activeFilters}</span>}<ChevronDown className={cn("transition", filtersOpen && "rotate-180")} /></Button>
      </div>
      {filtersOpen && <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3"><label className="space-y-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prazo</span><select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)} className={selectClass}><option value="ALL">Todos os prazos</option><option value="OVERDUE">Vencidas</option><option value="TODAY">Hoje</option><option value="UPCOMING">Próximas</option><option value="NONE">Sem prazo</option></select></label><label className="space-y-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prioridade</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className={selectClass}><option value="ALL">Todas</option>{Object.entries(priorityLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="space-y-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</span><select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className={selectClass}><option value="ALL">Todos</option><option value="NONE">Sem vínculo</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label></div>}
    </section>

    {loading ? <div className="mt-8 space-y-8">{[0, 1, 2].map((group) => <div key={group}><Skeleton className="mb-3 h-4 w-28" /><div className="space-y-3"><Skeleton className="h-[76px] rounded-xl" /><Skeleton className="h-[76px] rounded-xl" /></div></div>)}</div> : visible.length === 0 ? <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><div className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-blue-600"><Check className="size-6" /></div><h2 className="mt-4 text-lg font-bold text-slate-900">{tasks.length ? "Nenhuma tarefa corresponde aos filtros" : "Tudo organizado por aqui"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{tasks.length ? "Ajuste a pesquisa ou limpe os filtros para visualizar outras tarefas." : "Crie a primeira tarefa para acompanhar prazos e responsabilidades do escritório."}</p><div className="mt-5 flex justify-center gap-2">{tasks.length > 0 && <Button variant="outline" onClick={() => { setQuery(""); setAssignee("ALL"); setDueFilter("ALL"); setPriorityFilter("ALL"); setClientFilter("ALL"); }}><RotateCcw />Limpar filtros</Button>}<Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700"><Plus />Nova Tarefa</Button></div></section> : <section className="mt-8 space-y-8">{groups.filter((group) => group.tasks.length > 0).map((group) => <div key={group.label}><div className="mb-3 flex items-center gap-2"><h2 className={cn("text-xs font-bold tracking-[.13em] text-slate-500", group.tone === "overdue" && "text-red-600", group.tone === "completed" && "text-blue-600")}>{group.label}</h2><span className={cn("rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600", group.tone === "overdue" && "bg-red-100 text-red-700", group.tone === "completed" && "bg-blue-100 text-blue-700")}>{group.tasks.length}</span></div><div className="space-y-3">{group.tasks.map((task) => {
          const groupId = group.label === "CONCLUÍDAS" ? "completed" : "pending";
          return <TaskCard key={task.id} task={task} busy={busyId === task.id} draggable={sort === "space"} onDragStart={() => { setDraggedTask({ id: task.id, group: groupId }); }} onDragOver={(event) => { if (sort === "space" && draggedTask) event.preventDefault(); }} onDrop={() => { if (sort === "space" && draggedTask && draggedTask.group === groupId && draggedTask.id !== task.id) { reorderSpaceGroup(groupId, draggedTask.id, task.id); } setDraggedTask(null); }} onDragEnd={() => setDraggedTask(null)} onOpen={() => openTask(task)} onToggle={() => void toggle(task)} />;
        })}</div></div>)}</section>}

    <Sheet open={drawerOpen} onOpenChange={(open) => !saving && setDrawerOpen(open)}><SheetContent className="!w-full !max-w-none gap-0 p-0 sm:!w-[500px]" showCloseButton={false}><form onSubmit={save} className="flex min-h-0 flex-1 flex-col"><SheetHeader className="border-b border-slate-200 px-6 py-5"><div className="flex items-center justify-between"><SheetTitle className="text-lg">{selected ? "Detalhes da Tarefa" : "Nova Tarefa"}</SheetTitle><button type="button" onClick={() => setDrawerOpen(false)} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="size-5" /><span className="sr-only">Fechar</span></button></div><SheetDescription className="sr-only">Cadastre ou edite os dados da tarefa.</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-5">
          <Input autoFocus value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="O que precisa ser feito?" className="h-auto border-0 px-0 py-1 text-xl font-semibold shadow-none focus-visible:ring-0" />
          <Textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Adicionar descrição..." rows={3} className="resize-none rounded-xl border-slate-200" />
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Responsável"><select value={form.assignee} onChange={(event) => update("assignee", event.target.value)} className={selectClass}><option value="">Sem responsável</option>{team.map((name) => <option key={name}>{name}</option>)}</select></Field><Field label="Prioridade"><select value={form.priority} onChange={(event) => update("priority", event.target.value as Priority)} className={selectClass}>{Object.entries(priorityLabel).sort(([a], [b]) => priorityRank[a as Priority] - priorityRank[b as Priority]).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Data"><Input type="date" value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} className="h-11 rounded-lg border-slate-200" /></Field><Field label="Horário"><Input type="time" value={form.dueTime} disabled={!form.dueDate} onChange={(event) => update("dueTime", event.target.value)} className="h-11 rounded-lg border-slate-200" /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Status"><select value={form.status} onChange={(event) => update("status", event.target.value as TaskStatus)} className={selectClass}><option value="TODO">A fazer</option><option value="IN_PROGRESS">Em andamento</option><option value="COMPLETED">Concluída</option></select></Field><Field label="Recorrência"><select value={form.recurrence} onChange={(event) => update("recurrence", event.target.value as FormState["recurrence"])} className={selectClass}><option value="NONE">Nenhuma</option><option value="DAILY">Diária</option><option value="WEEKLY">Semanal</option><option value="FRIDAY">Toda sexta-feira</option><option value="MONTHLY">Mensal</option></select></Field></div>
          <Field label="Etiquetas"><div className="relative"><Tag className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="Ex: Petição, Urgente" className="h-11 rounded-lg border-slate-200 pl-10" /></div></Field>
          <fieldset className="space-y-3"><legend className="text-sm font-semibold text-slate-700">Vincular a</legend><div className="flex flex-wrap gap-4">{[["NONE", "Nenhum"], ["CLIENT", "Cliente"], ["PROCESS", "Processo"]].map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600"><input type="radio" name="linkType" value={value} checked={form.linkType === value} onChange={() => { update("linkType", value as FormState["linkType"]); if (value === "NONE") { update("clientId", ""); update("processId", ""); } }} className="accent-blue-600" />{label}</label>)}</div>{form.linkType !== "NONE" && <select value={form.clientId} onChange={(event) => { update("clientId", event.target.value); update("processId", ""); }} className={selectClass}><option value="">Selecione o cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>}{form.linkType === "PROCESS" && <select value={form.processId} onChange={(event) => { const process = processes.find((item) => item.id === Number(event.target.value)); update("processId", event.target.value); if (process) update("clientId", String(process.clientId)); }} className={selectClass}><option value="">Selecione o processo</option>{filteredProcesses.map((process) => <option key={process.id} value={process.id}>{process.title ? `${process.title} · ` : ""}{process.processNumber}</option>)}</select>}{form.linkType === "PROCESS" && form.processId && processes.find((item) => item.id === Number(form.processId))?.eprocUrl && <a href={processes.find((item) => item.id === Number(form.processId))?.eprocUrl || "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">Abrir no eproc <ExternalLink className="size-3.5" /></a>}</fieldset>
          <section className="border-t border-slate-200 pt-5"><div className="flex items-center justify-between"><h3 className="text-xs font-bold tracking-[.12em] text-slate-500">ANEXOS E LINKS</h3><Button type="button" variant="ghost" size="sm" onClick={() => setAddingLink(true)} className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"><Plus />Adicionar Link</Button></div><div className="mt-3 space-y-2">{form.attachments.map((attachment) => <div key={attachment.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"><Paperclip className="size-4 text-slate-400" /><a href={attachment.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 hover:text-blue-600">{attachment.name}</a><button type="button" onClick={() => update("attachments", form.attachments.filter((item) => item.id !== attachment.id))} className="text-slate-400 hover:text-red-600"><X className="size-4" /></button></div>)}{addingLink && <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3"><Input value={linkDraft.name} onChange={(event) => setLinkDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Nome do link" className="bg-white" /><Input value={linkDraft.url} onChange={(event) => setLinkDraft((draft) => ({ ...draft, url: event.target.value }))} placeholder="https://..." type="url" className="bg-white" /><div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setAddingLink(false)}>Cancelar</Button><Button type="button" size="sm" onClick={addAttachment} disabled={!linkDraft.name.trim() || !/^https?:\/\//i.test(linkDraft.url.trim())} className="bg-blue-600 hover:bg-blue-700">Adicionar</Button></div></div>}</div></section>
        </div>
      </div>
      <SheetFooter className="flex-row items-center border-t border-slate-200 bg-white px-6 py-4">{selected && <Button type="button" variant="ghost" onClick={() => setDeleteOpen(true)} className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 />Excluir Tarefa</Button>}<Button type="button" variant="outline" onClick={() => setDrawerOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving || !form.title.trim()} className="bg-blue-600 hover:bg-blue-700">{saving && <LoaderCircle className="animate-spin" />}Salvar Tarefa</Button></SheetFooter>
    </form></SheetContent></Sheet>

    <AlertDialog open={deleteOpen} onOpenChange={(open) => !saving && setDeleteOpen(open)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir esta tarefa?</AlertDialogTitle><AlertDialogDescription>{selected?.recurrenceSeriesId ? "Você pode excluir somente esta ocorrência ou também as próximas ocorrências da série." : "Esta ação não pode ser desfeita."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>{selected?.recurrenceSeriesId && <AlertDialogAction disabled={saving} variant="outline" onClick={() => void remove("FUTURE")}>Esta e próximas</AlertDialogAction>}<AlertDialogAction disabled={saving} variant="destructive" onClick={() => void remove("THIS")}>{saving && <LoaderCircle className="animate-spin" />}Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5"><Label className="text-sm font-semibold text-slate-700">{label}</Label>{children}</label>;
}
