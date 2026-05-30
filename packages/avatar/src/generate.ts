import {
  AVATAR_COLORS,
  AVATAR_OPTIONS,
  isAvatarStyle,
  topsForStyle,
} from "./options";
import type {
  AvatarColorKey,
  AvatarConfig,
  AvatarOptionKey,
  AvatarStyle,
} from "./types";

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

export function randomAvatarConfig(
  seed?: string,
  style: AvatarStyle = "any",
): AvatarConfig {
  const rnd = seed === undefined ? Math.random : mulberry32(hashSeed(seed));
  const accessoryValues = AVATAR_OPTIONS.accessories.filter(
    (v) => v !== "none",
  );
  const facialHairValues = AVATAR_OPTIONS.facialHair.filter(
    (v) => v !== "none",
  );
  const facialHairChance =
    style === "feminine" ? 0 : style === "masculine" ? 0.45 : 0.25;
  return {
    skinColor: pickFrom(AVATAR_COLORS.skinColor, rnd),
    top: pickFrom(topsForStyle(style), rnd),
    hairColor: pickFrom(AVATAR_COLORS.hairColor, rnd),
    hatColor: pickFrom(AVATAR_COLORS.hatColor, rnd),
    accessories: rnd() < 0.35 ? pickFrom(accessoryValues, rnd) : "none",
    accessoriesColor: pickFrom(AVATAR_COLORS.accessoriesColor, rnd),
    facialHair:
      rnd() < facialHairChance ? pickFrom(facialHairValues, rnd) : "none",
    facialHairColor: pickFrom(AVATAR_COLORS.facialHairColor, rnd),
    clothing: pickFrom(AVATAR_OPTIONS.clothing, rnd),
    clothesColor: pickFrom(AVATAR_COLORS.clothesColor, rnd),
    eyes: pickFrom(AVATAR_OPTIONS.eyes, rnd),
    eyebrows: pickFrom(AVATAR_OPTIONS.eyebrows, rnd),
    mouth: pickFrom(AVATAR_OPTIONS.mouth, rnd),
    backgroundColor: pickFrom(AVATAR_COLORS.backgroundColor, rnd),
    style,
  };
}

export function applyStyleToConfig(
  config: AvatarConfig,
  style: AvatarStyle,
): AvatarConfig {
  if (style === "any") return { ...config, style };
  return {
    ...config,
    top: pickFrom(topsForStyle(style), Math.random),
    facialHair: style === "feminine" ? "none" : config.facialHair,
    style,
  };
}

export function seedAvatarConfig(seed: string): AvatarConfig {
  return randomAvatarConfig(seed);
}

export function validateAvatarConfig(input: unknown): AvatarConfig | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;

  const opt = (key: AvatarOptionKey): string | null => {
    const v = o[key];
    return typeof v === "string" && AVATAR_OPTIONS[key].includes(v) ? v : null;
  };
  const col = (key: AvatarColorKey): string | null => {
    const v = o[key];
    return typeof v === "string" && AVATAR_COLORS[key].includes(v) ? v : null;
  };

  const fields: AvatarConfig = {
    skinColor: col("skinColor")!,
    top: opt("top")!,
    hairColor: col("hairColor")!,
    hatColor: col("hatColor")!,
    accessories: opt("accessories")!,
    accessoriesColor: col("accessoriesColor")!,
    facialHair: opt("facialHair")!,
    facialHairColor: col("facialHairColor")!,
    clothing: opt("clothing")!,
    clothesColor: col("clothesColor")!,
    eyes: opt("eyes")!,
    eyebrows: opt("eyebrows")!,
    mouth: opt("mouth")!,
    backgroundColor: col("backgroundColor")!,
    style: isAvatarStyle(o.style) ? o.style : "any",
  };

  for (const value of Object.values(fields)) {
    if (value === null) return null;
  }
  return fields;
}

export interface DicebearAvataaarsOptions {
  backgroundColor: string[];
  backgroundType: ("solid" | "gradientLinear")[];
  skinColor: string[];
  top: string[];
  hairColor: string[];
  hatColor: string[];
  accessories: string[];
  accessoriesProbability: number;
  accessoriesColor: string[];
  facialHair: string[];
  facialHairProbability: number;
  facialHairColor: string[];
  clothing: string[];
  clothesColor: string[];
  eyes: string[];
  eyebrows: string[];
  mouth: string[];
}

export function toDicebearOptions(c: AvatarConfig): DicebearAvataaarsOptions {
  const hasAccessories = c.accessories !== "none";
  const hasFacialHair = c.facialHair !== "none";
  return {
    backgroundColor: [c.backgroundColor],
    backgroundType: ["solid"],
    skinColor: [c.skinColor],
    top: [c.top],
    hairColor: [c.hairColor],
    hatColor: [c.hatColor],
    accessories: hasAccessories ? [c.accessories] : [],
    accessoriesProbability: hasAccessories ? 100 : 0,
    accessoriesColor: [c.accessoriesColor],
    facialHair: hasFacialHair ? [c.facialHair] : [],
    facialHairProbability: hasFacialHair ? 100 : 0,
    facialHairColor: [c.facialHairColor],
    clothing: [c.clothing],
    clothesColor: [c.clothesColor],
    eyes: [c.eyes],
    eyebrows: [c.eyebrows],
    mouth: [c.mouth],
  };
}
