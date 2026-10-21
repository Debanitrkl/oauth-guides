import { describe, expect, it } from "vitest";
import { verifyClaims } from "../lib/pipeline/verify";
import { htmlToText, isOfficialHost, normalize, quoteFoundIn, slugify } from "../lib/text";

describe("htmlToText", () => {
  it("drops scripts, nav and tags, keeps text and entities", () => {
    const html = `<html><head><title>T</title><script>x()</script></head><body><nav>menu</nav><h1>Hello &amp; welcome</h1><p>Up to <b>500</b> users.</p><ul><li>one</li><li>two</li></ul></body></html>`;
    const t = htmlToText(html);
    expect(t).not.toMatch(/menu|x\(\)/);
    expect(t).toMatch(/Hello & welcome/);
    expect(t).toMatch(/Up to 500 users\./);
    expect(t).toMatch(/- one/);
  });
});

describe("normalize and quoteFoundIn", () => {
  it("matches across curly quotes, dashes, case and whitespace", () => {
    const page = "Once your app has production status, you can’t change its name.\n\nTwo weeks – that is the window.";
    expect(quoteFoundIn("once your app has production status, you can't change its name", page)).toBe(true);
    expect(quoteFoundIn("Two weeks - that is the  window", page)).toBe(true);
    expect(quoteFoundIn("approval within 24 hours", page)).toBe(false);
  });
  it("refuses very short quotes", () => {
    expect(quoteFoundIn("two weeks", "two weeks")).toBe(false);
    expect(normalize("A–B  “c”")).toBe("a b c");
  });
});

describe("isOfficialHost and slugify", () => {
  it("matches subdomains of official domains only", () => {
    expect(isOfficialHost("docs.github.com", ["github.com"])).toBe(true);
    expect(isOfficialHost("github.com", ["github.com"])).toBe(true);
    expect(isOfficialHost("notgithub.com", ["github.com"])).toBe(false);
    expect(isOfficialHost("learn.microsoft.com", ["linkedin.com", "microsoft.com"])).toBe(true);
  });
  it("slugifies domains", () => {
    expect(slugify("https://www.Dropbox.com/")).toBe("dropbox-com");
    expect(slugify("Meta (Instagram)")).toBe("meta-instagram");
  });
});

describe("verifyClaims", () => {
  const pages = [
    {
      source: { id: "src-1", url: "https://a", host: "a", official: true, retrievedAt: "", status: "fetched" as const },
      text: "Development apps can link up to 500 total Dropbox users. Once 50 users have linked you have two weeks.",
    },
  ];
  it("keeps verified quotes, drops missing ones, strips bad ids and overlong quotes", () => {
    const r = verifyClaims(
      [
        { id: "c1", text: "500 users", kind: "tester_limit", sourceId: "src-1", quote: "link up to 500 total Dropbox users" },
        { id: "c1", text: "dup", kind: "fact", sourceId: "src-1", quote: "link up to 500 total Dropbox users" },
        { id: "c2", text: "fake", kind: "fact", sourceId: "src-1", quote: "approval takes one business day" },
        { id: "c3", text: "unknown source", kind: "fact", sourceId: "src-9", quote: "two weeks to apply" },
      ],
      pages,
    );
    expect(r.kept.map((c) => c.id)).toEqual(["c1"]);
    expect(r.dropped.map((d) => d.id).sort()).toEqual(["c2", "c3"]);
    expect(r.stripped).toBe(1);
  });
});
