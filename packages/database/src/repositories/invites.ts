import {
  type CreateGameInviteInput,
  createGameInviteInputSchema,
  type GameInviteRow,
} from "@gamelobby/shared/types";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { INVITE_TOKEN_LENGTH } from "../invite-token";
import { gameInvite } from "../schema";

export async function create(
  input: CreateGameInviteInput,
): Promise<GameInviteRow> {
  createGameInviteInputSchema.parse(input);
  if (input.token.length < INVITE_TOKEN_LENGTH) {
    throw new Error("Invite token is too short");
  }
  const [row] = await db
    .insert(gameInvite)
    .values({
      inviterUserId: input.inviterUserId,
      gameType: input.gameType,
      token: input.token,
      config: input.config ?? null,
      seatingMode: input.seatingMode ?? null,
      expiresAt: input.expiresAt,
    })
    .returning();
  if (!row) throw new Error("Failed to create invite");
  return row;
}

export async function getByToken(token: string): Promise<GameInviteRow | null> {
  const [row] = await db
    .select()
    .from(gameInvite)
    .where(eq(gameInvite.token, token))
    .limit(1);
  return row ?? null;
}
