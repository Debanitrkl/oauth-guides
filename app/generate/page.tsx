import { GenerateStream } from "@/components/GenerateStream";

export const dynamic = "force-dynamic";

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="space-y-8">
      <div className="rise border-b border-hairline-strong pb-6">
        <h1 className="t-headline text-chalk">Generate a guide</h1>
        <p className="t-lede mt-4">
          Name an app or paste its website. The agent resolves the provider, fetches its docs, extracts claims that must carry a verbatim quote, runs four probes with no account, and the rules assign the tier. Two to three minutes.
        </p>
      </div>
      <GenerateStream initialQuery={(q ?? "").slice(0, 200)} />
    </div>
  );
}
