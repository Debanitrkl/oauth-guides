"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KEY_EVENT, openKeyPrompt, readKey, writeKey } from "@/lib/clientKey";
import { PipelineEvent, ResolveResult } from "@/lib/pipeline/events";
import { Guide, Probe, Source } from "@/lib/schema";
import { GuideView } from "./GuideView";

type StageState = { name: string; status: "started" | "done" | "failed" | "skipped"; ms?: number; note?: string };

const STAGE_LABEL: Record<string, string> = {
  resolve: "Resolve the app to a provider",
  collect: "Fetch the provider's pages",
  extract: "Extract claims with quotes",
  "extract-retry": "Extract again with half the input",
  probe: "Run four probes without an account",
  persist: "Save the guide",
};

type Health = { mock: boolean; serverKey: boolean; model: string; store: string; composioKey: boolean };

export function GenerateStream({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<StageState[]>([]);
  const [resolved, setResolved] = useState<ResolveResult | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [probes, setProbes] = useState<Probe[]>([]);
  const [claims, setClaims] = useState<{ proposed: number; kept: number; dropped: number; stripped: number } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [done, setDone] = useState<{ slug: string; url: string | null; cached: boolean; runId: string } | null>(null);
  const [error, setError] = useState<{ message: string; stage: string; partial: boolean } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const started = useRef(false);

  // Optional per run key. Sent as a header for this browser's runs only; the server never logs or stores it.
  const [ownKey, setOwnKey] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const ownKeyRef = useRef("");
  const [health, setHealth] = useState<Health | null>(null);

  // Load the saved key on mount and whenever the site-wide prompt saves one.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: Health) => setHealth(h))
      .catch(() => setHealth(null));
    const load = () => {
      const saved = readKey();
      queueMicrotask(() => {
        setOwnKey(saved?.key ?? "");
        setRememberKey(saved ? saved.remembered : false);
      });
    };
    load();
    window.addEventListener(KEY_EVENT, load);
    return () => window.removeEventListener(KEY_EVENT, load);
  }, []);

  useEffect(() => {
    ownKeyRef.current = ownKey;
    writeKey(ownKey, rememberKey);
  }, [ownKey, rememberKey]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  const reset = () => {
    setStages([]);
    setResolved(null);
    setSources([]);
    setProbes([]);
    setClaims(null);
    setLogs([]);
    setGuide(null);
    setDone(null);
    setError(null);
  };

  const handle = useCallback((e: PipelineEvent) => {
    switch (e.type) {
      case "stage":
        setStages((prev) => {
          const i = prev.findIndex((s) => s.name === e.name);
          const next: StageState = { name: e.name, status: e.status, ms: e.ms, note: e.note };
          if (i === -1) return [...prev, next];
          const copy = prev.slice();
          copy[i] = next;
          return copy;
        });
        break;
      case "resolved":
        setResolved(e.result);
        break;
      case "source":
        setSources((prev) => [...prev.filter((s) => s.id !== e.source.id), e.source]);
        break;
      case "probe":
        setProbes((prev) => [...prev.filter((p) => p.id !== e.probe.id), e.probe]);
        break;
      case "claims":
        setClaims({ proposed: e.proposed, kept: e.kept, dropped: e.dropped, stripped: e.stripped });
        break;
      case "guide":
        setGuide(e.guide);
        break;
      case "done":
        setDone({ slug: e.slug, url: e.url, cached: e.cached, runId: e.runId });
        break;
      case "error":
        setError({ message: e.message, stage: e.stage, partial: e.partial });
        // A run that started from the URL before the key was known: ask for it now.
        if (/No Anthropic API key/i.test(e.message)) openKeyPrompt();
        break;
      case "log":
        setLogs((prev) => [...prev, e.message]);
        break;
    }
  }, []);

  const run = useCallback(
    async (q: string, force = false) => {
      if (!q.trim()) return;
      reset();
      setRunning(true);
      setStartedAt(Date.now());
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        const key = ownKeyRef.current.trim();
        if (key) headers["x-anthropic-key"] = key;
        const res = await fetch("/api/generate", {
          method: "POST",
          headers,
          body: JSON.stringify({ query: q, force }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({ error: res.statusText }));
          setError({ message: j.error ?? `HTTP ${res.status}`, stage: "request", partial: false });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              handle(JSON.parse(dataLine.slice(6)) as PipelineEvent);
            } catch {
              // ignore malformed chunk
            }
          }
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError({ message: e instanceof Error ? e.message : String(e), stage: "stream", partial: false });
        }
      } finally {
        setRunning(false);
      }
    },
    [handle],
  );

  useEffect(() => {
    if (initialQuery && !started.current) {
      started.current = true;
      run(initialQuery);
    }
  }, [initialQuery, run]);

  const elapsed = startedAt && now ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const liveReady = health ? health.mock || health.serverKey || !!ownKey.trim() : true;

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!liveReady) {
            // No key anywhere: ask for one instead of starting a run that fails at resolve.
            openKeyPrompt();
            return;
          }
          const url = new URL(window.location.href);
          url.searchParams.set("q", query);
          window.history.replaceState(null, "", url.toString());
          run(query);
        }}
        className="flex flex-wrap gap-3"
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} placeholder="An app name or website" className="field min-w-0 flex-1" aria-label="App name or website" />
        <button type="submit" disabled={running} className="pill pill-solid">
          {running ? "Generating" : "Generate"}
        </button>
        {running && (
          <button type="button" onClick={() => abortRef.current?.abort()} className="pill pill-ghost">
            Stop
          </button>
        )}
        {done?.cached && (
          <button type="button" onClick={() => run(query, true)} className="pill pill-ghost">
            Regenerate
          </button>
        )}
      </form>

      <section className="plate p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {health ? (
            <>
              <Stat label="Mode" value={health.mock ? "mock, fixture pages, no model" : "live"} />
              <Stat label="Server key" value={health.serverKey ? "configured" : "not configured"} />
              <Stat label="Model" value={health.model} mono />
              <Stat label="Store" value={health.store} />
            </>
          ) : (
            <span className="t-mono text-chalk-faint">Checking server status</span>
          )}
          <button type="button" onClick={() => setShowKey((v) => !v)} className="t-mono ml-auto text-chalk-mid transition-colors hover:text-chalk">
            {showKey ? "Hide key field" : ownKey ? "Using your own key" : "Use your own Anthropic key"}
          </button>
        </div>
        {!liveReady && !showKey && (
          <p className="mt-3 text-sm text-chalk-mid">
            No server key is configured, so live generation needs your own Anthropic key.{" "}
            <button type="button" onClick={openKeyPrompt} className="text-flare-soft underline-offset-4 hover:underline">
              Add a key
            </button>
          </p>
        )}
        {showKey && (
          <div className="mt-4 border-t border-hairline pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="password"
                value={ownKey}
                onChange={(e) => setOwnKey(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                spellCheck={false}
                aria-label="Your Anthropic API key"
                className="field min-w-0 flex-1 font-mono text-[13px]"
              />
              <label className="flex items-center gap-2 text-sm text-chalk-mid">
                <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} />
                Remember in this browser
                <span className="t-mono text-chalk-faint">{rememberKey ? "this browser only" : "this tab only"}</span>
              </label>
              {ownKey && (
                <button type="button" onClick={() => setOwnKey("")} className="pill pill-ghost pill-sm">
                  Clear
                </button>
              )}
            </div>
            <p className="mt-3 max-w-prose text-sm text-chalk-mid">
              Sent as a request header for your runs only. The server uses it for the two model calls in that run and does not log or store it. When the server has its own key, yours still takes precedence for your runs.
            </p>
          </div>
        )}
      </section>

      {(running || stages.length > 0) && (
        <section className="plate p-5 text-sm">
          <div className="flex items-center justify-between">
            <h2 className="t-title-sm text-chalk">Progress</h2>
            <span className="t-mono text-chalk-faint">{running ? `${elapsed}s` : done ? "finished" : error ? "stopped" : ""}</span>
          </div>
          <ol className="ledger mt-3 border-t border-hairline-strong">
            {stages.map((s) => (
              <li key={s.name} className="grid grid-cols-[6rem_1fr_auto] items-center gap-x-3 py-2">
                <span className={`t-mono ${s.status === "done" ? "text-chalk" : s.status === "failed" ? "text-flare-soft" : "text-chalk-faint"}`}>
                  {s.status === "started" ? "running" : s.status}
                </span>
                <span className="text-chalk">
                  {STAGE_LABEL[s.name] ?? s.name}
                  {s.note && <span className="ml-2 text-chalk-mid">{s.note}</span>}
                </span>
                <span className="t-mono tabular text-chalk-faint">{s.ms != null ? `${(s.ms / 1000).toFixed(1)}s` : ""}</span>
              </li>
            ))}
          </ol>
          {resolved && resolved.kind === "found" && (
            <p className="mt-4 text-chalk-mid">
              Resolved to <span className="text-chalk">{resolved.provider.name}</span> ({resolved.provider.domain}), {resolved.candidateUrls.length} pages to read.
            </p>
          )}
          {resolved && resolved.kind === "no_oauth" && (
            <p className="mt-4 text-chalk-mid">
              {resolved.providerName} has no OAuth for third party apps: {resolved.reason}
            </p>
          )}
          {resolved && resolved.kind === "ambiguous" && (
            <div className="mt-4">
              <p className="text-chalk">{resolved.question}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {resolved.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => {
                      setQuery(o);
                      run(o);
                    }}
                    className="pill pill-ghost pill-sm"
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sources.length > 0 && (
            <ul className="ledger mt-4 border-t border-hairline">
              {sources.map((s) => (
                <li key={s.id} className="grid grid-cols-[4.5rem_5.5rem_1fr_auto] items-center gap-x-3 py-1.5">
                  <span className={`t-mono ${s.status === "fetched" ? "text-chalk" : "text-chalk-faint"}`}>{s.status}</span>
                  <span className="t-mono text-chalk-faint">{s.official ? "official" : "community"}</span>
                  <a href={s.url} target="_blank" rel="noreferrer" className="truncate text-chalk-mid hover:text-flare-soft">
                    {s.url}
                  </a>
                  <span className="t-mono tabular text-chalk-faint">{s.chars ? `${s.chars.toLocaleString()} chars` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {claims && (
            <p className="mt-4 text-chalk-mid">
              Claims: {claims.proposed} proposed, {claims.kept} kept with a verified quote, {claims.dropped} dropped because the quote was not on the page, {claims.stripped} stripped.
            </p>
          )}
          {probes.length > 0 && (
            <ul className="ledger mt-3 border-t border-hairline">
              {probes.map((p) => (
                <li key={p.id} className="grid grid-cols-[9rem_1fr] gap-x-3 py-1.5">
                  <span className={`t-mono ${p.ok ? "text-chalk" : "text-chalk-faint"}`}>{p.kind}</span>
                  <span className="text-chalk-mid">{p.summary}</span>
                </li>
              ))}
            </ul>
          )}
          {logs.length > 0 && (
            <details className="mt-3">
              <summary className="t-mono cursor-pointer text-chalk-faint">Log</summary>
              <ul className="mt-2 space-y-1">
                {logs.map((l, i) => (
                  <li key={i} className="t-mono text-chalk-mid">
                    {l}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {error && (
            <p className="mt-4 border-t border-hairline-strong pt-3 text-chalk">
              <span className="t-label mr-2 text-flare-soft">Stopped at {error.stage}</span>
              {error.message}
              {error.partial ? " A partial guide is shown below." : ""}
            </p>
          )}
          {done && (
            <p className="mt-4 border-t border-hairline-strong pt-3 text-chalk-mid">
              {done.cached ? "Returned a guide generated in the last 7 days." : "Saved."}{" "}
              <a href={`/g/${done.slug}`} className="text-flare-soft">
                Open the stable page
              </a>
              {" · "}
              <a href={`/g/${done.slug}/markdown`} className="text-flare-soft">
                Markdown
              </a>
              <span className="t-mono ml-2 text-chalk-faint">run {done.runId}</span>
            </p>
          )}
        </section>
      )}

      {guide && <GuideView guide={guide} streaming={!done} />}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="t-label">{label}</span>
      <span className={mono ? "t-mono text-chalk" : "text-sm text-chalk"}>{value}</span>
    </span>
  );
}
