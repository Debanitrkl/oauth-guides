import { generateObject } from "ai";
import { ExtractionOutput, Provider } from "../schema";
import { CollectedPage } from "./collect";
import { anthropic, ModelAuth, modelId } from "./model";

const SYSTEM = `You extract facts about registering a third party OAuth app with a provider and getting it approved for production use by external users. You read page texts and return structured claims.

Hard rules:
1. Every claim needs a verbatim quote copied exactly from one page text (up to 300 characters, no paraphrase, no ellipsis). A claim without an exact quote will be dropped, so do not invent.
2. Claim kinds and their value fields:
   - gate: something that stands between registration and production use by external users. value.gateType is one of review (a mandatory provider review before external users can connect), partner_program, business_verification, identity_verification, paid_assessment, legal_entity. Use gateType none for a statement that external users can connect with no review or approval (for example "any user can install a public app"); that statement is evidence for the Open tier.
   - cap: a numeric limit on production use that a review or payment lifts. value.limit (number), value.unit (users, installs, servers, connections, athletes, workspaces), value.liftedBy.
   - duration: a stated wait for any review or verification. value.lowDays and value.highDays in calendar days (business days times 1.4, weeks times 7, months times 30), value.stage naming what the wait is for.
   - requirement: an artifact the developer must supply. value.artifact is one of privacy_policy, terms_of_service, homepage, domain_verification, demo_video, scope_justification, security_questionnaire, security_assessment, business_documents, identity_document, test_credentials, listing_assets, support_contact, other.
   - cost: money the developer pays (fees, assessments, paid tiers, revenue share). value.amount as text.
   - permanent_choice: a decision fixed at app creation.
   - rejection_reason: a stated reason apps are rejected or delayed.
   - limit_after: a limit that applies to unreviewed apps or after approval (rate limits, renewals). value.throttled true when unreviewed apps get a lower rate than reviewed ones.
   - tester_limit: how many test users or testers an unreviewed app may have. value.limit, value.unit.
   - fact: anything else a developer must know.
3. scopeClasses: 1 to 4 classes of permissions that change the gate (for example basic profile vs sensitive data vs restricted data). If the gate does not depend on scopes, return one class with id "default". Set scopeClassId on a claim only when it applies to one class; omit it when it applies to all.
4. steps: the ordered setup steps from account to production, 5 to 14 of them, each with the inputs the developer needs ready, the provider URL when the page gives one, and the claim ids that support it. proposedOwner: only_you for account creation, sign in, accepting terms, payment, identity or business documents, pressing submit; agent_prepares for forms and written material the agent drafts and the developer submits; agent for research and drafting.
5. playbooks: 2 to 6 blocked states, each with the symptom the developer sees, the cause, the fix, and claim ids.
6. artifacts: every artifact the provider demands, with the form it must take.
7. Prefer official pages for gates and durations. Community pages are for reported timelines and rejection stories; mark nothing as official yourself, the code decides from the host.
8. providerNotes.noOAuthReason only if the pages show the provider has no OAuth for third party apps.
Use claim ids c1, c2, c3 and so on.`;

export async function extract(provider: Provider, pages: CollectedPage[], signal?: AbortSignal, halve = false, auth?: ModelAuth): Promise<{ output: ExtractionOutput; usage?: { input: number; output: number } }> {
  const usable = pages.filter((p) => p.source.status === "fetched" && p.text);
  const budget = halve ? 6000 : 12000;
  const body = usable
    .map((p) => `### SOURCE ${p.source.id} | ${p.source.official ? "official" : "community"} | ${p.source.url}\n${p.text.slice(0, budget)}`)
    .join("\n\n");
  const model = anthropic(auth)(modelId());
  const res = await generateObject({
    model,
    schema: ExtractionOutput,
    system: SYSTEM,
    prompt: `Provider: ${provider.name} (${provider.domain}). Developer portal: ${provider.portalUrl}. OAuth products: ${provider.oauthProducts.join(", ") || "unknown"}.\n\nPages:\n\n${body}`,
    abortSignal: signal,
    maxOutputTokens: 12000,
  });
  return {
    output: res.object,
    usage: res.usage ? { input: res.usage.inputTokens ?? 0, output: res.usage.outputTokens ?? 0 } : undefined,
  };
}
