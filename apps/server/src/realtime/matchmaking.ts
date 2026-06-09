import { conversations } from "@gamelobby/database";
import { hasEngine } from "@gamelobby/games-core";
import {
  type ClientQueueJoin,
  type ClientQueueLeave,
  clientQueueJoinSchema,
  clientQueueLeaveSchema,
  type GameType,
  type ServerMatchFoundPayload,
} from "@gamelobby/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { createGameInConversation } from "../chat/games-in-chat-service";
import { childLogger } from "../logger";
import { matchmakingStore } from "./matchmaking-store";
import { presenceStore } from "./presence-store-instance";
import { emitToUser } from "./rooms";

const log = childLogger({ mod: "realtime:matchmaking" });

type CreatedMatchGame = { ok: true; gameId: string } | { ok: false };

type PairingDeps = {
  onlineAmong: (userIds: string[]) => Promise<Set<string>>;
  createMatchGame: (input: {
    a: string;
    b: string;
    gameType: GameType;
    config: unknown;
  }) => Promise<CreatedMatchGame>;
  emitMatch: (userId: string, gameId: string) => void;
  requeue: (gameType: string, userId: string) => Promise<void>;
};

export async function runPairing(
  gameType: GameType,
  pair: [string, string],
  config: unknown,
  deps: PairingDeps,
): Promise<void> {
  const [a, b] = pair;
  if (a === b) {
    log.warn({ gameType, a }, "refusing to match a user with themselves");
    return;
  }

  const online = await deps.onlineAmong([a, b]);
  if (!online.has(a) || !online.has(b)) {
    const survivor = online.has(a) ? a : online.has(b) ? b : null;
    if (survivor) await deps.requeue(gameType, survivor);
    log.info({ gameType, a, b, survivor }, "pairing aborted (liveness)");
    return;
  }

  const created = await deps.createMatchGame({ a, b, gameType, config });
  if (!created.ok) {
    log.error({ gameType, a, b }, "match game failed");
    return;
  }

  deps.emitMatch(a, created.gameId);
  deps.emitMatch(b, created.gameId);
  log.info({ gameType, a, b, gameId: created.gameId }, "match found");
}

async function createMatchGame(input: {
  a: string;
  b: string;
  gameType: GameType;
  config: unknown;
}): Promise<CreatedMatchGame> {
  const { conversation } = await conversations.getOrCreateDm(input.a, input.b);
  const created = await createGameInConversation({
    userId: input.a,
    conversationId: conversation.id,
    gameType: input.gameType,
    seatingMode: "challenge",
    challengedUserId: input.b,
    config: input.config,
  });
  if (!created.ok) return { ok: false };
  return { ok: true, gameId: created.value.game.id };
}

function defaultPairingDeps(io: IOServer): PairingDeps {
  return {
    onlineAmong: (userIds) => presenceStore.onlineAmong(userIds),
    createMatchGame,
    emitMatch: (userId, gameId) => {
      const payload: ServerMatchFoundPayload = { gameId };
      emitToUser(io, userId, "match_found", payload);
    },
    requeue: (gameType, userId) =>
      matchmakingStore.enqueue(gameType, userId, Date.now()),
  };
}

async function handleQueueJoin(
  io: IOServer,
  userId: string,
  payload: ClientQueueJoin,
): Promise<void> {
  const { gameType, config } = payload;
  if (!hasEngine(gameType)) return;
  await matchmakingStore.enqueue(gameType, userId, Date.now());
  const pair = await matchmakingStore.pairAndPop(gameType);
  if (!pair) return;
  await runPairing(gameType, pair, config, defaultPairingDeps(io));
}

export async function handleQueueLeave(
  userId: string,
  payload: ClientQueueLeave,
): Promise<void> {
  await matchmakingStore.remove(payload.gameType, userId);
}

export async function dequeueUserFromAllQueues(userId: string): Promise<void> {
  await matchmakingStore.removeFromAll(userId);
}

export function attachMatchmakingHandlers(io: IOServer, socket: Socket): void {
  socket.on("game:queue_join", (payload: unknown) => {
    const parsed = clientQueueJoinSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("game_error", { message: "Invalid queue_join payload" });
      return;
    }
    void (async () => {
      try {
        await handleQueueJoin(io, socket.data.userId, parsed.data);
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "queue_join failed");
        socket.emit("game_error", { message: "Matchmaking failed" });
      }
    })();
  });

  socket.on("game:queue_leave", (payload: unknown) => {
    const parsed = clientQueueLeaveSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("game_error", { message: "Invalid queue_leave payload" });
      return;
    }
    void (async () => {
      try {
        await handleQueueLeave(socket.data.userId, parsed.data);
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "queue_leave failed");
      }
    })();
  });
}
