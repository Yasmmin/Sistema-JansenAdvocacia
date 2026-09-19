import { Construction, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";

const routeLabels: Record<string, string> = {
  intimacoes: "Intimações",
  assistidos: "Assistidos",
  calendario: "Calendário",
  audiencias: "Audiências",
};

export default async function SajulbraPage({ params }: { params: Promise<{ segmentos?: string[] }> }) {
  const { segmentos } = await params;
  const section = segmentos?.[0];
  const title = section ? routeLabels[section] || "Sajulbra" : "Dashboard Sajulbra";

  return <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-4 py-12 sm:px-7 lg:px-10">
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-700"><Construction aria-hidden="true" className="size-6" /></span>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Módulo Sajulbra</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#111a2d]">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">Esta rota já está acessível, mas o conteúdo específico da Sajulbra ainda não foi implementado. O sistema não exibirá dados da carteira particular neste espaço.</p>
      <Button asChild className="mt-6 bg-[#112b3d] hover:bg-[#1c4057]"><a href="/"><LayoutGrid aria-hidden="true" />Voltar ao Dashboard Jansen</a></Button>
    </section>
  </div>;
}
