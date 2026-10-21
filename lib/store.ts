import { promises as fs } from "node:fs";
import path from "node:path";
import { Guide } from "./schema";

/**
 * Generated guides and run records. Three backends, picked by environment:
 *
 *   tigris  S3 compatible bucket (Tigris, or any S3 endpoint) when
 *           AWS_ENDPOINT_URL_S3 and a bucket name are set. Objects are
 *           guides/<slug>.json and runs/<runId>.json. Nothing is public;
 *           the app reads through the S3 API with its own credentials.
 *   blob    Vercel Blob when BLOB_READ_WRITE_TOKEN is set.
 *   local   a .data folder next to the app, so a clone runs with one key.
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

export type StoreKind = "tigris" | "blob" | "local";

/**
 * Tigris prints its credentials under two naming schemes: the AWS_* names its
 * docs use, and TIGRIS_STORAGE_* from the console's environment variable
 * toggle and the Vercel integration. Either set works; AWS_* wins when both
 * are present.
 */
const env = (...names: string[]) => names.map((n) => process.env[n]).find((v) => !!v);
const s3Endpoint = () => env("AWS_ENDPOINT_URL_S3", "TIGRIS_STORAGE_ENDPOINT", "TIGRIS_ENDPOINT_URL_S3");
const s3AccessKeyId = () => env("AWS_ACCESS_KEY_ID", "TIGRIS_STORAGE_ACCESS_KEY_ID");
const s3SecretAccessKey = () => env("AWS_SECRET_ACCESS_KEY", "TIGRIS_STORAGE_SECRET_ACCESS_KEY");
const s3Region = () => env("AWS_REGION", "TIGRIS_STORAGE_REGION") ?? "auto";
const bucketName = () => env("BUCKET_NAME", "TIGRIS_BUCKET_NAME", "TIGRIS_STORAGE_BUCKET", "TIGRIS_STORAGE_BUCKET_NAME") ?? "";
const s3Enabled = () => !!s3Endpoint() && !!bucketName();
const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const dataDir = () => process.env.GUIDES_DATA_DIR ?? path.join(process.cwd(), ".data");

export function storeKind(): StoreKind {
  if (s3Enabled()) return "tigris";
  if (blobEnabled()) return "blob";
  return "local";
}

// ---------- S3 / Tigris ----------

type S3Module = typeof import("@aws-sdk/client-s3");
let s3Client: InstanceType<S3Module["S3Client"]> | null = null;
let s3Mod: S3Module | null = null;

async function s3(): Promise<{ mod: S3Module; client: InstanceType<S3Module["S3Client"]>; bucket: string }> {
  if (!s3Mod) s3Mod = await import("@aws-sdk/client-s3");
  if (!s3Client) {
    const accessKeyId = s3AccessKeyId();
    const secretAccessKey = s3SecretAccessKey();
    s3Client = new s3Mod.S3Client({
      region: s3Region(),
      endpoint: s3Endpoint(),
      forcePathStyle: false,
      // Explicit credentials when either naming scheme supplies them;
      // otherwise the SDK's own provider chain (instance roles and the like).
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }
  return { mod: s3Mod, client: s3Client, bucket: bucketName() };
}

async function s3Put(key: string, body: string): Promise<void> {
  const { mod, client, bucket } = await s3();
  await client.send(new mod.PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/json" }));
}

async function s3Get(key: string): Promise<string | null> {
  const { mod, client, bucket } = await s3();
  try {
    const res = await client.send(new mod.GetObjectCommand({ Bucket: bucket, Key: key }));
    return res.Body ? await res.Body.transformToString() : null;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw e;
  }
}

async function s3ListKeys(prefix: string, max = 200): Promise<string[]> {
  const { mod, client, bucket } = await s3();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(new mod.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: Math.min(1000, max - keys.length) }));
    for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token && keys.length < max);
  return keys;
}

// ---------- Vercel Blob ----------

async function blob() {
  return await import("@vercel/blob");
}

// ---------- Guides ----------

