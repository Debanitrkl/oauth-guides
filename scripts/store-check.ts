/**
 * Round trip against the configured store: status, save a guide built from
 * the mock fixture under a test slug, list it, load it, save and load a run.
 * Prints JSON; exits 1 on the first failure. Never prints credentials.
 *
 *   npm run check:store            (reads .env.local, then the environment)
 */
async function loadEnvLocal() {
  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env.local
  }
}

async function main() {
  await loadEnvLocal();
  const { loadGeneratedGuide, listGeneratedGuides, loadRun, saveGuide, saveRun, storeKind, storeStatus } = await import("../lib/store");
  const { getLibraryGuides } = await import("../lib/library");
  const status = await storeStatus();
  console.log(JSON.stringify({ step: "status", ...status }));
  if (!status.ok) process.exit(1);

  const [sample] = await getLibraryGuides();
  if (!sample) throw new Error("no library guide to use as a sample");
  const slug = `store-check-${Date.now().toString(36)}`;
  const guide = { ...sample, slug, generatedAt: new Date().toISOString() };

  const saved = await saveGuide(guide);
  console.log(JSON.stringify({ step: "saveGuide", ...saved }));
  if (!saved.url) process.exit(1);

  const listed = await listGeneratedGuides();
  const seen = listed.some((g) => g.slug === slug);
  console.log(JSON.stringify({ step: "listGeneratedGuides", count: listed.length, seen }));
  if (!seen) process.exit(1);

  const loaded = await loadGeneratedGuide(slug);
  console.log(JSON.stringify({ step: "loadGeneratedGuide", ok: loaded?.slug === slug, claims: loaded?.claims.length }));
  if (loaded?.slug !== slug) process.exit(1);

  const runId = `run-${slug}`;
  await saveRun({
    runId,
    query: "store check",
    slug,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    stages: [{ name: "persist", ms: 1, status: "done" }],
    sources: { fetched: 0, blocked: 0, error: 0, empty: 0 },
    probes: { run: 0, failed: 0 },
    claims: { proposed: 0, kept: 0, dropped: 0, stripped: 0 },
    cached: false,
  });
  const run = await loadRun(runId);
  console.log(JSON.stringify({ step: "saveRun/loadRun", ok: run?.runId === runId }));
  if (run?.runId !== runId) process.exit(1);

  const missing = await loadGeneratedGuide("store-check-does-not-exist");
  console.log(JSON.stringify({ step: "missing key", ok: missing === null }));
  console.log(JSON.stringify({ step: "done", store: storeKind(), slug }));
}

main().catch((e) => {
  console.error(JSON.stringify({ step: "failed", error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
