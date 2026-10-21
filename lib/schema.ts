import { z } from "zod";

export const Label = z.enum(["tested", "documented", "reported", "unverified"]);
export type Label = z.infer<typeof Label>;

export const Tier = z.enum(["open", "capped", "reviewed", "gated"]);
export type Tier = z.infer<typeof Tier>;

export const Owner = z.enum(["agent", "agent_prepares", "only_you"]);
export type Owner = z.infer<typeof Owner>;

export const Flag = z.enum(["paid", "throttled", "permanent_choice", "entity_required"]);
export type Flag = z.infer<typeof Flag>;

export const GateType = z.enum([
  "none",
  "review",
  "partner_program",
  "business_verification",
  "identity_verification",
  "paid_assessment",
  "legal_entity",
]);
export type GateType = z.infer<typeof GateType>;

export const ClaimKind = z.enum([
  "gate",
  "cap",
  "duration",
  "requirement",
  "cost",
  "permanent_choice",
  "rejection_reason",
  "limit_after",
  "tester_limit",
  "fact",
]);
export type ClaimKind = z.infer<typeof ClaimKind>;

export const ArtifactKind = z.enum([
  "privacy_policy",
  "terms_of_service",
  "homepage",
  "domain_verification",
  "demo_video",
  "scope_justification",
  "security_questionnaire",
  "security_assessment",
  "business_documents",
  "identity_document",
  "test_credentials",
  "listing_assets",
  "support_contact",
  "other",
]);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

export const ClaimValue = z
  .object({
    gateType: GateType.optional(),
    limit: z.number().optional(),
    unit: z.string().optional(),
    liftedBy: z.string().optional(),
    lowDays: z.number().optional(),
    highDays: z.number().optional(),
    stage: z.string().optional(),
    amount: z.string().optional(),
    artifact: ArtifactKind.optional(),
    throttled: z.boolean().optional(),
  })
  .partial();
export type ClaimValue = z.infer<typeof ClaimValue>;

export const Claim = z.object({
  id: z.string(),
  text: z.string(),
  kind: ClaimKind,
  label: Label,
  sourceId: z.string().optional(),
  quote: z.string().max(400).optional(),
  probeId: z.string().optional(),
  attemptId: z.string().optional(),
  scopeClassId: z.string().optional(),
  value: ClaimValue.optional(),
  reviewerNote: z.string().optional(),
});
export type Claim = z.infer<typeof Claim>;

export const SourceStatus = z.enum(["fetched", "blocked", "error", "empty", "hand_checked"]);

export const Source = z.object({
  id: z.string(),
  url: z.string(),
  host: z.string(),
  official: z.boolean(),
  title: z.string().optional(),
  retrievedAt: z.string(),
  status: SourceStatus,
  textHash: z.string().optional(),
  chars: z.number().optional(),
});
export type Source = z.infer<typeof Source>;

export const ProbeKind = z.enum(["discovery", "authorize", "portal_login_wall", "docs_reachability"]);
export type ProbeKind = z.infer<typeof ProbeKind>;

export const Probe = z.object({
  id: z.string(),
  kind: ProbeKind,
  target: z.string(),
  ok: z.boolean(),
  summary: z.string(),
  result: z.record(z.string(), z.unknown()),
  ranAt: z.string(),
});
export type Probe = z.infer<typeof Probe>;

export const Attempt = z.object({
  id: z.string(),
  title: z.string(),
  account: z.string(),
  recordedOn: z.string(),
  screens: z.array(
    z.object({
      n: z.number(),
      title: z.string(),
      fields: z.array(z.string()),
      note: z.string().optional(),
      stoppedAt: z.boolean().optional(),
    }),
  ),
});
export type Attempt = z.infer<typeof Attempt>;

export const ScopeClass = z.object({
  id: z.string(),
  name: z.string(),
  examples: z.array(z.string()),
  description: z.string().optional(),
});
export type ScopeClass = z.infer<typeof ScopeClass>;

export const Step = z.object({
  n: z.number(),
  title: z.string(),
  detail: z.string().optional(),
  owner: Owner,
  inputs: z.array(z.string()),
  url: z.string().optional(),
  claimIds: z.array(z.string()),
  scopeClassIds: z.array(z.string()).optional(),
  attemptId: z.string().optional(),
});
export type Step = z.infer<typeof Step>;

export const Playbook = z.object({
  symptom: z.string(),
  cause: z.string(),
  fix: z.string(),
  waitDays: z.number().optional(),
  claimIds: z.array(z.string()),
});
export type Playbook = z.infer<typeof Playbook>;

