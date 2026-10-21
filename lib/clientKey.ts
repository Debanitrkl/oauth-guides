/**
 * The reviewer's own Anthropic key, kept in the browser only.
 *
 * Remembered keys live in localStorage (this browser, across visits).
 * Unremembered keys live in sessionStorage (this tab, until it closes).
 * The key travels to the server as a request header for that browser's
 * runs and is never logged or stored there. Nothing here runs on the server.
 */

export const KEY_STORAGE = "oauth-guides.anthropicKey";
export const PROMPT_DISMISSED = "oauth-guides.keyPromptDismissed";
/** Fired on window after the key changes, so every mounted component re-reads it. */
export const KEY_EVENT = "oauth-guides:key";
/** Fired on window to open the key prompt from anywhere. */
export const PROMPT_EVENT = "oauth-guides:key-prompt";

export const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

export type SavedKey = { key: string; remembered: boolean };

export function readKey(): SavedKey | null {
  try {
    const local = window.localStorage.getItem(KEY_STORAGE);
    if (local) return { key: local, remembered: true };
    const session = window.sessionStorage.getItem(KEY_STORAGE);
    if (session) return { key: session, remembered: false };
  } catch {
    // storage unavailable
  }
  return null;
}

export function writeKey(key: string, remember: boolean): void {
  const value = key.trim();
  try {
    if (!value) {
      window.localStorage.removeItem(KEY_STORAGE);
      window.sessionStorage.removeItem(KEY_STORAGE);
    } else if (remember) {
      window.localStorage.setItem(KEY_STORAGE, value);
      window.sessionStorage.removeItem(KEY_STORAGE);
    } else {
      window.sessionStorage.setItem(KEY_STORAGE, value);
      window.localStorage.removeItem(KEY_STORAGE);
    }
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
