import { promises as fs } from "node:fs";
import path from "node:path";
import { assemble, validateGuide } from "./rules";
import { Attempt, Guide, GuideInput } from "./schema";

/**
 * Library guides live in guides/<slug>.json as GuideInput (facts a reviewer
 * checked by hand). Recorded walkthroughs in attempts/<slug>.json are merged
 * as Tested steps. The same rules that run on live guides derive the rest.
 */

const guidesDir = () => path.join(process.cwd(), "guides");
const attemptsDir = () => path.join(process.cwd(), "attempts");

export async function getLibrarySlugs(): Promise<string[]> {
  try {
    const files = await fs.readdir(guidesDir());
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  } catch {
    return [];
  }
}

export async function getLibraryGuide(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  let raw: string;
  try {
    raw = await fs.readFile(path.join(guidesDir(), `${slug}.json`), "utf8");
  } catch {
    return null;
  }
  const parsed = GuideInput.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`guides/${slug}.json is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const input = parsed.data;
  let attempts: Attempt[] = input.attempts ?? [];
  try {
    const a = JSON.parse(await fs.readFile(path.join(attemptsDir(), `${slug}.json`), "utf8"));
    const list = Array.isArray(a) ? a : [a];
    attempts = attempts.concat(list.map((x) => Attempt.parse(x)));
  } catch {
    // no recorded walkthrough for this slug
  }
  const guide = assemble({ ...input, attempts }, { trustQuotes: true });
  const errors = validateGuide(guide);
  if (errors.length) throw new Error(`guides/${slug}.json failed validation: ${errors.join("; ")}`);
  return guide;
}

export async function getLibraryGuides(): Promise<Guide[]> {
  const slugs = await getLibrarySlugs();
  const guides = await Promise.all(slugs.map((s) => getLibraryGuide(s)));
  return guides.filter((g): g is Guide => !!g);
}