export const ArtifactReq = z.object({
  name: z.string(),
  form: z.string(),
  kind: ArtifactKind,
  claimIds: z.array(z.string()),
  scopeClassIds: z.array(z.string()).optional(),
});
export type ArtifactReq = z.infer<typeof ArtifactReq>;

export const Provider = z.object({
  name: z.string(),
  domain: z.string(),
  officialDomains: z.array(z.string()),
  portalUrl: z.string(),
  docsUrl: z.string(),
  oauthProducts: z.array(z.string()),
  variantNote: z.string().optional(),
  composioSlug: z.string().optional(),
});
export type Provider = z.infer<typeof Provider>;

export const ManagedAuth = z.object({
  managed: z.boolean().nullable(),
  schemes: z.array(z.string()),
  source: z.enum(["api", "cache", "unknown"]),
  checkedAt: z.string(),
  customAppReasons: z.array(z.string()),
  note: z.string().optional(),
});
export type ManagedAuth = z.infer<typeof ManagedAuth>;

export const VerificationNote = z.object({
  tested: z.array(z.string()),
  corrected: z.array(z.string()),
  unverified: z.array(z.string()),
});

/** The facts a pipeline run or a reviewer records. Rules derive the rest. */
export const GuideInput = z.object({
  slug: z.string(),
  schemaVersion: z.literal(1),
  provider: Provider,
  query: z.string().optional(),
  generatedAt: z.string(),
  verifiedOn: z.string(),
  reviewState: z.enum(["reviewed", "autogenerated"]),
  review: z
    .object({ reviewedBy: z.string(), reviewedOn: z.string(), corrections: z.array(z.string()) })
    .optional(),
  managedAuth: ManagedAuth,
  noOAuth: z.object({ reason: z.string() }).optional(),
  scopeClasses: z.array(ScopeClass),
  claims: z.array(Claim),
  sources: z.array(Source),
  probes: z.array(Probe),
  attempts: z.array(Attempt).optional(),
  steps: z.array(Step),
  playbooks: z.array(Playbook),
  artifacts: z.array(ArtifactReq),
  gaps: z.array(z.object({ what: z.string(), page: z.string() })),
  verificationNote: VerificationNote,
});
export type GuideInput = z.infer<typeof GuideInput>;

export const TierEntry = z.object({
  scopeClassId: z.string(),
  tier: Tier,
  gate: z.string(),
  flags: z.array(Flag),
  claimIds: z.array(z.string()),
});
export type TierEntry = z.infer<typeof TierEntry>;

export const WaitRange = z.object({
  scopeClassId: z.string(),
  lowDays: z.number().nullable(),
  highDays: z.number().nullable(),
  label: Label,
  reported: z.object({ lowDays: z.number(), highDays: z.number() }).optional(),
  claimIds: z.array(z.string()),
  note: z.string().optional(),
});
export type WaitRange = z.infer<typeof WaitRange>;

export const Effort = z.object({
  lowHours: z.number(),
  highHours: z.number(),
  inputs: z.array(z.string()),
});
export type Effort = z.infer<typeof Effort>;

export const Guide = GuideInput.extend({
  tiers: z.array(TierEntry),
  wait: z.array(WaitRange),
  effort: z.record(z.string(), Effort),
  cost: z.array(z.object({ text: z.string(), claimIds: z.array(z.string()), scopeClassId: z.string().optional() })),
  nextAction: z.record(z.string(), z.string()),
  stats: z.object({
    claims: z.number(),
    byLabel: z.record(z.string(), z.number()),
  }),
});
export type Guide = z.infer<typeof Guide>;

/** Shape the extraction model returns. Labels and derived fields are added by code. */
export const ExtractionOutput = z.object({
  providerNotes: z.object({
    oauthProducts: z.array(z.string()),
    variantNote: z.string().optional(),
    noOAuthReason: z.string().optional(),
  }),
  scopeClasses: z.array(ScopeClass).max(6),
  claims: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        kind: ClaimKind,
        sourceId: z.string(),
        quote: z.string().max(400),
        scopeClassId: z.string().optional(),
        value: ClaimValue.optional(),
      }),
    )
    .max(80),
  steps: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string().optional(),
        proposedOwner: Owner,
        inputs: z.array(z.string()),
        url: z.string().optional(),
        claimIds: z.array(z.string()),
        scopeClassIds: z.array(z.string()).optional(),
      }),
    )
    .max(20),
  playbooks: z.array(Playbook).max(8),
  artifacts: z.array(ArtifactReq).max(15),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutput>;
