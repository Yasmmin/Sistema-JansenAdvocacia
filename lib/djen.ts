export const DJEN_ENDPOINT = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
export const MONITORED_LAWYER = { name: "FRANCISCO JOSE BARRIOS JANSEN FERREIRA", oab: "103774", uf: "RS" } as const;
const PAGE_SIZE = 50;
const MAX_PAGES = 200;
const LOOKBACK_DAYS = 30;

type RawLawyer = { nome?: string; numero_oab?: string | number; uf_oab?: string };
type RawRecipient = { nome?: string; polo?: string };
export type RawPublication = {
  id?: number; data_disponibilizacao?: string; data_publicacao?: string; siglaTribunal?: string;
  nomeOrgao?: string; texto?: string; numeroprocessocommascara?: string; numero_processo?: string;
  link?: string | null; tipoComunicacao?: string; tipoDocumento?: string; nomeClasse?: string; codigoClasse?: string | number;
  destinatarios?: RawRecipient[];
  destinatarioadvogados?: Array<{ advogado?: RawLawyer }>;
};

export type NormalizedPublication = {
  externalId: string; fingerprint: string; processNumber: string | null; court: string | null;
  judicialBody: string | null; availabilityDate: string | null; publicationDate: string | null;
  recipient: string | null; lawyerName: string; oab: string; oabUf: string; content: string;
  summary: string; classification: "UNKNOWN" | "POSSIBLE_DEADLINE" | "HEARING" | "PAYMENT" | "DOCUMENT_REQUEST" | "PROCEDURAL_ACTION";
  sourceUrl: string | null;
  actionType: string | null; recipients: Array<{ name: string; pole: string | null }>;
  lawyers: Array<{ name: string; oab: string; uf: string }>;
  representedClient: string | null; hasAdamo: boolean;
  confidential: boolean;
};

function comparable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toUpperCase();
}

export function isAdamoLawyerName(name: string | null | undefined) {
  return /(^| )ADAMO( |$)/.test(comparable(name || ""));
}

export function inferRepresentedClient(recipients: RawRecipient[] | undefined, content: string) {
  const candidates = (recipients || []).map((recipient) => ({ name: stripHtml(recipient.nome || "").trim(), pole: recipient.polo || null }))
    .filter((recipient) => recipient.name && comparable(recipient.name) !== "SIGILO");
  if (candidates.length === 1) return candidates[0].name;
  if (!candidates.length) return null;
  const haystack = comparable(content);
  const lawyerIndex = haystack.lastIndexOf(comparable(MONITORED_LAWYER.name));
  if (lawyerIndex < 0) return null;
  const ranked = candidates.map((candidate) => {
    const index = haystack.lastIndexOf(comparable(candidate.name), lawyerIndex);
    return { ...candidate, distance: index < 0 ? Number.POSITIVE_INFINITY : lawyerIndex - index };
  }).filter((candidate) => candidate.distance <= 500).sort((a, b) => a.distance - b.distance);
  if (!ranked.length || (ranked[1] && ranked[0].distance === ranked[1].distance)) return null;
  return ranked[0].name;
}

function dateInSaoPaulo(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function stripHtml(value = "") {
  return value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&ordm;/gi, "º").replace(/&[Cc]cedil;/g, "ç")
    .replace(/&[Aa]tilde;/g, "ã").replace(/&[Oo]tilde;/g, "õ").replace(/&[Aa]acute;/g, "á")
    .replace(/&[Ee]acute;/g, "é").replace(/&[Ii]acute;/g, "í").replace(/&[Oo]acute;/g, "ó")
    .replace(/&[Uu]acute;/g, "ú").replace(/&quot;/gi, '"').replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/\s+/g, " ").trim();
}

function matchingLawyer(record: RawPublication) {
  return record.destinatarioadvogados?.map((entry) => entry.advogado).find((lawyer) =>
    String(lawyer?.numero_oab ?? "").replace(/\D/g, "") === MONITORED_LAWYER.oab &&
    lawyer?.uf_oab?.toUpperCase() === MONITORED_LAWYER.uf);
}

