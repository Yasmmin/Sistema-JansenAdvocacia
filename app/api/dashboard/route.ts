import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { intimations } from "@/db/schema";
import { lastAttempt, lastSync } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select({
      status: intimations.status,
      classification: intimations.classification,
      count: sql<number>`count(*)`,
    }).from(intimations).groupBy(intimations.status, intimations.classification);
    const counts = { new: 0, inReview: 0, possibleDeadlines: 0, hearings: 0, reviewed: 0, total: 0 };
    for (const row of rows) {
      const count = Number(row.count);
      counts.total += count;
      if (row.status === "NEW") counts.new += count;
      if (row.status === "IN_REVIEW") counts.inReview += count;
      if (["REVIEWED", "NO_ACTION", "COMPLETED"].includes(row.status)) counts.reviewed += count;
      if (row.classification === "POSSIBLE_DEADLINE") counts.possibleDeadlines += count;
      if (row.classification === "HEARING") counts.hearings += count;
    }
    const [successfulSync, attemptedSync] = await Promise.all([lastSync(), lastAttempt()]);
    return Response.json({ success: true, counts, lastSync: successfulSync, lastAttempt: attemptedSync }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Falha ao carregar painel." }, { status: 500 });
  }
}
