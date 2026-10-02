import { syncDjen } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return Response.json(await syncDjen(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[SYNC]", error);
    const technicalMessage = error instanceof Error ? error.message : "";
    const publicMessage = technicalMessage.startsWith("API oficial retornou HTTP")
      ? "A API oficial do DJEN não respondeu corretamente. Tente novamente em instantes."
      : technicalMessage.startsWith("DJEN") || technicalMessage.startsWith("DataJud")
        ? `Sincronização interrompida: ${technicalMessage.slice(0, 300)}`
      : "Não foi possível concluir a sincronização agora. Tente novamente em instantes.";
    return Response.json({ success: false, error: publicMessage }, { status: 502 });
  }
}
