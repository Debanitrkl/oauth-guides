import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * The model is used in exactly two stages: Resolve and Extract. Everything
 * else is code. The model id is configurable because key access differs.
 */
export function modelId(): string {
  return process.env.GUIDES_MODEL ?? "claude-sonnet-5-5";
}

export function anthropic(keyOverride?: string) {
  const apiKey = keyOverride || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No Anthropic API key. Set ANTHROPIC_API_KEY on the server, paste your own key on the generate page, or set GUIDES_MOCK=1 to run from fixtures.");
  return createAnthropic({ apiKey });
}

export function hasServerKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
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
