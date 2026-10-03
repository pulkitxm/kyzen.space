import { z } from "zod";
import { notificationTypeSchema } from "../chat/schemas";
import { gameTypeSchema } from "../games/core";
import {
  gamePlayerSchema,
  gameStatusSchema,
  seatingModeSchema,
} from "../games/wire";
import { glassModeSchema } from "../glass";
import { patternIdSchema } from "../pattern";
import { colorModeSchema, themeIdSchema } from "../theme";

export const messageKindSchema = z.enum(["text", "gif", "game_card", "system"]);

export const createGameInputSchema = z.object({
  publicMatch: z.boolean().optional(),
  gameType: gameTypeSchema,
  players: z.array(gamePlayerSchema),
  gameState: z.unknown(),
  config: z.unknown().optional(),
  status: gameStatusSchema.optional(),
  conversationId: z.string().nullable().optional(),
  creatorUserId: z.string().nullable().optional(),
  seatingMode: seatingModeSchema.nullable().optional(),
  challengedUserId: z.string().nullable().optional(),
  seriesId: z.string().nullable().optional(),
});

export const addMoveInputSchema = z.object({
  gameId: z.string(),
  moveNumber: z.number().int().nonnegative(),
  playerId: z.string(),
  moveData: z.unknown(),
});

export const createMessageInputSchema = z.object({
  conversationId: z.string(),
  senderId: z.string().nullable(),
  kind: messageKindSchema.optional(),
  body: z.string().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  gameId: z.string().nullable().optional(),
});

export const createNotificationInputSchema = z.object({
  userId: z.string(),
  type: notificationTypeSchema,
  actorId: z.string().nullable().optional(),
  payload: z.unknown().optional(),
});

export const accountMergeStatusSchema = z.enum([
  "pending",
  "confirmed",
  "discarded",
]);

export const recordAccountMergeInputSchema = z
  .object({
    anonUserId: z.string().min(1),
    targetUserId: z.string().min(1),
  })
  .refine((v) => v.anonUserId !== v.targetUserId, {
    message: "anonUserId and targetUserId must differ",
  });

export const createProfileInputSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatar: z.unknown().nullable().optional(),
});

export const appearancePatchSchema = z
  .object({
    theme: themeIdSchema.optional(),
    colorMode: colorModeSchema.optional(),
    pattern: patternIdSchema.optional(),
    glass: glassModeSchema.optional(),
  })
  .strict();
