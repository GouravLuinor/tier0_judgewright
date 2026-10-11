import { describe, expect, it } from "vitest";
import {
  familyOf,
  isKnownLabel,
  isKnownVocabulary,
  knownFamilies,
  normalizeLabel,
  vocabularyError,
} from "../labels";

describe("normalizeLabel — alias folding", () => {
  it("folds case and whitespace", () => {
    expect(normalizeLabel("  PASS ")).toBe("pass");
    expect(normalizeLabel("Fail")).toBe("fail");
  });

  it("maps every known family member to its canonical value", () => {
    expect(normalizeLabel("passed")).toBe("pass");
    expect(normalizeLabel("failure")).toBe("fail");
    expect(normalizeLabel("YES")).toBe("yes");
    expect(normalizeLabel("T")).toBe("true");
    expect(normalizeLabel("FALSE")).toBe("false");
    expect(normalizeLabel("1")).toBe("1");
    expect(normalizeLabel("0")).toBe("0");
    expect(normalizeLabel("GOOD")).toBe("good");
    expect(normalizeLabel("A")).toBe("a");
  });

  it("keeps unknown values in their trimmed lowercase form", () => {
    expect(normalizeLabel("OK")).toBe("ok");
    expect(normalizeLabel("  Maybe ")).toBe("maybe");
    expect(normalizeLabel("RED")).toBe("red");
  });

  it("reports the family a canonical value belongs to", () => {
    expect(familyOf("pass")).toBe("pass/fail");
    expect(familyOf("1")).toBe("1/0");
    expect(familyOf("ok")).toBeNull();
  });
});

describe("isKnownLabel", () => {
  it("recognizes every canonical family member", () => {
    for (const label of ["pass", "fail", "yes", "no", "true", "false", "1", "0", "good", "bad", "a", "b"]) {
      expect(isKnownLabel(label)).toBe(true);
    }
  });

  it("rejects unknown-but-consistent values", () => {
    expect(isKnownLabel("ok")).toBe(false);
    expect(isKnownLabel("maybe")).toBe(false);
  });
});

describe("knownFamilies — the distinct families present", () => {
  it("finds one family for a single known pair", () => {
    expect(knownFamilies(["pass", "fail"])).toEqual(["pass/fail"]);
  });

  it("finds two families for a mixed pair", () => {
    expect(knownFamilies(["pass", "fail", "true"])).toEqual(["pass/fail", "true/false"]);
  });

  it("ignores unknown members entirely", () => {
    expect(knownFamilies(["good", "ok", "bad"])).toEqual(["good/bad"]);
    expect(knownFamilies(["red", "green"])).toEqual([]);
  });

  it("is order-independent and de-duplicated", () => {
    expect(knownFamilies(["no", "yes", "no", "yes"])).toEqual(["yes/no"]);
  });
});

describe("isKnownVocabulary — the FM-2 predicate", () => {
  it("accepts a single known family", () => {
    expect(isKnownVocabulary(["pass", "fail"])).toBe(true);
    expect(isKnownVocabulary(["true", "false", "maybe"])).toBe(true);
  });

  it("accepts an all-unknown label set (k-class passports)", () => {
    expect(isKnownVocabulary(["good", "ok", "bad"])).toBe(true);
    expect(isKnownVocabulary(["red", "green", "blue"])).toBe(true);
  });

  it("rejects two known families", () => {
    expect(isKnownVocabulary(["pass", "fail", "true"])).toBe(false);
    expect(isKnownVocabulary(["pass", "fail", "1"])).toBe(false);
    expect(isKnownVocabulary(["pass", "true"])).toBe(false);
    expect(isKnownVocabulary(["0", "no"])).toBe(false);
  });
});

describe("vocabularyError — the FM-2 hard copy", () => {
  it("returns null for a legal label set", () => {
    expect(vocabularyError(["good", "ok", "bad"])).toBeNull();
    expect(vocabularyError(["pass", "fail"])).toBeNull();
    expect(vocabularyError(["red", "green", "blue"])).toBeNull();
  });

  it("returns the verbatim FM-2 copy for {PASS, FAIL, TRUE}", () => {
    expect(vocabularyError(["PASS", "FAIL", "TRUE"])).toBe(
      "Labels {PASS, FAIL, TRUE} mix two vocabularies — normalize before comparing. Known aliases: pass/fail, yes/no, true/false, 1/0."
    );
  });

  it("returns the verbatim FM-2 copy for {PASS, FAIL, 1}", () => {
    expect(vocabularyError(["PASS", "FAIL", "1"])).toBe(
      "Labels {PASS, FAIL, 1} mix two vocabularies — normalize before comparing. Known aliases: pass/fail, yes/no, true/false, 1/0."
    );
  });

  it("returns the verbatim FM-2 copy for {0, NO} (numeric/family collision)", () => {
    expect(vocabularyError(["0", "NO"])).toBe(
      "Labels {0, NO} mix two vocabularies — normalize before comparing. Known aliases: pass/fail, yes/no, true/false, 1/0."
    );
  });

  it("lists every distinct raw label in first-appearance order", () => {
    const message = vocabularyError(["yes", "no", "1", "yes"]);
    expect(message).toContain("{yes, no, 1}");
  });
});
