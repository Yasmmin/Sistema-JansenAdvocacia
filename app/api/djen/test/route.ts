import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL("/api/djen", request.url);
  try {
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json() as { success?: boolean; recordsFoundByApi?: number; recordsValidated?: number; validatedLawyer?: boolean; query?: { startDate: string; endDate: string }; error?: string };
    return NextResponse.json({ success: response.ok && data.success === true, oab: "103774", uf: "RS", recordsFound: data.recordsFoundByApi ?? 0, recordsValidated: data.recordsValidated ?? 0, validatedLawyer: data.validatedLawyer ?? false, period: data.query ? { start: data.query.startDate, end: data.query.endDate } : null, error: data.error }, { status: response.ok ? 200 : response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, oab: "103774", uf: "RS", recordsFound: 0, recordsValidated: 0, validatedLawyer: false, error: error instanceof Error ? error.message : "Erro inesperado" }, { status: 502 });
  }
}
