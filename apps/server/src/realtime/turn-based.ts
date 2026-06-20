import {
  type GamePlayer,
  type GameRecord,
  games,
  profiles,
} from "@gamelobby/database";
import { getDefinition } from "@gamelobby/games-core";
import type {
  ClientJoinRoom,
  ClientMakeMove,
  Outcome,
  ServerGameStatePayload,
  MonopolyState,
} from "@gamelobby/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { serializeGame, serializeMove } from "../api/serialize";
import { broadcastGameCard } from "../chat/game-card-broadcast";
import { isUuid } from "../lib/uuid";
import { emitToGame, joinGameRoom } from "./rooms";

function err(socket: Socket, message: string) {
  socket.emit("game_error", { message });
}

async function emitFullState(io: IOServer, gameRow: GameRecord) {
  const moves = await games.listMoves(gameRow.id);
  const payload: ServerGameStatePayload = {
    game: serializeGame(gameRow),
    moves: moves.map(serializeMove),
  };
  emitToGame(io, gameRow.id, "game_state", payload);
}

async function ensureSeated(
  gameRow: GameRecord,
  userId: string,
  intent: "play" | "spectate",
): Promise<{ game: GameRecord; changed: boolean }> {
  const players = gameRow.players;
  if (players.some((p) => p.userId === userId)) {
    return { game: gameRow, changed: false };
  }

  const { engine } = getDefinition(gameRow.gameType);
  const seatFree =
    gameRow.status === "waiting" && players.length < engine.maxPlayers;
  const challengeReserved =
    gameRow.seatingMode === "challenge" &&
    !!gameRow.challengedUserId &&
    userId !== gameRow.challengedUserId;

  if (intent === "spectate" || !seatFree || challengeReserved) {
    return { game: gameRow, changed: false };
  }

  const profile = await profiles.getProfileByUserId(userId);
  const username = profile?.username ?? "player";
  // biome-ignore lint/style/noNonNullAssertion: seatFree guarantees players.length < maxPlayers, so a role exists for the next seat
  const role = engine.roles[players.length]!;
  const newPlayer: GamePlayer = { userId, username, role };
  const nextPlayers = [...players, newPlayer];
  const becomesActive = nextPlayers.length >= engine.minPlayers;

  await games.seatPlayer(gameRow.id, newPlayer, players.length);
  const game = await games.updateGame(gameRow.id, {
    status: becomesActive ? "active" : "waiting",
    startedAt: becomesActive ? new Date() : gameRow.startedAt,
    gameState: becomesActive
      ? engine.createInitialState(nextPlayers.map((p) => ({ role: p.role })))
      : (gameRow.gameState ??
        engine.createInitialState(nextPlayers.map((p) => ({ role: p.role })))),
  });
  return { game, changed: true };
}

async function finalize(
  gameRow: GameRecord,
  outcome: Outcome,
): Promise<GameRecord> {
  if (outcome.status !== "completed") return gameRow;

  const players = gameRow.players;
  let winnerUserId: string | null = null;
  if (!outcome.draw && outcome.winnerRole) {
    winnerUserId =
      players.find((p) => p.role === outcome.winnerRole)?.userId ?? null;
  }

  const updated = await games.updateGame(gameRow.id, {
    status: "completed",
    completedAt: new Date(),
    winner: outcome.draw ? "draw" : winnerUserId,
  });

  for (const p of players) {
    if (outcome.draw)
      await profiles.bumpStats(p.userId, gameRow.gameType, "drawn");
    else if (p.userId === winnerUserId)
      await profiles.bumpStats(p.userId, gameRow.gameType, "won");
    else await profiles.bumpStats(p.userId, gameRow.gameType, "lost");
  }
  return updated;
}

export async function handleJoinRoom(
  io: IOServer,
  socket: Socket,
  payload: ClientJoinRoom,
): Promise<void> {
  const userId = socket.data.userId;
  if (!isUuid(payload.gameId)) return err(socket, "Invalid game id");

  const gameRow = await games.getGameById(payload.gameId);
  if (!gameRow) return err(socket, "Game not found");

  const { game, changed } = await ensureSeated(
    gameRow,
    userId,
    payload.intent ?? "play",
  );

  joinGameRoom(socket, payload.gameId);
  await emitFullState(io, game);
  if (changed) await broadcastGameCard(io, game.id);
  await scheduleTimeout(io, game.id, false);
}

