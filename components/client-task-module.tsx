"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, LoaderCircle, Plus, Repeat2, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TEAM_MEMBERS, parseWeekDays, recurrenceLabel, type TaskRecord } from "@/lib/tasks";

type ProcessOption = { id: number; processNumber: string };
type Filter = "ALL" | "TODO" | "IN_PROGRESS" | "COMPLETED";
type RepeatMode = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";

const priorities: Record<string, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente" };
const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const weekDays = [{ value: 1, label: "Seg" }, { value: 2, label: "Ter" }, { value: 3, label: "Qua" }, { value: 4, label: "Qui" }, { value: 5, label: "Sex" }, { value: 6, label: "Sáb" }, { value: 0, label: "Dom" }];

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function normalizedStatus(status: string) {
  return status === "NOT_STARTED" ? "TODO" : status;
}

function taskSort(a: TaskRecord, b: TaskRecord) {
  const aCompleted = normalizedStatus(a.status) === "COMPLETED";
  const bCompleted = normalizedStatus(b.status) === "COMPLETED";
  if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
  if (aCompleted && bCompleted) return String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt));
  if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1;
  const aDue = `${a.dueDate || ""}T${a.dueTime || "23:59"}`;
  const bDue = `${b.dueDate || ""}T${b.dueTime || "23:59"}`;
  return aDue.localeCompare(bDue) || (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) || String(b.createdAt).localeCompare(String(a.createdAt));
}

