"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { DateSelectArg, DatesSetArg, EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, ExternalLink, Filter, LoaderCircle, MapPin, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CALENDAR_EVENT_COLORS, DEFAULT_CALENDAR_EVENT_COLOR } from "@/lib/calendar";

type LegalType = "HEARING" | "DEADLINE" | "MEETING" | "DILIGENCE" | "EXPERT_EXAM" | "ORAL_ARGUMENT" | "CLIENT_SERVICE" | "OTHER";
type CalendarEvent = {
  id: number; title: string; description: string | null; location: string | null; startAt: string; endAt: string; allDay: boolean;
  timeZone: string; legalType: LegalType; responsible: string | null; attendees: string[]; recurrence: string[];
  reminders: { overrides?: Array<{ minutes: number }> }; clientId: number | null; processId: number | null; cnj: string | null;
  eprocUrl: string | null; googleHtmlLink: string | null; syncStatus: "PENDING" | "SYNCED" | "ERROR"; syncError: string | null;
  googleColor: string | null; googleForegroundColor: string | null;
  clientName: string | null; processNumber: string | null;
};
type CalendarOptions = { clients: Array<{ id: number; name: string }>; processes: Array<{ id: number; clientId: number; processNumber: string; title: string | null; eprocUrl: string | null }> };
type GoogleStatus = { configured: boolean; connected: boolean; status: string; lastSyncAt: string | null; lastSyncError: string | null; webhookActive: boolean; webhookExpiresAt: string | null };
type ViewName = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listMonth";

const typeLabels: Record<LegalType, string> = { HEARING: "Audiência", DEADLINE: "Prazo", MEETING: "Reunião", DILIGENCE: "Diligência", EXPERT_EXAM: "Perícia", ORAL_ARGUMENT: "Sustentação", CLIENT_SERVICE: "Atendimento", OTHER: "Outro" };
const team = ["Francisco Jansen", "Bruno Boff", "Yasmmin Flávia"];

function inputDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : format(date, "yyyy-MM-dd");
}
function inputTime(value?: string | null) {
  if (!value || value.length === 10) return "09:00";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "09:00" : format(date, "HH:mm");
}
function googleAllDayEndForForm(value: string) {
  return format(addDays(new Date(`${value}T12:00:00`), -1), "yyyy-MM-dd");
}

function parseRRule(rule: string) {
  return Object.fromEntries(rule.replace(/^RRULE:/, "").split(";").map((part) => part.split("="))) as Record<string, string>;
}

