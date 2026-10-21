import {
  ArtifactReq,
  Claim,
  Effort,
  Flag,
  GateType,
  Guide,
  GuideInput,
  Label,
  Owner,
  Source,
  Step,
  Tier,
  TierEntry,
  WaitRange,
} from "./schema";

/** Rules in code. Same facts in, same guide out. */

const GATED_TYPES: GateType[] = [
  "partner_program",
  "business_verification",
  "identity_verification",
  "paid_assessment",
  "legal_entity",
];

const LABEL_RANK: Record<Label, number> = { tested: 3, documented: 2, reported: 1, unverified: 0 };

export function weakest(labels: Label[]): Label {
  if (labels.length === 0) return "unverified";
  return labels.reduce((a, b) => (LABEL_RANK[b] < LABEL_RANK[a] ? b : a));
}

export function strongest(labels: Label[]): Label {
  if (labels.length === 0) return "unverified";
  return labels.reduce((a, b) => (LABEL_RANK[b] > LABEL_RANK[a] ? b : a));
}

/**
 * Label a claim from its provenance. A quote is trusted only when the caller
 * says so (library guides checked by hand) or when the verify stage already
 * confirmed it; the live pipeline passes verified ids.
 */
export function labelFor(
  claim: Omit<Claim, "label"> & { label?: Label },
  sourcesById: Map<string, Source>,
  opts: { trustQuotes: boolean; verifiedIds?: Set<string> },
): Label {
  if (claim.probeId || claim.attemptId) return "tested";
  if (claim.sourceId && claim.quote) {
    const src = sourcesById.get(claim.sourceId);
    if (!src) return "unverified";
    const ok = opts.trustQuotes || opts.verifiedIds?.has(claim.id);
    if (!ok) return "unverified";
    return src.official ? "documented" : "reported";
  }
  return "unverified";
}

function applies(claim: Claim, scopeClassId: string): boolean {
  return !claim.scopeClassId || claim.scopeClassId === "*" || claim.scopeClassId === scopeClassId;
}

export function tierFor(claims: Claim[], scopeClassId: string): TierEntry {
  const mine = claims.filter((c) => applies(c, scopeClassId) && c.label !== "unverified");
  const gates = mine.filter((c) => c.kind === "gate");
  const gated = gates.filter((c) => c.value?.gateType && GATED_TYPES.includes(c.value.gateType));
  const reviews = gates.filter((c) => c.value?.gateType === "review");
  const none = gates.filter((c) => c.value?.gateType === "none");
  const caps = mine.filter((c) => c.kind === "cap");

  let tier: Tier = "open";
  let chosen: Claim[] = none;
  if (gated.length) {
    tier = "gated";
    chosen = gated;
  } else if (reviews.length) {
    tier = "reviewed";
    chosen = reviews;
  } else if (caps.length) {
    tier = "capped";
    chosen = caps;
  }

  const flags = new Set<Flag>();
  if (mine.some((c) => c.kind === "cost")) flags.add("paid");
  if (mine.some((c) => c.kind === "limit_after" && c.value?.throttled)) flags.add("throttled");
  if (mine.some((c) => c.kind === "permanent_choice")) flags.add("permanent_choice");
  if (
    gates.some((c) => c.value?.gateType === "legal_entity" || c.value?.gateType === "business_verification") ||
    mine.some((c) => c.kind === "requirement" && c.value?.artifact === "business_documents")
  ) {
    flags.add("entity_required");
  }

  const gate =
    tier === "open"
      ? none.length
        ? `Nothing before external users can connect. ${none.map((c) => c.text).join(" ")}`
        : "Nothing found. No review, cap or verification appears in the sources, so external users can authorize the app once it is registered."
      : chosen.map((c) => c.text).join(" ");

  return {
    scopeClassId,
    tier,
    gate,
    flags: [...flags],
    claimIds: chosen.map((c) => c.id),
  };
}

