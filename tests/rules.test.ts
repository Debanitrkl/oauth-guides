import { describe, expect, it } from "vitest";
import { assemble, effortFor, labelFor, ownerFor, tierFor, validateGuide, waitFor, weakest } from "../lib/rules";
import { Claim, GuideInput, Source } from "../lib/schema";

const src = (id: string, official: boolean): Source => ({
  id,
  url: official ? "https://docs.example.com/oauth" : "https://community.example.net/thread",
  host: official ? "docs.example.com" : "community.example.net",
  official,
  retrievedAt: "2026-10-20T00:00:00.000Z",
  status: "fetched",
});

const claim = (p: Partial<Claim> & { id: string; kind: Claim["kind"] }): Claim => ({
  text: p.text ?? p.id,
  label: p.label ?? "documented",
  ...p,
});

describe("tierFor", () => {
  it("is open with no gate claims", () => {
    expect(tierFor([claim({ id: "a", kind: "fact" })], "default").tier).toBe("open");
  });
  it("is capped with a cap claim", () => {
    const t = tierFor([claim({ id: "a", kind: "cap", value: { limit: 25, unit: "installs" } })], "default");
    expect(t.tier).toBe("capped");
    expect(t.claimIds).toEqual(["a"]);
  });
  it("is reviewed with a review gate, and review beats cap", () => {
    const t = tierFor(
      [claim({ id: "a", kind: "cap", value: { limit: 25 } }), claim({ id: "b", kind: "gate", value: { gateType: "review" } })],
      "default",
    );
    expect(t.tier).toBe("reviewed");
    expect(t.claimIds).toEqual(["b"]);
  });
  it("is gated with business verification, and gated beats review", () => {
    const t = tierFor(
      [claim({ id: "a", kind: "gate", value: { gateType: "review" } }), claim({ id: "b", kind: "gate", value: { gateType: "business_verification" } })],
      "default",
    );
    expect(t.tier).toBe("gated");
    expect(t.flags).toContain("entity_required");
  });
  it("ignores unverified claims and claims for other scope classes", () => {
    const t = tierFor(
      [
        claim({ id: "a", kind: "gate", value: { gateType: "review" }, label: "unverified" }),
        claim({ id: "b", kind: "gate", value: { gateType: "paid_assessment" }, scopeClassId: "restricted" }),
      ],
      "sensitive",
    );
    expect(t.tier).toBe("open");
    expect(tierFor([claim({ id: "b", kind: "gate", value: { gateType: "paid_assessment" }, scopeClassId: "restricted" })], "restricted").tier).toBe("gated");
  });
  it("adds flags for cost, throttle and permanent choices", () => {
    const t = tierFor(
      [
        claim({ id: "a", kind: "cost", value: { amount: "USD 999" } }),
        claim({ id: "b", kind: "limit_after", value: { throttled: true } }),
        claim({ id: "c", kind: "permanent_choice" }),
      ],
      "default",
    );
    expect(t.flags.sort()).toEqual(["paid", "permanent_choice", "throttled"]);
  });
});

describe("waitFor", () => {
  const sources = new Map([
    ["s1", src("s1", true)],
    ["s2", src("s2", false)],
  ]);
  it("ranges over documented durations and shows reported beside when longer", () => {
    const w = waitFor(
      [
        claim({ id: "a", kind: "duration", value: { lowDays: 3, highDays: 14 }, sourceId: "s1" }),
        claim({ id: "b", kind: "duration", value: { lowDays: 35, highDays: 56 }, sourceId: "s2", label: "reported" }),
      ],
      sources,
      "default",
    );
    expect(w.lowDays).toBe(3);
    expect(w.highDays).toBe(14);
    expect(w.label).toBe("documented");
    expect(w.reported).toEqual({ lowDays: 35, highDays: 56 });
  });
  it("is reported when only community figures exist", () => {
    const w = waitFor([claim({ id: "b", kind: "duration", value: { lowDays: 7, highDays: 10 }, label: "reported" })], sources, "default");
    expect(w.label).toBe("reported");
    expect(w.highDays).toBe(10);
  });
  it("is unverified with no durations", () => {
    const w = waitFor([], sources, "default");
    expect(w.label).toBe("unverified");
    expect(w.lowDays).toBeNull();
  });
});

describe("labelFor", () => {
  const sources = new Map([
    ["s1", src("s1", true)],
    ["s2", src("s2", false)],
  ]);
  it("marks probes tested, official quotes documented, others reported, and unverified without a verified quote", () => {
    expect(labelFor({ id: "a", text: "", kind: "fact", probeId: "p" }, sources, { trustQuotes: false })).toBe("tested");
    expect(labelFor({ id: "a", text: "", kind: "fact", sourceId: "s1", quote: "x" }, sources, { trustQuotes: true })).toBe("documented");
    expect(labelFor({ id: "a", text: "", kind: "fact", sourceId: "s2", quote: "x" }, sources, { trustQuotes: true })).toBe("reported");
    expect(labelFor({ id: "a", text: "", kind: "fact", sourceId: "s1", quote: "x" }, sources, { trustQuotes: false })).toBe("unverified");
    expect(labelFor({ id: "a", text: "", kind: "fact", sourceId: "s1", quote: "x" }, sources, { trustQuotes: false, verifiedIds: new Set(["a"]) })).toBe("documented");
    expect(labelFor({ id: "a", text: "", kind: "fact", sourceId: "missing", quote: "x" }, sources, { trustQuotes: true })).toBe("unverified");
  });
  it("weakest picks the lowest rank", () => {
    expect(weakest(["documented", "reported", "tested"])).toBe("reported");
  });
});

