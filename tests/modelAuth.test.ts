import { describe, expect, it } from "vitest";
import { resolveModelAuth, WORKSPACE_PATTERN } from "../lib/pipeline/model";

describe("resolveModelAuth", () => {
  const server = { ANTHROPIC_API_KEY: "sk-ant-api03-server", ANTHROPIC_WORKSPACE_ID: "wrkspc_server1234" };

  it("uses the server key with the server workspace", () => {
    expect(resolveModelAuth({}, server)).toEqual({ apiKey: "sk-ant-api03-server", workspaceId: "wrkspc_server1234" });
  });

  it("adds no workspace header when the server has none", () => {
    expect(resolveModelAuth({}, { ANTHROPIC_API_KEY: "sk-ant-api03-server" })).toEqual({ apiKey: "sk-ant-api03-server" });
  });

  it("never attaches the server workspace to a reviewer's own key", () => {
    expect(resolveModelAuth({ apiKey: "sk-ant-api03-own" }, server)).toEqual({ apiKey: "sk-ant-api03-own" });
  });

  it("sends the workspace that came with a reviewer's user scoped key", () => {
    expect(resolveModelAuth({ apiKey: "sk-ant-usr-own", workspaceId: "wrkspc_own5678" }, server)).toEqual({ apiKey: "sk-ant-usr-own", workspaceId: "wrkspc_own5678" });
  });

  it("throws without any key", () => {
    expect(() => resolveModelAuth({}, {})).toThrow(/No Anthropic API key/);
  });

  it("recognises workspace ids", () => {
    expect(WORKSPACE_PATTERN.test("wrkspc_013rTXwAV67iXQrosWTx1W5E")).toBe(true);
    expect(WORKSPACE_PATTERN.test("sk-ant-usr-abc")).toBe(false);
  });
});
