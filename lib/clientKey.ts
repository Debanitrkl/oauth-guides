/**
 * The reviewer's own Anthropic key, kept in the browser only.
 *
 * Remembered keys live in localStorage (this browser, across visits).
 * Unremembered keys live in sessionStorage (this tab, until it closes).
 * The key travels to the server as a request header for that browser's
 * runs and is never logged or stored there. Nothing here runs on the server.
 */

export const KEY_STORAGE = "oauth-guides.anthropicKey";
export const WORKSPACE_STORAGE = "oauth-guides.anthropicWorkspace";
export const PROMPT_DISMISSED = "oauth-guides.keyPromptDismissed";
/** Fired on window after the key changes, so every mounted component re-reads it. */
export const KEY_EVENT = "oauth-guides:key";
/** Fired on window to open the key prompt from anywhere. */
export const PROMPT_EVENT = "oauth-guides:key-prompt";

export const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
export const WORKSPACE_PATTERN = /^wrkspc_[A-Za-z0-9]{8,}$/;
/** User scoped keys need a workspace id beside them; the API refuses them without one. */
export const isUserScopedKey = (key: string) => key.trim().startsWith("sk-ant-usr-");

export type SavedKey = { key: string; workspaceId: string; remembered: boolean };

export function readKey(): SavedKey | null {
  try {
    const local = window.localStorage.getItem(KEY_STORAGE);
    if (local) return { key: local, workspaceId: window.localStorage.getItem(WORKSPACE_STORAGE) ?? "", remembered: true };
    const session = window.sessionStorage.getItem(KEY_STORAGE);
    if (session) return { key: session, workspaceId: window.sessionStorage.getItem(WORKSPACE_STORAGE) ?? "", remembered: false };
  } catch {
    // storage unavailable
  }
  return null;
}

export function writeKey(key: string, workspaceId: string, remember: boolean): void {
  const value = key.trim();
  const ws = workspaceId.trim();
  try {
    const stores: Storage[] = [window.localStorage, window.sessionStorage];
    for (const st of stores) {
      st.removeItem(KEY_STORAGE);
      st.removeItem(WORKSPACE_STORAGE);
    }
    if (!value) return;
    const target = remember ? window.localStorage : window.sessionStorage;
    target.setItem(KEY_STORAGE, value);
    if (ws) target.setItem(WORKSPACE_STORAGE, ws);
  } catch {
    // storage unavailable: the key still works for this page through component state
  }
}

export function announceKeyChange(): void {
  try {
    window.dispatchEvent(new Event(KEY_EVENT));
  } catch {
    // no window
  }
}

export function openKeyPrompt(): void {
  try {
    window.dispatchEvent(new Event(PROMPT_EVENT));
  } catch {
    // no window
  }
}

export function promptDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(PROMPT_DISMISSED) === "1";
  } catch {
    return false;
  }
}

export function dismissPrompt(): void {
  try {
    window.sessionStorage.setItem(PROMPT_DISMISSED, "1");
  } catch {
    // storage unavailable
  }
}
