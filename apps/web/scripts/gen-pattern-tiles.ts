import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "patterns");
const ICON_BASE = "https://unpkg.com/lucide-static@latest/icons";

type Theme = {
  id: string;
  name: string;
  blurb: string;
  tile: number;
  cols: number;
  scale: number;
  icons: string[];
};

const THEMES: Theme[] = [
  {
    id: "doodles",
    name: "Doodles",
    blurb: "Playful line icons",
    tile: 320,
    cols: 6,
    scale: 0.82,
    icons: [
      "star",
      "heart",
      "smile",
      "music",
      "zap",
      "cloud",
      "moon",
      "sun",
      "gem",
      "flower",
      "leaf",
      "gift",
      "sparkles",
      "anchor",
      "key",
      "rocket",
      "eye",
      "clover",
      "snowflake",
      "bell",
      "coffee",
      "umbrella",
    ],
  },
  {
    id: "shapes",
    name: "Geometry",
    blurb: "Circles, lines & polygons",
    tile: 300,
    cols: 6,
    scale: 0.86,
    icons: [
      "circle",
      "square",
      "triangle",
      "hexagon",
      "octagon",
      "diamond",
      "star",
      "plus",
      "x",
      "minus",
      "asterisk",
      "spline",
      "shapes",
      "pentagon",
    ],
  },
  {
    id: "games",
    name: "Game Night",
    blurb: "Dice, cards & trophies",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "dice-1",
      "dice-3",
      "dice-5",
      "dices",
      "gamepad-2",
      "joystick",
      "trophy",
      "crown",
      "puzzle",
      "target",
      "swords",
      "spade",
      "club",
      "diamond",
      "heart",
      "medal",
      "flag",
    ],
  },
  {
    id: "nature",
    name: "Nature",
    blurb: "Leaves, sun & sky",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "leaf",
      "flower",
      "flower-2",
      "sprout",
      "tree-pine",
      "tree-deciduous",
      "trees",
      "sun",
      "cloud",
      "droplet",
      "snowflake",
      "wind",
      "rainbow",
      "bird",
      "bug",
      "feather",
      "mountain",
    ],
  },
  {
    id: "space",
    name: "Cosmos",
    blurb: "Rockets, stars & planets",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "rocket",
      "star",
      "moon",
      "moon-star",
      "sun",
      "sparkles",
      "orbit",
      "satellite",
      "satellite-dish",
      "telescope",
      "atom",
      "radar",
      "globe",
      "zap",
    ],
  },
  {
    id: "ocean",
    name: "Ocean",
    blurb: "Fish, waves & anchors",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "fish",
      "fish-symbol",
      "waves",
      "sailboat",
      "ship",
      "ship-wheel",
      "shell",
      "life-buoy",
      "anchor",
      "droplets",
      "compass",
      "container",
    ],
  },
  {
    id: "food",
    name: "Foodie",
    blurb: "Pizza, coffee & sweets",
    tile: 320,
    cols: 6,
    scale: 0.82,
    icons: [
      "pizza",
      "coffee",
      "ice-cream-cone",
      "cake",
      "cake-slice",
      "apple",
      "cherry",
      "banana",
      "croissant",
      "cookie",
      "candy",
      "wine",
      "beer",
      "utensils",
      "egg",
      "carrot",
      "grape",
      "popcorn",
    ],
  },
  {
    id: "weather",
    name: "Weather",
    blurb: "Clouds, sun & snow",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "cloud",
      "cloud-rain",
      "cloud-snow",
      "cloud-lightning",
      "cloud-drizzle",
      "cloud-sun",
      "cloud-moon",
      "sun",
      "moon",
      "snowflake",
      "umbrella",
      "wind",
      "rainbow",
      "droplet",
      "tornado",
      "sunrise",
    ],
  },
  {
    id: "music",
    name: "Music",
    blurb: "Notes, mics & vinyl",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "music",
      "music-2",
      "music-3",
      "music-4",
      "headphones",
      "mic",
      "mic-2",
      "radio",
      "disc",
      "disc-3",
      "guitar",
      "piano",
      "drum",
      "speaker",
      "audio-lines",
    ],
  },
  {
    id: "tech",
    name: "Tech",
    blurb: "Code, chips & wifi",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "cpu",
      "code",
      "terminal",
      "wifi",
      "battery",
      "smartphone",
      "mouse",
      "keyboard",
      "monitor",
      "server",
      "database",
      "bug",
      "binary",
      "bluetooth",
      "hard-drive",
      "plug-zap",
    ],
  },
  {
    id: "travel",
    name: "Wanderlust",
    blurb: "Planes, maps & tents",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "plane",
      "map",
      "map-pin",
      "compass",
      "luggage",
      "mountain",
      "tent",
      "car",
      "train-front",
      "bus",
      "ship",
      "camera",
      "ticket",
      "globe",
      "bike",
      "backpack",
    ],
  },
  {
    id: "animals",
    name: "Critters",
    blurb: "Cats, dogs & birds",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "cat",
      "dog",
      "bird",
      "fish",
      "bug",
      "rabbit",
      "snail",
      "turtle",
      "squirrel",
      "rat",
      "shrimp",
      "worm",
      "paw-print",
      "feather",
      "bone",
      "egg",
    ],
  },
  {
    id: "party",
    name: "Party",
    blurb: "Gifts, cake & confetti",
    tile: 320,
    cols: 6,
    scale: 0.83,
    icons: [
      "party-popper",
      "gift",
      "cake",
      "cake-slice",
      "sparkles",
      "star",
      "crown",
      "candy",
      "popcorn",
      "wine",
      "music",
      "hand-heart",
      "bell",
    ],
  },
  {
    id: "love",
    name: "Love",
    blurb: "Hearts, stars & blooms",
    tile: 320,
    cols: 6,
    scale: 0.84,
    icons: [
      "heart",
      "heart-handshake",
      "hand-heart",
      "smile",
      "sparkles",
      "star",
      "gift",
      "flower",
      "sun",
      "moon",
      "gem",
      "music",
    ],
  },
  {
    id: "school",
    name: "Stationery",
    blurb: "Pencils, books & rulers",
    tile: 320,
    cols: 6,
    scale: 0.83,
    icons: [
      "pencil",
      "pen-tool",
      "book",
      "book-open",
      "ruler",
      "pencil-ruler",
      "scissors",
      "paperclip",
      "calculator",
      "graduation-cap",
      "backpack",
      "eraser",
      "highlighter",
      "notebook",
      "paintbrush",
      "palette",
      "lightbulb",
      "globe",
    ],
  },
];

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

