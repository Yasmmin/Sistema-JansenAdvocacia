import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, legalProcesses } from "@/db/schema";
import { normalizePersonName } from "@/lib/legal";

type AgentResponse = { processNumber?: string; parties?: Array<{ name?: string; role?: string }>; representedParty?: string };

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getDb();
  const [process] = await db.select().from(legalProcesses).where(eq(legalProcesses.id, id)).limit(1);
  if (!process) return Response.json({ success: false, code: "PROCESS_NOT_FOUND", error: "Processo não encontrado." }, { status: 404 });
  if (!process.confidential) return Response.json({ success: false, code: "NOT_CONFIDENTIAL", error: "Este processo não está marcado como sigiloso." }, { status: 400 });
  const agent = (env as unknown as { CUSTOMER_HTTP_EPROC_AGENT?: { fetch: typeof fetch } }).CUSTOMER_HTTP_EPROC_AGENT;
  if (!agent) {
    await db.update(legalProcesses).set({ enrichmentStatus: "PENDING", updatedAt: new Date().toISOString() }).where(eq(legalProcesses.id, id));
    return Response.json({ success: false, code: "AGENT_OFFLINE", error: "O agente local do eproc ainda não está conectado nesta máquina." }, { status: 503 });
  }
  try {
    const response = await agent.fetch("https://eproc-agent.local/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ processNumber: process.processNumber }), signal: AbortSignal.timeout(30_000) });
    const data = await response.json() as AgentResponse & { code?: string; error?: string };
    if (!response.ok) throw Object.assign(new Error(data.error || "O eproc não retornou os dados do processo."), { code: data.code || "FAILED" });
    const parties = (data.parties || []).map((party) => `${party.role ? `${party.role}: ` : ""}${party.name || ""}`.trim()).filter(Boolean).join(" • ");
    if (!parties) return Response.json({ success: false, code: "PARTIES_NOT_FOUND", error: "O eproc foi consultado, mas não retornou as partes." }, { status: 422 });
    let clientId = process.clientId;
    if (data.representedParty) {
      const normalizedName = normalizePersonName(data.representedParty);
      const [existing] = await db.select({ id: clients.id }).from(clients).where(eq(clients.normalizedName, normalizedName)).limit(1);
      if (existing) clientId = existing.id;
      else {
        const [created] = await db.insert(clients).values({ name: data.representedParty, normalizedName, source: "PRIVATE", status: "ACTIVE", updatedAt: new Date().toISOString() }).onConflictDoNothing().returning({ id: clients.id });
        if (created) clientId = created.id;
      }
    }
    const [updated] = await db.update(legalProcesses).set({ clientId, parties, partiesSource: "EPROC_AUTHENTICATED", lastEnrichedAt: new Date().toISOString(), enrichmentStatus: "SUCCESS", updatedAt: new Date().toISOString() }).where(eq(legalProcesses.id, id)).returning();
    return Response.json({ success: true, process: updated });
  } catch (error) {
    const code = error instanceof DOMException && error.name === "TimeoutError" ? "TIMEOUT" : (error as { code?: string })?.code || "FAILED";
    await db.update(legalProcesses).set({ enrichmentStatus: code === "ACCESS_DENIED" ? "NO_ACCESS" : "FAILED", updatedAt: new Date().toISOString() }).where(eq(legalProcesses.id, id));
    const messages: Record<string, string> = { CERTIFICATE_ERROR: "O certificado A1 não pôde ser utilizado.", ACCESS_DENIED: "O certificado foi reconhecido, mas o advogado não possui acesso a este processo.", TIMEOUT: "O eproc demorou demais para responder.", EPROC_NOT_AUTHENTICATED: "Não foi possível autenticar o advogado no eproc." };
    return Response.json({ success: false, code, error: messages[code] || "Não foi possível buscar os dados no eproc." }, { status: 502 });
  }
}
