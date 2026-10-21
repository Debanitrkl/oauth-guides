import { promises as fs } from "node:fs";
import path from "node:path";
import { Guide } from "./schema";

/**
 * Generated guides and run records. Vercel Blob when BLOB_READ_WRITE_TOKEN is
 * set, otherwise a .data folder next to the app so a clone runs with one key.
 */

export type RunRecord = {
  runId: string;
  query: string;
  slug?: string;
  startedAt: string;
  endedAt?: string;
  stages: { name: string; ms: number; status: "done" | "failed" | "skipped"; note?: string }[];
  sources: { fetched: number; blocked: number; error: number; empty: number };
  probes: { run: number; failed: number };
  claims: { proposed: number; kept: number; dropped: number; stripped: number };
  tokens?: { input: number; output: number };
  cached: boolean;
  error?: { stage: string; message: string };
};

const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const dataDir = () => process.env.GUIDES_DATA_DIR ?? path.join(process.cwd(), ".data");

async function blob() {
  return await import("@vercel/blob");
}

export async function saveGuide(guide: Guide): Promise<{ url: string | null; error?: string }> {
  const body = JSON.stringify(guide, null, 2);
  if (blobEnabled()) {
    try {
      const { put } = await blob();
      const res = await put(`guides/${guide.slug}.json`, body, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      return { url: res.url };
    } catch (e) {
      return { url: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
  try {
    const dir = path.join(dataDir(), "guides");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${guide.slug}.json`);
    await fs.writeFile(file, body);
    return { url: `file://${file}` };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function loadGeneratedGuide(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (blobEnabled()) {
    try {
      const { list } = await blob();
      const res = await list({ prefix: `guides/${slug}.json`, limit: 1 });
      const hit = res.blobs.find((b) => b.pathname === `guides/${slug}.json`);
      if (!hit) return null;
      const r = await fetch(hit.url, { cache: "no-store" });
      if (!r.ok) return null;
      const parsed = Guide.safeParse(await r.json());
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
  try {
    const raw = await fs.readFile(path.join(dataDir(), "guides", `${slug}.json`), "utf8");
    const parsed = Guide.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listGeneratedGuides(): Promise<Pick<Guide, "slug" | "provider" | "generatedAt" | "reviewState" | "tiers">[]> {
  const out: Guide[] = [];
  if (blobEnabled()) {
    try {
      const { list } = await blob();
      const res = await list({ prefix: "guides/", limit: 200 });
      const fetched = await Promise.all(
        res.blobs.map(async (b) => {
          try {
            const r = await fetch(b.url, { cache: "no-store" });
            const parsed = Guide.safeParse(await r.json());
            return parsed.success ? parsed.data : null;
          } catch {
            return null;
          }
        }),
      );
      fetched.forEach((g) => g && out.push(g));
    } catch {
      // ignore
    }
  } else {
    try {
      const dir = path.join(dataDir(), "guides");
      const files = await fs.readdir(dir);
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          const parsed = Guide.safeParse(JSON.parse(await fs.readFile(path.join(dir, f), "utf8")));
          if (parsed.success) out.push(parsed.data);
        } catch {
          // skip
        }
      }
    } catch {
      // no folder yet
    }
  }
  return out
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .map((g) => ({ slug: g.slug, provider: g.provider, generatedAt: g.generatedAt, reviewState: g.reviewState, tiers: g.tiers }));
}

export async function saveRun(run: RunRecord): Promise<void> {
  const body = JSON.stringify(run, null, 2);
  try {
    if (blobEnabled()) {
      const { put } = await blob();
      await put(`runs/${run.runId}.json`, body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
      return;
    }
    const dir = path.join(dataDir(), "runs");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${run.runId}.json`), body);
  } catch (e) {
    console.error(JSON.stringify({ event: "run_save_failed", runId: run.runId, error: String(e) }));
  }
}

export async function loadRun(runId: string): Promise<RunRecord | null> {
  if (!/^[a-z0-9-]+$/.test(runId)) return null;
  try {
    if (blobEnabled()) {
      const { list } = await blob();
      const res = await list({ prefix: `runs/${runId}.json`, limit: 1 });
      const hit = res.blobs.find((b) => b.pathname === `runs/${runId}.json`);
      if (!hit) return null;
      const r = await fetch(hit.url, { cache: "no-store" });
      return (await r.json()) as RunRecord;
    }
    return JSON.parse(await fs.readFile(path.join(dataDir(), "runs", `${runId}.json`), "utf8")) as RunRecord;
  } catch {
    return null;
  }
}

export function storeKind(): "blob" | "local" {
  return blobEnabled() ? "blob" : "local";
}
