import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Regenerates data/managed-auth.json from Composio's toolkit API for the
 * toolkits already in the file plus any passed on the command line.
 * Usage: COMPOSIO_API_KEY=... npx tsx scripts/regen-managed-auth.ts [slug ...]
 */
async function main() {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) {
    console.error("COMPOSIO_API_KEY is required.");
    process.exit(1);
  }
  const file = path.join(process.cwd(), "data", "managed-auth.json");
  const current = JSON.parse(await fs.readFile(file, "utf8")) as { toolkits: Record<string, unknown> };
  const slugs = Array.from(new Set([...Object.keys(current.toolkits), ...process.argv.slice(2)]));
  const toolkits: Record<string, { managed: boolean; schemes: string[] }> = {};
  for (const slug of slugs) {
    try {
      const res = await fetch(`https://backend.composio.dev/api/v3.1/toolkits/${encodeURIComponent(slug)}`, { headers: { "x-api-key": key } });
      if (!res.ok) {
        console.error(`${slug}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as Record<string, unknown>;
      const schemes = find(json) ?? [];
      toolkits[slug] = { managed: schemes.some((s) => /oauth/i.test(s)), schemes };
      console.log(`${slug}: ${toolkits[slug].managed ? "managed" : "bring your own"} (${schemes.join(", ") || "none"})`);
    } catch (e) {
      console.error(`${slug}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await fs.writeFile(
    file,
    JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), source: "Composio toolkit API, composio_managed_auth_schemes", toolkits }, null, 2),
  );
  console.log(`Wrote ${Object.keys(toolkits).length} toolkits to ${file}`);
}

function find(obj: unknown, depth = 0): string[] | null {
  if (!obj || typeof obj !== "object" || depth > 3) return null;
  const rec = obj as Record<string, unknown>;
  if (Array.isArray(rec.composio_managed_auth_schemes)) return rec.composio_managed_auth_schemes.map(String);
  for (const v of Object.values(rec)) {
    const f = find(v, depth + 1);
    if (f) return f;
  }
  return null;
}

main();
