import { describe, expect, it } from "vitest";
import { GUIDE_TABS } from "../guide";
import { SITE } from "../../../../../lib/site";

/**
 * Content integrity for the education sources.
 *
 * The rule the statistics milestone tightens at AC-56: a user-facing PROSE
 * string may not state a bare number. Every third-party figure must carry a
 * citation link or a `{cite}` tag plus the words "cited, not computed by this
 * tool". The scaffold keeps all prose digit-free and leaves the citation rails
 * for the milestone that ships the cited research hook (SPEC §0).
 */

const DIGIT = /\d/;

function hasCitation(text: string): boolean {
  return (
    text.includes("https://") ||
    text.includes("{cite:") ||
    text.includes("cited, not computed by this tool")
  );
}

describe("guide content", () => {
  it("renders every tab from a single source array", () => {
    expect(GUIDE_TABS.length).toBeGreaterThan(0);
    for (const tab of GUIDE_TABS) {
      expect(tab.id).toBeTruthy();
      expect(tab.label).toBeTruthy();
      expect(tab.title).toBeTruthy();
      expect(tab.blurb).toBeTruthy();
      expect(tab.code).toBeTruthy();
    }
  });

  it("keeps guide prose free of uncited numbers", () => {
    for (const tab of GUIDE_TABS) {
      for (const prose of [tab.blurb, tab.title]) {
        if (DIGIT.test(prose)) {
          expect(hasCitation(prose), `uncited number in: ${prose}`).toBe(true);
        }
      }
    }
  });
});

describe("FAQ content", () => {
  it("renders every answer from the same array the JSON-LD uses", () => {
    expect(SITE.faqs.length).toBeGreaterThan(0);
    for (const faq of SITE.faqs) {
      expect(faq.q.length).toBeGreaterThan(0);
      expect(faq.a.length).toBeGreaterThan(0);
    }
  });

  it("keeps FAQ answers free of uncited numbers", () => {
    for (const faq of SITE.faqs) {
      for (const prose of [faq.q, faq.a]) {
        if (DIGIT.test(prose)) {
          expect(hasCitation(prose), `uncited number in: ${prose}`).toBe(true);
        }
      }
    }
  });

  it("names the canonical origin once", () => {
    expect(SITE.url).toBe("https://judge.norai.tech");
  });
});
