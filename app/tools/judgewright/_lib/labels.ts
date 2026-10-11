/**
 * Judgewright — label vocabulary normalization (SPEC §2.1.4, C5).
 *
 * The validity rule, decided: UNKNOWN-BUT-CONSISTENT values are a legal label
 * set. The hard error (FM-2) fires only when two values normalize into two
 * different KNOWN families — `PASS`+`TRUE`, `0`+`NO`, `PASS`+`1`. One known
 * family plus unknown members, or all-unknown members, is a perfectly good
 * k-class label set (`{GOOD, OK, BAD}`, `{RED, GREEN, BLUE}`).
 *
 * `normalizeLabel` is the single place case/alias folding happens, so every
 * downstream statistic compares one canonical form per label.
 */

/**
 * Known label families. A family is a pair of canonical values; two values
 * from different families in one session is the FM-2 hard error.
 */
const LABEL_FAMILIES: readonly { family: string; members: Record<string, string> }[] = [
  {
    family: "pass/fail",
    members: {
      pass: "pass",
      passed: "pass",
      passable: "pass",
      fail: "fail",
      failed: "fail",
      failure: "fail",
      failing: "fail",
    },
  },
  {
    family: "yes/no",
    members: { yes: "yes", y: "yes", no: "no", n: "no" },
  },
  {
    family: "true/false",
    members: { true: "true", t: "true", false: "false", f: "false" },
  },
  {
    family: "1/0",
    members: { "1": "1", "0": "0" },
  },
  {
    family: "good/bad",
    members: { good: "good", bad: "bad" },
  },
  {
    family: "a/b",
    members: { a: "a", b: "b" },
  },
];

/** Fast alias → canonical lookup, built once from the family table. */
const ALIAS_TO_CANONICAL = new Map<string, string>();
const CANONICAL_TO_FAMILY = new Map<string, string>();
for (const { family, members } of LABEL_FAMILIES) {
  for (const [alias, canonical] of Object.entries(members)) {
    ALIAS_TO_CANONICAL.set(alias, canonical);
    CANONICAL_TO_FAMILY.set(canonical, family);
  }
}

/** The canonical members of every known family, in table order. */
export const KNOWN_VOCABULARY: readonly string[] = Array.from(
  new Set(ALIAS_TO_CANONICAL.values())
);

/**
 * Canonical form of a raw label: trimmed, lowercased, alias-folded.
 * Unknown values keep their trimmed lowercase form, which is what makes an
 * unknown-but-consistent label set legal.
 */
export function normalizeLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  return ALIAS_TO_CANONICAL.get(key) ?? key;
}

/** True when `normalizeLabel(raw)` lands inside a known family. */
export function isKnownLabel(raw: string): boolean {
  return CANONICAL_TO_FAMILY.has(normalizeLabel(raw));
}

/** The known family a canonical label belongs to, or null when unknown. */
export function familyOf(canonical: string): string | null {
  return CANONICAL_TO_FAMILY.get(canonical) ?? null;
}

/** The distinct known families present among `labels` (order of first sight). */
export function knownFamilies(labels: readonly string[]): string[] {
  const families: string[] = [];
  for (const label of labels) {
    const family = familyOf(normalizeLabel(label));
    if (family !== null && !families.includes(family)) families.push(family);
  }
  return families;
}

/**
 * True when the session uses fewer than TWO distinct known families — the
 * exact FM-2 predicate. Unknown-but-consistent values are valid.
 */
export function isKnownVocabulary(labels: readonly string[]): boolean {
  return knownFamilies(labels).length < 2;
}

/**
 * The single vocabulary hard error of SPEC §2.1.4 / FM-2, verbatim:
 * `Labels {PASS, FAIL, TRUE} mix two vocabularies — normalize before
 * comparing. Known aliases: pass/fail, yes/no, true/false, 1/0.`
 *
 * Returns null when the label set is legal. `rawLabels` are echoed in the
 * message exactly as they appeared in the input.
 */
export function vocabularyError(rawLabels: readonly string[]): string | null {
  if (isKnownVocabulary(rawLabels)) return null;
  const distinct: string[] = [];
  for (const label of rawLabels) {
    if (!distinct.includes(label)) distinct.push(label);
  }
  const listed = distinct.join(", ");
  return (
    `Labels {${listed}} mix two vocabularies — normalize before comparing. ` +
    `Known aliases: pass/fail, yes/no, true/false, 1/0.`
  );
}
