# OAuth App Setup Guides

Before a developer builds an OAuth app with a provider, this tells them how hard it is to get that app production ready, how long the wait is, what the provider demands, and which steps an agent can do for them. Six providers are covered by reviewed guides. Any other app can be submitted by name or website, and an agent generates a guide live, with every claim labelled by its evidence.

## Run it locally

```bash
git clone <this repo> && cd oauth-guides
npm install
cp .env.example .env.local        # then put your ANTHROPIC_API_KEY in it
npm run dev                       # http://localhost:3000
```

Without a key, `GUIDES_MOCK=1 npm run dev` runs the generation pipeline from a fixture (short verbatim excerpts of Dropbox's developer guide) so the stream, the span check and the page all work offline.

Environment variables (all optional except the first for live generation):

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Live generation. Two model calls per run: resolve and extract. |
| `GUIDES_MODEL` | Model id, default `claude-sonnet-5-5`. Set it if your key lacks that model. |
| `COMPOSIO_API_KEY` | Live managed auth check against `GET /api/v3.1/toolkits/{slug}`. Without it the bundled `data/managed-auth.json` answers. |
| `BLOB_READ_WRITE_TOKEN` | Store generated guides in Vercel Blob. Without it they go to `.data/` next to the app. |
| `GUIDES_MOCK=1` | Run the pipeline from the fixture, no network, no model. |

Other commands: `npm test` (rules, span check, SSRF guard), `npm run check:guides` (validate the six library guides through the same rules the live path uses), `npm run run:live "<app>"` (the pipeline from the command line with the same events the page shows), `npm run run:mock`, `npm run build`, `npm run regen:managed-auth` (refresh the bundled list from Composio's API). On a Mac, `start.command` and `stop.command` are double click launchers.

A reviewer without server access can paste their own Anthropic key on the generate page ("Use your own Anthropic key"). It travels as a request header for that browser's runs, is used for the two model calls, and is never logged or stored by the server; it is remembered only in that browser if the box is ticked. `/api/health` reports mode, whether a server key is configured, the model id and the store, and never returns secrets.

## Deploy to Vercel

Import the repo, set `ANTHROPIC_API_KEY`, add a Blob store (gives `BLOB_READ_WRITE_TOKEN`), deploy. `app/api/generate/route.ts` sets `maxDuration = 300`; confirm your plan allows it. The pipeline budgets 180 seconds and hard stops at 280.

## What a reviewer should try

1. Open a library guide, for example `/g/google-gmail`. Switch the scope class and watch the tier, wait and next action change.
2. Open `/generate?q=` with an app we did not prepare. First findings arrive in seconds, the full guide in about two minutes. The progress panel shows every page fetched, every probe, and how many proposed claims were dropped because their quote was not on the page.
3. Open any claim's Evidence and check the quote against the linked page on the retrieval date.
4. Export a guide as markdown from the button or `/g/<slug>/markdown`.

## Design

The interface uses the Basalt & Flare system: a warm near black base, chalk ink, one flare orange reserved for the survey line and links, Bricolage Grotesque for display, Schibsted Grotesk for reading, Fragment Mono for metadata. Tokens live in `app/globals.css`; meaning in chips is carried by weight and line (solid, hairline, dashed, faint), never by a second hue. `/how` is the build story: the problem, the 21 provider research table, the product decisions, the pipeline, the evidence policy, what was tested and left unverified, and the one day trade-offs, with links to the PRD and the system design.

## How it works

One Next.js app. Library guides live in `guides/*.json` as facts a person checked. Live guides come from `POST /api/generate`, which streams typed events while seven stages run inside the request:

1. Resolve: the model, with web search, turns the query into a provider identity and 4 to 8 candidate pages. Ambiguous names and apps with no OAuth end here.
2. Collect: code fetches the pages in parallel through an SSRF guard, 8 pages at most, 12k characters each.
3. Extract: the model returns typed claims, each with a verbatim quote of 300 characters or fewer, plus scope classes, steps, playbooks and artifacts.
4. Verify spans: code keeps a claim only if its quote, normalized, is a substring of the fetched page. No span, no claim.
5. Probe: four checks that need no account, run beside collect and extract: the OpenID discovery document, what an unregistered client sees at the authorize endpoint, whether the developer portal sits behind a login, whether the docs render.
6. Tier and estimate: pure functions in `lib/rules.ts` assign the tier per scope class, the evidence labels, the step owners, the wait ranges and the effort estimate.
7. Validate and persist: Zod validation, then Blob or `.data/`.

The model writes facts in exactly two stages. Everything that decides what the reader sees is code with unit tests.

## Key decisions

1. A guide is a readiness card with one next action, not a tutorial. The provider's docs stay the tutorial.
2. Tiers name what gates production: Open, Capped, Reviewed, Gated. A star rating hides who decides and when.
3. Scopes pick the tier, so guides with scope dependent gates ask for the scope class first. Google is Open, Reviewed or Gated depending on the scope.
4. Two time figures, never one: hands on effort (a rule based estimate, labelled as such) and calendar wait (only from quoted duration claims, never guessed).
5. Every claim carries Tested, Documented, Reported or Unverified. Documented requires a verbatim quote found on an official domain; the model proposes, code verifies.
6. Step owners come from a rule in code: account creation, sign in, terms, payment, identity or business documents, CAPTCHAs and submit buttons are always Only you.
7. Managed auth is step zero. If Composio manages an app for the toolkit, the guide says to start there.
8. One pipeline produces library and live guides. Library files hold facts; the same rules derive the rest at read time.
9. Credential free probes run live. Walkthroughs with real accounts are recorded, never automated.
10. Shortcuts for a one day build, each with its exit signal: pipeline inside one request (move to a queue past 4 minutes), guides in git and Blob (Postgres when a correction queue arrives), in memory rate limits (Upstash at launch).

## What was tested, corrected, and left unverified

Each library guide carries a verification note on its page. In short:

- Tested: the probes that could run against each provider on 2026-10-20. Several providers (facebook.com, zoom.us, slack.com, app.hubspot.com) disallow automated fetching of their authorize endpoints, and each guide says so in its gaps. A second pass re-checked 14 quotes across the six guides against their pages and found all 14.
- Corrected against sources: facts from the first research pass that the provider's current pages contradict. Notable ones: Notion's review attaches to Marketplace listing, not to external OAuth use; Discord's often quoted 75 server threshold is from a 2020 post and the current article states only the 100 server cap; Xero's 25 connection cap for uncertified apps no longer appears on its pricing or FAQ pages, which now show a paid tier ladder from March 2026.
- Unverified: official durations for Meta Business Verification and Zoom review (the providers publish none), Intuit's go live pages and Xero's limits page (JavaScript rendered, did not fetch), and every wait figure that rests on developer reports rather than provider pages. Guides say so inline.

## Limitations

- Live generation runs inside one serverless request. A run past the hard stop fails with a partial guide; a closed tab ends the run.
- Pages that render with JavaScript or block fetchers yield no documented claims. The guide shows the gap and names the page.
- The span check is a normalized substring match. Quotes broken by rendering are dropped, which is visible as the dropped count. Fuzzy matching with a shown score is the planned fix once the drop rate is measured.
- Rate limiting is in memory and per instance: 10 runs per address per hour, 5 concurrent.
- The bundled managed auth list covers 21 toolkits read by hand on 2026-10-20. Set `COMPOSIO_API_KEY` for a live answer.
- Hands on effort is an estimate by rule and is labelled as such on the card. It is not a measured figure.
- Provider rules change monthly. Library guides carry a verified on date; staleness detection is designed but not built.

## The rule boundary

The agent never creates accounts, signs in, accepts terms, pays, uploads identity or business documents, solves CAPTCHAs, or presses submit on a review. Those steps are marked Only you in every guide. The agent reads docs, runs probes, drafts the written material, and prepares forms.

## Layout

```
app/              pages and routes (/, /g/[slug], /g/[slug]/markdown, /generate, /about, /how, /api/*)
components/       GuideView, GenerateStream, chips
lib/schema.ts     Zod types: GuideInput (facts), Guide (facts + derived), ExtractionOutput
lib/rules.ts      tier, labels, owners, wait ranges, effort, next action, validation
lib/pipeline/     resolve, collect, extract, verify, run, events
lib/probes.ts     the four credential free probes
lib/net.ts        SSRF guard and page fetcher
lib/store.ts      Blob or .data persistence, run records
lib/library.ts    loads guides/*.json and attempts/*.json through the rules
guides/           six reviewed guides as facts
attempts/         recorded walkthroughs
data/             bundled managed auth list
tests/            vitest
```
