import { getLibraryGuides } from "@/lib/library";
import { listGeneratedGuides } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [library, generated] = await Promise.all([getLibraryGuides(), listGeneratedGuides()]);
  return Response.json({
    library: library.map((g) => ({
      slug: g.slug,
      provider: g.provider.name,
      domain: g.provider.domain,
      tiers: g.tiers.map((t) => ({ scopeClassId: t.scopeClassId, tier: t.tier })),
      verifiedOn: g.verifiedOn,
      reviewState: g.reviewState,
    })),
    generated: generated.map((g) => ({
      slug: g.slug,
      provider: g.provider.name,
      domain: g.provider.domain,
      tiers: g.tiers.map((t) => ({ scopeClassId: t.scopeClassId, tier: t.tier })),
      generatedAt: g.generatedAt,
      reviewState: g.reviewState,
    })),
  });
}
