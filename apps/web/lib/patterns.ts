// Background pattern catalog (web source of truth for the picker UI + boot).
// "pattern" is the third appearance axis (alongside theme + colorMode): which
// doodle tile is masked behind the app. Each tile is theme-tinted via CSS, so
// only the shape changes here. Keep the id list in sync with
// apps/server/src/lib/pattern.ts (the server validates the persisted choice).

export const PATTERN_IDS = [
  "doodles",
  "games",
  "shapes",
  "nature",
  "none",
] as const;

export type PatternId = (typeof PATTERN_IDS)[number];

export const DEFAULT_PATTERN: PatternId = "doodles";

export interface PatternDef {
  id: PatternId;
  name: string;
  /** Short blurb shown under the name on the picker card. */
  blurb: string;
  /** Public asset path for the tile, or null for "none" (solid background). */
  src: string | null;
  /** Tile size in px for `mask-size` / the preview swatch. */
  tile: number;
}

export const PATTERNS: PatternDef[] = [
  {
    id: "doodles",
    name: "Doodles",
    blurb: "Playful line icons",
    src: "/patterns/doodles.svg",
    tile: 360,
  },
  {
    id: "games",
    name: "Games",
    blurb: "Dice, cards & crowns",
    src: "/patterns/games.svg",
    tile: 320,
  },
  {
    id: "shapes",
    name: "Sketch",
    blurb: "Eclectic line doodles",
    src: "/patterns/shapes.svg",
    tile: 360,
  },
  {
    id: "nature",
    name: "Nature",
    blurb: "Leaves, sun & sky",
    src: "/patterns/nature.svg",
    tile: 360,
  },
  {
    id: "none",
    name: "None",
    blurb: "Solid background",
    src: null,
    tile: 0,
  },
];

const PATTERN_SET = new Set<string>(PATTERN_IDS);

export function isValidPattern(value: unknown): value is PatternId {
  return typeof value === "string" && PATTERN_SET.has(value);
}

export function getPatternDef(id: string): PatternDef | undefined {
  return PATTERNS.find((p) => p.id === id);
}

// --- Pattern boot (no-flash) -------------------------------------------------
// Applies the stored pattern to <html data-pattern> before paint, mirroring the
// palette boot in lib/themes.ts.

export const PATTERN_STORAGE_KEY = "gl-pattern";

export const PATTERN_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${PATTERN_STORAGE_KEY}");var ok=${JSON.stringify(
  PATTERN_IDS,
)};if(v&&ok.indexOf(v)!==-1){document.documentElement.setAttribute("data-pattern",v);}}catch(e){}})();`;
