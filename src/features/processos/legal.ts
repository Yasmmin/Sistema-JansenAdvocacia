export function normalizeProcessNumber(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 20) return trimmed;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

export function processDigits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") || "";
}

export function normalizePersonName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

export const PROCESS_AREAS = ["Cível", "Família", "Sucessões", "Consumidor", "Empresarial", "Trabalhista", "Previdenciário", "Administrativo", "Tributário", "Criminal", "Constitucional", "Imobiliário", "Outra"] as const;
export const PROCESS_COURTS = ["TJRS", "TJSC", "TJPR", "TJSP", "TJPE", "TRF4", "TRF5", "TRT4", "STJ", "STF", "Outro"] as const;

export function inferArea(actionType: string | null | undefined, judicialBody: string | null | undefined) {
  const text = normalizePersonName(`${actionType || ""} ${judicialBody || ""}`);
  if (/CRIMINAL|JURI|PENAL/.test(text)) return "Criminal";
  if (/FAMILIA|SUCESS/.test(text)) return /SUCESS/.test(text) ? "Sucessões" : "Família";
  if (/CONSUMIDOR/.test(text)) return "Consumidor";
  if (/TRABALH/.test(text)) return "Trabalhista";
  if (/PREVIDENCI/.test(text)) return "Previdenciário";
  if (/TRIBUT/.test(text)) return "Tributário";
  if (/FAZENDA PUBLICA|ADMINISTRAT/.test(text)) return "Administrativo";
  if (/EMPRESAR|FALENCIA|RECUPERACAO JUDICIAL/.test(text)) return "Empresarial";
  if (/IMOVEL|IMOBILI|REGISTRO PUBLICO|USUCAPIAO/.test(text)) return "Imobiliário";
  if (/CONSTITUCIONAL/.test(text)) return "Constitucional";
  if (/CIVEL|CIVIL/.test(text)) return "Cível";
  return null;
}

export function allowedCourt(value: string | null | undefined) {
  const court = (value || "").trim().toUpperCase();
  return (PROCESS_COURTS as readonly string[]).includes(court) ? court : court ? "Outro" : null;
}

export function optionalText(value: unknown, max = 1000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function validUrl(value: unknown) {
  const text = optionalText(value, 2000);
  if (!text) return null;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function officialProcessPortal(court: string | null | undefined, judicialBody: string | null | undefined, processNumber: string | null | undefined) {
  if ((court || "").trim().toUpperCase() !== "TJRS") return null;
  const digits = processDigits(processNumber);
  if (digits.length !== 20) return null;
  const body = normalizePersonName(judicialBody);
  const secondDegree = /CAMARA|TURMA|GRUPO|SECAO|TRIBUNAL PLENO/.test(body);
  const base = secondDegree ? "https://eproc2g.tjrs.jus.br/eproc/" : "https://eproc1g.tjrs.jus.br/eproc/";
  const url = new URL("externo_controlador.php", base);
  url.searchParams.set("acao", "processo_seleciona_publica");
  url.searchParams.set("acao_origem", "processo_consulta_publica");
  url.searchParams.set("acao_retorno", "processo_consulta_publica");
  url.searchParams.set("num_chave", "");
  url.searchParams.set("num_chave_documento", "");
  url.searchParams.set("num_processo", digits);
  return url.toString();
}
