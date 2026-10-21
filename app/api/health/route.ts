import { hasServerKey, isMock, modelId } from "@/lib/pipeline/model";
import { storeKind } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What a reviewer needs to know before pressing Generate. Never returns secrets. */
export async function GET() {
  return Response.json(
    {
      mock: isMock(),
      serverKey: hasServerKey(),
      model: modelId(),
      store: storeKind(),
      composioKey: !!process.env.COMPOSIO_API_KEY,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
