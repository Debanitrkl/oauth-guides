import { randomUUID } from "node:crypto";
import { checkManagedAuth } from "../managedAuth";
import { runProbes, ProbeOutcome } from "../probes";
import { assemble, validateGuide } from "../rules";
import { Claim, ExtractionOutput, Guide, GuideInput, Probe, Provider, Source } from "../schema";
import { loadGeneratedGuide, RunRecord, saveGuide, saveRun } from "../store";
import { slugify } from "../text";
import { collect, CollectedPage } from "./collect";
import { Emit, ResolveResult } from "./events";
import { extract } from "./extract";
import { isMock, ModelAuth } from "./model";
import { resolveQuery } from "./resolve";
import { verifyClaims } from "./verify";

export const BUDGET = {
  resolveMs: 20_000,
  collectMs: 40_000,
  extractMs: 60_000,
  probesMs: 15_000,
  totalMs: 280_000,
  cacheDays: 7,
};

export type RunOptions = { query: string; force?: boolean; signal?: AbortSignal; auth?: ModelAuth };

export type Deps = {
  resolve: (q: string, signal?: AbortSignal, auth?: ModelAuth) => Promise<ResolveResult>;
  collect: typeof collect;
  extract: typeof extract;
  probes: typeof runProbes;
  managedAuth: typeof checkManagedAuth;
};

async function realDeps(): Promise<Deps> {
  return { resolve: resolveQuery, collect, extract, probes: runProbes, managedAuth: checkManagedAuth };
}

async function mockDeps(): Promise<Deps> {
  const m = await import("../mock/fixture");
  return m.mockDeps();
}