describe("ownerFor", () => {
  it("forces only_you for the legal acts", () => {
    expect(ownerFor({ title: "Create a developer account and sign in" })).toBe("only_you");
    expect(ownerFor({ title: "Accept the developer agreement" }, "agent")).toBe("only_you");
    expect(ownerFor({ title: "Pay for the Core tier" }, "agent")).toBe("only_you");
    expect(ownerFor({ title: "Upload business registration documents" }, "agent")).toBe("only_you");
    expect(ownerFor({ title: "Submit the app for review" }, "agent")).toBe("only_you");
  });
  it("forces agent_prepares for forms and written material", () => {
    expect(ownerFor({ title: "Write the scope justification" }, "agent")).toBe("agent_prepares");
    expect(ownerFor({ title: "Record the demo video" }, "agent")).toBe("agent_prepares");
    expect(ownerFor({ title: "Fill in the app review form fields" }, "agent")).toBe("agent_prepares");
  });
  it("keeps the proposal otherwise and defaults to agent", () => {
    expect(ownerFor({ title: "Add redirect URIs in the console" }, "agent")).toBe("agent");
    expect(ownerFor({ title: "Read the scopes reference" })).toBe("agent");
  });
});

describe("effortFor", () => {
  it("adds per artifact and for heavy artifacts", () => {
    const e = effortFor([
      { name: "p", form: "", kind: "privacy_policy", claimIds: [] },
      { name: "v", form: "", kind: "demo_video", claimIds: [] },
    ]);
    expect(e.lowHours).toBe(3);
    expect(e.highHours).toBe(6);
  });
});

describe("assemble and validate", () => {
  const input: GuideInput = {
    slug: "example",
    schemaVersion: 1,
    provider: { name: "Example", domain: "example.com", officialDomains: ["example.com"], portalUrl: "https://example.com/dev", docsUrl: "https://docs.example.com/oauth", oauthProducts: ["OAuth 2"] },
    generatedAt: "2026-10-20T00:00:00.000Z",
    verifiedOn: "2026-10-20",
    reviewState: "reviewed",
    review: { reviewedBy: "Deba", reviewedOn: "2026-10-20", corrections: [] },
    managedAuth: { managed: false, schemes: [], source: "cache", checkedAt: "2026-10-20", customAppReasons: [] },
    scopeClasses: [
      { id: "basic", name: "Basic", examples: [] },
      { id: "sensitive", name: "Sensitive", examples: [] },
    ],
    claims: [
      { id: "c1", text: "Sensitive scopes need verification", kind: "gate", label: "unverified", sourceId: "s1", quote: "q", scopeClassId: "sensitive", value: { gateType: "review" } },
      { id: "c2", text: "10 business days", kind: "duration", label: "unverified", sourceId: "s1", quote: "q", scopeClassId: "sensitive", value: { lowDays: 14, highDays: 14 } },
      { id: "c3", text: "Discovery", kind: "fact", label: "unverified", probeId: "p1" },
    ],
    sources: [src("s1", true)],
    probes: [{ id: "p1", kind: "discovery", target: "x", ok: true, summary: "found", result: {}, ranAt: "2026-10-20" }],
    steps: [{ n: 1, title: "Sign in to the console", owner: "agent", inputs: [], claimIds: ["c1"] }],
    playbooks: [],
    artifacts: [],
    gaps: [],
    verificationNote: { tested: [], corrected: [], unverified: [] },
  };
  it("derives per scope tiers, labels, owners and next actions", () => {
    const g = assemble(input, { trustQuotes: true });
    expect(g.tiers.map((t) => t.tier)).toEqual(["open", "reviewed"]);
    expect(g.wait[1].highDays).toBe(14);
    expect(g.wait[0].label).toBe("unverified");
    expect(g.claims.find((c) => c.id === "c3")?.label).toBe("tested");
    expect(g.steps[0].owner).toBe("only_you");
    expect(g.nextAction.sensitive).toMatch(/Gather/);
    expect(validateGuide(g)).toEqual([]);
  });
  it("flags citations of missing claims", () => {
    const g = assemble({ ...input, steps: [{ n: 1, title: "x", owner: "agent", inputs: [], claimIds: ["nope"] }] }, { trustQuotes: true });
    expect(validateGuide(g).join(" ")).toMatch(/missing claim nope/);
  });
});
