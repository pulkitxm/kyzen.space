import type { PatternDef, PatternId } from "../types/pattern";

export const PATTERN_IDS = [
  "doodles",
  "games",
  "shapes",
  "nature",
  "none",
] as const;

export const DEFAULT_PATTERN = "doodles" as const satisfies PatternId;

export const PATTERNS = [
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
  { id: "none", name: "None", blurb: "Solid background", src: null, tile: 0 },
] satisfies PatternDef[];

export function getPatternDef(id: string): PatternDef | undefined {
  return PATTERNS.find((p) => p.id === id);
}

export const PATTERN_STORAGE_KEY = "gl-pattern";