function classify(content: string): NormalizedPublication["classification"] {
  const text = content.toLocaleLowerCase("pt-BR");
  if (/audiência|audiencia|sessão de julgamento|sessao de julgamento/.test(text)) return "HEARING";
  if (/pagamento|depósito judicial|deposito judicial|alvará|alvara/.test(text)) return "PAYMENT";
  if (/junt(e|ar)|apresent(e|ar).{0,35}document/.test(text)) return "DOCUMENT_REQUEST";
  if (/\bprazo\b|manifest(e-se|ar)|intime-se.{0,80}\bdias\b/.test(text)) return "POSSIBLE_DEADLINE";
  if (/despacho|decisão|decisao|ato ordinatório|ato ordinatorio/.test(text)) return "PROCEDURAL_ACTION";
  return "UNKNOWN";
}

async function fingerprint(parts: string[]) {
  const bytes = new TextEncoder().encode(parts.join("|").toLowerCase().replace(/\s+/g, " ").trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function normalize(item: RawPublication): Promise<NormalizedPublication | null> {
  const lawyer = matchingLawyer(item);
  if (!lawyer || item.id == null) return null;
  const content = stripHtml(item.texto);
  const externalId = String(item.id);
  const processNumber = item.numeroprocessocommascara || item.numero_processo || null;
  const availabilityDate = item.data_disponibilizacao || null;
  const lawyers = (item.destinatarioadvogados || []).map((entry) => entry.advogado).filter((lawyer): lawyer is RawLawyer => Boolean(lawyer)).map((entry) => ({
    name: entry.nome || "", oab: String(entry.numero_oab || "").replace(/\D/g, ""), uf: (entry.uf_oab || "").toUpperCase(),
  }));
  const recipients = (item.destinatarios || []).map((entry) => ({ name: stripHtml(entry.nome || "").trim(), pole: entry.polo || null })).filter((entry) => entry.name);
  return {
    externalId,
    fingerprint: await fingerprint([externalId, processNumber || "", availabilityDate || "", content]),
    processNumber,
    court: item.siglaTribunal || null,
    judicialBody: item.nomeOrgao || null,
    availabilityDate,
    publicationDate: item.data_publicacao || null,
    recipient: item.destinatarios?.map((entry) => entry.nome).filter(Boolean).join(" • ") || null,
    lawyerName: lawyer.nome || MONITORED_LAWYER.name,
    oab: String(lawyer.numero_oab || MONITORED_LAWYER.oab),
    oabUf: lawyer.uf_oab || MONITORED_LAWYER.uf,
    content,
    summary: content.length > 220 ? `${content.slice(0, 220).trim()}…` : content,
    classification: classify(content),
    sourceUrl: item.link || null,
    actionType: stripHtml(item.nomeClasse || item.tipoDocumento || "") || null,
    recipients,
    lawyers,
    representedClient: inferRepresentedClient(item.destinatarios, content),
    hasAdamo: item.destinatarioadvogados?.some((entry) => isAdamoLawyerName(entry.advogado?.nome)) || false,
    confidential: recipients.some((entry) => comparable(entry.name) === "SIGILO") || /processo sigiloso/i.test(content),
  };
}

export async function queryDjenRange(startDate: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) throw new Error("Período inválido para consulta ao DJEN.");
  const all: RawPublication[] = [];
  let total = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(DJEN_ENDPOINT);
    Object.entries({ numeroOab: MONITORED_LAWYER.oab, ufOab: MONITORED_LAWYER.uf, dataDisponibilizacaoInicio: startDate, dataDisponibilizacaoFim: endDate, pagina: String(page), itensPorPagina: String(PAGE_SIZE) }).forEach(([key, value]) => url.searchParams.set(key, value));
    console.log(`[DJEN] Página ${page}: ${url.pathname}`);
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Jansen-DJEN-Monitor/2.0" }, cache: "no-store" });
    const raw = await response.text();
    console.log(`[DJEN] HTTP ${response.status}`);
    if (!response.ok) throw new Error(`API oficial retornou HTTP ${response.status}: ${raw.slice(0, 180)}`);
    const payload = JSON.parse(raw) as { count?: number; items?: RawPublication[] };
    const items = Array.isArray(payload.items) ? payload.items : [];
    total = Number(payload.count || items.length);
    all.push(...items);
    if (items.length < PAGE_SIZE || all.length >= total) break;
  }

  const normalized = (await Promise.all(all.map(normalize))).filter((item): item is NormalizedPublication => Boolean(item));
  console.log(`[DJEN] Recebidos: ${all.length}; validados: ${normalized.length}`);
  return { total, received: all.length, publications: normalized, startDate, endDate };
}

export async function queryDjen() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - LOOKBACK_DAYS);
  return queryDjenRange(dateInSaoPaulo(start), dateInSaoPaulo(end));
}
