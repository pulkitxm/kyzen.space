import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().regex(UUID_RE, "Invalid id");

export const gameStatusSchema = z.enum([
  "waiting",
  "active",
  "completed",
  "abandoned",
]);
export type GameStatusDto = z.infer<typeof gameStatusSchema>;

export const seatingModeSchema = z.enum(["open", "challenge"]);
export type SeatingModeDto = z.infer<typeof seatingModeSchema>;

export const gamePlayerSchema = z
  .object({
    userId: z.string().min(1),
    username: z.string().min(1),
    role: z.string().min(1),
  })
  .strict();
export type GamePlayerDto = z.infer<typeof gamePlayerSchema>;

export const clientJoinRoomSchema = z
  .object({
    gameId: uuidSchema,
    intent: z.enum(["play", "spectate"]).optional(),
  })
  .strict();
export type ClientJoinRoom = z.infer<typeof clientJoinRoomSchema>;

export const clientMakeMoveSchema = z
  .object({
    gameId: uuidSchema,
    moveData: z.unknown(),
  })
  .strict();
export type ClientMakeMove = z.infer<typeof clientMakeMoveSchema>;

export const gameJsonSchema = z.object({
  id: z.string(),
  gameType: z.string(),
  status: gameStatusSchema,
  winner: z.string().nullable(),
  players: z.array(gamePlayerSchema),
  gameState: z.unknown(),
  conversationId: z.string().nullable().optional(),
  creatorUserId: z.string().nullable().optional(),
  seatingMode: seatingModeSchema.nullable().optional(),
  challengedUserId: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});
export type GameJson = z.infer<typeof gameJsonSchema>;

export const moveJsonSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  moveNumber: z.number().int().nonnegative(),
  playerId: z.string(),
  moveData: z.unknown(),
  createdAt: z.string().nullable().optional(),
});
export type MoveJson = z.infer<typeof moveJsonSchema>;

export type ServerGameStatePayload = {
  game: GameJson;
  moves: MoveJson[];
};

export type ServerMoveMadePayload = {
  move: MoveJson;
  gameState: unknown;
};

export type ServerGameOverPayload = {
  winner: string | "draw" | null;
};

export type ServerErrorPayload = {
  message: string;
};
