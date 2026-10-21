import { fetchPage } from "./net";
import { Claim, Probe } from "./schema";
import { hostOf } from "./text";

export type ProbeTargets = {
  domain: string;
  portalUrl: string;
  docsUrl: string;
  authorizeUrl?: string;
  providerName?: string;
};

export type ProbeOutcome = { probe: Probe; claim?: Omit<Claim, "label"> };

const now = () => new Date().toISOString();

/** Four probes that need no account. Each has its own timeout and never throws. */
export async function runProbes(t: ProbeTargets, signal?: AbortSignal): Promise<ProbeOutcome[]> {
  const results = await Promise.allSettled([
    discoveryProbe(t, signal),
    portalLoginWallProbe(t, signal),
    docsReachabilityProbe(t, signal),
  ]);
  const out: ProbeOutcome[] = results.map((r, i) =>
    r.status === "fulfilled" ? r.value : failed(["discovery", "portal_login_wall", "docs_reachability"][i] as Probe["kind"], t, r.reason),
  );
  const disc = out[0].probe;
  const authorizeUrl = t.authorizeUrl ?? (disc.result.authorization_endpoint as string | undefined);
  if (authorizeUrl) {
    try {
      out.push(await authorizeProbe(authorizeUrl, signal));
    } catch (e) {
      out.push(failed("authorize", t, e));
    }
  } else {
    out.push({
      probe: {
        id: "probe-authorize",
        kind: "authorize",
        target: "",
        ok: false,
        summary: "No authorize endpoint known, so the unregistered client probe did not run.",
        result: {},
        ranAt: now(),
      },
    });
  }
  return out;
}

function failed(kind: Probe["kind"], t: ProbeTargets, reason: unknown): ProbeOutcome {
  return {
    probe: {
      id: `probe-${kind}`,
      kind,
      target: kind === "docs_reachability" ? t.docsUrl : kind === "portal_login_wall" ? t.portalUrl : t.domain,
      ok: false,
      summary: `Probe could not run: ${reason instanceof Error ? reason.message : String(reason)}`,
      result: {},
      ranAt: now(),
    },
  };
}

async function discoveryProbe(t: ProbeTargets, signal?: AbortSignal): Promise<ProbeOutcome> {
  const candidates = [
    `https://${t.domain}/.well-known/openid-configuration`,
    `https://${t.domain}/.well-known/oauth-authorization-server`,
  ];
  for (const url of candidates) {
    const page = await fetchPage(url, { timeoutMs: 5000, retries: 0, signal, maxBytes: 200_000 });
    if (page.ok && page.html.trim().startsWith("{")) {
      try {
        const json = JSON.parse(page.html) as Record<string, unknown>;
        const scopes = Array.isArray(json.scopes_supported) ? (json.scopes_supported as string[]) : [];
        const probe: Probe = {
          id: "probe-discovery",
          kind: "discovery",
          target: url,
          ok: true,
          summary: `Discovery document found at ${url}${scopes.length ? `, listing ${scopes.length} scopes` : ""}.`,
          result: {
            authorization_endpoint: json.authorization_endpoint,
            token_endpoint: json.token_endpoint,
            scopes_supported: scopes.slice(0, 50),
            code_challenge_methods_supported: json.code_challenge_methods_supported,
          },
          ranAt: now(),
        };
        return {
          probe,
          claim: {
            id: "claim-probe-discovery",
            text: `${t.domain} publishes an OAuth discovery document${json.authorization_endpoint ? ` with the authorize endpoint ${json.authorization_endpoint}` : ""}${scopes.length ? ` and ${scopes.length} listed scopes` : ""}${Array.isArray(json.code_challenge_methods_supported) && (json.code_challenge_methods_supported as string[]).includes("S256") ? ". PKCE with S256 is supported" : ""}.`,
            kind: "fact",
            probeId: probe.id,
          },
        };
      } catch {
        // not JSON, try next
      }
    }
  }
  const probe: Probe = {
    id: "probe-discovery",
    kind: "discovery",
    target: candidates[0],
    ok: true,
    summary: `No discovery document at ${t.domain}. Endpoints must come from the docs.`,
    result: { found: false },
    ranAt: now(),
  };
  return {
    probe,
    claim: {
      id: "claim-probe-discovery",
      text: `${t.domain} publishes no OpenID or OAuth discovery document, so the authorize and token endpoints come from the docs rather than metadata.`,
      kind: "fact",
      probeId: probe.id,
    },
  };
}

