import { z } from "zod";

export const GAME_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const GAME_CODE_LENGTH = 6;

const GAME_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{6}$/;

export function generateGameCode(): string {
  const bytes = new Uint8Array(GAME_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += GAME_CODE_ALPHABET.charAt(b & 31);
  return code;
}

export function normalizeGameCode(input: string): string {
  return input.trim().toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");
}

export function isGameCode(value: string): boolean {
  return GAME_CODE_RE.test(normalizeGameCode(value));
}

export const gameCodeSchema = z
  .string()
  .transform(normalizeGameCode)
  .refine((value) => GAME_CODE_RE.test(value), {
    message: "Invalid game code",
  });
