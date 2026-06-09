import { randomBytes } from "node:crypto";

const INVITE_TOKEN_BYTES = 32;

export const INVITE_TOKEN_LENGTH = 43;

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}
