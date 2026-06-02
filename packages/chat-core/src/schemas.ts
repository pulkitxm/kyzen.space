import { gameTypeSchema } from "@gamelobby/games-core";
import { z } from "zod";

const gameCardPlayerSchema = z
  .object({
    userId: z.string().min(1),
    username: z.string().min(1),
    role: z.string().min(1),
  })
  .strict();

export const gameCardMetaSchema = z
  .object({
    gameId: z.string().min(1),
    gameType: gameTypeSchema,
    seatingMode: z.enum(["open", "challenge"]),
    challengedUserId: z.string().nullable().optional(),
    creatorUsername: z.string(),
    status: z.string().optional(),
    winner: z.string().nullable().optional(),
    winnerUsername: z.string().nullable().optional(),
    players: z.array(gameCardPlayerSchema).optional(),
  })
  .strict();

export const notificationPayloadSchema = z.object({
  conversationId: z.string().optional(),
  gameId: z.string().optional(),
  gameType: gameTypeSchema.optional(),
  requestId: z.string().optional(),
});

export const clientCreateGameInConversationSchema = z
  .object({
    conversationId: z.string().min(1),
    gameType: gameTypeSchema,
    seatingMode: z.enum(["open", "challenge"]).optional(),
    challengedUserId: z.string().nullable().optional(),
    config: z.unknown().optional(),
  })
  .strict();
