export const THEME_IDS = [
  "sangria",
  "crimson-nights",
  "midnight-blue",
  "royal-ember",
  "forest",
  "violet",
  "slate",
  "amber",
  "rose",
  "cyan",
  "csk",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "midnight-blue";

export const COLOR_MODES = ["light", "dark", "system"] as const;

export type ColorMode = (typeof COLOR_MODES)[number];

export const DEFAULT_COLOR_MODE: ColorMode = "dark";

const THEME_SET = new Set<string>(THEME_IDS);
const MODE_SET = new Set<string>(COLOR_MODES);

export function isValidTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_SET.has(value);
}

export function isValidColorMode(value: unknown): value is ColorMode {
  return typeof value === "string" && MODE_SET.has(value);
}