async function authorizeProbe(authorizeUrl: string, signal?: AbortSignal): Promise<ProbeOutcome> {
  const u = new URL(authorizeUrl);
  u.searchParams.set("client_id", "oauth-guides-probe-not-registered");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", "https://example.invalid/callback");
  u.searchParams.set("scope", "openid");
  u.searchParams.set("state", "probe");
  const page = await fetchPage(u.toString(), { timeoutMs: 5000, retries: 0, signal, maxBytes: 300_000 });
  const snippet = page.text.slice(0, 2000);
  const mentions = /invalid[_ ]client|client[_ ]id|unknown client|not (found|registered)|invalid request|unauthorized_client|redirect/i.exec(snippet)?.[0];
  const loginWall = /sign in|log in|login|password/i.test(snippet) && !mentions;
  const probe: Probe = {
    id: "probe-authorize",
    kind: "authorize",
    target: authorizeUrl,
    ok: page.status > 0,
    summary:
      page.status === 0
        ? `The authorize endpoint did not answer: ${page.error}`
        : `An unregistered client_id gets HTTP ${page.status}${mentions ? ` and the page mentions "${mentions}"` : loginWall ? " and a sign in page before any client check" : ""}.`,
    result: { status: page.status, finalUrl: page.finalUrl, mentions, loginWall, snippet: snippet.slice(0, 300) },
    ranAt: now(),
  };
  if (page.status === 0) return { probe };
  return {
    probe,
    claim: {
      id: "claim-probe-authorize",
      text: `A user sent to the authorize endpoint with an unregistered client_id sees HTTP ${page.status}${mentions ? ` with a message about "${mentions}"` : loginWall ? " and is asked to sign in before the client is checked" : ""}, which is what a misconfigured client ID looks like to your users.`,
      kind: "fact",
      probeId: probe.id,
    },
  };
}

async function portalLoginWallProbe(t: ProbeTargets, signal?: AbortSignal): Promise<ProbeOutcome> {
  const page = await fetchPage(t.portalUrl, { timeoutMs: 5000, retries: 0, signal, maxBytes: 400_000 });
  const finalHost = hostOf(page.finalUrl);
  const redirectedToLogin = finalHost !== hostOf(t.portalUrl) && /login|signin|sign-in|auth|account|id\./i.test(finalHost + page.finalUrl);
  const asksForLogin = /\b(sign in|log in|login|create (an )?account)\b/i.test(page.text.slice(0, 3000));
  const wall = page.status === 401 || page.status === 403 || redirectedToLogin || (page.ok && asksForLogin && page.text.length < 4000);
  const probe: Probe = {
    id: "probe-portal",
    kind: "portal_login_wall",
    target: t.portalUrl,
    ok: page.status > 0,
    summary:
      page.status === 0
        ? `The developer portal did not answer: ${page.error}`
        : wall
          ? `The developer portal sits behind a sign in${redirectedToLogin ? ` (redirects to ${finalHost})` : ""}.`
          : `The developer portal page loads without a sign in (HTTP ${page.status}).`,
    result: { status: page.status, finalUrl: page.finalUrl, redirectedToLogin, asksForLogin, chars: page.text.length },
    ranAt: now(),
  };
  if (page.status === 0) return { probe };
  return {
    probe,
    claim: {
      id: "claim-probe-portal",
      text: wall
        ? `Creating the app requires signing in to ${t.providerName ?? (finalHost || hostOf(t.portalUrl))}: the portal at ${t.portalUrl} ${redirectedToLogin ? `redirects to ${finalHost}` : "asks for an account"} before anything else.`
        : `The developer portal at ${t.portalUrl} loads without a sign in; the registration form itself still needs an account.`,
      kind: "fact",
      probeId: probe.id,
    },
  };
}

async function docsReachabilityProbe(t: ProbeTargets, signal?: AbortSignal): Promise<ProbeOutcome> {
  const page = await fetchPage(t.docsUrl, { timeoutMs: 5000, retries: 0, signal, maxBytes: 600_000 });
  const thin = page.ok && page.text.length < 500;
  const probe: Probe = {
    id: "probe-docs",
    kind: "docs_reachability",
    target: t.docsUrl,
    ok: page.status > 0,
    summary:
      page.status === 0
        ? `The docs did not answer: ${page.error}`
        : page.blocked
          ? `The docs site blocks automated fetching (HTTP ${page.status}), so claims from it must be checked by hand.`
          : thin
            ? `The docs page renders with JavaScript (HTTP ${page.status}, ${page.text.length} characters of text), so automated extraction is thin here.`
            : `The docs page fetched (HTTP ${page.status}, ${page.text.length} characters of text).`,
    result: { status: page.status, blocked: page.blocked, chars: page.text.length, finalUrl: page.finalUrl },
    ranAt: now(),
  };
  return { probe };
}
