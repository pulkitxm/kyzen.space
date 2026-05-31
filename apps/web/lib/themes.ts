// Appearance catalog (web source of truth for the picker UI + palette boot).
// Two independent axes:
//   - theme: which color palette (each defines its own light + dark colors via CSS)
//   - colorMode: light / dark / system
// Keep the id lists in sync with apps/server/src/lib/theme.ts (the server uses
// the same ids to validate the persisted preference).

export const THEME_IDS = [
  "sangria",
  "crimson-nights",
  "midnight-blue",
  "royal-ember",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "midnight-blue";

export const COLOR_MODES = ["light", "dark", "system"] as const;

export type ColorMode = (typeof COLOR_MODES)[number];

export const DEFAULT_COLOR_MODE: ColorMode = "dark";

export interface ThemeDef {
  id: ThemeId;
  name: string;
  /** Short blurb shown under the name on the picker card. */
  blurb: string;
  /** The two brand colors — deep base + vivid accent (the image's hex pair). */
  deep: string;
  vivid: string;
}

export const THEMES: ThemeDef[] = [
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
];

const THEME_SET = new Set<string>(THEME_IDS);
const MODE_SET = new Set<string>(COLOR_MODES);

export function isValidTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_SET.has(value);
}

export function isValidColorMode(value: unknown): value is ColorMode {
  return typeof value === "string" && MODE_SET.has(value);
}

export function getThemeDef(id: string): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id);
}

/** The theme's signature gradient (deep -> vivid), matching the in-app dark look. */
export function themeGradient(def: ThemeDef): string {
  return `linear-gradient(160deg, ${def.deep} 0%, ${def.vivid} 100%)`;
}

// --- Palette boot (no-flash) -------------------------------------------------
// next-themes handles the light/dark *mode* class. The palette lives in a
// `data-theme` attribute, so we apply the stored palette before paint here.

export const PALETTE_STORAGE_KEY = "gl-palette";

export const PALETTE_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${PALETTE_STORAGE_KEY}");var ok=${JSON.stringify(
  THEME_IDS,
)};if(v&&ok.indexOf(v)!==-1){document.documentElement.setAttribute("data-theme",v);}}catch(e){}})();`;
