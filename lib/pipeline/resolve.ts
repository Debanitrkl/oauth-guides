import { generateObject, generateText } from "ai";
import { z } from "zod";
import { Provider } from "../schema";
import { hostOf, slugify } from "../text";
import { ResolveResult } from "./events";
import { anthropic, lastJsonObject, modelId } from "./model";

const ResolveSchema = z.object({
  status: z.enum(["found", "no_oauth", "ambiguous"]),
  providerName: z.string(),
  reason: z.string().optional(),
  options: z.array(z.string()).optional(),
  question: z.string().optional(),
  provider: z
    .object({
      name: z.string(),
      domain: z.string(),
      officialDomains: z.array(z.string()),
      portalUrl: z.string(),
      docsUrl: z.string(),
      oauthProducts: z.array(z.string()),
      authorizeUrl: z.string().optional(),
      composioSlug: z.string().optional(),
      variantNote: z.string().optional(),
    })
    .optional(),
  candidateUrls: z.array(z.object({ url: z.string(), why: z.string() })).max(10).optional(),
});

const SYSTEM = `You resolve a developer's query (an app name or website) to the OAuth provider a third party developer would register an app with. Use web search to confirm the developer portal, the docs, and the pages about app review, verification, scopes, limits and distribution. Answer only with a JSON object matching this shape:
{
  "status": "found" | "no_oauth" | "ambiguous",
  "providerName": string,
  "reason": string (for no_oauth: why third party OAuth apps are not offered),
  "options": string[] (for ambiguous: the distinct OAuth products, e.g. "Facebook Login", "Instagram API"),
  "question": string (for ambiguous),
  "provider": { "name", "domain" (bare apex domain like "dropbox.com"), "officialDomains": string[] (every domain the provider itself owns that docs live on), "portalUrl" (where a developer creates an app), "docsUrl" (OAuth guide), "oauthProducts": string[], "authorizeUrl"?: string, "composioSlug"?: string (lowercase toolkit slug if you know it, e.g. "github"), "variantNote"?: string },
  "candidateUrls": [{ "url", "why" }] 4 to 8 official pages worth reading: the OAuth or app creation guide, app review or verification or approval process, scopes or permissions reference, rate limits or quotas, distribution or marketplace or production access rules, developer terms. Prefer official pages. Add at most 2 community pages (forum threads, well known vendor docs) only if they discuss review timelines.
}
Rules: no_oauth means the product has no OAuth for third party apps at all (API keys only, or no API). If the query names a company with several distinct OAuth products, set ambiguous and list them. Never invent URLs: every URL must come from search results or be the provider's well known root. Output the JSON only.`;

export async function resolveQuery(query: string, signal?: AbortSignal, apiKey?: string): Promise<ResolveResult> {
  const provider = anthropic(apiKey);
  const model = provider(modelId());
  let text = "";
  try {
    const res = await generateText({
      model,
      system: SYSTEM,
      prompt: `Query: ${query}\nToday: ${new Date().toISOString().slice(0, 10)}`,
      tools: { web_search: provider.tools.webSearch_20250305({ maxUses: 6 }) },
      abortSignal: signal,
      maxOutputTokens: 6000,
    });
    text = res.text;
  } catch (e) {
    // Fall back to a plain call without search; the model's own knowledge of the portal is still useful and every URL is fetched and verified downstream.
    const res = await generateText({
      model,
      system: SYSTEM.replace("Use web search to confirm", "You cannot search; use what you know about"),
      prompt: `Query: ${query}\nToday: ${new Date().toISOString().slice(0, 10)}\n(Web search unavailable: ${e instanceof Error ? e.message : String(e)})`,
      abortSignal: signal,
      maxOutputTokens: 6000,
    });
    text = res.text;
  }
  let parsed = ResolveSchema.safeParse(safeJson(lastJsonObject(text)));
  if (!parsed.success) {
    const repaired = await generateObject({
      model,
      schema: ResolveSchema,
      prompt: `Convert this answer into the schema exactly. Answer:\n${text}`,
      abortSignal: signal,
    });
    parsed = ResolveSchema.safeParse(repaired.object);
    if (!parsed.success) throw new Error(`Resolve produced no usable result: ${parsed.error.message}`);
  }
  return toResult(parsed.data, query);
}

function safeJson(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function toResult(r: z.infer<typeof ResolveSchema>, query: string): ResolveResult {
  if (r.status === "no_oauth") return { kind: "no_oauth", providerName: r.providerName || query, reason: r.reason ?? "The provider offers no OAuth for third party apps." };
  if (r.status === "ambiguous") return { kind: "ambiguous", options: r.options ?? [], question: r.question ?? `${r.providerName} has several OAuth products. Which one?` };
  if (!r.provider) throw new Error("Resolve said found but gave no provider");
  const p = r.provider;
  const domain = p.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const officialDomains = Array.from(new Set([domain, ...p.officialDomains.map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))])).filter(Boolean);
  const provider: Provider = {
    name: p.name,
    domain,
    officialDomains,
    portalUrl: p.portalUrl,
    docsUrl: p.docsUrl,
    oauthProducts: p.oauthProducts,
    variantNote: p.variantNote,
    composioSlug: p.composioSlug ?? slugify(p.name).replace(/-/g, ""),
  };
  const seen = new Set<string>();
  const candidateUrls = (r.candidateUrls ?? [])
    .filter((c) => /^https?:\/\//.test(c.url) && hostOf(c.url))
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .slice(0, 8);
  if (!candidateUrls.some((c) => c.url === provider.docsUrl) && /^https?:\/\//.test(provider.docsUrl)) {
    candidateUrls.unshift({ url: provider.docsUrl, why: "OAuth guide" });
  }
  return { kind: "found", provider, authorizeUrl: p.authorizeUrl, candidateUrls: candidateUrls.slice(0, 8) };
}
