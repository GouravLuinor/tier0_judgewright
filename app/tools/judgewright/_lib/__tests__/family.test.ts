import { describe, expect, it } from "vitest";
import { COMPANY, FAMILY_TOOLS, SITE } from "../../../../../lib/site";

describe("Nor AI family thread", () => {
  it("lists every tool exactly once, Judgewright included so the footer can filter it", () => {
    const names = FAMILY_TOOLS.map((t) => t.name);
    expect([...names].sort()).toEqual(
      ["Anchorflow", "Grounded RAG", "Judgewright", "RegexCraft", "SchemaCraft", "Smart Rozgar", "TokenCraft"]
    );
    expect(new Set(names).size).toBe(names.length);
    expect(FAMILY_TOOLS.find((t) => t.name === "Grounded RAG")?.href).toBe("https://rag.norai.tech");
    expect(FAMILY_TOOLS.find((t) => t.name === SITE.name)?.href).toBe(SITE.url);
  });

  it("links to the company and keeps the search title under 60 characters", () => {
    expect(COMPANY.url).toBe("https://norai.tech");
    expect(COMPANY.orgId).toBe("https://norai.tech/#organization");
    expect(SITE.seoTitle).toContain("Nor AI");
    expect(SITE.seoTitle.length).toBeLessThan(60);
  });
});
