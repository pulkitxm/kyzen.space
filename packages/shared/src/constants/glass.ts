import type { GlassMode, GlassModeDef } from "../types/glass";

export const GLASS_MODES = ["off", "neutral", "tinted", "smoke"] as const;

export const DEFAULT_GLASS_MODE = "off" as const satisfies GlassMode;

export const GLASS_MODE_DEFS = [
  {
    id: "off",
    name: "Off",
    blurb: "Solid surfaces, no glass",
  },
  {
    id: "neutral",
    name: "Neutral",
    blurb: "Clear liquid glass",
  },
  {
    id: "tinted",
    name: "Tinted",
    blurb: "Glass that picks up your theme",
  },
  {
    id: "smoke",
    name: "Smoke",
    blurb: "Dark glass that dims what's behind",
  },
] satisfies GlassModeDef[];

export function getGlassModeDef(id: string): GlassModeDef | undefined {
  return GLASS_MODE_DEFS.find((m) => m.id === id);
}

export const GLASS_STORAGE_KEY = "gl-glass";
