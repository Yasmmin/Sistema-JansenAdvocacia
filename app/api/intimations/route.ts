import { desc, eq, getTableColumns } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, intimations, legalProcesses } from "@/db/schema";
import { normalizeOfficialLabel, normalizeOfficialText, stripHtml } from "@/lib/djen";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getDb().select({
      ...getTableColumns(intimations),
      clientId: clients.id,
      clientName: clients.name,
    }).from(intimations)
      .leftJoin(legalProcesses, eq(legalProcesses.id, intimations.processId))
      .leftJoin(clients, eq(clients.id, legalProcesses.clientId))
      .orderBy(desc(intimations.availabilityDate), desc(intimations.id)).limit(1000);
    return Response.json({
      success: true,
      intimations: rows.map((row) => ({
        ...row,
        actionType: row.actionType ? normalizeOfficialLabel(row.actionType) : row.actionType,
        summary: row.summary ? normalizeOfficialText(stripHtml(row.summary)) : row.summary,
        content: row.content ? normalizeOfficialText(stripHtml(row.content)) : row.content,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Falha ao carregar intimações." }, { status: 500 });
  }
}