export function waitFor(claims: Claim[], sourcesById: Map<string, Source>, scopeClassId: string, tier?: TierEntry): WaitRange {
  if (tier?.tier === "open") {
    const none = tier.claimIds.map((id) => claims.find((c) => c.id === id)).filter((c): c is Claim => !!c);
    return {
      scopeClassId,
      lowDays: 0,
      highDays: 0,
      label: none.length ? weakest(none.map((c) => c.label)) : "unverified",
      claimIds: none.map((c) => c.id),
      note: none.length
        ? "No provider review before external users connect. Optional listing reviews are described in the steps."
        : "No review found in the sources, but no page states that none is needed either.",
    };
  }
  const durations = claims.filter(
    (c) =>
      c.kind === "duration" &&
      applies(c, scopeClassId) &&
      c.label !== "unverified" &&
      typeof c.value?.highDays === "number",
  );
  const documented = durations.filter((c) => c.label === "documented" || c.label === "tested");
  const reported = durations.filter((c) => c.label === "reported");

  const range = (list: Claim[]) => ({
    lowDays: Math.min(...list.map((c) => c.value?.lowDays ?? c.value?.highDays ?? 0)),
    highDays: Math.max(...list.map((c) => c.value?.highDays ?? 0)),
  });

  if (documented.length) {
    const r = range(documented);
    const rep = reported.length ? range(reported) : undefined;
    return {
      scopeClassId,
      lowDays: r.lowDays,
      highDays: r.highDays,
      label: weakest(documented.map((c) => c.label)),
      reported: rep && rep.highDays > r.highDays ? rep : undefined,
      claimIds: durations.map((c) => c.id),
      note: rep && rep.highDays > r.highDays ? "Developers report longer waits than the provider states." : undefined,
    };
  }
  if (reported.length) {
    const r = range(reported);
    return {
      scopeClassId,
      lowDays: r.lowDays,
      highDays: r.highDays,
      label: "reported",
      claimIds: reported.map((c) => c.id),
      note: "The provider publishes no figure. This range comes from developer reports.",
    };
  }
  void sourcesById;
  return {
    scopeClassId,
    lowDays: null,
    highDays: null,
    label: "unverified",
    claimIds: [],
    note: "No published figure found.",
  };
}

