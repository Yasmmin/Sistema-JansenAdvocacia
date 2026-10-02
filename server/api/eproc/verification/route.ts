import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { clients, eprocVerifications, legalProcesses } from "@/db/schema";
import { normalizePersonName, normalizeProcessNumber } from "@/lib/legal";
import { authenticatedUser, readServerEnv } from "@server/auth";

async function authorized(request: Request) {
  if (request.headers.get("origin") === "https://eproc1g.tjrs.jus.br") return true;
  if (request.headers.get("x-eproc-extension") === "jansen-local-v1") return true;
  const expected = readServerEnv("EPROC_AUTOMATION_KEY");
  if (expected.length >= 32 && request.headers.get("x-eproc-automation-key") === expected) return true;
  return Boolean(await authenticatedUser(request));
}

export async function GET(request: Request) {
  if (!await authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  if (readServerEnv("EPROC_AUTOMATION_PAUSED") === "true") {
    return Response.json({ done: true, paused: true });
  }
  if (new URL(request.url).searchParams.get("status") === "1") {
    return Response.json({ done: false, paused: false });
  }
  const d1 = getD1();
  await d1.prepare(`INSERT OR IGNORE INTO eproc_verifications (process_number)
    SELECT DISTINCT process_number FROM intimations
    WHERE process_number IS NOT NULL
      AND trim(process_number) <> ''
      AND process_number LIKE '%.8.21.%'`).run();
  await d1.prepare("UPDATE eproc_verifications SET status = 'REJECTED', error = 'Tribunal fora do eproc TJRS' WHERE status IN ('PENDING', 'PROCESSING') AND process_number NOT LIKE '%.8.21.%'").run();
  await d1.prepare("UPDATE eproc_verifications SET status = 'REVIEW_SECOND_DEGREE', error = 'Aguardando revisão manual de segundo grau' WHERE status IN ('PENDING', 'PROCESSING', 'REJECTED') AND trim(process_number) LIKE '%7000'").run();
  await d1.prepare(`INSERT INTO pending_legal_processes
    (process_number, title, parties, status, reason, updated_at)
    SELECT process_number, 'Processo de segundo grau - revisar manualmente', parties,
      'UNKNOWN', 'SEGUNDO_GRAU_REVISAO', CURRENT_TIMESTAMP
    FROM eproc_verifications WHERE status = 'REVIEW_SECOND_DEGREE'
    ON CONFLICT(process_number) DO UPDATE SET
      title = excluded.title, parties = excluded.parties,
      reason = excluded.reason, updated_at = CURRENT_TIMESTAMP`).run();
  await d1.prepare("UPDATE eproc_verifications SET status = 'PENDING' WHERE status = 'PROCESSING' AND datetime(updated_at) < datetime('now', '-10 minutes')").run();
  const item = await d1.prepare("SELECT id, process_number AS processNumber FROM eproc_verifications WHERE status = 'PENDING' AND trim(process_number) NOT LIKE '%7000' ORDER BY id LIMIT 1").first<{ id: number; processNumber: string }>();
  if (!item) return Response.json({ done: true });
  await d1.prepare("UPDATE eproc_verifications SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(item.id).run();
  return Response.json({ done: false, item });
}

export async function POST(request: Request) {
  if (!await authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { id?: number; processNumber?: string; parties?: string[]; representedParties?: string[]; lawyers?: Array<{ name: string; oab: string }>; error?: string; skipReason?: "SECOND_DEGREE" };
  if (!body?.id || !body.processNumber) return Response.json({ error: "Resultado inválido." }, { status: 400 });
  const normalizedProcessNumber = normalizeProcessNumber(body.processNumber);
  const isSecondDegree = body.skipReason === "SECOND_DEGREE" || normalizedProcessNumber.endsWith("7000");
  const lawyers = Array.isArray(body.lawyers) ? body.lawyers : [];
  const hasFrancisco = lawyers.some((lawyer) => lawyer.oab.replace(/\D/g, "") === "103774");
  const hasAdamo = lawyers.some((lawyer) => lawyer.oab.replace(/\D/g, "") === "076712" || /(^|\s)[ÁA]DAMO(\s|$)/i.test(lawyer.name));
  const parties = [...new Set((body.parties || []).map(String).map((value) => value.trim()).filter(Boolean))];
  const represented = [...new Set((body.representedParties || []).map(String).map((value) => value.trim()).filter(Boolean))];
  const status = body.error ? "ERROR" : isSecondDegree ? "REVIEW_SECOND_DEGREE" : hasFrancisco && hasAdamo ? "CONFIRMED" : "REJECTED";
  const verificationError = body.error?.slice(0, 500) || (isSecondDegree ? "Aguardando revisão manual de segundo grau" : null);
  const db = getDb();
  await db.update(eprocVerifications).set({ status, hasFrancisco, hasAdamo, parties: JSON.stringify(parties), representedParties: JSON.stringify(represented), lawyers: JSON.stringify(lawyers), error: verificationError, verifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(eprocVerifications.id, body.id));
  if (isSecondDegree) {
    await getD1().prepare(`INSERT OR IGNORE INTO pending_legal_processes
      (process_number, title, parties, court, judicial_body, action_type, status, last_movement_at, last_movement_description, reason, updated_at)
      SELECT ?, 'Processo de segundo grau - revisar manualmente', ?, i.court, i.judicial_body, i.action_type,
        'UNKNOWN', i.availability_date, i.summary, 'SEGUNDO_GRAU_REVISAO', CURRENT_TIMESTAMP
      FROM intimations i WHERE i.process_number = ?
      ORDER BY i.availability_date DESC, i.id DESC LIMIT 1`)
      .bind(body.processNumber, JSON.stringify(parties), body.processNumber).run();
  }
  if (status === "CONFIRMED" && represented[0]) {
    const normalizedName = normalizePersonName(represented[0]);
    let [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.normalizedName, normalizedName)).limit(1);
    if (!client) [client] = await db.insert(clients).values({ name: represented[0], normalizedName, source: "SAJULBRA", status: "ACTIVE", updatedAt: new Date().toISOString() }).returning({ id: clients.id });
    await db.insert(legalProcesses).values({ clientId: client.id, processNumber: normalizedProcessNumber, parties: parties.join(" • ") || null, status: "ACTIVE", source: "SAJULBRA", updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: legalProcesses.processNumber, set: { clientId: client.id, parties: parties.join(" • ") || null, source: "SAJULBRA", updatedAt: new Date().toISOString() } });
  }
  return Response.json({ success: true, status });
}
