import { queryDjen, DJEN_ENDPOINT, MONITORED_LAWYER } from "@/lib/djen";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await queryDjen();
    return Response.json({
      success: true, source: DJEN_ENDPOINT,
      query: { oab: MONITORED_LAWYER.oab, uf: MONITORED_LAWYER.uf, startDate: result.startDate, endDate: result.endDate },
      recordsFoundByApi: result.total, recordsReceived: result.received,
      recordsValidated: result.publications.length, validatedLawyer: result.publications.length > 0,
      publications: result.publications,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[DJEN]", error);
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Falha ao consultar a API oficial." }, { status: 502 });
  }
}
