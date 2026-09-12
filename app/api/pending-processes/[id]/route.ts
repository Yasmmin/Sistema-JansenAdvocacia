import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { legalProcesses, pendingLegalProcesses } from "@/db/schema";
import { processDigits } from "@/lib/legal";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ success: false, error: "Processo pendente inválido." }, { status: 400 });
  const db = getDb();
  const [pending] = await db.select().from(pendingLegalProcesses).where(eq(pendingLegalProcesses.id, id)).limit(1);
  if (!pending) return Response.json({ success: false, error: "Este vínculo já foi removido." }, { status: 404 });
  const [registered] = await db.select({ id: legalProcesses.id }).from(legalProcesses).where(eq(legalProcesses.processNumber, pending.processNumber)).limit(1);
  const d1 = getD1();
  const statements = [];
  if (!registered) statements.push(d1.prepare(`INSERT INTO ignored_imports(kind, normalized_value, reason)
    VALUES('PROCESS', ?, 'PENDING_DISMISSED') ON CONFLICT(kind, normalized_value) DO NOTHING`).bind(processDigits(pending.processNumber)));
  statements.push(d1.prepare("DELETE FROM pending_legal_processes WHERE id = ?").bind(id));
  await d1.batch(statements);
  return Response.json({ success: true, registered: Boolean(registered), preservedPublications: true });
}
