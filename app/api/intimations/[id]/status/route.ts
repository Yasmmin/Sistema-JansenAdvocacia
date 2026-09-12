import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { intimations, type IntimationStatus } from "@/db/schema";

const allowed = new Set<IntimationStatus>(["NEW", "IN_REVIEW", "REVIEWED", "NO_ACTION", "COMPLETED", "NEEDS_CONFIRMATION"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (Number(request.headers.get("content-length") || 0) > 1024) return Response.json({ success: false, error: "Requisição muito grande." }, { status: 413 });
  const id = Number((await params).id);
  const body = await request.json().catch(() => null) as { status?: IntimationStatus } | null;
  if (!Number.isInteger(id) || id < 1 || !body?.status || !allowed.has(body.status)) return Response.json({ success: false, error: "Status inválido." }, { status: 400 });
  const now = new Date().toISOString();
  const [row] = await getDb().update(intimations).set({ status: body.status, reviewedAt: ["REVIEWED", "NO_ACTION", "COMPLETED"].includes(body.status) ? now : null, updatedAt: now }).where(eq(intimations.id, id)).returning();
  return row ? Response.json({ success: true, intimation: row }) : Response.json({ success: false, error: "Intimação não encontrada." }, { status: 404 });
}
