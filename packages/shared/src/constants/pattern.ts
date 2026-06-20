import type { PatternDef, PatternId } from "../types/pattern";

export const PATTERN_IDS = [
  "doodles",
  "shapes",
  "games",
  "nature",
  "space",
  "ocean",
  "food",
  "weather",
  "music",
  "tech",
  "travel",
  "animals",
  "party",
  "love",
  "school",
  "none",
] as const;

export const DEFAULT_PATTERN = "doodles" as const satisfies PatternId;

export const PATTERNS = [
  {
    id: "doodles",
    name: "Doodles",
    blurb: "Playful line icons",
    src: "/patterns/doodles.svg",
    tile: 320,
  },
  {
    id: "shapes",
    name: "Geometry",
    blurb: "Circles, lines & polygons",
    src: "/patterns/shapes.svg",
    tile: 300,
  },
  {
    id: "games",
    name: "Game Night",
    blurb: "Dice, cards & trophies",
    src: "/patterns/games.svg",
    tile: 320,
  },
  {
    id: "nature",
    name: "Nature",
    blurb: "Leaves, sun & sky",
    src: "/patterns/nature.svg",
    tile: 320,
  },
  {
    id: "space",
    name: "Cosmos",
    blurb: "Rockets, stars & planets",
    src: "/patterns/space.svg",
    tile: 320,
  },
  {
    id: "ocean",
    name: "Ocean",
    blurb: "Fish, waves & anchors",
    src: "/patterns/ocean.svg",
    tile: 320,
  },
  {
    id: "food",
    name: "Foodie",
    blurb: "Pizza, coffee & sweets",
    src: "/patterns/food.svg",
    tile: 320,
  },
  {
    id: "weather",
    name: "Weather",
    blurb: "Clouds, sun & snow",
    src: "/patterns/weather.svg",
    tile: 320,
  },
  {
    id: "music",
    name: "Music",
    blurb: "Notes, mics & vinyl",
    src: "/patterns/music.svg",
    tile: 320,
  },
  {
    id: "tech",
    name: "Tech",
    blurb: "Code, chips & wifi",
    src: "/patterns/tech.svg",
    tile: 320,
  },
  {
    id: "travel",
    name: "Wanderlust",
    blurb: "Planes, maps & tents",
    src: "/patterns/travel.svg",
    tile: 320,
  },
  {
    id: "animals",
    name: "Critters",
    blurb: "Cats, dogs & birds",
    src: "/patterns/animals.svg",
    tile: 320,
  },
  {
    id: "party",
    name: "Party",
    blurb: "Gifts, cake & confetti",
    src: "/patterns/party.svg",
    tile: 320,
  },
  {
    id: "love",
    name: "Love",
    blurb: "Hearts, stars & blooms",
    src: "/patterns/love.svg",
    tile: 320,
  },
  {
    id: "school",
    name: "Stationery",
    blurb: "Pencils, books & rulers",
    src: "/patterns/school.svg",
    tile: 320,
  },
  { id: "none", name: "None", blurb: "Solid background", src: null, tile: 0 },
] satisfies PatternDef[];

export function getPatternDef(id: string): PatternDef | undefined {
  return PATTERNS.find((p) => p.id === id);
}

export const PATTERN_STORAGE_KEY = "gl-pattern";
