import type { AvatarConfig } from "./types";

export const AVATAR_CONFIG_KEYS = [
  "skinColor",
  "top",
  "hairColor",
  "hatColor",
  "accessories",
  "accessoriesColor",
  "facialHair",
  "facialHairColor",
  "clothing",
  "clothesColor",
  "eyes",
  "eyebrows",
  "mouth",
  "backgroundColor",
] satisfies (keyof AvatarConfig)[];

export function configsEqual(a: AvatarConfig, b: AvatarConfig): boolean {
  if ((a.style ?? "any") !== (b.style ?? "any")) return false;
  return AVATAR_CONFIG_KEYS.every((k) => a[k] === b[k]);
}
