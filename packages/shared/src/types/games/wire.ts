import { z } from "zod";
import { CAR_FOOTBALL } from "../../constants/games";
import { avatarConfigSchema } from "../avatar";
import { gameCodeSchema } from "./code";
import { gameTypeSchema } from "./core";

export const gameStatusSchema = z.enum([
  "waiting",
  "active",
  "completed",
  "abandoned",
  "aborted",
]);
export type GameStatusDto = z.infer<typeof gameStatusSchema>;

export const seatingModeSchema = z.enum(["open", "challenge"]);
export type SeatingModeDto = z.infer<typeof seatingModeSchema>;

export const gamePlayerSchema = z
  .object({
    userId: z.string().min(1),
    username: z.string().min(1),
    role: z.string().min(1),
    avatar: avatarConfigSchema.nullable().optional(),
    timeoutStrikes: z.number().int().nonnegative().optional(),
  })
  .strict();
export type GamePlayerDto = z.infer<typeof gamePlayerSchema>;

export const clientJoinRoomSchema = z
  .object({
    gameId: gameCodeSchema,
    intent: z.enum(["play", "spectate"]).optional(),
  })
  .strict();
export type ClientJoinRoom = z.infer<typeof clientJoinRoomSchema>;

export const clientMakeMoveSchema = z
  .object({
    gameId: gameCodeSchema,
    moveData: z.unknown(),
  })
  .strict();
export type ClientMakeMove = z.infer<typeof clientMakeMoveSchema>;

export const clientQueueJoinSchema = z
  .object({
    gameType: gameTypeSchema,
    config: z.unknown().optional(),
  })
  .strict();
export type ClientQueueJoin = z.infer<typeof clientQueueJoinSchema>;

export const clientQueueLeaveSchema = z
  .object({
    gameType: gameTypeSchema,
  })
  .strict();
export type ClientQueueLeave = z.infer<typeof clientQueueLeaveSchema>;

export type ServerMatchFoundPayload = {
  gameId: string;
};

export const clientCreateRoomSchema = z
  .object({
    gameType: gameTypeSchema,
    config: z.unknown().optional(),
  })
  .strict();
export type ClientCreateRoom = z.infer<typeof clientCreateRoomSchema>;

export const clientJoinByCodeSchema = z
  .object({
    code: gameCodeSchema,
  })
  .strict();
export type ClientJoinByCode = z.infer<typeof clientJoinByCodeSchema>;

export const joinByCodeErrorSchema = z.enum([
  "not_found",
  "full",
  "already_started",
  "finished",
]);
export type JoinByCodeError = z.infer<typeof joinByCodeErrorSchema>;

export type ServerRoomCreatedPayload = { ok: true; code: string };
export type ServerJoinByCodeResult =
  | { ok: true; code: string }
  | { ok: false; error: JoinByCodeError };

export const gameJsonSchema = z.object({
  publicMatch: z.boolean().optional(),
  viewerId: z.string().nullable().optional(),
  id: z.string(),
  gameType: gameTypeSchema,
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
  turnDeadline: z.number().nullable().optional(),
});
export type GameJson = z.infer<typeof gameJsonSchema>;

export const moveJsonSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  moveNumber: z.number().int().nonnegative(),
  playerId: z.string(),
  moveData: z.unknown(),
  createdAt: z.string().nullable().optional(),
  auto: z.boolean().optional(),
});
export type MoveJson = z.infer<typeof moveJsonSchema>;

export type ServerGameStatePayload = {
  game: GameJson;
  moves?: MoveJson[];
  move?: MoveJson;
};

export type ServerGameOverPayload = {
  winner: string | "draw" | null;
};

export type ServerErrorPayload = {
  message: string;
};

export function isGameOver(status: string): boolean {
  return (
    status === "completed" || status === "abandoned" || status === "aborted"
  );
}

export function isGameLive(status: string): boolean {
  return status === "waiting" || status === "active";
}

export function resolveWinnerUsername(
  winner: string | null,
  players: ReadonlyArray<{ userId: string; username: string; role?: string }>,
  gameType?: string,
): string | null {
  if (!winner || winner === "draw") return null;
  const player = players.find((candidate) => candidate.userId === winner);
  if (gameType === CAR_FOOTBALL && player?.role)
    return player.role.startsWith("blue") ? "Blue team" : "Orange team";
  return player?.username ?? null;
}

const matchMessageSchema = z.object({
  id: z.string(),
  gameId: gameCodeSchema,
  authorId: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type MatchMessage = z.infer<typeof matchMessageSchema>;
export const clientMatchMessageSchema = z
  .object({
    gameId: gameCodeSchema,
    clientId: z.string().uuid(),
    body: z.string().trim().min(1).max(1000),
  })
  .strict();
