import { z } from "zod";
import {
  DISPLAY_NAME_MAX_LENGTH,
  RESERVED_USERNAMES,
  USERNAME_PATTERN,
} from "../constants/username";

export const usernameSchema = z.string().regex(USERNAME_PATTERN);
export const displayNameSchema = z.string().max(DISPLAY_NAME_MAX_LENGTH);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsernameFormat(normalized: string): boolean {
  return USERNAME_PATTERN.test(normalized);
}

export function isReservedUsername(normalized: string): boolean {
  return RESERVED_USERNAMES.has(normalized);
}
