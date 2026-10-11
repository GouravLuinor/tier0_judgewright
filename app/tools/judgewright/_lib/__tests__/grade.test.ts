import { describe, expect, it } from "vitest";
import {
  GRADE_CONVENTION_COPY,
  GRADE_NEGATIVE_LABEL,
  GRADE_UNDEFINED,
  gradeCopy,
  landisKochLabel,
  letterGrade,
} from "../grade";

describe("letterGrade — the Landis–Koch bands (AC-26)", () => {
  it("maps the band boundaries exactly", () => {
    expect(letterGrade(1)).toBe("A");
    expect(letterGrade(0.8)).toBe("A");
    expect(letterGrade(0.7999)).toBe("B");
    expect(letterGrade(0.6)).toBe("B");
    expect(letterGrade(0.5999)).toBe("C");
    expect(letterGrade(0.4)).toBe("C");
    expect(letterGrade(0.3999)).toBe("D");
    expect(letterGrade(0.2)).toBe("D");
    expect(letterGrade(0.1999)).toBe("F");
    expect(letterGrade(0)).toBe("F");
    expect(letterGrade(-0.5)).toBe("F");
  });

  it("labels each band and calls a negative κ what it is", () => {
    expect(landisKochLabel(0.9)).toBe("almost perfect");
    expect(landisKochLabel(0.7)).toBe("substantial");
    expect(landisKochLabel(0.5)).toBe("moderate");
    expect(landisKochLabel(0.3)).toBe("fair");
    expect(landisKochLabel(0.1)).toBe("slight");
    expect(landisKochLabel(-0.01)).toBe(GRADE_NEGATIVE_LABEL);
    expect(landisKochLabel(-0.01)).toBe("worse than chance");
    expect(landisKochLabel(-1)).toBe(GRADE_NEGATIVE_LABEL);
  });

  it("a null κ is a dash with an empty label — never a fabricated grade", () => {
    expect(letterGrade(null)).toBe(GRADE_UNDEFINED);
    expect(letterGrade(null)).toBe("—");
    expect(landisKochLabel(null)).toBe("");
    expect(letterGrade(Number.NaN)).toBe(GRADE_UNDEFINED);
  });

  it("discloses the convention as a convenience mapping on unweighted κ", () => {
    expect(GRADE_CONVENTION_COPY).toBe(
      "A–F bands are the Landis–Koch convention applied to unweighted κ — a convenience mapping, not a standard"
    );
    expect(gradeCopy(0.5192307692307692)).toContain(GRADE_CONVENTION_COPY);
    expect(gradeCopy(0.5192307692307692)).toBe(
      `C — moderate (${GRADE_CONVENTION_COPY})`
    );
    expect(gradeCopy(null)).toBe("κ undefined — no letter grade");
  });

  it("carries the negative-κ headline copy (AC-57)", () => {
    expect(gradeCopy(-0.5)).toContain("worse than chance");
  });
});
