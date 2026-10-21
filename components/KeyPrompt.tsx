"use client";

import { useEffect, useRef, useState } from "react";
import { announceKeyChange, dismissPrompt, isUserScopedKey, KEY_PATTERN, PROMPT_EVENT, promptDismissed, readKey, WORKSPACE_PATTERN, writeKey } from "@/lib/clientKey";

/**
 * Asks for the reviewer's Anthropic key on first visit when the deployment
 * has no server key. Opens once per tab unless dismissed, and whenever a
 * component fires PROMPT_EVENT (for example Generate pressed with no key).
 */
export function KeyPrompt({ needsKey }: { needsKey: boolean }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => {
      const saved = readKey();
      queueMicrotask(() => {
        setKey(saved?.key ?? "");
        setWorkspaceId(saved?.workspaceId ?? "");
        setRemember(saved ? saved.remembered : true);
        setTouched(false);
        setOpen(true);
      });
    };
    if (needsKey && !readKey() && !promptDismissed()) show();
    window.addEventListener(PROMPT_EVENT, show);
    return () => window.removeEventListener(PROMPT_EVENT, show);
  }, [needsKey]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") later();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const keyOk = KEY_PATTERN.test(key.trim());
  const userScoped = isUserScopedKey(key);
  const ws = workspaceId.trim();
  const workspaceOk = ws ? WORKSPACE_PATTERN.test(ws) : !userScoped;
  const valid = keyOk && workspaceOk;

  function save() {
    setTouched(true);
    if (!valid) return;
    writeKey(key, workspaceId, remember);
    announceKeyChange();
    setOpen(false);
  }

  function later() {
    dismissPrompt();
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-basalt/70 p-4 backdrop-blur-sm sm:items-center" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && later()}>
      <div role="dialog" aria-modal="true" aria-labelledby="key-prompt-title" className="plate-raised rise w-full max-w-xl p-6 sm:p-8">
        <p className="t-label">Before you generate</p>
        <h2 id="key-prompt-title" className="t-title mt-2 text-chalk">
          Add an Anthropic key for live generation
        </h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-chalk-mid">
          This deployment has no server key. The six reviewed guides read without one. To generate a guide for any other app, add your own key: it travels as a request header for your runs, pays for the two model calls in each run, and is never logged or stored by the server.
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            ref={inputRef}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
            spellCheck={false}
            aria-label="Your Anthropic API key"
            aria-invalid={touched && !keyOk}
            className="field w-full font-mono text-[13px]"
          />
          {touched && !keyOk && <p className="t-mono text-flare-soft">That does not look like an Anthropic key. They start with sk-ant-.</p>}
          {(userScoped || ws) && (
            <div className="space-y-2">
              <input
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                placeholder="wrkspc_..."
                autoComplete="off"
                spellCheck={false}
                aria-label="Anthropic workspace id"
                aria-invalid={touched && !workspaceOk}
                className="field w-full font-mono text-[13px]"
              />
              <p className="t-mono text-chalk-faint">A user scoped key (sk-ant-usr-) only works with its workspace id, from the Anthropic console under Workspaces.</p>
              {touched && !workspaceOk && <p className="t-mono text-flare-soft">{ws ? "Workspace ids start with wrkspc_." : "This key needs its workspace id."}</p>}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-chalk-mid">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember in this browser
            <span className="t-mono text-chalk-faint">{remember ? "localStorage, this browser only" : "this tab only"}</span>
          </label>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="submit" className="pill pill-solid">
              Save key
            </button>
            <button type="button" onClick={later} className="pill pill-ghost">
              Not now
            </button>
            <span className="t-mono ml-auto text-chalk-faint">Change it any time on the Generate page</span>
          </div>
        </form>
      </div>
    </div>
  );
}
