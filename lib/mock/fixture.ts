import type { Deps } from "../pipeline/run";
import type { ResolveResult } from "../pipeline/events";
import type { CollectedPage } from "../pipeline/collect";
import { ExtractionOutput, Source } from "../schema";
import { sha256 } from "../text";
import { CUSTOM_APP_REASONS } from "../managedAuth";

/**
 * Fixture for GUIDES_MOCK=1. The page text below is made of short verbatim
 * excerpts retrieved from docs.dropboxapi.com on 2026-10-20, joined with
 * plain connective text, so the span check and the rules run on real words
 * without any network or model call. It is a demo of the pipeline, not a
 * reviewed guide.
 */

const RETRIEVED = "2026-10-20T13:40:00.000Z";

const PAGE_TEXT = `Dropbox API developer guide (fixture excerpts, retrieved 2026-10-20)

Production approval
When you first create a Dropbox API app, it starts in development status. In development status it can only be linked with up to 500 total Dropbox users. Once your app has linked with 50 Dropbox users, you will have two weeks to apply for and receive production status approval. If you do not, your app's ability to link additional users will be frozen until you submit an application and are approved for production status.

Applying for production status
You can apply from your app's info page. Note that it will not be reviewed until your app has linked with at least 50 Dropbox users, unless you request an early review. If you feel there's a compelling reason for why your app should be reviewed ahead of time, explain it in the application. Before applying, follow our developer branding guidelines and the terms and conditions. Also note that once your app has production status, you can't change its name.

App permissions
During the production review we'll review that your app doesn't request an unnecessarily broad permission. Request the least privileged access you need. The Chooser, Saver and Embedder are pre-built components, and using them doesn't require production approval like other permissions do.

Privacy
Be sure to include a clear privacy policy that's specific to your app and describes how you handle user data.`;

const resolve: ResolveResult = {
  kind: "found",
  provider: {
    name: "Dropbox",
    domain: "dropbox.com",
    officialDomains: ["dropbox.com", "dropboxapi.com"],
    portalUrl: "https://www.dropbox.com/developers/apps",
    docsUrl: "https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide",
    oauthProducts: ["Dropbox API (OAuth 2)"],
    composioSlug: "dropbox",
  },
  authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
  candidateUrls: [
    { url: "https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide", why: "developer guide with production approval rules" },
    { url: "https://www.dropbox.com/developers/apps", why: "app console" },
  ],
};

