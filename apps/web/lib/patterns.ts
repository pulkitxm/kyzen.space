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
  blurb: string;
  src: string | null;
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

export const PATTERN_STORAGE_KEY = "gl-pattern";

export const PATTERN_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem("${PATTERN_STORAGE_KEY}");var ok=${JSON.stringify(
  PATTERN_IDS,
)};if(v&&ok.indexOf(v)!==-1){document.documentElement.setAttribute("data-pattern",v);}}catch(e){}})();`;