function withTimeout(ms: number, parent?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error(`stage timed out after ${ms} ms`)), ms);
  const onAbort = () => ctrl.abort(parent?.reason);
  parent?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: ctrl.signal,
    clear: () => {
      clearTimeout(t);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

export async function runPipeline(opts: RunOptions, emit: Emit): Promise<void> {
  const deps = isMock() ? await mockDeps() : await realDeps();
  const runId = randomUUID().slice(0, 8);
  const startedAt = new Date();
  const record: RunRecord = {
    runId,
    query: opts.query,
    startedAt: startedAt.toISOString(),
    stages: [],
    sources: { fetched: 0, blocked: 0, error: 0, empty: 0 },
    probes: { run: 0, failed: 0 },
    claims: { proposed: 0, kept: 0, dropped: 0, stripped: 0 },
    cached: false,
  };
  const total = withTimeout(BUDGET.totalMs, opts.signal);
  const stage = async <T>(name: string, ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    emit({ type: "stage", name, status: "started" });
    const scoped = withTimeout(ms, total.signal);
    try {
      const out = await fn(scoped.signal);
      record.stages.push({ name, ms: Date.now() - t0, status: "done" });
      emit({ type: "stage", name, status: "done", ms: Date.now() - t0 });
      return out;
    } catch (e) {
      record.stages.push({ name, ms: Date.now() - t0, status: "failed", note: String(e instanceof Error ? e.message : e) });
      emit({ type: "stage", name, status: "failed", ms: Date.now() - t0, note: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      scoped.clear();
    }
  };
  const log = (message: string) => {
    console.log(JSON.stringify({ runId, at: new Date().toISOString(), message }));
    emit({ type: "log", message });
  };

  try {
    // 1 Resolve
    const resolved = await stage("resolve", BUDGET.resolveMs, (s) => deps.resolve(opts.query, s, opts.auth));
    emit({ type: "resolved", result: resolved });
    if (resolved.kind !== "found") {
      if (resolved.kind === "no_oauth") {
        const guide = noOAuthGuide(opts.query, resolved.providerName, resolved.reason);
        emit({ type: "guide", guide });
        const saved = await saveGuide(guide);
        record.slug = guide.slug;
        emit({ type: "done", slug: guide.slug, url: saved.url, cached: false, runId });
      }
      record.endedAt = new Date().toISOString();
      await saveRun(record);
      return;
    }
    const provider = resolved.provider;
    const slug = slugify(provider.domain);
    record.slug = slug;

    // Cache
    if (!opts.force) {
      const cached = await loadGeneratedGuide(slug);
      if (cached && Date.now() - Date.parse(cached.generatedAt) < BUDGET.cacheDays * 86_400_000) {
        log(`Guide for ${provider.domain} generated ${cached.generatedAt.slice(0, 10)}, returning it from the store.`);
        record.cached = true;
        emit({ type: "guide", guide: cached });
        emit({ type: "done", slug, url: null, cached: true, runId });
        record.endedAt = new Date().toISOString();
        await saveRun(record);
        return;
      }
    }

    // Probes and the managed auth check start now and run beside Collect and Extract.
    const probesPromise = stage("probe", BUDGET.probesMs, (s) =>
      deps.probes({ domain: provider.domain, portalUrl: provider.portalUrl, docsUrl: provider.docsUrl, authorizeUrl: resolved.authorizeUrl, providerName: provider.name }, s),
    ).catch((): ProbeOutcome[] => []);
    const managedPromise = deps.managedAuth(provider.composioSlug ?? slugify(provider.name).replace(/-/g, "")).catch(() => null);

    // 2 Collect
    const pages = await stage("collect", BUDGET.collectMs, (s) => deps.collect(resolved.candidateUrls, provider.officialDomains, emit, s));
    for (const p of pages) record.sources[p.source.status === "hand_checked" ? "fetched" : p.source.status]++;
    const fetched = pages.filter((p) => p.source.status === "fetched");

    // 3 Extract, with one retry on half the input
    let extraction: ExtractionOutput | null = null;
    if (fetched.length) {
      try {
        const r = await stage("extract", BUDGET.extractMs, (s) => deps.extract(provider, pages, s, false, opts.auth));
        extraction = r.output;
        record.tokens = r.usage;
      } catch (e) {
        log(`Extract failed once (${e instanceof Error ? e.message : e}), retrying with half the input.`);
        try {
          const r = await stage("extract-retry", BUDGET.extractMs, (s) => deps.extract(provider, pages, s, true, opts.auth));
          extraction = r.output;
          record.tokens = r.usage;
        } catch (e2) {
          log(`Extract failed twice: ${e2 instanceof Error ? e2.message : e2}. The guide carries sources and probes only.`);
        }
      }
    } else {
      emit({ type: "stage", name: "extract", status: "skipped", note: "no page fetched" });
      record.stages.push({ name: "extract", ms: 0, status: "skipped", note: "no page fetched" });
    }

    // 4 Verify spans
    const verified = verifyClaims(extraction?.claims ?? [], pages);
    record.claims = {
      proposed: extraction?.claims.length ?? 0,
      kept: verified.kept.length,
      dropped: verified.dropped.length,
      stripped: verified.stripped,
    };
    emit({ type: "claims", proposed: record.claims.proposed, kept: record.claims.kept, dropped: record.claims.dropped, stripped: record.claims.stripped });

    // 5 Probes land
    const probeOutcomes = await probesPromise;
    const probes: Probe[] = probeOutcomes.map((o) => o.probe);
    probes.forEach((p) => emit({ type: "probe", probe: p }));
    record.probes = { run: probes.length, failed: probes.filter((p) => !p.ok).length };
    const managed = (await managedPromise) ?? {
      managed: null,
      schemes: [],
      source: "unknown" as const,
      checkedAt: new Date().toISOString(),
      customAppReasons: [],
      note: "managed auth check failed",
    };

    // 6 Tier and estimate (rules)
    const input = buildInput({ query: opts.query, slug, provider, pages, extraction, verified, probeOutcomes, managed });
    const guide = assemble(input, { trustQuotes: false, verifiedIds: new Set(verified.kept.map((c) => c.id)) });
    const errors = validateGuide(guide);
    if (errors.length) log(`Validation notes: ${errors.slice(0, 5).join("; ")}`);
    emit({ type: "guide", guide });

    // 7 Persist
    const saved = await stage("persist", 5000, () => saveGuide(guide));
    if (saved.error) log(`Could not save the guide: ${saved.error}`);
    emit({ type: "done", slug, url: saved.url, cached: false, runId });
    record.endedAt = new Date().toISOString();
    await saveRun(record);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stageName = record.stages.at(-1)?.name ?? "start";
    record.error = { stage: stageName, message };
    record.endedAt = new Date().toISOString();
    await saveRun(record);
    emit({ type: "error", message, stage: stageName, partial: record.stages.some((s) => s.name === "collect" && s.status === "done") });
  } finally {
    total.clear();
  }
}

function noOAuthGuide(query: string, providerName: string, reason: string): Guide {
  const now = new Date().toISOString();
  const input: GuideInput = {
    slug: slugify(providerName || query) || "unknown",
    schemaVersion: 1,
    provider: { name: providerName || query, domain: "", officialDomains: [], portalUrl: "", docsUrl: "", oauthProducts: [] },
    query,
    generatedAt: now,
    verifiedOn: now,
    reviewState: "autogenerated",
    managedAuth: { managed: null, schemes: [], source: "unknown", checkedAt: now, customAppReasons: [] },
    noOAuth: { reason },
    scopeClasses: [],
    claims: [],
    sources: [],
    probes: [],
    steps: [],
    playbooks: [],
    artifacts: [],
    gaps: [],
    verificationNote: { tested: [], corrected: [], unverified: ["The no OAuth verdict comes from the resolve step and its search results, not from a fetched page."] },
  };
  return assemble(input, { trustQuotes: false });
}

export function buildInput(args: {
  query: string;
  slug: string;
  provider: Provider;
  pages: CollectedPage[];
  extraction: ExtractionOutput | null;
  verified: ReturnType<typeof verifyClaims>;
  probeOutcomes: ProbeOutcome[];
  managed: GuideInput["managedAuth"];
}): GuideInput {
  const { query, slug, provider, pages, extraction, verified, probeOutcomes, managed } = args;
  const now = new Date().toISOString();
  const keptIds = new Set(verified.kept.map((c) => c.id));
  const claims: Claim[] = verified.kept.map((c) => ({
    id: c.id,
    text: c.text,
    kind: c.kind,
    label: "unverified",
    sourceId: c.sourceId,
    quote: c.quote,
    scopeClassId: c.scopeClassId,
    value: c.value,
  }));
  for (const o of probeOutcomes) {
    if (o.claim) claims.push({ ...o.claim, label: "tested" });
  }
  const sources: Source[] = pages.map((p) => p.source);
  const scopeClasses = extraction?.scopeClasses.length ? extraction.scopeClasses : [{ id: "default", name: "All scopes", examples: [] }];
  const validScope = new Set(scopeClasses.map((s) => s.id));
  const onlyKept = (ids: string[]) => ids.filter((id) => keptIds.has(id) || id.startsWith("claim-probe"));
  const steps = (extraction?.steps ?? []).map((s, i) => ({
    n: i + 1,
    title: s.title,
    detail: s.detail,
    owner: s.proposedOwner,
    inputs: s.inputs,
    url: s.url,
    claimIds: onlyKept(s.claimIds),
    scopeClassIds: s.scopeClassIds?.filter((id) => validScope.has(id)),
  }));
  const playbooks = (extraction?.playbooks ?? []).map((p) => ({ ...p, claimIds: onlyKept(p.claimIds) }));
  const artifacts = (extraction?.artifacts ?? []).map((a) => ({ ...a, claimIds: onlyKept(a.claimIds), scopeClassIds: a.scopeClassIds?.filter((id) => validScope.has(id)) }));
  const gaps: GuideInput["gaps"] = [];
  for (const p of pages) {
    if (p.source.status === "blocked") gaps.push({ what: `${p.source.host} blocked automated fetching, so nothing from it is cited`, page: p.source.url });
    if (p.source.status === "error") gaps.push({ what: `${p.source.url} could not be fetched`, page: p.source.url });
    if (p.source.status === "empty") gaps.push({ what: `${p.source.host} rendered with JavaScript and gave almost no text`, page: p.source.url });
  }
  if (!extraction) gaps.push({ what: "The extraction step failed, so this guide has sources and probes but no documented claims", page: provider.docsUrl });
  const unverifiedNotes: string[] = [];
  if (verified.dropped.length) unverifiedNotes.push(`${verified.dropped.length} proposed claims were dropped because their quote was not found on the cited page.`);
  if (verified.stripped) unverifiedNotes.push(`${verified.stripped} proposed claims were stripped for a missing or overlong quote or a duplicate id.`);
  unverifiedNotes.push("Autogenerated guide: no person has reviewed these claims yet.");
  if (isMock()) unverifiedNotes.push("Mock run: the page text came from a fixture of short excerpts retrieved on 2026-10-20 and the probes did not touch the network.");
  const noOAuth = extraction?.providerNotes.noOAuthReason ? { reason: extraction.providerNotes.noOAuthReason } : undefined;
  const probeNotes = probeOutcomes.filter((o) => o.probe.ok).map((o) => o.probe.summary);
  // Claims whose scope class is unknown apply to all.
  claims.forEach((c) => {
    if (c.scopeClassId && !validScope.has(c.scopeClassId)) c.scopeClassId = undefined;
  });
  return {
    slug,
    schemaVersion: 1,
    provider: { ...provider, oauthProducts: extraction?.providerNotes.oauthProducts?.length ? extraction.providerNotes.oauthProducts : provider.oauthProducts, variantNote: extraction?.providerNotes.variantNote ?? provider.variantNote },
    query,
    generatedAt: now,
    verifiedOn: now,
    reviewState: "autogenerated",
    managedAuth: managed,
    noOAuth,
    scopeClasses: noOAuth ? [] : scopeClasses,
    claims,
    sources,
    probes: probeOutcomes.map((o) => o.probe),
    steps: noOAuth ? [] : steps,
    playbooks: noOAuth ? [] : playbooks,
    artifacts: noOAuth ? [] : artifacts,
    gaps,
    verificationNote: { tested: probeNotes, corrected: [], unverified: unverifiedNotes },
  };
}
