import { z } from "zod";
import { gameTypeSchema } from "../games/core";
import { seriesScoreSchema } from "../games/series";

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
    winners: z.array(z.string().min(1)).optional(),
    players: z.array(gameCardPlayerSchema).optional(),
    seriesScore: seriesScoreSchema.optional(),
    seriesSuperseded: z.boolean().optional(),
  })
  .strict();

export const notificationPayloadSchema = z.object({
  conversationId: z.string().optional(),
  gameId: z.string().optional(),
  gameType: gameTypeSchema.optional(),
  requestId: z.string().optional(),
});

export const notificationTypeSchema = z.enum([
  "friend_request",
  "friend_accepted",
  "game_started",
  "game_challenge",
  "game_invite",
]);

export const clientCreateGameInConversationSchema = z
  .object({
    conversationId: z.string().min(1),
    gameType: gameTypeSchema,
    seatingMode: z.enum(["open", "challenge"]).optional(),
    challengedUserId: z.string().nullable().optional(),
    config: z.unknown().optional(),
  })
  .strict();

export const clientRematchSchema = z
  .object({ gameId: z.string().min(1) })
  .strict();

export const gifMetaSchema = z
  .object({
    provider: z.literal("klipy"),
    providerId: z.string(),
    previewUrl: z.string(),
    fullUrl: z.string(),
    width: z.number(),
    height: z.number(),
    title: z.string().optional(),
    blurPreview: z.string().optional(),
  })
  .strict();

export const clientConversationRefSchema = z.object({
  conversationId: z.string().min(1),
});

export const clientSendMessageSchema = z.object({
  conversationId: z.string().min(1),
  clientId: z.string().optional(),
  kind: z.enum(["text", "gif"]).optional(),
  body: z.string().optional(),
  metadata: gifMetaSchema.optional(),
});

export const clientMarkReadSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

export const clientCreateDmSchema = z.object({
  userId: z.string().min(1),
});

export const clientCreateGroupSchema = z.object({
  name: z.string().optional(),
  memberIds: z.array(z.string().min(1)).optional(),
});

export const clientAddMembersSchema = z.object({
  conversationId: z.string().min(1),
  userIds: z.array(z.string().min(1)).optional(),
});

export const clientRemoveMemberSchema = z.object({
  conversationId: z.string().min(1),
  userId: z.string().min(1),
});

export const clientRenameGroupSchema = z.object({
  conversationId: z.string().min(1),
  name: z.string().optional(),
});

export const clientFriendRequestSchema = z.object({
  username: z.string().min(1),
});

export const clientFriendRespondSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(["accept", "decline"]).optional(),
});

export const clientFriendRemoveSchema = z.object({
  userId: z.string().min(1),
});

export const clientNotificationReadSchema = z.object({
  id: z.string().min(1),
});
