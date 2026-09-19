"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, LoaderCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Intimation = {
  id: number;
  processId: number | null;
  processNumber: string | null;
  clientName: string | null;
  court: string | null;
  judicialBody: string | null;
  availabilityDate: string | null;
  summary: string;
  content: string;
  status: "NEW" | "IN_REVIEW" | "REVIEWED" | "NO_ACTION" | "COMPLETED" | "NEEDS_CONFIRMATION";
  classification: "UNKNOWN" | "INFORMATION" | "POSSIBLE_DEADLINE" | "HEARING" | "PAYMENT" | "DOCUMENT_REQUEST" | "PROCEDURAL_ACTION";
  sourceUrl: string | null;
  actionType: string | null;
};

const statusLabels: Record<Intimation["status"], string> = {
  NEW: "Nova",
  IN_REVIEW: "Em análise",
  REVIEWED: "Revisada",
  NO_ACTION: "Sem providência",
  COMPLETED: "Concluída",
  NEEDS_CONFIRMATION: "Confirmar",
};

const classificationLabels: Record<Intimation["classification"], string> = {
  UNKNOWN: "Não classificada",
  INFORMATION: "Informação",
  POSSIBLE_DEADLINE: "Possível prazo",
  HEARING: "Audiência",
  PAYMENT: "Pagamento",
  DOCUMENT_REQUEST: "Documento",
  PROCEDURAL_ACTION: "Providência processual",
};

function formatDate(value: string | null) {
  if (!value) return "Data não informada";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

export default function IntimationsPage() {
  const [items, setItems] = useState<Intimation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("PENDING");

  useEffect(() => {
    let active = true;
    void fetch("/api/intimations", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { intimations?: Intimation[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as intimações.");
        if (active) setItems(data.intimations || []);
      })
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Falha ao carregar intimações."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      const matchesStatus = status === "ALL"
        || (status === "PENDING" && ["NEW", "IN_REVIEW", "NEEDS_CONFIRMATION"].includes(item.status))
        || item.status === status;
      const matchesSearch = !query || [item.processNumber, item.clientName, item.court, item.judicialBody, item.summary, item.actionType]
        .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [items, search, status]);

  const pendingCount = items.filter((item) => ["NEW", "IN_REVIEW", "NEEDS_CONFIRMATION"].includes(item.status)).length;

  return <div className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
    <header>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Monitor DJEN</p>
      <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.035em] text-[#111a2d]">Intimações</h1>
      <p className="mt-2 text-sm text-slate-500">Publicações oficiais localizadas para a OAB monitorada.</p>
    </header>

    <section aria-label="Resumo das intimações" className="mt-7 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
      <div className="bg-white p-5"><p className="text-sm text-slate-500">Total armazenado</p><p className="mt-2 text-2xl font-bold">{items.length}</p></div>
      <div className="bg-white p-5"><p className="text-sm text-slate-500">Pendentes de análise</p><p className="mt-2 text-2xl font-bold text-amber-700">{pendingCount}</p></div>
      <div className="bg-white p-5"><p className="text-sm text-slate-500">Exibidas agora</p><p className="mt-2 text-2xl font-bold">{visible.length}</p></div>
    </section>

    <section className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="relative w-full sm:max-w-xl">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por processo, cliente, tribunal ou conteúdo" className="h-11 pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 min-w-48 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#315f7c]">
            <option value="PENDING">Pendentes</option>
            <option value="ALL">Todas</option>
            <option value="NEW">Novas</option>
            <option value="IN_REVIEW">Em análise</option>
            <option value="NEEDS_CONFIRMATION">A confirmar</option>
            <option value="REVIEWED">Revisadas</option>
            <option value="NO_ACTION">Sem providência</option>
            <option value="COMPLETED">Concluídas</option>
          </select>
        </label>
      </div>

      {error && <div role="alert" className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}
      {loading ? <div className="flex items-center justify-center gap-3 p-16 text-slate-500"><LoaderCircle aria-hidden="true" className="size-5 animate-spin" />Carregando intimações...</div>
        : visible.length === 0 ? <div className="px-6 py-16 text-center"><FileText aria-hidden="true" className="mx-auto size-9 text-slate-400" /><h2 className="mt-4 text-lg font-bold">Nenhuma intimação encontrada</h2><p className="mt-2 text-sm text-slate-500">Ajuste a busca ou o filtro selecionado.</p></div>
          : <div className="divide-y divide-slate-200">{visible.map((item) => <article key={item.id} className="p-5 transition-colors hover:bg-slate-50/70">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={item.status === "NEW" ? "border-blue-200 bg-blue-50 text-blue-800" : item.status === "NEEDS_CONFIRMATION" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}>{statusLabels[item.status]}</Badge>
                  <Badge variant="outline">{classificationLabels[item.classification]}</Badge>
                  <time className="text-xs font-medium text-slate-500">{formatDate(item.availabilityDate)}</time>
                </div>
                <h2 className="mt-3 text-base font-bold text-slate-900">{item.summary || item.actionType || "Publicação sem resumo"}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.content}</p>
                <p className="mt-3 text-xs text-slate-500">{[item.clientName, item.processNumber, item.court, item.judicialBody].filter(Boolean).join(" · ") || "Processo ainda não vinculado"}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {item.processId && <Button asChild variant="outline" size="sm"><a href={`/processos/${item.processId}`}>Ver processo</a></Button>}
                {item.sourceUrl && <Button asChild size="sm" className="bg-[#112b3d] hover:bg-[#1c4057]"><a href={item.sourceUrl} target="_blank" rel="noreferrer">Abrir publicação <ExternalLink aria-hidden="true" /></a></Button>}
              </div>
            </div>
          </article>)}</div>}
    </section>
  </div>;
}
