import { NextRequest } from "next/server";
import { getLibraryGuide } from "@/lib/library";
import { guideToMarkdown } from "@/lib/markdown";
import { loadGeneratedGuide } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const guide = (await getLibraryGuide(slug).catch(() => null)) ?? (await loadGeneratedGuide(slug));
  if (!guide) return new Response("No guide with that slug.", { status: 404 });
  const base = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const md = guideToMarkdown(guide, base);
  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `inline; filename="${slug}-oauth-guide.md"`,
      "cache-control": "no-store",
    },
  });
}
