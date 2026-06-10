import { z } from "zod";
import { GLASS_MODES } from "../constants/glass";

export const glassModeSchema = z.enum(GLASS_MODES);
export type GlassMode = z.infer<typeof glassModeSchema>;

export function isValidGlassMode(value: unknown): value is GlassMode {
  return glassModeSchema.safeParse(value).success;
}

export interface GlassModeDef {
  id: GlassMode;
  name: string;
  blurb: string;
}
