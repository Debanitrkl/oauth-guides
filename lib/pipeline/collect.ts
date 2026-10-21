import { fetchPage } from "../net";
import { Source } from "../schema";
import { hostOf, isOfficialHost, sha256 } from "../text";
import { Emit } from "./events";

export type CollectedPage = { source: Source; text: string };

const PER_PAGE_CHARS = 12_000;

/**
 * Fetch candidate pages in parallel. Each page keeps up to 12k characters of
 * text. Blocked or empty pages are recorded as sources with a status so the
 * guide can name the gap.
 */
export async function collect(
  candidates: { url: string; why: string }[],
  officialDomains: string[],
  emit: Emit,
  signal?: AbortSignal,
): Promise<CollectedPage[]> {
  const retrievedAt = new Date().toISOString();
  const results = await Promise.all(
    candidates.slice(0, 8).map(async (c, i) => {
      const page = await fetchPage(c.url, { timeoutMs: 8000, retries: 2, signal });
      const host = hostOf(page.finalUrl || c.url);
      const status: Source["status"] = page.blocked ? "blocked" : !page.ok ? "error" : page.text.length < 400 ? "empty" : "fetched";
      const text = status === "fetched" ? page.text.slice(0, PER_PAGE_CHARS) : "";
      const source: Source = {
        id: `src-${i + 1}`,
        url: c.url,
        host,
        official: isOfficialHost(host, officialDomains),
        title: page.title,
        retrievedAt,
        status,
        textHash: text ? sha256(text) : undefined,
        chars: page.text.length,
      };
      emit({ type: "source", source });
      return { source, text };
    }),
  );
  return results;
}
