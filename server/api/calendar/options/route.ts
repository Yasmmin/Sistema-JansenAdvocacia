import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, legalProcesses } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getDb();
  const source = new URL(request.url).searchParams.get("source") === "SAJULBRA" ? "SAJULBRA" : "PRIVATE";
  const [clientRows, processRows] = await Promise.all([
    db.selectDistinct({ id: clients.id, name: clients.name }).from(clients).innerJoin(legalProcesses, eq(legalProcesses.clientId, clients.id)).where(eq(legalProcesses.source, source)).orderBy(clients.name),
    db.select({ id: legalProcesses.id, clientId: legalProcesses.clientId, processNumber: legalProcesses.processNumber, title: legalProcesses.title, eprocUrl: legalProcesses.eprocUrl }).from(legalProcesses).where(eq(legalProcesses.source, source)).orderBy(legalProcesses.processNumber),
  ]);
  return Response.json({ clients: clientRows, processes: processRows }, { headers: { "Cache-Control": "no-store" } });
}
