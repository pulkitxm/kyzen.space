import { z } from "zod";
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

export const clientRoomConfigureSchema = z
  .object({
    gameId: gameCodeSchema,
    config: z.unknown(),
  })
  .strict();
export type ClientRoomConfigure = z.infer<typeof clientRoomConfigureSchema>;

export const clientRoomStartSchema = z
  .object({
    gameId: gameCodeSchema,
  })
  .strict();
export type ClientRoomStart = z.infer<typeof clientRoomStartSchema>;

export const clientMatchFriendSchema = z
  .object({
    gameId: gameCodeSchema,
    playerId: z.string().min(1),
  })
  .strict();
export type ClientMatchFriend = z.infer<typeof clientMatchFriendSchema>;

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
  config: z.unknown().optional(),
  winners: z.array(z.string()).optional(),
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
  players: ReadonlyArray<{ userId: string; username: string }>,
): string | null {
  return winner && winner !== "draw"
    ? (players.find((p) => p.userId === winner)?.username ?? null)
    : null;
}

export function gameResultLabel(game: {
  status?: string;
  winner?: string | null;
  winners?: readonly string[];
  players?: ReadonlyArray<{ userId: string; username: string }>;
}): string | null {
  if (!game.status || !isGameOver(game.status)) return null;
  if (game.winner === "draw") return "Draw";
  const ids = game.winners?.length
    ? game.winners
    : game.winner
      ? [game.winner]
      : [];
  const names = ids.flatMap((id) => {
    const username = game.players?.find((p) => p.userId === id)?.username;
    return username ? [username] : [];
  });
  if (!names.length) return "Game over";
  return `${new Intl.ListFormat("en", { type: "conjunction" }).format(names)} won`;
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
