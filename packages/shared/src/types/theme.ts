import { z } from "zod";
import { COLOR_MODES, THEME_IDS } from "../constants/theme";

export const themeIdSchema = z.enum(THEME_IDS);
export type ThemeId = z.infer<typeof themeIdSchema>;

export const colorModeSchema = z.enum(COLOR_MODES);
export type ColorMode = z.infer<typeof colorModeSchema>;

export function isValidTheme(value: unknown): value is ThemeId {
  return themeIdSchema.safeParse(value).success;
}

export function isValidColorMode(value: unknown): value is ColorMode {
  return colorModeSchema.safeParse(value).success;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  blurb: string;
  deep: string;
  vivid: string;
}