export async function executeGameMove(
  io: IOServer,
  gameId: string,
  userId: string,
  moveData: any,
): Promise<void> {
  const gameRow = await games.getGameById(gameId);
  if (!gameRow) throw new Error("Game not found");
  if (gameRow.status !== "active") throw new Error("Game is not active");

  const player = gameRow.players.find((p) => p.userId === userId);
  if (!player) throw new Error("Not a player in this game");

  const def = getDefinition(gameRow.gameType);
  if (!def.engine.reduce) throw new Error("Game does not accept moves");

  const parsedMove = def.moveSchema.safeParse(moveData);
  if (!parsedMove.success) throw new Error("Invalid move");
  const parsedState = def.stateSchema.safeParse(gameRow.gameState);
  if (!parsedState.success) throw new Error("Corrupt game state");

  const result = def.engine.reduce(
    parsedState.data,
    { role: player.role },
    parsedMove.data,
  );
  if (!result.ok) throw new Error(result.error);

  const moveNumber = await games.nextMoveNumber(gameRow.id);
  const moveRow = await games.addMove({
    gameId: gameRow.id,
    moveNumber,
    playerId: userId,
    moveData: parsedMove.data,
  });

  let updated = await games.updateGame(gameRow.id, { gameState: result.state });
  updated = await finalize(updated, result.outcome);

  emitToGame(io, gameRow.id, "move_made", {
    move: serializeMove(moveRow),
    gameState: updated.gameState,
  });
  await emitFullState(io, updated);

  if (updated.status === "completed") {
    clearGameTimeout(gameId);
    emitToGame(io, gameRow.id, "game_over", { winner: updated.winner });
    await broadcastGameCard(io, updated.id);
  } else {
    await scheduleTimeout(io, gameId, true);
  }
}

export async function handleMakeMove(
  io: IOServer,
  socket: Socket,
  payload: ClientMakeMove,
): Promise<void> {
  const userId = socket.data.userId;
  if (!isUuid(payload.gameId)) return err(socket, "Invalid game id");

  try {
    await executeGameMove(io, payload.gameId, userId, payload.moveData);
  } catch (error: any) {
    err(socket, error.message ?? "Error making move");
  }
}

const gameTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function clearGameTimeout(gameId: string) {
  const existing = gameTimers.get(gameId);
  if (existing) {
    clearTimeout(existing);
    gameTimers.delete(gameId);
  }
}

export async function scheduleTimeout(io: IOServer, gameId: string, force = false) {
  if (!force && gameTimers.has(gameId)) return;

  const gameRow = await games.getGameById(gameId);
  if (!gameRow || gameRow.status !== "active" || gameRow.gameType !== "monopoly") {
    clearGameTimeout(gameId);
    return;
  }

  const state = gameRow.gameState as MonopolyState;
  const player = state.players[state.currentPlayerIndex];
  if (!player) return;

  let duration = 15000;
  if (state.turnPhase === "WAITING_FOR_ROLL") {
    const consecutiveTimeouts = player.consecutiveTimeouts ?? 0;
    if (consecutiveTimeouts === 0) duration = 15000;
    else if (consecutiveTimeouts === 1) duration = 5000;
    else duration = 4000;
  } else {
    duration = 20000;
  }

  clearGameTimeout(gameId);

  const timer = setTimeout(async () => {
    try {
      await executeTimeoutSkip(io, gameId);
    } catch (e) {
      console.error(`Error executing timeout skip for game ${gameId}:`, e);
    }
  }, duration);

  gameTimers.set(gameId, timer);
}

export async function executeTimeoutSkip(io: IOServer, gameId: string) {
  const gameRow = await games.getGameById(gameId);
  if (!gameRow || gameRow.status !== "active") return;

  const state = gameRow.gameState as MonopolyState;
  const player = state.players[state.currentPlayerIndex];
  if (!player) return;

  const gamePlayer = gameRow.players.find((p) => p.role === player.id);
  const userId = gamePlayer ? gamePlayer.userId : "system";

  await executeGameMove(io, gameId, userId, { type: "TIMEOUT_SKIP" });
}