async function fetchIcon(name: string): Promise<string | null> {
  try {
    const res = await fetch(`${ICON_BASE}/${name}.svg`);
    if (!res.ok) return null;
    const text = await res.text();
    const match = text
      .replace(/<!--[\s\S]*?-->/g, "")
      .match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
    const inner = match?.[1]?.trim();
    return inner && inner.length > 0 ? inner : null;
  } catch {
    return null;
  }
}

type Placement = {
  def: number;
  x: number;
  y: number;
  rot: number;
  scale: number;
};

function layout(theme: Theme, count: number): Placement[] {
  const rand = mulberry32(hashSeed(theme.id));
  const step = theme.tile / theme.cols;
  const out: Placement[] = [];
  for (let row = 0; row < theme.cols; row++) {
    for (let col = 0; col < theme.cols; col++) {
      const jitter = step * 0.32;
      const x = step * (col + 0.5) + (rand() * 2 - 1) * jitter;
      const y = step * (row + 0.5) + (rand() * 2 - 1) * jitter;
      const rot = Math.round((rand() * 2 - 1) * 24);
      const scale = theme.scale * (0.85 + rand() * 0.3);
      const def = Math.floor(rand() * count);
      out.push({ def, x, y, rot, scale });
    }
  }
  return out;
}

function emitUses(theme: Theme, placements: Placement[]): string[] {
  const tile = theme.tile;
  const uses: string[] = [];
  for (const p of placements) {
    const radius = 20 * p.scale;
    for (const dx of [-tile, 0, tile]) {
      if (p.x + dx + radius < 0 || p.x + dx - radius > tile) continue;
      for (const dy of [-tile, 0, tile]) {
        if (p.y + dy + radius < 0 || p.y + dy - radius > tile) continue;
        const tx = round(p.x + dx);
        const ty = round(p.y + dy);
        const s = round(p.scale);
        uses.push(
          `    <use href="#g${p.def}" transform="translate(${tx},${ty}) rotate(${p.rot}) scale(${s}) translate(-12,-12)" />`,
        );
      }
    }
  }
  return uses;
}

async function buildTheme(theme: Theme): Promise<void> {
  const fetched = await Promise.all(
    theme.icons.map(async (name) => ({ name, inner: await fetchIcon(name) })),
  );
  const icons = fetched.filter((f): f is { name: string; inner: string } =>
    Boolean(f.inner),
  );
  const missing = fetched.filter((f) => !f.inner).map((f) => f.name);
  if (missing.length)
    console.warn(`  ${theme.id}: skipped (not found): ${missing.join(", ")}`);
  if (icons.length < 8)
    throw new Error(`${theme.id}: too few icons resolved (${icons.length})`);

  const defs = icons.map((ic, i) => `    <g id="g${i}">${ic.inner}</g>`);
  const placements = layout(theme, icons.length);
  const uses = emitUses(theme, placements);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${theme.tile}" height="${theme.tile}" viewBox="0 0 ${theme.tile} ${theme.tile}" fill="none">
  <!--
    Seamless "${theme.id}" tile generated by scripts/gen-pattern-tiles.ts from
    Lucide icons (ISC license, https://lucide.dev). Used purely as a CSS mask
    (alpha): the stroke colour is irrelevant, only the alpha matters; the visible
    tint comes from the masking element's background-color. Icons crossing a tile
    edge are duplicated on the opposite edge so the repeat is seamless.
  -->
  <defs>
${defs.join("\n")}
  </defs>
  <g stroke="#0f172a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
${uses.join("\n")}
  </g>
</svg>
`;
  const outPath = join(OUT_DIR, `${theme.id}.svg`);
  await Bun.write(outPath, svg);
  console.log(
    `  ${theme.id}: ${icons.length} icons, ${uses.length} placements -> ${theme.id}.svg`,
  );
}

console.log(`Generating ${THEMES.length} pattern tiles into ${OUT_DIR}`);
for (const theme of THEMES) {
  await buildTheme(theme);
}
console.log("done");
