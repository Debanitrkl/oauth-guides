import { LabelChip, TierChip } from "@/components/chips";

export const metadata = {
  title: "How we built this · OAuth App Setup Guides",
};

type Row = { provider: string; url: string; tier: "open" | "capped" | "reviewed" | "gated"; gate: string; stated: string; reported: string };

const FINDINGS: Row[] = [
  { provider: "GitHub", url: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app", tier: "open", gate: "Nothing. Any user can authorize an OAuth app from creation", stated: "None needed", reported: "" },
  { provider: "Microsoft Entra", url: "https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview", tier: "open", gate: "No Microsoft gate. Tenant admins consent; default risk policies block unverified multitenant apps", stated: "Publisher verification 3 to 5 business days", reported: "A free account's B2C tenant cannot be verified" },
  { provider: "X", url: "https://docs.x.com/x-api/getting-started/getting-access", tier: "open", gate: "No review for self serve. Paid credits from the start; Enterprise review at scale", stated: "Immediate", reported: "" },
  { provider: "Atlassian", url: "https://developer.atlassian.com/cloud/oauth/getting-started/managing-oauth-apps/", tier: "open", gate: "Enable sharing, no review. Users see a not yet reviewed notice; site admins may block", stated: "Marketplace approval 10 to 15 business days, KYB via Stripe Identity", reported: "Individuals without a business entity cannot publish" },
  { provider: "Slack", url: "https://docs.slack.dev/distribution", tier: "open", gate: "Unlisted distribution needs no review. Apps created after 29 May 2025 read history at 1 call a minute until Marketplace approved", stated: "Marketplace: 10 business days preliminary, up to 10 weeks functional", reported: "About 4 months, one developer, 2026" },
  { provider: "Notion", url: "https://developers.notion.com/guides/get-started/public-connections", tier: "open", gate: "Install scope set at creation. Review attaches to Marketplace listing", stated: "Listing review 5 to 10 business days", reported: "Immediate OAuth after toggling public, vendor guides" },
  { provider: "HubSpot", url: "https://developers.hubspot.com/changelog/new-marketplace-distribution-app-install-limits", tier: "capped", gate: "25 installs for unlisted apps until listed. Install screen shows a not verified banner", stated: "Initial review within 10 business days, at most 60 days", reported: "About 10 business days, staff, 2026" },
  { provider: "Discord", url: "https://support-dev.discord.com/hc/en-us/articles/23926564536471-How-Do-I-Get-My-App-Verified", tier: "capped", gate: "100 servers until verification. The team owner verifies identity via Stripe", stated: "None stated", reported: "A few days, longer when queued" },
  { provider: "Dropbox", url: "https://www.dropbox.com/developers/reference/developer-guide", tier: "capped", gate: "50 linked users, then two weeks to obtain production approval", stated: "None stated", reported: "A few business days, staff" },
  { provider: "Strava", url: "https://developers.strava.com/docs/rate-limits/", tier: "capped", gate: "1 athlete, self upgrade to 10, review beyond. A subscription is required to create an app", stated: "None stated", reported: "7 to 10 business days (2025), 5 to 7 weeks or more (2026)" },
  { provider: "Xero", url: "https://developer.xero.com/pricing", tier: "capped", gate: "5 free connections, 50 on a paid tier with no review. Plus and above need certification with 10 beta customers", stated: "Security assessment review 5 to 10 working days", reported: "Several months on the financial services path" },
  { provider: "Google, basic scopes", url: "https://support.google.com/cloud/answer/13463817", tier: "open", gate: "Brand verification only if you show a name and logo", stated: "Brand 2 to 3 business days", reported: "" },
  { provider: "Google, sensitive scopes", url: "https://support.google.com/cloud/answer/7454865", tier: "reviewed", gate: "Scope verification. Unverified apps show a warning and cap at 100 users", stated: "10 business days", reported: "5 to 8 weeks or more in 2026 threads" },
  { provider: "Google, restricted scopes", url: "https://support.google.com/cloud/answer/13465431", tier: "gated", gate: "Scope verification plus an annual CASA assessment by a paid assessor", stated: "6 weeks", reported: "Assessor USD 540 to 1,800, 5 to 20 days plus a week" },
  { provider: "QuickBooks Online", url: "https://blogs.a.intuit.com/?p=33153", tier: "reviewed", gate: "Production keys only after app details and an assessment questionnaire are approved", stated: "Questionnaire 30 minutes, security review up to 10 business days", reported: "1 to 3 months for an App Store listing" },
  { provider: "Shopify", url: "https://shopify.dev/docs/apps/launch/distribution", tier: "reviewed", gate: "Public distribution needs App Store review even for unlisted apps. Distribution is chosen forever", stated: "None stated", reported: "5 to 10 business days (2023), 4 to 8 weeks before a reviewer is assigned (2026)" },
  { provider: "Stripe Apps", url: "https://docs.stripe.com/stripe-apps/publish-app", tier: "reviewed", gate: "The public OAuth install link works only after review and publication", stated: "Decision within 4 business days", reported: "" },
  { provider: "Zoom", url: "https://developers.zoom.us/docs/build-flow/publish/", tier: "reviewed", gate: "External Zoom users require Marketplace review. A beta link reaches 10 or 100 users for 4 weeks", stated: "Varies, none stated", reported: "72 hours plus 2 weeks security (staff, 2024), 7 weeks or more in threads" },
  { provider: "Canva", url: "https://www.canva.dev/docs/connect/submission-checklist/", tier: "reviewed", gate: "Public integrations need review before anyone outside your team authorizes", stated: "None stated", reported: "1 to 4 months in late 2024" },
  { provider: "Meta, Facebook Login and Instagram", url: "https://developers.facebook.com/docs/graph-api/overview/access-levels", tier: "gated", gate: "App Review per permission plus Business Verification for advanced access", stated: "App Review within a week", reported: "17 to 20 days by May 2026. Business Verification minutes to 14 days" },
  { provider: "LinkedIn", url: "https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access", tier: "gated", gate: "Partner tiers. Only Sign In and Share are open. A rejected app cannot reapply", stated: "None published", reported: "3 to 6 weeks per review, months for Marketing and Talent" },
  { provider: "Spotify", url: "https://developer.spotify.com/documentation/web-api/concepts/quota-modes", tier: "gated", gate: "Extended quota mode needs an organization with a launched service and 250k monthly users", stated: "Up to 6 weeks", reported: "No replies for small apps" },
  { provider: "Salesforce", url: "https://trailhead.salesforce.com/content/learn/modules/external-client-app-basics/use-external-client-apps-when-connected-apps-wont-do", tier: "gated", gate: "External Client Apps work in one org unless packaged and installed per customer org", stated: "Security review 4 to 5 weeks, USD 999 per attempt for paid solutions", reported: "Reviewers ask OAuth only tools to package anyway" },
];

const DECISIONS = [
  ["Readiness card first, steps second", "Every guide opens with a card: tier, effort, calendar wait, what gates production, the artifacts, one next action. The card is what gets shared. The steps are below it for when you start."],
  ["Tiers name what gates production", "Open, Capped, Reviewed, Gated. A star rating hides the thing that matters: who decides and when."],
  ["Scopes decide the tier", "The same Google app is Open with basic scopes, Reviewed with sensitive scopes and Gated with restricted scopes. A guide that ignores scopes gives the wrong tier to most readers, so the guide asks first."],
  ["Two time figures, never one", "Hands on effort is a rule based estimate and is labelled as such. Calendar wait comes only from quoted duration claims. A single number invites a false plan."],
  ["Every claim carries its evidence", "Tested, Documented, Reported, Unverified. Documented needs a verbatim quote found on an official domain. The model proposes; code verifies."],
  ["The agent split is decided by rule", "Account creation, sign in, terms, payment, identity or business documents, CAPTCHAs and submit buttons are always Only you. The rule is fixed in code, not left to the model."],
  ["Managed auth is step zero", "If Composio manages an app for the toolkit, the guide says to start there. The cheapest OAuth app is the one you do not build."],
  ["One pipeline for library and live guides", "Library files hold facts a person checked; the same rules derive the rest at read time. Two pipelines would drift."],
  ["Guides carry a verified on date", "Provider rules moved six times in the last eighteen months among the providers studied. Staleness detection is designed and is the first follow up."],
  ["Blocker playbooks are part of the guide", "Each names the symptom, the cause, the fix and the realistic wait, drawn from real rejection and cap behaviour."],
];

const STAGES = [
  ["Resolve", "The model, with web search, turns the query into a provider identity and 4 to 8 candidate pages. Apps with no OAuth and ambiguous names end here.", true],
  ["Collect", "Code fetches the pages in parallel through an SSRF guard: 8 pages at most, 12,000 characters each, 8 seconds a page.", false],
  ["Extract", "The model returns typed claims, each with a verbatim quote of 300 characters or fewer, plus scope classes, steps, playbooks and artifacts.", true],
  ["Verify spans", "Code keeps a claim only if its quote, normalized, is a substring of the fetched page. No span, no claim.", false],
  ["Probe", "Four checks that need no account: the discovery document, what an unregistered client sees at the authorize endpoint, whether the portal sits behind a login, whether the docs render.", false],
  ["Tier and estimate", "Pure functions assign the tier per scope class, the labels, the step owners, the wait ranges and the effort estimate.", false],
  ["Validate and persist", "Schema validation, then a Tigris bucket over the S3 API (a local folder in development), plus a run record with stage timings and the dropped claim count.", false],
] as const;

const TRADEOFFS = [
  ["Pipeline inside one streaming request", "Queue and worker with polling", "Runs pass 4 minutes, need to survive a closed tab, or exceed 5 concurrent"],
  ["Model fenced to resolve and extract", "An agent loop deciding tier and labels", "Never for tiering. A drafting pass for artifacts arrives in phase 2"],
  ["Verbatim span check", "Trust model citations, or a second model as judge", "Drop rate above 20 percent, then fuzzy matching with a shown score"],
  ["Guides in git plus an object bucket", "Postgres", "A correction queue, search over guides, or a reviewer workflow"],
  ["Composio API with a bundled fallback", "API only", "Never remove the fallback; regenerate the list on deploy"],
  ["Credential free probes live, walkthroughs recorded", "Browser agent with the developer's credentials", "Phase 3, as a separate service with explicit consent"],
  ["In memory rate limiting", "A hosted rate limiter", "Public launch"],
];

export default function How() {
  return (
    <div className="prose-basalt space-y-14">
      <div className="rise border-b border-hairline-strong pb-6">
        <h1 className="t-headline text-chalk">How we built this</h1>
        <p className="t-lede mt-4">
          The assignment: a developer building an agent needs their users to connect an app, and may first need an OAuth app approved by the provider. Help them see that path and make progress on it, as a library of guides plus live generation for any app. This page is the product thinking, the research, the architecture and the honest account of what was tested.
        </p>
      </div>

      <section>
        <h2 className="t-title text-chalk">The problem</h2>
        <p className="mt-4">A developer who needs their own OAuth app cannot tell, before starting, whether the work takes an hour or a month. Provider rules differ in kind, not degree: GitHub approves nothing, Google reviews scopes, Meta reviews the business, LinkedIn admits partners, and several providers let anyone register but cap production use until a review passes. The developer finds this out by reading scattered docs, clicking through an unfamiliar console and emailing the provider.</p>
        <p>The cost lands at launch. The team builds the agent, then discovers a four week verification, a paid security assessment, a user cap, or a scope the provider will not grant. The connection is the last step before users can use the agent, so every unexpected week here delays the whole launch.</p>
        <p>Three objects carry different names and the problem lives in the first one: the provider OAuth app (the registration the provider decides to approve), the developer integration (in Composio terms an auth config pointing at an app), and the user connections (one per end user). Managed auth removes the first layer where Composio has registered its own app. Neither Composio page covers provider approval. That gap is this product.</p>
      </section>

      <section>
        <h2 className="t-title text-chalk">What the research found</h2>
        <p className="mt-4">Across 21 providers the gate on production use falls into four patterns, and the wait for a review is the least documented fact of all. Roughly half the providers publish a duration, and where developers also report one it runs two to six times the provider&apos;s figure. Official pages were retrieved on 19 and 20 October 2026; the provider cell links to the page each row rests on.</p>
        <div className="mt-6 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Tier</th>
                <th>What gates production</th>
                <th>Provider&apos;s wait figure</th>
                <th>Developers report</th>
              </tr>
            </thead>
            <tbody>
              {FINDINGS.map((r) => (
                <tr key={r.provider}>
                  <td className="whitespace-nowrap">
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.provider}
                    </a>
                  </td>
                  <td>
                    <TierChip tier={r.tier} />
                  </td>
                  <td>{r.gate}</td>
                  <td>{r.stated}</td>
                  <td>{r.reported}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="t-title-sm mt-10 text-chalk">Patterns the guide design rests on</h3>
        <ol className="mt-4 list-decimal pl-5">
          <li>Caps are the most common gate, and a cap is good news. Dropbox 50 users, HubSpot 25 installs, Discord 100 servers, Strava 10 athletes, Spotify 5 users, Stripe 25 testers, Google 100 users on sensitive scopes. You can ship a beta today and schedule the review for the date you expect to hit the cap, so the next action is a date, not a wait.</li>
          <li>Scopes change the tier on the same provider. Google moves from Open to Gated by scope alone; Discord adds a review at 10,000 users for privileged intents; Shopify gates protected customer data separately.</li>
          <li>A legal entity is now a prerequisite on many of the harder providers: Meta since 2023, Atlassian since June 2025, Spotify since May 2025, Discord identity checks, Microsoft Partner Center documents, LinkedIn legal name and address. A solo developer stops here, and the guide says so early.</li>
          <li>Money appears in three forms: paid developer tiers (Xero, X credits, a Strava subscription), paid assessments (Google CASA, Salesforce USD 999 per attempt) and revenue share (Shopify 15 percent above USD 1M lifetime).</li>
          <li>Some choices are permanent at creation: Shopify distribution, Canva public or private, Notion install scope. The guide warns before the first click.</li>
          <li>The rules move on a scale of months. Slack throttled unlisted apps in May 2025, Spotify restricted development mode in February 2026, Xero repriced in March 2026, HubSpot capped installs in September 2025 and closed legacy apps in June 2026, Salesforce restricted connected apps in Spring 26, Strava rewrote its agreement in June 2026. Guides carry a verified on date because of this.</li>
          <li>Provider figures are upper bounds or aspirations, not forecasts. Where developers report in 2026, the reported wait exceeds the provider&apos;s figure every time we found both. The guide shows both numbers with their labels and plans on the reported one.</li>
        </ol>
        <h3 className="t-title-sm mt-10 text-chalk">What the research corrected</h3>
        <ul className="mt-4 list-disc pl-5">
          <li>Notion. We assumed approval precedes external use. Current docs attach review to Marketplace listing and vendor guides show immediate OAuth after toggling public. Marked Unverified until a probe settles it.</li>
          <li>Discord. The often quoted 75 server application threshold comes from a 2020 post. The current verification article states only the 100 server cap.</li>
          <li>Xero. The 25 connection cap for uncertified apps that third party guides repeat no longer appears on the pricing or FAQ pages, which show a paid tier ladder from 2 March 2026.</li>
          <li>Meta Business Verification timing and X Enterprise review timing could not be fetched from official pages; they rest on third party sources or stay Unverified.</li>
          <li>Intuit&apos;s go live pages and Xero&apos;s OAuth limits page render with JavaScript and did not fetch. Those rows lean on a 2022 Intuit post and integration vendor docs, and say so.</li>
        </ul>
      </section>

      <section>
        <h2 className="t-title text-chalk">Product decisions</h2>
        <ol className="ledger mt-5 border-t border-hairline-strong !max-w-none">
          {DECISIONS.map(([title, body], i) => (
            <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-x-3 py-4">
              <span className="t-mono pt-1 text-chalk-faint">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="text-[16px] font-medium text-chalk">{title}</div>
                <p className="mt-1 text-sm">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="t-title text-chalk">How a guide is made</h2>
        <p className="mt-4">One Next.js app. Library guides live in the repo as facts a person checked. Live guides come from a single streaming request that runs seven stages. The model writes facts in exactly two of them; everything that decides what the reader sees is code with unit tests.</p>
        <ol className="ledger mt-5 border-t border-hairline-strong !max-w-none">
          {STAGES.map(([name, body, model], i) => (
            <li key={name} className="grid grid-cols-[2.5rem_11rem_1fr] gap-x-3 py-4">
              <span className="t-mono pt-1 text-chalk-faint">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="text-[16px] font-medium text-chalk">{name}</div>
                <div className="t-mono mt-1 text-chalk-faint">{model ? "model" : "code"}</div>
              </div>
              <p className="text-sm">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6">The rule boundary is fixed in code and shown in every guide as Only you: account creation and login, terms and policy acceptance, payment, identity or business documents, CAPTCHAs, and pressing submit on any review form. The agent prepares every input for those steps and names the one you press.</p>
      </section>

      <section>
        <h2 className="t-title text-chalk">Evidence policy</h2>
        <ul className="ledger mt-5 border-t border-hairline-strong !max-w-none">
          <li className="grid grid-cols-[9rem_1fr] gap-x-4 py-3">
            <LabelChip label="tested" />
            <span>A probe or a recorded walkthrough saw it. Backed by a recorded response or screen, with the date.</span>
          </li>
          <li className="grid grid-cols-[9rem_1fr] gap-x-4 py-3">
            <LabelChip label="documented" host="provider" />
            <span>The provider&apos;s own page states it. Backed by the URL, the retrieval date and the verbatim span, found on the page by code.</span>
          </li>
          <li className="grid grid-cols-[9rem_1fr] gap-x-4 py-3">
            <LabelChip label="reported" />
            <span>A developer or community source states it and the provider page does not.</span>
          </li>
          <li className="grid grid-cols-[9rem_1fr] gap-x-4 py-3">
            <LabelChip label="unverified" />
            <span>We looked and could not confirm it. Dropped in generated guides; kept in a library guide only when a reviewer adds it with a note.</span>
          </li>
        </ul>
        <ul className="mt-5 list-disc pl-5">
          <li>Time ranges inherit the weakest label among their sources, and a reported figure that exceeds the documented one is shown beside it.</li>
          <li>A reported claim never upgrades itself. Only a new probe or a provider page moves it.</li>
          <li>No claim is generated from the model&apos;s memory. If a page cannot be fetched, the guide shows the gap in place and names the page that would fill it.</li>
        </ul>
      </section>

      <section>
        <h2 className="t-title text-chalk">What was tested, corrected, and left unverified</h2>
        <p className="mt-4">Each library guide carries a verification note on its page. Across the six: 167 claims, each resting on a verbatim quote or a probe; a second pass re-checked 14 quotes against their pages and found all 14. Probes ran where providers allow automated fetching; facebook.com, zoom.us, slack.com and app.hubspot.com disallow fetching of their authorize endpoints, and those guides say so in their gaps. No walkthrough with a real account has been recorded yet; the registration screens come from the docs and are labelled Documented, not Tested.</p>
        <p>Corrections from the first research pass that made it into the guides: HubSpot is Capped, not Open, since the 25 install limit of September 2025; Slack does not review unlisted apps; Google&apos;s 100 user cap does not reset; Zoom&apos;s beta caps are per application kind; Meta&apos;s stated review time is quoted beside the 2026 reports rather than replaced by them.</p>
      </section>

      <section>
        <h2 className="t-title text-chalk">Shortcuts and their exit signals</h2>
        <p className="mt-4">Each row is a decision taken for speed, with the signal that ends it.</p>
        <div className="mt-5 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Decision</th>
                <th>Alternative not taken</th>
                <th>Revisit when</th>
              </tr>
            </thead>
            <tbody>
              {TRADEOFFS.map(([a, b, c]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td>{b}</td>
                  <td>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="t-title text-chalk">Limitations</h2>
        <ul className="mt-4 list-disc pl-5">
          <li>Live generation runs inside one serverless request. A run past the hard stop fails with a partial guide; a closed tab ends the run.</li>
          <li>Pages that render with JavaScript or block fetchers yield no documented claims. The guide shows the gap and names the page.</li>
          <li>The span check is a normalized substring match. Quotes broken by rendering are dropped, which is visible as the dropped count.</li>
          <li>Rate limiting is in memory and per instance: 10 runs per address per hour, 5 concurrent.</li>
          <li>The bundled managed auth list covers 21 toolkits read by hand on 20 October 2026. A Composio key gives a live answer.</li>
          <li>Hands on effort is an estimate by rule and is labelled as such. It is not a measured figure.</li>
          <li>Provider rules change monthly. Guides carry a verified on date; staleness detection is designed but not built.</li>
        </ul>
      </section>
    </div>
  );
}
