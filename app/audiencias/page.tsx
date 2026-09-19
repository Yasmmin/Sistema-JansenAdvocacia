"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Gavel, LoaderCircle, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Hearing = {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  legalType: string;
  status: string;
  responsible: string | null;
  clientName: string | null;
  processNumber: string | null;
  eprocUrl: string | null;
  googleHtmlLink: string | null;
};

type Period = "UPCOMING" | "PAST" | "ALL";

function eventDate(value: string) {
  return new Date(value.length === 10 ? `${value}T12:00:00` : value);
}

function formatEventDate(event: Hearing) {
  const date = eventDate(event.startAt);
  if (Number.isNaN(date.getTime())) return event.startAt;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    ...(event.allDay ? {} : { timeStyle: "short" as const }),
  }).format(date);
}

export default function HearingsPage() {
  const [events, setEvents] = useState<Hearing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("UPCOMING");

  useEffect(() => {
    let active = true;
    void fetch("/api/calendar/events", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { events?: Hearing[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as audiências.");
        if (active) setEvents((data.events || []).filter((event) => event.legalType === "HEARING" && event.status !== "cancelled"));
      })
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Falha ao carregar audiências."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const now = Date.now();
  const visible = useMemo(() => events.filter((event) => {
    const timestamp = eventDate(event.endAt || event.startAt).getTime();
    return period === "ALL" || (period === "UPCOMING" ? timestamp >= now : timestamp < now);
  }).sort((first, second) => {
    const direction = period === "PAST" ? -1 : 1;
    return (eventDate(first.startAt).getTime() - eventDate(second.startAt).getTime()) * direction;
  }), [events, now, period]);

  const upcomingCount = events.filter((event) => eventDate(event.endAt || event.startAt).getTime() >= now).length;

  return <div className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Agenda jurídica</p>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.035em] text-[#111a2d]">Audiências</h1>
        <p className="mt-2 text-sm text-slate-500">Audiências sincronizadas e registradas no calendário do escritório.</p>
      </div>
      <Button asChild variant="outline" className="h-11 self-start"><a href="/calendario"><CalendarDays aria-hidden="true" />Abrir calendário completo</a></Button>
    </header>

    <section aria-label="Resumo das audiências" className="mt-7 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
      <div className="bg-white p-5"><p className="text-sm text-slate-500">Próximas audiências</p><p className="mt-2 text-2xl font-bold">{upcomingCount}</p></div>
      <div className="bg-white p-5"><p className="text-sm text-slate-500">Total no histórico</p><p className="mt-2 text-2xl font-bold">{events.length}</p></div>
    </section>

    <section className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4 sm:p-5">
        {([['UPCOMING', 'Próximas'], ['PAST', 'Realizadas'], ['ALL', 'Todas']] as Array<[Period, string]>).map(([value, label]) => <Button key={value} variant={period === value ? "default" : "outline"} size="sm" onClick={() => setPeriod(value)} className={period === value ? "bg-[#112b3d] hover:bg-[#1c4057]" : ""}>{label}</Button>)}
      </div>

      {error && <div role="alert" className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}
      {loading ? <div className="flex items-center justify-center gap-3 p-16 text-slate-500"><LoaderCircle aria-hidden="true" className="size-5 animate-spin" />Carregando audiências...</div>
        : visible.length === 0 ? <div className="px-6 py-16 text-center"><Gavel aria-hidden="true" className="mx-auto size-9 text-slate-400" /><h2 className="mt-4 text-lg font-bold">Nenhuma audiência encontrada</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">As audiências cadastradas no calendário com o tipo “Audiência” aparecerão aqui.</p><Button asChild className="mt-5 bg-[#112b3d] hover:bg-[#1c4057]"><a href="/calendario">Ir para o calendário</a></Button></div>
          : <div className="divide-y divide-slate-200">{visible.map((event) => <article key={event.id} className="p-5 transition-colors hover:bg-slate-50/70">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Audiência</Badge>{event.allDay && <Badge variant="outline">Dia inteiro</Badge>}</div>
                <h2 className="mt-3 text-lg font-bold text-slate-900">{event.title}</h2>
                <p className="mt-2 text-sm font-medium capitalize text-slate-700">{formatEventDate(event)}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                  {event.location && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden="true" className="size-4" />{event.location}</span>}
                  {event.responsible && <span>Responsável: {event.responsible}</span>}
                  {event.clientName && <span>Cliente: {event.clientName}</span>}
                  {event.processNumber && <span className="font-mono">{event.processNumber}</span>}
                </div>
                {event.description && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{event.description}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {event.eprocUrl && <Button asChild variant="outline" size="sm"><a href={event.eprocUrl} target="_blank" rel="noreferrer">Abrir processo <ExternalLink aria-hidden="true" /></a></Button>}
                {event.googleHtmlLink && <Button asChild size="sm" className="bg-[#112b3d] hover:bg-[#1c4057]"><a href={event.googleHtmlLink} target="_blank" rel="noreferrer">Abrir no Google <ExternalLink aria-hidden="true" /></a></Button>}
              </div>
            </div>
          </article>)}</div>}
    </section>
  </div>;
}
