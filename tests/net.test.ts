import { describe, expect, it } from "vitest";
import { assertPublicUrl, BlockedUrlError } from "../lib/net";

describe("assertPublicUrl", () => {
  it("refuses non http schemes, localhost, private addresses and metadata hosts", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://10.0.0.5/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://192.168.1.1/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://[::1]/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://metadata.google.internal/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("not a url")).rejects.toBeInstanceOf(BlockedUrlError);
  });
  it("accepts a public literal address", async () => {
    const u = await assertPublicUrl("https://1.1.1.1/");
    expect(u.hostname).toBe("1.1.1.1");
  });
});
