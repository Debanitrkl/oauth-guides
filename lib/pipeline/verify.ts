import { ExtractionOutput } from "../schema";
import { quoteFoundIn } from "../text";
import { CollectedPage } from "./collect";

export type VerifyResult = {
  kept: ExtractionOutput["claims"];
  dropped: { id: string; reason: string }[];
  stripped: number;
};

/**
 * No span, no claim. A claim survives only if its quote, normalized, is a
 * substring of the normalized text of the page it cites.
 */
export function verifyClaims(claims: ExtractionOutput["claims"], pages: CollectedPage[]): VerifyResult {
  const textById = new Map(pages.map((p) => [p.source.id, p.text]));
  const kept: ExtractionOutput["claims"] = [];
  const dropped: { id: string; reason: string }[] = [];
  let stripped = 0;
  const seen = new Set<string>();
  for (const c of claims) {
    if (seen.has(c.id)) {
      stripped++;
      continue;
    }
    seen.add(c.id);
    if (!c.quote || c.quote.length > 400) {
      stripped++;
      continue;
    }
    const text = textById.get(c.sourceId);
    if (!text) {
      dropped.push({ id: c.id, reason: `cites unknown or unfetched source ${c.sourceId}` });
      continue;
    }
    if (!quoteFoundIn(c.quote, text)) {
      dropped.push({ id: c.id, reason: "quote not found in the page text" });
      continue;
    }
    kept.push(c);
  }
  return { kept, dropped, stripped };
}
