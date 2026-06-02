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
