import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { intimations, type IntimationStatus } from "@/db/schema";

const pendingStatuses: IntimationStatus[] = ["NEW", "IN_REVIEW", "NEEDS_CONFIRMATION"];

export async function GET() {
  try {
    const [row] = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(intimations)
      .where(inArray(intimations.status, pendingStatuses));

    return Response.json(
      { success: true, count: Number(row?.count ?? 0) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Falha ao contar intimações pendentes." },
      { status: 500 },
    );
  }
}
