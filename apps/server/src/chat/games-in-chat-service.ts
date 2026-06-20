import {
  conversations,
  type GameRecord,
  games,
  profiles,
  type SeatingMode,
} from "@kyzen/database";
import { getDefinition, hasEngine } from "@kyzen/games-core";
import type {
  GameCardMeta,
  GameJson,
  GameType,
  MessageJson,
} from "@kyzen/shared/types";
import { serializeGame } from "../api/serialize";
import { notify } from "../realtime/notify";
import { sendMessage } from "./messages-service";
import { computeRematchSeating } from "./rematch-seating";
import { fail, ok, type ServiceResult } from "./result";

async function announceGame(opts: {
  game: GameRecord;
  actorUserId: string;
  creatorUsername: string;
  seatingMode: SeatingMode;
  challengedUserId: string | null;
}): Promise<ServiceResult<MessageJson>> {
  const conversationId = opts.game.conversationId;
  if (!conversationId) return fail("Game is not in a conversation", 400);

  const metadata: GameCardMeta = {
    gameId: opts.game.code,
    gameType: opts.game.gameType,
    seatingMode: opts.seatingMode,
    challengedUserId: opts.challengedUserId,
    creatorUsername: opts.creatorUsername,
  };
  const sent = await sendMessage({
    conversationId,
    senderId: opts.actorUserId,
    kind: "game_card",
    metadata,
    gameId: opts.game.id,
  });
  if (!sent.ok) return fail(sent.error, sent.status);

  const memberIds = await conversations.getMemberIds(conversationId);
  for (const uid of memberIds) {
    if (uid === opts.actorUserId) continue;
    await notify(
      uid,
      opts.challengedUserId === uid ? "game_challenge" : "game_started",
      {
        actorId: opts.actorUserId,
        payload: {
          conversationId,
          gameId: opts.game.code,
          gameType: opts.game.gameType,
        },
      },
    );
  }
  return ok(sent.value);
}

export async function createGameInConversation(input: {
  userId: string;
  conversationId: string;
  gameType: GameType;
  seatingMode?: SeatingMode;
  challengedUserId?: string | null;
  config?: unknown;
}): Promise<ServiceResult<{ game: GameJson; message?: MessageJson }>> {
  const conv = await conversations.getById(input.conversationId);
  if (!conv) return fail("Conversation not found", 404);
  if (!(await conversations.isMember(input.conversationId, input.userId))) {
    return fail("Not a member of this conversation", 403);
  }
  if (!hasEngine(input.gameType)) return fail("Unsupported game type", 400);

  const existingLive = await games.findLiveGameInConversation(
    input.conversationId,
    input.gameType,
  );
  if (existingLive) {
    return ok({ game: serializeGame(existingLive) });
  }

  const definition = getDefinition(input.gameType);
  const parsedConfig = definition.configSchema.safeParse(input.config ?? {});
  if (!parsedConfig.success) return fail("Invalid game config", 400);

  const profile = await profiles.getProfileByUserId(input.userId);
  if (!profile) return fail("Profile not found", 400);

  let seatingMode: SeatingMode;
  let challengedUserId: string | null = null;
  if (conv.kind === "dm") {
    seatingMode = "open";
  } else {
    if (input.seatingMode !== "open" && input.seatingMode !== "challenge") {
      return fail("Pick a seating mode for the group game", 400);
    }
    seatingMode = input.seatingMode;
    if (seatingMode === "challenge") {
      const target = input.challengedUserId;
      if (!target || target === input.userId) {
        return fail("Choose a member to challenge", 400);
      }
      if (!(await conversations.isMember(input.conversationId, target))) {
        return fail("Challenged user is not in this conversation", 400);
      }
      challengedUserId = target;
    }
  }

  const { engine } = definition;
  const [firstRole] = engine.roles;
  if (!firstRole) return fail("Game has no roles", 400);
  const created = await games.createGame({
    gameType: input.gameType,
    status: "waiting",
    players: [
      {
        userId: input.userId,
        username: profile.username,
        role: firstRole,
      },
    ],
    gameState: engine.createInitialState([{ role: firstRole }]),
    config: parsedConfig.data,
    conversationId: input.conversationId,
    creatorUserId: input.userId,
    seatingMode,
    challengedUserId,
  });

  const announced = await announceGame({
    game: created,
    actorUserId: input.userId,
    creatorUsername: profile.username,
    seatingMode,
    challengedUserId,
  });
  if (!announced.ok) return fail(announced.error, announced.status);

  return ok({ game: serializeGame(created), message: announced.value });
}

export async function rematchGame(input: {
  userId: string;
  gameId: string;
}): Promise<ServiceResult<{ game: GameJson }>> {
  const prev = await games.getGameByCode(input.gameId);
  if (!prev) return fail("Game not found", 404);
  if (prev.status !== "completed") return fail("Game is not finished", 400);
  if (!prev.players.some((p) => p.userId === input.userId)) {
    return fail("Not a player in this game", 403);
  }
  if (!prev.conversationId) return fail("Game is not in a conversation", 400);
  if (!hasEngine(prev.gameType)) return fail("Unsupported game type", 400);

  const existingLive = await games.findLiveGameInConversation(
    prev.conversationId,
    prev.gameType,
  );
  if (existingLive) return ok({ game: serializeGame(existingLive) });

  const { engine } = getDefinition(prev.gameType);
  const orderedUserIds = computeRematchSeating(prev);
  const players: { userId: string; username: string; role: string }[] = [];
  for (let i = 0; i < orderedUserIds.length; i++) {
    const uid = orderedUserIds[i];
    const seat = prev.players.find((p) => p.userId === uid);
    const role = engine.roles[i];
    if (!uid || !seat || !role) {
      return fail("Cannot rematch: invalid game seating", 409);
    }
    players.push({ userId: uid, username: seat.username, role });
  }
  const becomesActive = players.length >= engine.minPlayers;

  const created = await games.createGame({
    gameType: prev.gameType,
    status: becomesActive ? "active" : "waiting",
    players,
    gameState: engine.createInitialState(
      players.map((p) => ({ role: p.role })),
    ),
    config: prev.config,
    conversationId: prev.conversationId,
    creatorUserId: input.userId,
    seriesId: prev.seriesId,
    seatingMode: prev.seatingMode ?? undefined,
    challengedUserId: prev.challengedUserId,
  });

  const creatorUsername =
    prev.players.find((p) => p.userId === input.userId)?.username ?? "player";
  const announced = await announceGame({
    game: created,
    actorUserId: input.userId,
    creatorUsername,
    seatingMode: created.seatingMode ?? "open",
    challengedUserId: created.challengedUserId,
  });
  if (!announced.ok) return fail(announced.error, announced.status);

  return ok({ game: serializeGame(created) });
}
