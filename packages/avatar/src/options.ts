import type { AvatarColorKey, AvatarOptionKey, AvatarStyle } from "./types";

export const AVATAR_OPTIONS: Record<AvatarOptionKey, string[]> = {
  top: [
    "shortFlat",
    "shortRound",
    "shortWaved",
    "shortCurly",
    "theCaesar",
    "theCaesarAndSidePart",
    "sides",
    "shavedSides",
    "dreads",
    "dreads01",
    "dreads02",
    "frida",
    "frizzle",
    "fro",
    "froBand",
    "curly",
    "curvy",
    "bigHair",
    "bob",
    "bun",
    "longButNotTooLong",
    "miaWallace",
    "shaggy",
    "shaggyMullet",
    "straight01",
    "straight02",
    "straightAndStrand",
    "hat",
    "hijab",
    "turban",
    "winterHat1",
    "winterHat02",
    "winterHat03",
    "winterHat04",
  ],
  accessories: [
    "none",
    "round",
    "prescription01",
    "prescription02",
    "wayfarers",
    "sunglasses",
    "eyepatch",
    "kurt",
  ],
  facialHair: [
    "none",
    "beardLight",
    "beardMedium",
    "beardMajestic",
    "moustacheFancy",
    "moustacheMagnum",
  ],
  clothing: [
    "shirtCrewNeck",
    "shirtScoopNeck",
    "shirtVNeck",
    "hoodie",
    "collarAndSweater",
    "graphicShirt",
    "blazerAndShirt",
    "blazerAndSweater",
    "overall",
  ],
  eyes: [
    "default",
    "happy",
    "wink",
    "squint",
    "surprised",
    "hearts",
    "side",
    "eyeRoll",
    "winkWacky",
    "closed",
    "cry",
    "xDizzy",
  ],
  eyebrows: [
    "default",
    "defaultNatural",
    "flatNatural",
    "raisedExcited",
    "raisedExcitedNatural",
    "sadConcerned",
    "angryNatural",
    "frownNatural",
    "unibrowNatural",
    "upDown",
  ],
  mouth: [
    "default",
    "smile",
    "twinkle",
    "tongue",
    "serious",
    "eating",
    "grimace",
    "disbelief",
    "concerned",
    "sad",
    "screamOpen",
  ],
};

export const AVATAR_COLORS: Record<AvatarColorKey, string[]> = {
  skinColor: ["614335", "ae5d29", "d08b5b", "edb98a", "ffdbb4", "fd9841"],
  hairColor: [
    "2c1b18",
    "4a312c",
    "724133",
    "a55728",
    "b58143",
    "d6b370",
    "c93305",
    "f59797",
    "ecdcbf",
    "e8e1e1",
  ],
  facialHairColor: [
    "2c1b18",
    "4a312c",
    "724133",
    "a55728",
    "b58143",
    "d6b370",
    "c93305",
    "e8e1e1",
  ],
  hatColor: [
    "262e33",
    "3c4f5c",
    "25557c",
    "5199e4",
    "65c9ff",
    "929598",
    "a7ffc4",
    "b1e2ff",
    "ff488e",
    "ff5c5c",
    "ffafb9",
    "ffffff",
  ],
  clothesColor: [
    "262e33",
    "3c4f5c",
    "25557c",
    "5199e4",
    "65c9ff",
    "929598",
    "a7ffc4",
    "b1e2ff",
    "ff488e",
    "ff5c5c",
    "ffafb9",
    "ffffb1",
    "ffffff",
  ],
  accessoriesColor: [
    "262e33",
    "3c4f5c",
    "25557c",
    "5199e4",
    "65c9ff",
    "929598",
    "a7ffc4",
    "b1e2ff",
    "ff488e",
    "ff5c5c",
    "ffafb9",
    "ffffff",
  ],
  backgroundColor: [
    "b6e3f4",
    "c0aede",
    "d1d4f9",
    "ffd5dc",
    "ffdfbf",
    "c6f6d5",
    "fde68a",
    "e9d5ff",
  ],
};

export const HAT_TOPS = new Set<string>([
  "hat",
  "hijab",
  "turban",
  "winterHat1",
  "winterHat02",
  "winterHat03",
  "winterHat04",
]);

export function isHatTop(top: string): boolean {
  return HAT_TOPS.has(top);
}

export const AVATAR_STYLES: readonly AvatarStyle[] = [
  "any",
  "feminine",
  "masculine",
];

const LONG_TOPS = [
  "bob",
  "bun",
  "curly",
  "curvy",
  "longButNotTooLong",
  "miaWallace",
  "straight01",
  "straight02",
  "straightAndStrand",
  "bigHair",
  "frida",
];

const SHORT_TOPS = [
  "shortFlat",
  "shortRound",
  "shortWaved",
  "shortCurly",
  "theCaesar",
  "theCaesarAndSidePart",
  "sides",
  "shavedSides",
  "frizzle",
];

const NEUTRAL_TOPS = [
  "dreads",
  "dreads01",
  "dreads02",
  "fro",
  "froBand",
  "shaggy",
  "shaggyMullet",
];

const HAT_TOP_LIST = [
  "hat",
  "hijab",
  "turban",
  "winterHat1",
  "winterHat02",
  "winterHat03",
  "winterHat04",
];

export function topsForStyle(style: AvatarStyle): string[] {
  if (style === "feminine")
    return [...LONG_TOPS, ...NEUTRAL_TOPS, ...HAT_TOP_LIST];
  if (style === "masculine")
    return [...SHORT_TOPS, ...NEUTRAL_TOPS, ...HAT_TOP_LIST];
  return AVATAR_OPTIONS.top;
}

export function isAvatarStyle(value: unknown): value is AvatarStyle {
  return value === "feminine" || value === "masculine" || value === "any";
}
