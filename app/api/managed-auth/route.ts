import { NextRequest } from "next/server";
import { checkManagedAuth } from "@/lib/managedAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const toolkit = req.nextUrl.searchParams.get("toolkit") ?? "";
  if (!toolkit) return Response.json({ error: "toolkit is required" }, { status: 400 });
  const result = await checkManagedAuth(toolkit);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
