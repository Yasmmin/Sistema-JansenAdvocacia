import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { intimations, type IntimationClassification } from "@/db/schema";

const allowed = new Set<IntimationClassification>(["UNKNOWN", "INFORMATION", "POSSIBLE_DEADLINE", "HEARING", "PAYMENT", "DOCUMENT_REQUEST", "PROCEDURAL_ACTION"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (Number(request.headers.get("content-length") || 0) > 1024) return Response.json({ success: false, error: "Requisição muito grande." }, { status: 413 });
  const id = Number((await params).id);
  const body = await request.json().catch(() => null) as { classification?: IntimationClassification } | null;
  if (!Number.isInteger(id) || id < 1 || !body?.classification || !allowed.has(body.classification)) return Response.json({ success: false, error: "Classificação inválida." }, { status: 400 });
  const [row] = await getDb().update(intimations).set({ classification: body.classification, updatedAt: new Date().toISOString() }).where(eq(intimations.id, id)).returning();
  return row ? Response.json({ success: true, intimation: row }) : Response.json({ success: false, error: "Intimação não encontrada." }, { status: 404 });
}
