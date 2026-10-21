import { promises as fs } from "node:fs";
import path from "node:path";
import { ManagedAuth } from "./schema";

/**
 * Step zero: does Composio already manage an OAuth app for this toolkit?
 * API first when a key exists and answers within 3 seconds, bundled list
 * otherwise. The answer says which source it came from.
 */

export const CUSTOM_APP_REASONS = [
  "Your app name on the consent screen instead of Composio's",
  "Scopes beyond Composio's defaults",
  "A dedicated rate limit quota instead of one shared across Composio users",
  "Polling triggers faster than the 15 minute managed floor",
  "A self hosted or regional provider instance",
  "Enterprise customers who require your branding end to end",
];

type CacheFile = {
  generatedAt: string;
  source: string;
  toolkits: Record<string, { managed: boolean; schemes: string[] }>;
};

const memory = new Map<string, { at: number; value: ManagedAuth }>();
const HOUR = 60 * 60 * 1000;

export async function checkManagedAuth(toolkit: string): Promise<ManagedAuth> {
  const slug = toolkit.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!slug) return unknown("empty toolkit slug");
  const hit = memory.get(slug);
  if (hit && Date.now() - hit.at < HOUR) return hit.value;

  const fromApi = await viaApi(slug);
  const value = fromApi ?? (await viaCache(slug));
  memory.set(slug, { at: Date.now(), value });
  return value;
}

async function viaApi(slug: string): Promise<ManagedAuth | null> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`https://backend.composio.dev/api/v3.1/toolkits/${encodeURIComponent(slug)}`, {
      headers: { "x-api-key": key, accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 404) {
      return { managed: null, schemes: [], source: "api", checkedAt: new Date().toISOString(), customAppReasons: CUSTOM_APP_REASONS };
    }
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const schemes = findSchemes(json);
    if (!schemes) return null;
    return {
      managed: schemes.some((s) => /oauth/i.test(s)),
      schemes,
      source: "api",
      checkedAt: new Date().toISOString(),
      customAppReasons: CUSTOM_APP_REASONS,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function findSchemes(obj: unknown, depth = 0): string[] | null {
  if (!obj || typeof obj !== "object" || depth > 3) return null;
  const rec = obj as Record<string, unknown>;
  if (Array.isArray(rec.composio_managed_auth_schemes)) return rec.composio_managed_auth_schemes.map(String);
  for (const v of Object.values(rec)) {
    const found = findSchemes(v, depth + 1);
    if (found) return found;
  }
  return null;
}

let cacheFile: CacheFile | null = null;

async function readCache(): Promise<CacheFile | null> {
  if (cacheFile) return cacheFile;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", "managed-auth.json"), "utf8");
    cacheFile = JSON.parse(raw) as CacheFile;
    return cacheFile;
  } catch {
    return null;
  }
}

async function viaCache(slug: string): Promise<ManagedAuth> {
  const cache = await readCache();
  const entry = cache?.toolkits[slug];
  if (!cache || !entry) return unknown(cache ? "toolkit not in the bundled list" : "bundled list missing");
  return {
    managed: entry.managed,
    schemes: entry.schemes,
    source: "cache",
    checkedAt: cache.generatedAt,
    customAppReasons: CUSTOM_APP_REASONS,
  };
}

function unknown(reason: string): ManagedAuth {
  return { managed: null, schemes: [], source: "unknown", checkedAt: new Date().toISOString(), customAppReasons: CUSTOM_APP_REASONS, note: reason };
}