function expandRecurringEvent(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): EventInput[] {
  const backgroundColor = event.googleColor || DEFAULT_CALENDAR_EVENT_COLOR;
  const textColor = event.googleForegroundColor || "#ffffff";
  if (!event.recurrence.length) return [{ id: String(event.id), title: event.title, start: event.startAt, end: event.endAt, allDay: event.allDay, display: event.allDay ? "block" : "list-item", backgroundColor, borderColor: backgroundColor, textColor, extendedProps: { internalId: event.id, recurring: false } }];
  const rule = parseRRule(event.recurrence[0]);
  const masterStart = new Date(event.startAt.length === 10 ? `${event.startAt}T00:00:00` : event.startAt);
  const masterEnd = new Date(event.endAt.length === 10 ? `${event.endAt}T00:00:00` : event.endAt);
  const duration = masterEnd.getTime() - masterStart.getTime();
  const until = rule.UNTIL ? new Date(`${rule.UNTIL.slice(0, 4)}-${rule.UNTIL.slice(4, 6)}-${rule.UNTIL.slice(6, 8)}T23:59:59`) : rangeEnd;
  const limit = Math.min(1000, Number(rule.COUNT) || 1000);
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const dayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const byDay = rule.BYDAY?.split(",") || [dayCodes[masterStart.getDay()]];
  const result: EventInput[] = [];
  let cursor = new Date(masterStart);
  let occurrences = 0;
  for (let guard = 0; guard < 10000 && cursor <= rangeEnd && cursor <= until && occurrences < limit; guard += 1) {
    const daysFromStart = Math.floor((cursor.getTime() - masterStart.getTime()) / 86400000);
    const weeksFromStart = Math.floor(daysFromStart / 7);
    const monthsFromStart = (cursor.getFullYear() - masterStart.getFullYear()) * 12 + cursor.getMonth() - masterStart.getMonth();
    const matches = rule.FREQ === "DAILY" ? daysFromStart % interval === 0
      : rule.FREQ === "WEEKLY" ? weeksFromStart % interval === 0 && byDay.includes(dayCodes[cursor.getDay()])
      : rule.FREQ === "MONTHLY" ? monthsFromStart % interval === 0 && cursor.getDate() === masterStart.getDate()
      : false;
    if (matches) {
      occurrences += 1;
      if (cursor >= rangeStart || cursor.getTime() + duration >= rangeStart.getTime()) {
        const occurrenceStart = new Date(cursor);
        occurrenceStart.setHours(masterStart.getHours(), masterStart.getMinutes(), masterStart.getSeconds(), 0);
        result.push({ id: `${event.id}__${occurrenceStart.toISOString()}`, title: event.title, start: event.allDay ? format(occurrenceStart, "yyyy-MM-dd") : occurrenceStart.toISOString(), end: event.allDay ? format(new Date(occurrenceStart.getTime() + duration), "yyyy-MM-dd") : new Date(occurrenceStart.getTime() + duration).toISOString(), allDay: event.allDay, display: event.allDay ? "block" : "list-item", backgroundColor, borderColor: backgroundColor, textColor, editable: false, extendedProps: { internalId: event.id, recurring: true } });
      }
    }
    cursor = addDays(cursor, 1);
  }
  return result;
}

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [options, setOptions] = useState<CalendarOptions>({ clients: [], processes: [] });
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allDay, setAllDay] = useState(false);
  const [selectedClient, setSelectedClient] = useState("NONE");
  const [selectedProcess, setSelectedProcess] = useState("NONE");
  const [recurrence, setRecurrence] = useState("NONE");
  const [selectedColor, setSelectedColor] = useState(DEFAULT_CALENDAR_EVENT_COLOR);
  const [view, setView] = useState<ViewName>("dayGridMonth");
  const [title, setTitle] = useState(format(new Date(), "MMMM 'de' yyyy", { locale: ptBR }));
  const [range, setRange] = useState({ start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), end: addDays(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1), 7) });
  const [enabledTypes, setEnabledTypes] = useState<Set<LegalType>>(new Set(Object.keys(typeLabels) as LegalType[]));
  const [enabledPeople, setEnabledPeople] = useState<Set<string>>(new Set(team));

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [eventResponse, optionResponse, statusResponse] = await Promise.all([fetch("/api/calendar/events", { cache: "no-store" }), fetch("/api/calendar/options", { cache: "no-store" }), fetch("/api/calendar/google/status", { cache: "no-store" })]);
      const eventData = await eventResponse.json() as { events?: CalendarEvent[]; error?: string };
      if (!eventResponse.ok) throw new Error(eventData.error || "Não foi possível carregar o calendário.");
      setEvents(eventData.events || []);
      setOptions(await optionResponse.json() as CalendarOptions);
      setGoogle(await statusResponse.json() as GoogleStatus);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar o calendário."); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); const poll = window.setInterval(() => void load(true), 30_000); return () => { window.clearTimeout(initial); window.clearInterval(poll); }; }, [load]);

  const visibleEvents = useMemo(() => events.filter((event) => enabledTypes.has(event.legalType) && (!event.responsible || enabledPeople.has(event.responsible))).flatMap((event) => expandRecurringEvent(event, range.start, range.end)), [events, enabledTypes, enabledPeople, range]);
  const filteredProcesses = useMemo(() => options.processes.filter((process) => selectedClient === "NONE" || process.clientId === Number(selectedClient)), [options.processes, selectedClient]);

  function openNew(date = new Date(), isAllDay = false) {
    setEditing(null); setSelectedDate(date); setAllDay(isAllDay); setSelectedClient("NONE"); setSelectedProcess("NONE"); setRecurrence("NONE"); setSelectedColor(DEFAULT_CALENDAR_EVENT_COLOR); setMessage(""); setDialogOpen(true);
  }
  function openEdit(event: CalendarEvent) {
    setEditing(event); setSelectedDate(new Date(event.startAt.length === 10 ? `${event.startAt}T12:00:00` : event.startAt)); setAllDay(event.allDay); setSelectedClient(event.clientId ? String(event.clientId) : "NONE"); setSelectedProcess(event.processId ? String(event.processId) : "NONE"); setRecurrence(event.recurrence.length ? parseRRule(event.recurrence[0]).FREQ || "NONE" : "NONE"); setSelectedColor(event.googleColor || DEFAULT_CALENDAR_EVENT_COLOR); setMessage(""); setDialogOpen(true);
  }
  function navigate(action: "prev" | "next" | "today") {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api[action](); setSelectedDate(api.getDate());
  }
  function changeView(next: ViewName) { setView(next); calendarRef.current?.getApi().changeView(next); }

  async function syncGoogle() {
    if (google && !google.configured) { setMessage("Configure as credenciais OAuth do Google no servidor antes de conectar."); return; }
    if (!google?.connected) { window.location.href = new URL("/api/calendar/google/connect", window.location.origin).toString(); return; }
    setSyncing(true); setMessage("");
    try {
      const response = await fetch("/api/calendar/google/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha na sincronização.");
      setMessage("Google Calendar sincronizado."); await load(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na sincronização."); }
    finally { setSyncing(false); }
  }

  async function saveEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); setSaving(true); setMessage("");
    const form = new FormData(formEvent.currentTarget);
    const date = String(form.get("date"));
    const endDate = String(form.get("endDate") || date);
    const body = {
      title: form.get("title"), description: form.get("description"), location: form.get("location"), responsible: form.get("responsible"), legalType: form.get("legalType"), googleColor: selectedColor,
      allDay, startAt: allDay ? date : new Date(`${date}T${form.get("startTime")}:00`).toISOString(), endAt: allDay ? format(addDays(new Date(`${endDate}T12:00:00`), 1), "yyyy-MM-dd") : new Date(`${endDate}T${form.get("endTime")}:00`).toISOString(),
      attendees: form.get("attendees"), clientId: selectedClient === "NONE" ? null : Number(selectedClient), processId: selectedProcess === "NONE" ? null : Number(selectedProcess), cnj: form.get("cnj"), eprocUrl: form.get("eprocUrl"),
      reminderMinutes: form.get("reminderMinutes"), recurrenceFrequency: recurrence, recurrenceInterval: form.get("recurrenceInterval"), recurrenceEndDate: form.get("recurrenceEndDate"),
    };
    try {
      const response = await fetch(editing ? `/api/calendar/events/${editing.id}` : "/api/calendar/events", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { error?: string; syncWarning?: string };
      if (!response.ok && response.status !== 202) throw new Error(data.error || "Não foi possível salvar o agendamento.");
      setDialogOpen(false); setMessage(data.syncWarning || data.error || "Agendamento salvo e sincronizado."); await load(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o agendamento."); }
    finally { setSaving(false); }
  }

  async function removeEvent() {
    if (!editing || saving) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/calendar/events/${editing.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir o agendamento.");
      setDialogOpen(false); setMessage("Agendamento excluído no Jansen e no Google."); await load(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível excluir o agendamento."); }
    finally { setSaving(false); }
  }

  async function persistMove(arg: EventDropArg | EventResizeDoneArg) {
    const internalId = Number(arg.event.extendedProps.internalId);
    if (!internalId || arg.event.extendedProps.recurring) { arg.revert(); return; }
    try {
      const response = await fetch(`/api/calendar/events/${internalId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startAt: arg.event.startStr, endAt: arg.event.endStr || arg.event.startStr, allDay: arg.event.allDay }) });
      const data = await response.json() as { error?: string };
      if (!response.ok && response.status !== 202) throw new Error(data.error || "Não foi possível mover o evento.");
      setMessage(data.error || "Horário atualizado no Jansen e no Google."); await load(true);
    } catch (error) { arg.revert(); setMessage(error instanceof Error ? error.message : "Não foi possível mover o evento."); }
  }

  const editStartDate = editing ? inputDate(editing.startAt) : format(selectedDate, "yyyy-MM-dd");
  const editEndDate = editing ? (editing.allDay ? googleAllDayEndForForm(editing.endAt) : inputDate(editing.endAt)) : editStartDate;
  const editingRule = editing?.recurrence[0] ? parseRRule(editing.recurrence[0]) : {};
  const selectedProcessData = options.processes.find((item) => item.id === Number(selectedProcess));

  return <div className="min-h-screen bg-white">
    <header className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-[#e28a00]"><CalendarDays className="size-5" /></div><div><h1 className="text-xl font-bold tracking-tight">Calendário</h1><p className="text-sm text-slate-500">Gerencie agendamentos, audiências e prazos</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => void syncGoogle()} disabled={syncing || google?.status === "SYNCING"} className="h-10 rounded-lg"><RefreshCw className={syncing ? "animate-spin" : ""} />{google?.connected ? "Sincronizar Google Calendar" : "Conectar Google Calendar"}{google?.connected && <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Conectado</span>}</Button>
        <Button onClick={() => openNew()} className="h-10 bg-[#f59b00] px-4 text-white hover:bg-[#dd8900]"><Plus />Novo agendamento</Button>
      </div>
    </header>
    {message && <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 sm:mx-6"><AlertCircle className="size-4 shrink-0" />{message}</div>}

    <div className="flex min-h-[calc(100vh-90px)]">
      <aside className="hidden w-[250px] shrink-0 border-r border-slate-200 px-4 py-5 xl:block">
        <Button onClick={() => openNew()} variant="outline" className="h-12 w-full justify-start rounded-full border-slate-200 bg-white px-5 shadow-sm"><Plus className="size-5" />Criar</Button>
        <Calendar mode="single" selected={selectedDate} onSelect={(date) => { if (date) { setSelectedDate(date); calendarRef.current?.getApi().gotoDate(date); } }} locale={ptBR} className="mt-4 w-full p-0 [--cell-size:30px]" />
        <div className="mt-6 border-t border-slate-200 pt-5"><div className="flex items-center gap-2 text-sm font-bold"><Filter className="size-4" />Tipos de agendamento</div><div className="mt-3 space-y-2.5">{(Object.keys(typeLabels) as LegalType[]).map((type) => <label key={type} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><Checkbox checked={enabledTypes.has(type)} onCheckedChange={(checked) => setEnabledTypes((current) => { const next = new Set(current); if (checked) next.add(type); else next.delete(type); return next; })} />{typeLabels[type]}</label>)}</div></div>
        <div className="mt-6 border-t border-slate-200 pt-5"><div className="flex items-center gap-2 text-sm font-bold"><Users className="size-4" />Responsáveis</div><div className="mt-3 space-y-2.5">{team.map((person) => <label key={person} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><Checkbox checked={enabledPeople.has(person)} onCheckedChange={(checked) => setEnabledPeople((current) => { const next = new Set(current); if (checked) next.add(person); else next.delete(person); return next; })} />{person}</label>)}</div></div>
      </aside>

      <main className="min-w-0 flex-1 p-3 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1"><Button variant="outline" onClick={() => navigate("today")} className="h-10 px-4">Hoje</Button><Button variant="ghost" size="icon" onClick={() => navigate("prev")} aria-label="Período anterior"><ChevronLeft /></Button><Button variant="ghost" size="icon" onClick={() => navigate("next")} aria-label="Próximo período"><ChevronRight /></Button><h2 className="calendar-period-title ml-2 text-xl font-semibold sm:text-2xl">{title}</h2></div>
          <div className="flex overflow-x-auto rounded-lg border border-slate-200 p-1">{([['timeGridDay','Dia'],['timeGridWeek','Semana'],['dayGridMonth','Mês'],['listMonth','Agenda']] as Array<[ViewName,string]>).map(([value,label]) => <Button key={value} variant="ghost" size="sm" onClick={() => changeView(value)} className={view === value ? "bg-slate-100 text-slate-950" : "text-slate-500"}>{label}</Button>)}</div>
        </div>
        <div className="calendar-surface relative min-h-[640px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {loading && <div className="absolute inset-0 z-10 grid place-items-center bg-white/80"><div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" />Carregando agenda...</div></div>}
          <FullCalendar ref={calendarRef} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]} locale={ptBrLocale} initialView="dayGridMonth" headerToolbar={false} height="auto" contentHeight="auto" nowIndicator selectable editable eventResizableFromStart dayMaxEvents={3} eventOrder="allDay,start,-duration,title" moreLinkContent={(arg) => `Mais ${arg.num}`} slotMinTime="07:00:00" slotMaxTime="22:00:00" slotDuration="00:30:00" allDayText="Dia inteiro" noEventsText="Nenhum agendamento neste período" events={visibleEvents} select={(arg: DateSelectArg) => openNew(arg.start, arg.allDay)} eventClick={(arg: EventClickArg) => { const event = events.find((item) => item.id === Number(arg.event.extendedProps.internalId)); if (event) openEdit(event); }} eventDrop={(arg) => void persistMove(arg)} eventResize={(arg) => void persistMove(arg)} datesSet={(arg: DatesSetArg) => { setRange({ start: arg.start, end: arg.end }); setTitle(format(arg.view.currentStart, arg.view.type === "timeGridDay" ? "d 'de' MMMM 'de' yyyy" : "MMMM 'de' yyyy", { locale: ptBR })); setView(arg.view.type as ViewName); setSelectedDate(arg.view.currentStart); }} eventContent={(arg) => <div className={`calendar-event-content flex min-w-0 items-center gap-1 ${arg.event.allDay ? "calendar-event-block" : "calendar-event-timed"}`}>{!arg.event.allDay && <span aria-hidden="true" className="calendar-event-dot" style={{ backgroundColor: arg.event.backgroundColor }} />}<span className="truncate font-semibold">{arg.timeText && <span className="mr-1 font-normal opacity-80">{arg.timeText}</span>}{arg.event.title}</span>{arg.event.extendedProps.recurring && <RefreshCw className="size-2.5 shrink-0" aria-hidden="true" />}</div>} />
        </div>
      </main>
    </div>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader><DialogTitle>{editing ? "Editar agendamento" : "Novo agendamento"}</DialogTitle><DialogDescription>Os dados jurídicos ficam vinculados ao evento do Jansen e a agenda é sincronizada com o Google Calendar.</DialogDescription></DialogHeader>
        <form onSubmit={saveEvent} className="space-y-5">
          <div><Label htmlFor="calendar-title">Título</Label><Input id="calendar-title" name="title" defaultValue={editing?.title || ""} className="mt-1.5 h-11" required autoFocus /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="legalType">Tipo jurídico</Label><select id="legalType" name="legalType" defaultValue={editing?.legalType || "HEARING"} className="mt-1.5 h-11 w-full rounded-md border border-input bg-white px-3 text-sm">{(Object.keys(typeLabels) as LegalType[]).map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></div><div><Label htmlFor="responsible">Responsável</Label><select id="responsible" name="responsible" defaultValue={editing?.responsible || "Francisco Jansen"} className="mt-1.5 h-11 w-full rounded-md border border-input bg-white px-3 text-sm">{team.map((person) => <option key={person}>{person}</option>)}</select></div></div>
          <fieldset><legend className="text-sm font-medium">Cor do agendamento</legend><div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do agendamento">{CALENDAR_EVENT_COLORS.map((color) => { const selected = selectedColor.toLowerCase() === color.background; return <button key={color.id} type="button" role="radio" aria-checked={selected} aria-label={color.name} title={color.name} onClick={() => setSelectedColor(color.background)} className={`grid size-9 place-items-center rounded-full border-2 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#112b3d] focus-visible:ring-offset-2 ${selected ? "border-slate-900" : "border-transparent"}`}><span className="size-6 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color.background }} />{selected && <span className="sr-only">Selecionada</span>}</button>; })}</div><p className="mt-1.5 text-xs text-slate-500">A cor é independente do tipo jurídico e também será aplicada no Google Calendar.</p></fieldset>
          <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={allDay} onCheckedChange={(checked) => setAllDay(Boolean(checked))} />Dia inteiro</label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><Label htmlFor="date">Data inicial</Label><Input id="date" name="date" type="date" defaultValue={editStartDate} className="mt-1.5 h-11" required /></div>{!allDay && <div><Label htmlFor="startTime">Início</Label><Input id="startTime" name="startTime" type="time" defaultValue={editing ? inputTime(editing.startAt) : "09:00"} className="mt-1.5 h-11" required /></div>}<div><Label htmlFor="endDate">Data final</Label><Input id="endDate" name="endDate" type="date" defaultValue={editEndDate} className="mt-1.5 h-11" required /></div>{!allDay && <div><Label htmlFor="endTime">Fim</Label><Input id="endTime" name="endTime" type="time" defaultValue={editing ? inputTime(editing.endAt) : "10:00"} className="mt-1.5 h-11" required /></div>}</div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="location">Local</Label><div className="relative mt-1.5"><MapPin className="absolute left-3 top-3 size-4 text-slate-400" /><Input id="location" name="location" defaultValue={editing?.location || ""} className="h-11 pl-9" placeholder="Fórum, sala ou link da reunião" /></div></div><div><Label htmlFor="attendees">Participantes</Label><Input id="attendees" name="attendees" defaultValue={editing?.attendees.join(", ") || ""} className="mt-1.5 h-11" placeholder="email@exemplo.com, outro@exemplo.com" /></div></div>
          <div><Label htmlFor="description">Descrição</Label><Textarea id="description" name="description" defaultValue={editing?.description || ""} className="mt-1.5 min-h-24" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label>Cliente</Label><Select value={selectedClient} onValueChange={(value) => { setSelectedClient(value); setSelectedProcess("NONE"); }}><SelectTrigger className="mt-1.5 h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">Nenhum cliente</SelectItem>{options.clients.map((client) => <SelectItem key={client.id} value={String(client.id)}>{client.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Processo</Label><Select value={selectedProcess} onValueChange={(value) => { setSelectedProcess(value); const process = options.processes.find((item) => item.id === Number(value)); if (process && selectedClient === "NONE") setSelectedClient(String(process.clientId)); }}><SelectTrigger className="mt-1.5 h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">Nenhum processo</SelectItem>{filteredProcesses.map((process) => <SelectItem key={process.id} value={String(process.id)}>{process.processNumber}{process.title ? ` · ${process.title}` : ""}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="cnj">Número CNJ</Label><Input key={`cnj-${editing?.id || "new"}-${selectedProcess}`} id="cnj" name="cnj" defaultValue={(editing && selectedProcess === String(editing.processId) ? editing.cnj : selectedProcessData?.processNumber) || ""} className="mt-1.5 h-11" placeholder="0000000-00.0000.0.00.0000" /></div><div><Label htmlFor="eprocUrl">Link eproc</Label><Input key={`eproc-${editing?.id || "new"}-${selectedProcess}`} id="eprocUrl" name="eprocUrl" type="url" defaultValue={(editing && selectedProcess === String(editing.processId) ? editing.eprocUrl : selectedProcessData?.eprocUrl) || ""} className="mt-1.5 h-11" placeholder="https://..." /></div></div>
          <div className="grid gap-4 sm:grid-cols-3"><div><Label>Recorrência</Label><Select value={recurrence} onValueChange={setRecurrence}><SelectTrigger className="mt-1.5 h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">Não repetir</SelectItem><SelectItem value="DAILY">Diariamente</SelectItem><SelectItem value="WEEKLY">Semanalmente</SelectItem><SelectItem value="MONTHLY">Mensalmente</SelectItem></SelectContent></Select></div>{recurrence !== "NONE" && <><div><Label htmlFor="recurrenceInterval">A cada</Label><Input id="recurrenceInterval" name="recurrenceInterval" type="number" min="1" max="365" defaultValue={editingRule.INTERVAL || "1"} className="mt-1.5 h-11" /></div><div><Label htmlFor="recurrenceEndDate">Repetir até</Label><Input id="recurrenceEndDate" name="recurrenceEndDate" type="date" defaultValue={editingRule.UNTIL ? `${editingRule.UNTIL.slice(0, 4)}-${editingRule.UNTIL.slice(4, 6)}-${editingRule.UNTIL.slice(6, 8)}` : ""} className="mt-1.5 h-11" /></div></>}<div><Label htmlFor="reminderMinutes">Lembrete</Label><select id="reminderMinutes" name="reminderMinutes" defaultValue={editing?.reminders.overrides?.[0]?.minutes ?? 30} className="mt-1.5 h-11 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="0">Na hora</option><option value="10">10 minutos antes</option><option value="30">30 minutos antes</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option></select></div></div>
          {editing && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><div className="flex flex-wrap items-center gap-3"><span className="flex items-center gap-1.5">{editing.syncStatus === "SYNCED" ? <CircleCheck className="size-4 text-emerald-600" /> : <AlertCircle className="size-4 text-amber-600" />}{editing.syncStatus === "SYNCED" ? "Sincronizado com o Google" : editing.syncError || "Sincronização pendente"}</span>{editing.googleHtmlLink && <a href={editing.googleHtmlLink} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 font-semibold text-blue-700 hover:underline">Abrir no Google <ExternalLink className="size-3.5" /></a>}</div></div>}
          <DialogFooter className="items-center border-t border-slate-200 pt-4">{editing && <Button type="button" variant="ghost" onClick={() => void removeEvent()} disabled={saving} className="mr-auto text-red-700 hover:bg-red-50 hover:text-red-800"><Trash2 />Excluir</Button>}<Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving} className="bg-[#112b3d] hover:bg-[#1c4057]">{saving ? <LoaderCircle className="animate-spin" /> : <CalendarCheck />}{editing ? "Salvar alterações" : "Criar agendamento"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
