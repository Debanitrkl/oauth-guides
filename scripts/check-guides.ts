import { getLibrarySlugs, getLibraryGuide } from "../lib/library";

async function main() {
  const slugs = await getLibrarySlugs();
  if (!slugs.length) {
    console.log("No library guides in guides/.");
    return;
  }
  let failed = 0;
  for (const slug of slugs) {
    try {
      const g = await getLibraryGuide(slug);
      if (!g) throw new Error("not found");
      const tiers = g.tiers.map((t) => `${t.scopeClassId}=${t.tier}`).join(", ");
      console.log(`ok   ${slug}: ${g.stats.claims} claims (${JSON.stringify(g.stats.byLabel)}), tiers ${tiers}, ${g.steps.length} steps, ${g.playbooks.length} playbooks`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${slug}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (failed) process.exit(1);
}
main();