export function effortFor(artifacts: ArtifactReq[]): Effort {
  let hours = 1;
  const inputs = ["1 hour to register the app and configure redirect URIs"];
  const kinds = new Set(artifacts.map((a) => a.kind));
  if (artifacts.length) {
    hours += 0.5 * artifacts.length;
    inputs.push(`0.5 hour for each of ${artifacts.length} required artifacts`);
  }
  if (kinds.has("demo_video")) {
    hours += 2;
    inputs.push("2 hours for a demo video or screencast");
  }
  if (kinds.has("security_questionnaire")) {
    hours += 1;
    inputs.push("1 hour for a security questionnaire");
  }
  if (kinds.has("security_assessment")) {
    hours += 4;
    inputs.push("4 hours of your time for an external security assessment, excluding the assessor's work");
  }
  if (kinds.has("business_documents")) {
    hours += 1;
    inputs.push("1 hour to gather business documents");
  }
  return {
    lowHours: round1(hours * 0.75),
    highHours: round1(hours * 1.5),
    inputs,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const ONLY_YOU =
  /\b(create|open|register)\b[^.]{0,40}\baccount\b|\bsign(ing)? (in|up)\b|\blog(ging)? ?in\b|\baccept(ing|s)? (the |your )?(terms|agreement|policies|developer agreement)|\bpay(ing|ment)?\b|\bsubscri(be|ption)|\bupload(ing)? (your |the )?(id|identity|business|tax|government|registration|documents?)\b|\bcaptcha\b|\bsubmit(ting)?\b[^.]{0,40}\b(review|form|application|verification|listing)\b|\bpress(ing)? submit\b|\bverify (your )?(identity|business)\b|\btwo.factor|\bmfa\b/i;

const AGENT_PREPARES =
  /\b(review|verification|listing|submission|questionnaire|assessment) (form|questions|answers|fields)|\bquestionnaire\b|\bapp review\b|\bjustif(y|ication)|\bprivacy policy\b|\bterms of service\b|\bdemo video\b|\bscreencast\b|\bscreen recording\b|\bvideo script\b|\blisting (text|copy|description|assets)|\bsupport (url|page|contact)|\bhomepage\b|\btest (credentials|instructions|plan)|\btechnical design/i;

export function ownerFor(step: { title: string; detail?: string }, proposed?: Owner): Owner {
  const text = `${step.title} ${step.detail ?? ""}`;
  if (ONLY_YOU.test(text)) return "only_you";
  if (AGENT_PREPARES.test(text)) return "agent_prepares";
  return proposed ?? "agent";
}

export function artifactsForScope(artifacts: ArtifactReq[], scopeClassId: string): ArtifactReq[] {
  return artifacts.filter((a) => !a.scopeClassIds || a.scopeClassIds.length === 0 || a.scopeClassIds.includes(scopeClassId));
}

export function nextActionFor(
  guide: Pick<GuideInput, "managedAuth" | "provider" | "noOAuth">,
  tier: TierEntry,
  wait: WaitRange,
  allArtifacts: ArtifactReq[],
  claims: Claim[],
): string {
  if (guide.noOAuth) return `Stop. ${guide.provider.name} does not offer OAuth for third party apps: ${guide.noOAuth.reason}`;
  const managedLine =
    guide.managedAuth.managed === true
      ? `Composio manages an OAuth app for ${guide.provider.name}, so start with managed auth and build your own app only for the reasons listed above. If you do need your own: `
      : "";
  const cap = claims.find((c) => c.kind === "cap" && c.label !== "unverified" && (!c.scopeClassId || c.scopeClassId === "*" || c.scopeClassId === tier.scopeClassId));
  const artifactCount = artifactsForScope(allArtifacts, tier.scopeClassId).length;
  const gateTypes = new Set(
    tier.claimIds
      .map((id) => claims.find((c) => c.id === id)?.value?.gateType)
      .filter((g): g is GateType => !!g),
  );
  const waitText =
    wait.highDays != null
      ? `plan ${wait.lowDays === wait.highDays ? `${wait.highDays}` : `${wait.lowDays} to ${wait.highDays}`} days of calendar wait${wait.reported ? `, or up to ${wait.reported.highDays} by developer reports` : ""}`
      : "no published wait figure exists, so plan for the review as an open ended step";
  switch (tier.tier) {
    case "open":
      return `${managedLine}Register the app at ${guide.provider.portalUrl} today. Nothing is reviewed before external users can connect${tier.flags.includes("throttled") ? ", but read the throttle step before you design polling" : ""}.`;
    case "capped":
      return `${managedLine}Register the app today and ship to your first ${cap?.value?.limit ?? "capped"} ${cap?.value?.unit ?? "users"}. Put the review on the calendar for the week you expect to approach that cap, and ${waitText}.`;
    case "reviewed":
      return `${managedLine}Gather the ${artifactCount} artifacts below before you register, then submit for review in the same sitting, and ${waitText}.`;
    case "gated": {
      const costs = claims.filter((c) => c.kind === "cost" && c.label !== "unverified" && (!c.scopeClassId || c.scopeClassId === tier.scopeClassId));
      if (gateTypes.has("partner_program")) {
        return `${managedLine}Apply to the partner program before you build anything else; without acceptance this provider is not reachable with your own app. If accepted, gather the ${artifactCount} artifacts, register, and ${waitText}.`;
      }
      if (gateTypes.has("business_verification") || gateTypes.has("legal_entity") || gateTypes.has("identity_verification")) {
        return `${managedLine}Confirm you have a registered business and its documents first; a solo developer stops here. Then gather the ${artifactCount} artifacts, register, and ${waitText}.`;
      }
      if (gateTypes.has("paid_assessment")) {
        return `${managedLine}Budget for the paid assessment${costs.length ? ` (${costs.map((c) => c.value?.amount ?? c.text).join("; ")})` : ""} and book the assessor early. Gather the ${artifactCount} artifacts, register, and ${waitText}.`;
      }
      return `${managedLine}Confirm you clear the gate first (${tier.gate}). If you do, gather the ${artifactCount} artifacts, register, and ${waitText}.`;
    }
  }
}

export function assemble(input: GuideInput, opts: { trustQuotes: boolean; verifiedIds?: Set<string> }): Guide {
  const sourcesById = new Map(input.sources.map((s) => [s.id, s]));
  const claims: Claim[] = input.claims.map((c) => ({
    ...c,
    label: labelFor(c, sourcesById, opts),
  }));
  const scopeIds = input.noOAuth ? [] : input.scopeClasses.length ? input.scopeClasses.map((s) => s.id) : ["default"];
  const tiers = scopeIds.map((id) => tierFor(claims, id));
  const wait = scopeIds.map((id, i) => waitFor(claims, sourcesById, id, tiers[i]));
  const steps: Step[] = input.steps.map((s, i) => ({
    ...s,
    n: i + 1,
    owner: ownerFor(s, s.owner),
  }));
  const cost = claims
    .filter((c) => c.kind === "cost" && c.label !== "unverified")
    .map((c) => ({ text: c.text, claimIds: [c.id], scopeClassId: c.scopeClassId && c.scopeClassId !== "*" ? c.scopeClassId : undefined }));
  const effort: Record<string, Effort> = {};
  const nextAction: Record<string, string> = {};
  scopeIds.forEach((id, i) => {
    effort[id] = effortFor(artifactsForScope(input.artifacts, id));
    nextAction[id] = nextActionFor(input, tiers[i], wait[i], input.artifacts, claims);
  });
  if (!scopeIds.length) effort.default = effortFor([]);
  const byLabel: Record<string, number> = { tested: 0, documented: 0, reported: 0, unverified: 0 };
  claims.forEach((c) => (byLabel[c.label] = (byLabel[c.label] ?? 0) + 1));
  return {
    ...input,
    claims,
    steps,
    tiers,
    wait,
    effort,
    cost,
    nextAction,
    stats: { claims: claims.length, byLabel },
  };
}

export function validateGuide(guide: Guide): string[] {
  const errors: string[] = [];
  const ids = new Set(guide.claims.map((c) => c.id));
  const check = (what: string, claimIds: string[]) => {
    for (const id of claimIds) if (!ids.has(id)) errors.push(`${what} cites missing claim ${id}`);
  };
  guide.tiers.forEach((t) => check(`tier ${t.scopeClassId}`, t.claimIds));
  guide.wait.forEach((w) => check(`wait ${w.scopeClassId}`, w.claimIds));
  guide.steps.forEach((s) => check(`step ${s.n}`, s.claimIds));
  guide.playbooks.forEach((p, i) => check(`playbook ${i + 1}`, p.claimIds));
  guide.artifacts.forEach((a) => check(`artifact ${a.name}`, a.claimIds));
  guide.claims.forEach((c) => {
    if ((c.label === "documented" || c.label === "reported") && !(c.sourceId && c.quote)) {
      errors.push(`claim ${c.id} is ${c.label} without a source and quote`);
    }
    if (c.label === "tested" && !(c.probeId || c.attemptId)) errors.push(`claim ${c.id} is tested without a probe or attempt`);
  });
  if (guide.noOAuth && (guide.tiers.length || guide.steps.length)) errors.push("noOAuth guide carries tiers or steps");
  if (guide.reviewState === "reviewed" && !guide.review) errors.push("reviewed guide has no review record");
  const parsed = Guide.safeParse(guide);
  if (!parsed.success) errors.push(...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  return errors;
}
