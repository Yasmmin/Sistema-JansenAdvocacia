import { env } from "cloudflare:workers";
import type { ProcessStatus } from "@/db/schema";
import { processDigits } from "@/lib/legal";

const SUPPORTED = new Set(["TJRS", "TJSC", "TJPR", "TJSP", "TJPE", "TRF4", "TRF5", "TRT4", "STJ"]);
const DATAJUD_PAGE_SIZE = 1000;
const DATAJUD_QUERY_CHUNK = 100;

type Movement = { codigo?: number; nome?: string; dataHora?: string; orgaoJulgador?: { nomeOrgao?: string; nome?: string } };
type Source = { numeroProcesso?: string; tribunal?: string; nivelSigilo?: number; classe?: { nome?: string }; orgaoJulgador?: { nome?: string }; movimentos?: Movement[] };
export type DataJudProcess = { status: ProcessStatus; confidential: boolean; actionType: string | null; judicialBody: string | null; lastMovementAt: string | null; lastMovementDescription: string | null };

function dataJudApiKey() {
  const cloudflareEnv = typeof env !== "undefined" ? env : {};
  const processEnv = typeof process !== "undefined" ? process.env ?? {} : {};
  const viteEnv = typeof import.meta !== "undefined" ? (((import.meta as unknown) as { env?: Record<string, string | undefined> }).env ?? {}) : {};
  const key = ({ ...viteEnv, ...processEnv, ...cloudflareEnv } as Record<string, string | undefined>).DATAJUD_API_KEY?.trim();
  if (!key) throw new Error("DATAJUD_API_KEY não configurada.");
  return key;
}

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
  const endpoint = `https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal.toLowerCase()}/_search`;
  const apiKey = dataJudApiKey();
  const grouped = new Map<string, Source[]>();

  for (let chunkStart = 0; chunkStart < numbers.length; chunkStart += DATAJUD_QUERY_CHUNK) {
    const chunk = numbers.slice(chunkStart, chunkStart + DATAJUD_QUERY_CHUNK);
    let from = 0;
    let reportedTotal = 0;
    const pageKeys = new Set<string>();

    for (;;) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `APIKey ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ from, size: DATAJUD_PAGE_SIZE, track_total_hits: true, query: { terms: { numeroProcesso: chunk } } }),
      });
      if (!response.ok) throw new Error(`DataJud ${tribunal} retornou HTTP ${response.status}.`);
      const payload = await response.json() as {
        hits?: { total?: number | { value?: number }; hits?: Array<{ _id?: string; _source?: Source }> };
      };
      const hits = Array.isArray(payload.hits?.hits) ? payload.hits.hits : [];
      const totalValue = typeof payload.hits?.total === "number" ? payload.hits.total : payload.hits?.total?.value;
      if (Number.isFinite(totalValue)) reportedTotal = Math.max(reportedTotal, Number(totalValue));
      if (!hits.length) {
        if (reportedTotal > from) throw new Error(`DataJud ${tribunal} encerrou a paginação antes de retornar todos os registros (${from}/${reportedTotal}).`);
        break;
      }
      const pageKey = hits.map((hit) => `${hit._id || ""}:${hit._source?.numeroProcesso || ""}:${(hit._source?.movimentos || []).map((movement) => movement.dataHora || "").sort().at(-1) || ""}`).join("|");
      if (pageKeys.has(pageKey)) throw new Error(`DataJud ${tribunal} repetiu uma página na posição ${from}.`);
      pageKeys.add(pageKey);
      for (const hit of hits) {
        const source = hit._source;
        const digits = processDigits(source?.numeroProcesso);
        if (source && digits) grouped.set(digits, [...(grouped.get(digits) || []), source]);
      }
      from += hits.length;
      if (reportedTotal > 0 && from >= reportedTotal) break;
      if (hits.length < DATAJUD_PAGE_SIZE) {
        throw new Error(`DataJud ${tribunal} retornou uma página incompleta antes do total informado (${from}/${reportedTotal || "desconhecido"}).`);
      }
    }
  }
  for (const [digits, sources] of grouped) result.set(digits, fromSources(sources));
  return result;
}
