import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, legalProcesses } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const [clientRows, processRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.source, "PRIVATE")).orderBy(clients.name),
    db.select({ id: legalProcesses.id, clientId: legalProcesses.clientId, processNumber: legalProcesses.processNumber, title: legalProcesses.title, eprocUrl: legalProcesses.eprocUrl }).from(legalProcesses).where(eq(legalProcesses.source, "PRIVATE")).orderBy(legalProcesses.processNumber),
  ]);
  return Response.json({ clients: clientRows, processes: processRows }, { headers: { "Cache-Control": "no-store" } });
}
