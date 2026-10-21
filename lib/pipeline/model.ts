import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * The model is used in exactly two stages: Resolve and Extract. Everything
 * else is code. The model id is configurable because key access differs.
 */
export function modelId(): string {
  return process.env.GUIDES_MODEL ?? "claude-sonnet-5-5";
}

/**
 * Credentials for one run. Either field may come from the request (a
 * reviewer's own key and, for user scoped keys, their workspace id) and
 * falls back to the server environment. A user scoped key (sk-ant-usr-)
 * is refused by the API without the anthropic-workspace-id header, so the
 * workspace id travels as a default header on every call.
 */
export type ModelAuth = { apiKey?: string; workspaceId?: string };

export const WORKSPACE_PATTERN = /^wrkspc_[A-Za-z0-9]{8,}$/;

/**
 * Which key and workspace a run uses. A key from the request is used as
 * sent, with the workspace id sent beside it if any; the server's workspace
 * id applies to the server's key only, since it belongs to that account.
 * Most keys need no workspace id at all, and none is added for them.
 */
export function resolveModelAuth(auth: ModelAuth = {}, env: Record<string, string | undefined> = process.env): { apiKey: string; workspaceId?: string } {
  const own = (auth.apiKey ?? "").trim();
  const apiKey = own || env.ANTHROPIC_API_KEY || "";
  if (!apiKey) throw new Error("No Anthropic API key. Set ANTHROPIC_API_KEY on the server, paste your own key on the generate page, or set GUIDES_MOCK=1 to run from fixtures.");
  const sentWorkspace = (auth.workspaceId ?? "").trim();
  const workspaceId = own ? sentWorkspace : sentWorkspace || env.ANTHROPIC_WORKSPACE_ID || "";
  return workspaceId ? { apiKey, workspaceId } : { apiKey };
}

export function anthropic(auth: ModelAuth = {}) {
  const { apiKey, workspaceId } = resolveModelAuth(auth);
  return createAnthropic({ apiKey, ...(workspaceId ? { headers: { "anthropic-workspace-id": workspaceId } } : {}) });
}

export function hasServerKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function hasServerWorkspace(): boolean {
  return !!process.env.ANTHROPIC_WORKSPACE_ID;
}

export function isMock(): boolean {
  return process.env.GUIDES_MOCK === "1";
}

export function stripFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : text).trim();
}

export function lastJsonObject(text: string): string | null {
  const s = stripFences(text);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}
