import { lastAttempt, lastSync } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [sync, attempt] = await Promise.all([lastSync(), lastAttempt()]);
    return Response.json({ success: true, sync, attempt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Falha ao consultar a sincronização." }, { status: 500 });
  }
}
