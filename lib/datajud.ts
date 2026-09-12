import type { ProcessStatus } from "@/db/schema";
import { processDigits } from "@/lib/legal";

const DATAJUD_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
const SUPPORTED = new Set(["TJRS", "TJSC", "TJPR", "TJSP", "TJPE", "TRF4", "TRF5", "TRT4", "STJ"]);

type Movement = { codigo?: number; nome?: string; dataHora?: string; orgaoJulgador?: { nomeOrgao?: string; nome?: string } };
type Source = { numeroProcesso?: string; tribunal?: string; nivelSigilo?: number; classe?: { nome?: string }; orgaoJulgador?: { nome?: string }; movimentos?: Movement[] };
export type DataJudProcess = { status: ProcessStatus; confidential: boolean; actionType: string | null; judicialBody: string | null; lastMovementAt: string | null; lastMovementDescription: string | null };

function normalized(value: string | null | undefined) { return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase(); }

function fromSources(sources: Source[]): DataJudProcess {
  const movements = sources.flatMap((source) => source.movimentos || []).filter((movement) => movement.dataHora).sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));
  const latest = movements[0];
  const latestName = normalized(latest?.nome);
  const status: ProcessStatus = latestName === "BAIXA DEFINITIVA" ? "CLOSED" : latestName === "ARQUIVAMENTO DEFINITIVO" ? "ARCHIVED" : latest ? "ACTIVE" : "UNKNOWN";
  const newestSource = [...sources].sort((a, b) => String((b.movimentos || []).map((m) => m.dataHora || "").sort().at(-1) || "").localeCompare(String((a.movimentos || []).map((m) => m.dataHora || "").sort().at(-1) || "")))[0];
  return {
    status,
    confidential: sources.some((source) => Number(source.nivelSigilo || 0) > 0),
    actionType: newestSource?.classe?.nome || null,
    judicialBody: latest?.orgaoJulgador?.nomeOrgao || latest?.orgaoJulgador?.nome || newestSource?.orgaoJulgador?.nome || null,
    lastMovementAt: latest?.dataHora || null,
    lastMovementDescription: latest?.nome || null,
  };
}

export async function queryDataJud(court: string | null, processNumbers: string[]) {
  const result = new Map<string, DataJudProcess>();
  const tribunal = (court || "").toUpperCase();
  if (!SUPPORTED.has(tribunal) || !processNumbers.length) return result;
  const numbers = [...new Set(processNumbers.map(processDigits).filter(Boolean))];
  const response = await fetch(`https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal.toLowerCase()}/_search`, {
    method: "POST",
    headers: { Authorization: `APIKey ${DATAJUD_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ size: Math.min(10000, Math.max(100, numbers.length * 5)), query: { terms: { numeroProcesso: numbers } } }),
  });
  if (!response.ok) throw new Error(`DataJud ${tribunal} retornou HTTP ${response.status}.`);
  const payload = await response.json() as { hits?: { hits?: Array<{ _source?: Source }> } };
  const grouped = new Map<string, Source[]>();
  for (const hit of payload.hits?.hits || []) {
    const source = hit._source;
    const digits = processDigits(source?.numeroProcesso);
    if (source && digits) grouped.set(digits, [...(grouped.get(digits) || []), source]);
  }
  for (const [digits, sources] of grouped) result.set(digits, fromSources(sources));
  return result;
}
