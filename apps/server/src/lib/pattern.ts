// Background pattern catalog (server-side source of truth for validation).
// "pattern" is the third appearance axis (alongside theme + colorMode). Keep
// this id list in sync with apps/web/lib/patterns.ts (the web catalog adds the
// visual metadata used to render the picker).

export const PATTERN_IDS = [
  "doodles",
  "games",
  "shapes",
  "nature",
  "none",
] as const;

export type PatternId = (typeof PATTERN_IDS)[number];

export const DEFAULT_PATTERN: PatternId = "doodles";

const PATTERN_SET = new Set<string>(PATTERN_IDS);

export function isValidPattern(value: unknown): value is PatternId {
  return typeof value === "string" && PATTERN_SET.has(value);
}
