import { LabelChip, OwnerChip, TierChip } from "@/components/chips";

export default function About() {
  return (
    <div className="prose-basalt space-y-12">
      <div className="rise border-b border-hairline-strong pb-6">
        <h1 className="t-headline text-chalk">How to read a guide</h1>
        <p className="t-lede mt-4">A guide is a readiness assessment with one next action, not a tutorial. The provider&apos;s docs stay the tutorial; the guide tells you whether to start today, plan for a wait, or skip the custom app.</p>
      </div>

      <section>
        <h2 className="t-title text-chalk">Tiers name what gates production</h2>
        <ul className="ledger mt-4 border-t border-hairline-strong !max-w-none">
          <li className="grid grid-cols-[6.5rem_1fr] gap-x-4 py-3">
            <TierChip tier="open" />
            <span>Register and go. Nothing is reviewed before external users can connect (GitHub, Slack unlisted apps).</span>
          </li>
          <li className="grid grid-cols-[6.5rem_1fr] gap-x-4 py-3">
            <TierChip tier="capped" />
            <span>Anyone registers, production use is capped until a light review lifts the cap (HubSpot 25 installs, Dropbox 50 users, Discord 100 servers).</span>
          </li>
          <li className="grid grid-cols-[6.5rem_1fr] gap-x-4 py-3">
            <TierChip tier="reviewed" />
            <span>A mandatory review with a real wait before external users can connect (Zoom, Shopify public apps, Google sensitive scopes).</span>
          </li>
          <li className="grid grid-cols-[6.5rem_1fr] gap-x-4 py-3">
            <TierChip tier="gated" />
            <span>A partner program, business verification, paid assessment or legal entity stands in the way (Meta advanced access, LinkedIn partner tiers, Google restricted scopes).</span>
          </li>
        </ul>
        <p className="mt-4">The same provider can sit in different tiers for different scopes, which is why many guides ask which scopes you need first.</p>
      </section>

      <section>
        <h2 className="t-title text-chalk">Every claim carries its evidence</h2>
        <ul className="ledger mt-4 border-t border-hairline-strong !max-w-none">
          <li className="grid grid-cols-[9rem_1fr] gap-x-4 py-3">
            <LabelChip label="tested" />
            <span>A probe or a recorded walkthrough saw it. Probes need no account: the discovery document, what an unregistered client sees at the authorize endpoint, whether the portal sits behind a login, whether the docs render.</span>
          </li>
          <li className="grid grid-cols-[9rem_1fr] gap-x-4 py-3">
            <LabelChip label="documented" host="provider" />
            <span>The provider&apos;s own page says it. The quote shown under the claim was found verbatim on the page on the retrieval date. The model cannot mint a documented claim; code checks the quote.</span>
          </li>
          <li className="grid grid-cols-[9rem_1fr] gap-x-4 py-3">
            <LabelChip label="reported" />
            <span>A community source says it: a forum thread, a vendor&apos;s integration docs, a blog. Useful for real waits; weaker than a provider page.</span>
          </li>
          <li className="grid grid-cols-[9rem_1fr] gap-x-4 py-3">
            <LabelChip label="unverified" />
            <span>We looked and could not confirm it. Generated guides drop these; a reviewer may keep one with a note when removing it would hide a risk.</span>
          </li>
        </ul>
        <p className="mt-4">A wait range takes the weakest label among its sources. When developers report longer waits than the provider states, both numbers are shown.</p>
      </section>

      <section>
        <h2 className="t-title text-chalk">Steps say who can do them</h2>
        <ul className="ledger mt-4 border-t border-hairline-strong !max-w-none">
          <li className="grid grid-cols-[12rem_1fr] gap-x-4 py-3">
            <OwnerChip owner="agent" />
            <span>An agent can perform or draft it: research, redirect URI lists, privacy policy drafts, scope justifications, console fields once you are signed in.</span>
          </li>
          <li className="grid grid-cols-[12rem_1fr] gap-x-4 py-3">
            <OwnerChip owner="agent_prepares" />
            <span>The agent fills the form or writes the material, you press submit.</span>
          </li>
          <li className="grid grid-cols-[12rem_1fr] gap-x-4 py-3">
            <OwnerChip owner="only_you" />
            <span>Account creation and sign in, accepting terms, paying, uploading identity or business documents, CAPTCHAs, pressing submit on a review. The rule that assigns this is code, not the model.</span>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="t-title text-chalk">Where the numbers come from</h2>
        <p className="mt-4">Hands on effort is an estimate by rule: one hour base, half an hour per artifact, two for a demo video, one for a security questionnaire, four of your time for an external assessment, shown as a range. It is never presented as a claim.</p>
        <p>Calendar wait comes only from duration claims with a quote. No quote, no figure, and the card says so.</p>
      </section>
    </div>
  );
}
