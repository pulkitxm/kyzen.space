import type { GameCardMeta, MessageJson } from "@gamelobby/chat-core";
import { type GameJson, getDefinition, hasEngine } from "@gamelobby/games-core";
import { serializeGame } from "../api/serialize";
import { conversations, games, profiles, type SeatingMode } from "../db";
import { notify } from "../realtime/notify";
import { sendMessage } from "./messages-service";
import { fail, ok, type ServiceResult } from "./result";

export async function createGameInConversation(input: {
  userId: string;
  conversationId: string;
  gameType: string;
  seatingMode?: SeatingMode;
  challengedUserId?: string | null;
  config?: unknown;
}): Promise<ServiceResult<{ game: GameJson; message: MessageJson }>> {
  const conv = await conversations.getById(input.conversationId);
  if (!conv) return fail("Conversation not found", 404);
  if (!(await conversations.isMember(input.conversationId, input.userId))) {
    return fail("Not a member of this conversation", 403);
  }
  if (!hasEngine(input.gameType)) return fail("Unsupported game type", 400);

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
  const created = await games.createGame({
    gameType: input.gameType,
    status: "waiting",
    players: [
      {
        userId: input.userId,
        username: profile.username,
        role: engine.roles[0]!,
      },
    ],
    gameState: engine.createInitialState([{ role: engine.roles[0]! }]),
    config: parsedConfig.data,
    conversationId: input.conversationId,
    creatorUserId: input.userId,
    seatingMode,
    challengedUserId,
  });

  const metadata: GameCardMeta = {
    gameId: created.id,
    gameType: input.gameType,
    seatingMode,
    challengedUserId,
    creatorUsername: profile.username,
  };
  const sent = await sendMessage({
    conversationId: input.conversationId,
    senderId: input.userId,
    kind: "game_card",
    metadata,
    gameId: created.id,
  });
  if (!sent.ok) return fail(sent.error, sent.status);

  const memberIds = await conversations.getMemberIds(input.conversationId);
  for (const uid of memberIds) {
    if (uid === input.userId) continue;
    await notify(
      uid,
      challengedUserId === uid ? "game_challenge" : "game_started",
      {
        actorId: input.userId,
        payload: {
          conversationId: input.conversationId,
          gameId: created.id,
          gameType: input.gameType,
        },
      },
    );
  }

  return ok({ game: serializeGame(created), message: sent.value });
}