const extraction: ExtractionOutput = {
  providerNotes: { oauthProducts: ["Dropbox API (OAuth 2)"] },
  scopeClasses: [{ id: "default", name: "All scopes", examples: ["files.content.read", "files.content.write"], description: "The gate does not depend on scopes. The review checks for unnecessarily broad permissions." }],
  claims: [
    { id: "c1", text: "A development status app can link up to 500 Dropbox users in total.", kind: "tester_limit", sourceId: "src-1", quote: "it can only be linked with up to 500 total Dropbox users.", value: { limit: 500, unit: "users" } },
    { id: "c2", text: "Once 50 users have linked, you have two weeks to apply for and receive production approval or new linking is frozen.", kind: "cap", sourceId: "src-1", quote: "you will have two weeks to apply for and receive production status approval", value: { limit: 50, unit: "users", liftedBy: "production status approval" } },
    { id: "c3", text: "Applications are not reviewed until the app has linked at least 50 users, unless you request an early review.", kind: "fact", sourceId: "src-1", quote: "it will not be reviewed until your app has linked with at least 50 Dropbox users," },
    { id: "c4", text: "A frozen app only unfreezes by submitting an application and getting production approval.", kind: "rejection_reason", sourceId: "src-1", quote: "will be frozen until you submit an application and are approved for production status." },
    { id: "c5", text: "The app name cannot be changed after production approval.", kind: "permanent_choice", sourceId: "src-1", quote: "once your app has production status, you can't change its name." },
    { id: "c6", text: "An app specific privacy policy is required.", kind: "requirement", sourceId: "src-1", quote: "Be sure to include a clear privacy policy that's specific to your app", value: { artifact: "privacy_policy" } },
    { id: "c7", text: "The app must follow the developer branding guidelines before applying.", kind: "requirement", sourceId: "src-1", quote: "follow our developer branding guidelines", value: { artifact: "other" } },
    { id: "c8", text: "An early review can be requested with a compelling reason.", kind: "fact", sourceId: "src-1", quote: "If you feel there's a compelling reason for why your app should be reviewed ahead of time" },
    { id: "c9", text: "The production review checks that the app does not request an unnecessarily broad permission.", kind: "rejection_reason", sourceId: "src-1", quote: "we'll review that your app doesn't request an unnecessarily broad permission" },
    { id: "c10", text: "The Chooser, Saver and Embedder components need no production approval.", kind: "fact", sourceId: "src-1", quote: "using them doesn't require production approval like other permissions do." },
    { id: "c11", text: "This claim has a quote that is not on the page and must be dropped by the span check.", kind: "fact", sourceId: "src-1", quote: "approval is granted within 24 hours of applying for production status" },
  ],
  steps: [
    { title: "Sign in to Dropbox and open the App Console", proposedOwner: "only_you", inputs: ["A Dropbox account"], url: "https://www.dropbox.com/developers/apps", claimIds: [] },
    { title: "Create the app, choosing scoped access and the narrowest access type", detail: "Pick App folder unless you need the user's whole Dropbox.", proposedOwner: "agent", inputs: ["App name (permanent after approval)", "Access type"], claimIds: ["c5", "c9"] },
    { title: "Select the least privileged permissions and add your redirect URIs", proposedOwner: "agent", inputs: ["Redirect URI list"], claimIds: ["c9"] },
    { title: "Publish an app specific privacy policy and check the branding guidelines", proposedOwner: "agent", inputs: ["Privacy policy URL", "App icon"], claimIds: ["c6", "c7"] },
    { title: "Add your first testers and ship to up to 500 users in development status", proposedOwner: "agent", inputs: ["Tester emails"], claimIds: ["c1"] },
    { title: "Submit the production status application once 50 users have linked", detail: "Describe how the app uses the API and attach the icon. The clock is two weeks from the 50th user.", proposedOwner: "agent_prepares", inputs: ["API usage description", "App icon"], claimIds: ["c2", "c3"] },
  ],
  playbooks: [
    { symptom: "New users cannot link and the console shows the app as frozen.", cause: "The app passed 50 linked users without production approval within two weeks.", fix: "Submit the production application. Unlinking users does not unfreeze the app.", claimIds: ["c2", "c4"] },
    { symptom: "The application was rejected for permissions.", cause: "The app requests broader access than it uses.", fix: "Switch to App folder access or drop unused scopes and reapply.", claimIds: ["c9"] },
  ],
  artifacts: [
    { name: "App specific privacy policy", form: "A public URL describing how the app handles user data", kind: "privacy_policy", claimIds: ["c6"] },
    { name: "App icon and API usage description", form: "Fields on the production application", kind: "listing_assets", claimIds: ["c2"] },
  ],
};

export function mockDeps(): Deps {
  return {
    resolve: async () => resolve,
    collect: async (candidates, officialDomains, emit) => {
      void officialDomains;
      const pages: CollectedPage[] = candidates.map((c, i) => {
        const fetched = i === 0;
        const source: Source = {
          id: `src-${i + 1}`,
          url: c.url,
          host: new URL(c.url).hostname,
          official: true,
          title: fetched ? "Developer guide (fixture excerpts)" : "App Console",
          retrievedAt: RETRIEVED,
          status: fetched ? "fetched" : "blocked",
          textHash: fetched ? sha256(PAGE_TEXT) : undefined,
          chars: fetched ? PAGE_TEXT.length : 0,
        };
        emit({ type: "source", source });
        return { source, text: fetched ? PAGE_TEXT : "" };
      });
      await sleep(600);
      return pages;
    },
    extract: async () => {
      await sleep(1200);
      return { output: extraction, usage: { input: 0, output: 0 } };
    },
    probes: async (t) => {
      await sleep(400);
      const ranAt = new Date().toISOString();
      return [
        {
          probe: { id: "probe-discovery", kind: "discovery", target: `https://${t.domain}/.well-known/openid-configuration`, ok: true, summary: "Mock: no discovery document checked, network is off in mock mode.", result: { mock: true }, ranAt },
        },
        {
          probe: { id: "probe-portal", kind: "portal_login_wall", target: t.portalUrl, ok: true, summary: "Mock: the portal probe did not run, network is off in mock mode.", result: { mock: true }, ranAt },
        },
        {
          probe: { id: "probe-docs", kind: "docs_reachability", target: t.docsUrl, ok: true, summary: "Mock: the docs probe did not run, network is off in mock mode.", result: { mock: true }, ranAt },
        },
        {
          probe: { id: "probe-authorize", kind: "authorize", target: t.authorizeUrl ?? "", ok: false, summary: "Mock: the authorize probe did not run, network is off in mock mode.", result: { mock: true }, ranAt },
        },
      ];
    },
    managedAuth: async () => ({ managed: true, schemes: ["OAUTH2"], source: "cache", checkedAt: "2026-10-20", customAppReasons: CUSTOM_APP_REASONS, note: "mock fixture" }),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
