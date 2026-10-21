import { runPipeline } from "../lib/pipeline/run";

process.env.GUIDES_MOCK = "1";
process.env.GUIDES_DATA_DIR = process.env.GUIDES_DATA_DIR ?? ".data";

async function main() {
  const t0 = Date.now();
  await runPipeline({ query: process.argv[2] ?? "dropbox", force: true }, (e) => {
    if (e.type === "guide") {
      console.log(`guide: ${e.guide.slug}, tiers ${e.guide.tiers.map((t) => t.tier).join(",")}, claims ${e.guide.stats.claims} ${JSON.stringify(e.guide.stats.byLabel)}, steps ${e.guide.steps.map((s) => s.owner).join(",")}`);
      console.log(`next: ${Object.values(e.guide.nextAction)[0]}`);
    } else if (e.type === "source") {
      console.log(`source: ${e.source.id} ${e.source.status} ${e.source.url}`);
    } else {
      console.log(JSON.stringify(e).slice(0, 220));
    }
  });
  console.log(`done in ${Date.now() - t0} ms`);
}
main();
