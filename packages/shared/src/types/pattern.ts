import { z } from "zod";
import { PATTERN_IDS } from "../constants/pattern";

export const patternIdSchema = z.enum(PATTERN_IDS);
export type PatternId = z.infer<typeof patternIdSchema>;

export function isValidPattern(value: unknown): value is PatternId {
  return patternIdSchema.safeParse(value).success;
}

export interface PatternDef {
  id: PatternId;
  name: string;
  blurb: string;
  src: string | null;
  tile: number;
}
