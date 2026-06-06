import type { ColorMode, ThemeDef, ThemeId } from "../types/theme";

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

export const DEFAULT_THEME = "amber" as const satisfies ThemeId;

export const COLOR_MODES = ["light", "dark", "system"] as const;

export const DEFAULT_COLOR_MODE = "system" as const satisfies ColorMode;

export const THEMES = [
  {
    id: "sangria",
    name: "Sangria",
    blurb: "Navy & crimson",
    deep: "#021c4f",
    vivid: "#c50337",
  },
  {
    id: "crimson-nights",
    name: "Crimson Nights",
    blurb: "Night & red",
    deep: "#02182b",
    vivid: "#d7263d",
  },
  {
    id: "midnight-blue",
    name: "Midnight Blue",
    blurb: "Inky blue depths",
    deep: "#02060e",
    vivid: "#0356c5",
  },
  {
    id: "royal-ember",
    name: "Royal Ember",
    blurb: "Teal & emerald",
    deep: "#013f4a",
    vivid: "#068562",
  },
  {
    id: "forest",
    name: "Forest",
    blurb: "Pine & green",
    deep: "#05140d",
    vivid: "#22a559",
  },
  {
    id: "violet",
    name: "Violet",
    blurb: "Indigo & purple",
    deep: "#0d0a1f",
    vivid: "#7c3aed",
  },
  {
    id: "slate",
    name: "Slate",
    blurb: "Graphite & sky",
    deep: "#0f1319",
    vivid: "#4f8fd6",
  },
  {
    id: "amber",
    name: "Amber",
    blurb: "Espresso & gold",
    deep: "#1a0f04",
    vivid: "#e0921f",
  },
  {
    id: "rose",
    name: "Rose",
    blurb: "Wine & pink",
    deep: "#1f0712",
    vivid: "#e84d8a",
  },
  {
    id: "cyan",
    name: "Cyan",
    blurb: "Teal & cyan",
    deep: "#03161a",
    vivid: "#06b6d4",
  },
  {
    id: "csk",
    name: "Super Kings",
    blurb: "Yellow & navy",
    deep: "#0a1b40",
    vivid: "#fdb913",
  },
] satisfies ThemeDef[];

export function getThemeDef(id: string): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id);
}

export const PALETTE_STORAGE_KEY = "gl-palette";
