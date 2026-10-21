import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { extractTitle, htmlToText } from "./text";

/** SSRF guard: only http(s), public hosts, no private ranges, no metadata endpoints. */

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata", "instance-data"]);

function ipIsPrivate(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::1" || s === "::") return true;
    if (s.startsWith("fe80:") || s.startsWith("fc") || s.startsWith("fd")) return true;
    if (s.startsWith("::ffff:")) return ipIsPrivate(s.slice(7));
    return false;
  }
  return true;
}

export class BlockedUrlError extends Error {}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError(`Not a URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError(`Refused scheme ${url.protocol}`);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".internal") || host.endsWith(".local") || !host.includes(".")) {
    if (!isIP(host)) throw new BlockedUrlError(`Refused host ${host}`);
  }
  if (isIP(host)) {
    if (ipIsPrivate(host)) throw new BlockedUrlError(`Refused private address ${host}`);
    return url;
  }
  let addresses: string[] = [];
  try {
    const res = await dns.lookup(host, { all: true });
    addresses = res.map((r) => r.address);
  } catch {
    throw new BlockedUrlError(`Could not resolve ${host}`);
  }
  if (addresses.length === 0 || addresses.some(ipIsPrivate)) throw new BlockedUrlError(`Refused private address for ${host}`);
  return url;
}

export type FetchedPage = {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  title?: string;
  text: string;
  html: string;
  blocked: boolean;
  error?: string;
  ms: number;
};

const UA = "oauth-guides/0.1 (+https://github.com; guide generator; contact via repo)";

/**
 * Fetch a page with the SSRF check on every hop, a timeout, and two retries on
 * network errors or 5xx. 403 and 404 are not retried.
 */
export async function fetchPage(
  raw: string,
  opts: { timeoutMs?: number; retries?: number; signal?: AbortSignal; maxBytes?: number } = {},
): Promise<FetchedPage> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxBytes = opts.maxBytes ?? 1_500_000;
  let attempt = 0;
  let lastError: string | undefined;
  const retries = opts.retries ?? 2;
  while (attempt <= retries) {
    attempt++;
    try {
      let url = await assertPublicUrl(raw);
      let hops = 0;
      let res: Response | undefined;
      while (hops < 4) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const onAbort = () => ctrl.abort();
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        try {
          res = await fetch(url, {
            redirect: "manual",
            signal: ctrl.signal,
            headers: { "user-agent": UA, accept: "text/html,application/json;q=0.9,*/*;q=0.5" },
          });
        } finally {
          clearTimeout(t);
          opts.signal?.removeEventListener("abort", onAbort);
        }
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc) break;
          url = await assertPublicUrl(new URL(loc, url).toString());
          hops++;
          continue;
        }
        break;
      }
      if (!res) throw new Error("no response");
      const status = res.status;
      const blocked = status === 403 || status === 401 || status === 429;
      if (status >= 500 && attempt <= retries) {
        lastError = `HTTP ${status}`;
        await sleep(attempt === 1 ? 1000 : 3000);
        continue;
      }
      const buf = await readLimited(res, maxBytes);
      const html = buf;
      const text = htmlToText(html);
      return {
        url: raw,
        finalUrl: url.toString(),
        status,
        ok: status >= 200 && status < 300,
        title: extractTitle(html),
        text,
        html,
        blocked,
        ms: Date.now() - start,
      };
    } catch (e) {
      if (e instanceof BlockedUrlError) {
        return { url: raw, finalUrl: raw, status: 0, ok: false, text: "", html: "", blocked: true, error: e.message, ms: Date.now() - start };
      }
      lastError = e instanceof Error ? e.message : String(e);
      if (opts.signal?.aborted || attempt > retries) break;
      await sleep(attempt === 1 ? 1000 : 3000);
    }
  }
  return { url: raw, finalUrl: raw, status: 0, ok: false, text: "", html: "", blocked: false, error: lastError ?? "fetch failed", ms: Date.now() - start };
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        break;
      }
    }
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