export function ClientTaskModule({ clientId, tasks, processes, reload, reportError }: { clientId: number; tasks: TaskRecord[]; processes: ProcessOption[]; reload: () => Promise<void>; reportError: (message: string) => void }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState<TaskRecord | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTask, setDeleteTask] = useState<TaskRecord | null>(null);

  const visible = useMemo(() => [...tasks]
    .filter((task) => filter === "ALL" || normalizedStatus(task.status) === filter)
    .sort(taskSort), [filter, tasks]);

  async function saveTask(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/tasks/${editing.id}` : `/api/clients/${clientId}/tasks`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a tarefa.");
      setEditing(undefined);
      await reload();
    } catch (error) {
      reportError(error instanceof Error ? error.message : "Não foi possível salvar a tarefa.");
    } finally { setSaving(false); }
  }

  async function setStatus(task: TaskRecord, status: "TODO" | "COMPLETED") {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar a tarefa.");
      await reload();
    } catch (error) { reportError(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa."); }
  }

  async function remove(scope: "THIS" | "FUTURE") {
    if (!deleteTask) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/tasks/${deleteTask.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir a tarefa.");
      setDeleteTask(null);
      setEditing(undefined);
      await reload();
    } catch (error) { reportError(error instanceof Error ? error.message : "Não foi possível excluir a tarefa."); }
    finally { setDeleting(false); }
  }

  return <section className="mt-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold">Tarefas</h2><p className="mt-1 text-sm text-slate-500">Pendências relacionadas ao cliente e seus processos.</p></div><Button variant="outline" onClick={() => setEditing(null)}><Plus />Nova tarefa</Button></div>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Filtrar tarefas">{([['ALL', 'Todas'], ['TODO', 'A fazer'], ['IN_PROGRESS', 'Em andamento'], ['COMPLETED', 'Concluídas']] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "outline"} className={filter === value ? "bg-[#112b3d]" : ""} onClick={() => setFilter(value)}>{label}</Button>)}</div>
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">{visible.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Nenhuma tarefa neste filtro.</div> : <div className="divide-y divide-slate-200">{visible.map((task) => {
      const completed = normalizedStatus(task.status) === "COMPLETED";
      const process = processes.find((item) => item.id === task.processId);
      return <div key={task.id} className="flex items-start gap-3 p-4 hover:bg-slate-50">
        <button type="button" onClick={() => void setStatus(task, completed ? "TODO" : "COMPLETED")} className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-500"}`} aria-label={completed ? "Reabrir tarefa" : "Marcar como concluída"}><Check className="size-4" /></button>
        <button type="button" onClick={() => setEditing(task)} className="min-w-0 flex-1 text-left">
          <p className={completed ? "font-medium text-slate-400 line-through" : "font-semibold text-slate-900"}>{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            {task.dueDate && <span>{formatDate(task.dueDate)}{task.dueTime ? ` · ${task.dueTime}` : ""}</span>}
            {task.assignee && <span>{task.assignee}</span>}
            {process && <span className="font-mono">Processo {process.processNumber}</span>}
            <Badge variant="outline" className="py-0 text-xs">{priorities[task.priority]}</Badge>
          </div>
          {task.isRecurring && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Repeat2 className="size-3" />{recurrenceLabel(task)}</p>}
        </button>
      </div>;
    })}</div>}</div>
    {editing !== undefined && <TaskDialog key={editing?.id || "new"} open task={editing} processes={processes} saving={saving} onClose={() => setEditing(undefined)} onSave={saveTask} onDelete={(task) => setDeleteTask(task)} />}
    <AlertDialog open={Boolean(deleteTask)} onOpenChange={(open) => !open && setDeleteTask(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir tarefa?</AlertDialogTitle><AlertDialogDescription>{deleteTask?.isRecurring ? "Escolha se deseja remover apenas esta ocorrência ou interromper também as próximas." : "Esta tarefa será removida do histórico."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="flex-col sm:flex-row"><AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>{deleteTask?.isRecurring && <AlertDialogAction disabled={deleting} onClick={() => void remove("THIS")} className="bg-slate-700 hover:bg-slate-800">Somente esta ocorrência</AlertDialogAction>}<AlertDialogAction disabled={deleting} onClick={() => void remove(deleteTask?.isRecurring ? "FUTURE" : "THIS")} className="bg-red-700 hover:bg-red-800">{deleteTask?.isRecurring ? "Esta e as próximas" : "Excluir tarefa"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

function TaskDialog({ open, task, processes, saving, onClose, onSave, onDelete }: { open: boolean; task: TaskRecord | null; processes: ProcessOption[]; saving: boolean; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<void>; onDelete: (task: TaskRecord) => void }) {
  const initialMode: RepeatMode = task?.isRecurring ? (task.recurrenceInterval > 1 ? "CUSTOM" : task.recurrenceFrequency) : "NONE";
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initialMode);
  const [customFrequency, setCustomFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">(task?.recurrenceFrequency === "NONE" || !task?.recurrenceFrequency ? "WEEKLY" : task.recurrenceFrequency);
  const [selectedDays, setSelectedDays] = useState<number[]>(parseWeekDays(task?.recurrenceDaysOfWeek));
  const [endType, setEndType] = useState(task?.recurrenceEndType || "NEVER");
  const frequency = repeatMode === "CUSTOM" ? customFrequency : repeatMode;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    body.recurrenceFrequency = frequency;
    body.recurrenceDaysOfWeek = selectedDays.join(",");
    body.recurrenceEndType = endType;
    body.status = task ? normalizedStatus(String(body.status || task.status)) : "TODO";
    void onSave(body);
  }

  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><form onSubmit={submit}><DialogHeader><DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle><DialogDescription>{task ? "Atualize os dados desta tarefa. Em séries recorrentes, a alteração vale para esta e as próximas ocorrências." : "Crie uma pendência para o cliente ou vincule-a a um processo."}</DialogDescription></DialogHeader>
    <div className="mt-6 grid gap-4">
      <label className="space-y-2"><Label htmlFor="task-title">Título *</Label><Input id="task-title" name="title" required defaultValue={task?.title || ""} /></label>
      <label className="space-y-2"><Label htmlFor="task-description">Descrição</Label><Textarea id="task-description" name="description" rows={4} defaultValue={task?.description || ""} /></label>
      <div className="grid gap-4 sm:grid-cols-3">
        <fieldset className="space-y-2"><Label>Data e hora</Label><div className="grid grid-cols-[1fr_7rem] gap-2"><Input name="dueDate" type="date" defaultValue={task?.dueDate || ""} /><Input name="dueTime" type="time" defaultValue={task?.dueTime || ""} aria-label="Hora opcional" /></div></fieldset>
        <label className="space-y-2"><Label>Atribuir</Label><select name="assignee" defaultValue={task?.assignee || ""} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Sem responsável</option>{TEAM_MEMBERS.map((member) => <option key={member}>{member}</option>)}</select></label>
        <label className="space-y-2"><Label>Repetir</Label><select value={repeatMode} onChange={(event) => setRepeatMode(event.target.value as RepeatMode)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="NONE">Não repetir</option><option value="DAILY">Diariamente</option><option value="WEEKLY">Semanalmente</option><option value="MONTHLY">Mensalmente</option><option value="CUSTOM">Personalizado</option></select></label>
      </div>
      {repeatMode === "CUSTOM" && <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><label className="space-y-2"><Label>A cada</Label><Input name="recurrenceInterval" type="number" min={1} max={365} defaultValue={task?.recurrenceInterval || 2} /></label><label className="space-y-2"><Label>Período</Label><select value={customFrequency} onChange={(event) => setCustomFrequency(event.target.value as typeof customFrequency)} className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="DAILY">dias</option><option value="WEEKLY">semanas</option><option value="MONTHLY">meses</option></select></label></div>}
      {repeatMode !== "CUSTOM" && <input type="hidden" name="recurrenceInterval" value="1" />}
      {frequency === "WEEKLY" && <fieldset className="space-y-2"><Label>Dias da semana</Label><div className="flex flex-wrap gap-2">{weekDays.map((day) => { const active = selectedDays.includes(day.value); return <Button key={day.value} type="button" size="sm" variant={active ? "default" : "outline"} className={active ? "bg-[#112b3d]" : ""} onClick={() => setSelectedDays(active ? selectedDays.filter((item) => item !== day.value) : [...selectedDays, day.value])}>{day.label}</Button>; })}</div></fieldset>}
      {frequency === "MONTHLY" && <label className="max-w-48 space-y-2"><Label>Dia do mês</Label><Input name="recurrenceDayOfMonth" type="number" min={1} max={31} defaultValue={task?.recurrenceDayOfMonth || (task?.dueDate ? Number(task.dueDate.slice(8, 10)) : 1)} /></label>}
      {frequency !== "NONE" && <div className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2"><label className="space-y-2"><Label>Fim da recorrência</Label><select value={endType} onChange={(event) => setEndType(event.target.value as typeof endType)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="NEVER">Nunca</option><option value="DATE">Em uma data específica</option><option value="COUNT">Após X ocorrências</option></select></label>{endType === "DATE" && <label className="space-y-2"><Label>Data final</Label><Input name="recurrenceEndDate" type="date" defaultValue={task?.recurrenceEndDate || ""} /></label>}{endType === "COUNT" && <label className="space-y-2"><Label>Número de ocorrências</Label><Input name="recurrenceCount" type="number" min={1} max={1000} defaultValue={task?.recurrenceCount || 2} /></label>}</div>}
      <label className="space-y-2"><Label>Processo</Label><select name="processId" defaultValue={task?.processId || ""} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Cliente em geral</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.processNumber}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2"><Label>Prioridade</Label><select name="priority" defaultValue={task?.priority || "MEDIUM"} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></label>{task && <label className="space-y-2"><Label>Status</Label><select name="status" defaultValue={normalizedStatus(task.status)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="TODO">A fazer</option><option value="IN_PROGRESS">Em andamento</option><option value="COMPLETED">Concluída</option></select></label>}</div>
      {task?.isRecurring && <p className="text-xs text-slate-500">Aplicar alteração: esta e as próximas ocorrências.</p>}
    </div>
    <DialogFooter className="mt-6 sm:justify-between"><div>{task && <Button type="button" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onDelete(task)}><Trash2 />Excluir</Button>}</div><div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-[#112b3d]">{saving && <LoaderCircle className="animate-spin" />}Salvar</Button></div></DialogFooter>
  </form></DialogContent></Dialog>;
}