export async function saveGuide(guide: Guide): Promise<{ url: string | null; error?: string }> {
  const body = JSON.stringify(guide, null, 2);
  const key = `guides/${guide.slug}.json`;
  try {
    if (s3Enabled()) {
      await s3Put(key, body);
      return { url: `s3://${bucketName()}/${key}` };
    }
    if (blobEnabled()) {
      const { put } = await blob();
      const res = await put(key, body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
      return { url: res.url };
    }
    const dir = path.join(dataDir(), "guides");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${guide.slug}.json`);
    await fs.writeFile(file, body);
    return { url: `file://${file}` };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function parseGuide(raw: string | null): Guide | null {
  if (!raw) return null;
  try {
    const parsed = Guide.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function loadGeneratedGuide(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const key = `guides/${slug}.json`;
  try {
    if (s3Enabled()) return parseGuide(await s3Get(key));
    if (blobEnabled()) {
      const { list } = await blob();
      const res = await list({ prefix: key, limit: 1 });
      const hit = res.blobs.find((b) => b.pathname === key);
      if (!hit) return null;
      const r = await fetch(hit.url, { cache: "no-store" });
      return r.ok ? parseGuide(await r.text()) : null;
    }
    return parseGuide(await fs.readFile(path.join(dataDir(), "guides", `${slug}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function listGeneratedGuides(): Promise<Pick<Guide, "slug" | "provider" | "generatedAt" | "reviewState" | "tiers">[]> {
  const out: Guide[] = [];
  try {
    if (s3Enabled()) {
      const keys = (await s3ListKeys("guides/")).filter((k) => k.endsWith(".json"));
      const fetched = await Promise.all(keys.map(async (k) => parseGuide(await s3Get(k).catch(() => null))));
      fetched.forEach((g) => g && out.push(g));
    } else if (blobEnabled()) {
      const { list } = await blob();
      const res = await list({ prefix: "guides/", limit: 200 });
      const fetched = await Promise.all(
        res.blobs.map(async (b) => {
          try {
            const r = await fetch(b.url, { cache: "no-store" });
            return parseGuide(await r.text());
          } catch {
            return null;
          }
        }),
      );
      fetched.forEach((g) => g && out.push(g));
    } else {
      const dir = path.join(dataDir(), "guides");
      const files = await fs.readdir(dir).catch(() => [] as string[]);
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const g = parseGuide(await fs.readFile(path.join(dir, f), "utf8").catch(() => null));
        if (g) out.push(g);
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ event: "guide_list_failed", store: storeKind(), error: String(e) }));
  }
  return out
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .map((g) => ({ slug: g.slug, provider: g.provider, generatedAt: g.generatedAt, reviewState: g.reviewState, tiers: g.tiers }));
}

// ---------- Runs ----------

export async function saveRun(run: RunRecord): Promise<void> {
  const body = JSON.stringify(run, null, 2);
  const key = `runs/${run.runId}.json`;
  try {
    if (s3Enabled()) {
      await s3Put(key, body);
      return;
    }
    if (blobEnabled()) {
      const { put } = await blob();
      await put(key, body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
      return;
    }
    const dir = path.join(dataDir(), "runs");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${run.runId}.json`), body);
  } catch (e) {
    console.error(JSON.stringify({ event: "run_save_failed", runId: run.runId, store: storeKind(), error: String(e) }));
  }
}

export async function loadRun(runId: string): Promise<RunRecord | null> {
  if (!/^[a-z0-9-]+$/.test(runId)) return null;
  const key = `runs/${runId}.json`;
  try {
    if (s3Enabled()) {
      const raw = await s3Get(key);
      return raw ? (JSON.parse(raw) as RunRecord) : null;
    }
    if (blobEnabled()) {
      const { list } = await blob();
      const res = await list({ prefix: key, limit: 1 });
      const hit = res.blobs.find((b) => b.pathname === key);
      if (!hit) return null;
      const r = await fetch(hit.url, { cache: "no-store" });
      return (await r.json()) as RunRecord;
    }
    return JSON.parse(await fs.readFile(path.join(dataDir(), "runs", `${runId}.json`), "utf8")) as RunRecord;
  } catch {
    return null;
  }
}

/**
 * One round trip against the configured store, for /api/health and the
 * deploy check. Never throws; never returns credentials.
 */
export async function storeStatus(): Promise<{ kind: StoreKind; ok: boolean; detail: string }> {
  const kind = storeKind();
  try {
    if (kind === "tigris") {
      if (!s3AccessKeyId() || !s3SecretAccessKey()) {
        return { kind, ok: false, detail: "No access key: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or the TIGRIS_STORAGE_* names)" };
      }
      const { mod, client, bucket } = await s3();
      await client.send(new mod.HeadBucketCommand({ Bucket: bucket }));
      return { kind, ok: true, detail: `bucket ${bucket} reachable` };
    }
    if (kind === "blob") {
      const { list } = await blob();
      await list({ prefix: "guides/", limit: 1 });
      return { kind, ok: true, detail: "blob store reachable" };
    }
    await fs.mkdir(path.join(dataDir(), "guides"), { recursive: true });
    return { kind, ok: true, detail: `writing to ${dataDir()}` };
  } catch (e) {
    return { kind, ok: false, detail: describeError(e) };
  }
}

/** Name, HTTP status and message of an SDK error, with nothing from the request. */
function describeError(e: unknown): string {
  const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const name = err?.name && err.name !== "Error" ? err.name : "";
  const status = err?.$metadata?.httpStatusCode;
  const message = err?.message && err.message !== name ? err.message : "";
  return [name, status ? `HTTP ${status}` : "", message].filter(Boolean).join(" ") || String(e);
}
