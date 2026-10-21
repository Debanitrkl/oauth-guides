import { runPipeline } from "../lib/pipeline/run";

/**
 * Runs the live pipeline from the command line with the same events the UI
 * receives. Usage: npx tsx scripts/run-live.ts "dropbox" [--force]
 * Reads ANTHROPIC_API_KEY from the environment or .env.local.
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
  const query = process.argv[2];
  if (!query) {
    console.error('Usage: npx tsx scripts/run-live.ts "app name or url" [--force]');
    process.exit(1);
  }
  const t0 = Date.now();
  await runPipeline({ query, force: process.argv.includes("--force") }, (e) => {
    const t = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
    switch (e.type) {
      case "stage":
        console.log(`${t}s stage ${e.name} ${e.status}${e.ms != null ? ` ${e.ms} ms` : ""}${e.note ? ` (${e.note})` : ""}`);
        break;
      case "resolved":
        console.log(`${t}s resolved ${JSON.stringify(e.result).slice(0, 400)}`);
        break;
      case "source":
        console.log(`${t}s source ${e.source.id} ${e.source.status} ${e.source.official ? "official" : "community"} ${e.source.url} ${e.source.chars ?? 0} chars`);
        break;
      case "probe":
        console.log(`${t}s probe ${e.probe.kind} ${e.probe.ok ? "ok" : "failed"}: ${e.probe.summary}`);
        break;
      case "claims":
        console.log(`${t}s claims proposed ${e.proposed}, kept ${e.kept}, dropped ${e.dropped}, stripped ${e.stripped}`);
        break;
      case "guide":
        console.log(`${t}s guide ${e.guide.slug}: tiers ${e.guide.tiers.map((x) => `${x.scopeClassId}=${x.tier}`).join(", ")}; ${e.guide.stats.claims} claims ${JSON.stringify(e.guide.stats.byLabel)}; ${e.guide.steps.length} steps; ${e.guide.playbooks.length} playbooks; ${e.guide.gaps.length} gaps`);
        for (const [k, v] of Object.entries(e.guide.nextAction)) console.log(`        next (${k}): ${v}`);
        break;
      case "done":
        console.log(`${t}s done ${e.slug} cached=${e.cached} url=${e.url} run=${e.runId}`);
        break;
      case "error":
        console.log(`${t}s ERROR at ${e.stage}: ${e.message} (partial=${e.partial})`);
        break;
      case "log":
        console.log(`${t}s log ${e.message}`);
        break;
    }
  });
}
main();
