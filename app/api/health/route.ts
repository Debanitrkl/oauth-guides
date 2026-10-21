import { hasServerKey, isMock, modelId } from "@/lib/pipeline/model";
import { storeKind, storeStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a reviewer needs to know before pressing Generate. Never returns secrets.
 * `?check=store` adds one round trip against the configured store so a fresh
 * deploy can confirm its bucket credentials without generating a guide.
 */
export async function GET(req: Request) {
  const check = new URL(req.url).searchParams.get("check");
  const body: Record<string, unknown> = {
    mock: isMock(),
    serverKey: hasServerKey(),
    model: modelId(),
    store: storeKind(),
    composioKey: !!process.env.COMPOSIO_API_KEY,
  };
  if (check === "store") body.storeCheck = await storeStatus();
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
