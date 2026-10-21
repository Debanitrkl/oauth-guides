import Link from "next/link";
import { ReviewChip, TierChip } from "@/components/chips";
import { getLibraryGuides } from "@/lib/library";
import { Guide, Tier } from "@/lib/schema";
import { listGeneratedGuides } from "@/lib/store";

const RANK: Record<Tier, number> = { open: 0, capped: 1, reviewed: 2, gated: 3 };

function hardestGate(g: Guide): string {
  const t = [...g.tiers].sort((a, b) => RANK[b.tier] - RANK[a.tier])[0];
  return t?.gate ?? "";
}

export const dynamic = "force-dynamic";

export default async function Home() {
  const [library, generated] = await Promise.all([getLibraryGuides(), listGeneratedGuides()]);
  return (
    <div className="space-y-16">
      <section className="rise">
        <h1 className="t-headline max-w-4xl text-chalk">Before you build an OAuth app, know what the provider will ask of you.</h1>
        <p className="t-lede mt-5">
          Each guide says how hard your own OAuth app is to get production ready, how long the wait is, what artifacts the provider demands, and which steps an agent can do for you. Every claim carries its evidence.
        </p>
        <form action="/generate" method="get" className="mt-8 flex max-w-3xl flex-wrap gap-3">
          <input name="q" required maxLength={200} placeholder="An app name or website, for example Dropbox or developer.spotify.com" className="field min-w-0 flex-1" />
          <button type="submit" className="pill pill-solid arrow">
            Generate a guide
          </button>
        </form>
        <p className="t-mono mt-3 text-chalk-faint">Not in the library? The agent reads the provider&apos;s docs, runs four probes, and streams a labelled guide in about two minutes.</p>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4 border-b border-hairline-strong pb-3">
          <h2 className="t-title text-chalk">Reviewed guides</h2>
          <span className="t-label">Six providers, six ways to fail</span>
        </div>
        <ol className="ledger">
          {library.map((g) => (
            <li key={g.slug}>
              <Link href={`/g/${g.slug}`} className="group grid grid-cols-1 gap-x-6 gap-y-2 py-5 no-underline sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto] sm:items-start">
                <div>
                  <div className="t-title-sm text-chalk transition-colors group-hover:text-flare-soft">{g.provider.name}</div>
                  <div className="t-mono mt-1 text-chalk-faint">{g.provider.domain}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {g.tiers.map((t) => {
                    const sc = g.scopeClasses.find((s) => s.id === t.scopeClassId);
                    return (
                      <div key={t.scopeClassId} className="flex flex-wrap items-center gap-2">
                        <TierChip tier={t.tier} />
                        {g.tiers.length > 1 && <span className="text-sm text-chalk-mid">{sc?.name}</span>}
                      </div>
                    );
                  })}
                  <p className="mt-1 line-clamp-2 max-w-prose text-sm text-chalk-mid">{hardestGate(g)}</p>
                </div>
                <div className="flex flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                  <ReviewChip state={g.reviewState} />
                  <span className="t-mono text-chalk-faint">
                    {g.stats.claims} claims · {g.verifiedOn.slice(0, 10)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {library.length === 0 && <li className="py-5 text-sm text-chalk-mid">No library guides found. Add guides/*.json files.</li>}
        </ol>
      </section>

      {generated.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-4 border-b border-hairline-strong pb-3">
            <h2 className="t-title text-chalk">Generated guides</h2>
            <span className="t-label">Produced by the agent on request</span>
          </div>
          <ol className="ledger">
            {generated.map((g) => (
              <li key={g.slug}>
                <Link href={`/g/${g.slug}`} className="group flex flex-wrap items-center justify-between gap-3 py-4 no-underline">
                  <span className="text-chalk transition-colors group-hover:text-flare-soft">{g.provider.name}</span>
                  <span className="flex items-center gap-3">
                    {g.tiers.slice(0, 3).map((t) => (
                      <TierChip key={t.scopeClassId} tier={t.tier} />
                    ))}
                    <ReviewChip state={g.reviewState} />
                    <span className="t-mono text-chalk-faint">{g.generatedAt.slice(0, 10)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
