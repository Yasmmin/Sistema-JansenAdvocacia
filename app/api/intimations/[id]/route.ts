import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { intimations } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ success: false, error: "Identificador inválido." }, { status: 400 });
  const [row] = await getDb().select().from(intimations).where(eq(intimations.id, id)).limit(1);
  return row ? Response.json({ success: true, intimation: row }) : Response.json({ success: false, error: "Intimação não encontrada." }, { status: 404 });
}
