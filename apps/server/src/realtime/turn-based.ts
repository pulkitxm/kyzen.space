import {
  type GamePlayer,
  type GameRecord,
  games,
  profiles,
} from "@gamelobby/database";
import { getDefinition } from "@gamelobby/games-core";
import {
  type ClientJoinRoom,
  type ClientMakeMove,
  type GameJson,
  isGameCode,
  type Outcome,
  type ServerGameStatePayload,
} from "@gamelobby/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { serializeGame, serializeMove } from "../api/serialize";
import { broadcastGameCard } from "../chat/game-card-broadcast";
import { emitToGame, joinGameRoom } from "./rooms";
import {
  abortOutcome,
  decideTimeout,
  turnLimitMs,
  turnTimers,
} from "./turn-timer";

function err(socket: Socket, message: string) {
  socket.emit("game_error", { message });
}

function withTimerFields(game: GameJson, gameId: string): GameJson {
  return {
    ...game,
    turnDeadline: turnTimers.deadline(gameId),
    players: game.players.map((p) => ({
      ...p,
      timeoutStrikes: turnTimers.strikes(gameId, p.role),
    })),
  };
}

function currentRoleOf(gameRow: GameRecord): string | null {
  const def = getDefinition(gameRow.gameType);
  if (!def.engine.currentRole) return null;
  const parsed = def.stateSchema.safeParse(gameRow.gameState);
  if (!parsed.success) return null;
  return def.engine.currentRole(parsed.data);
}

function scheduleNext(io: IOServer, gameRow: GameRecord): void {
  if (gameRow.status !== "active") {
    turnTimers.clear(gameRow.id);
    return;
  }
  const role = currentRoleOf(gameRow);
  if (!role) {
    turnTimers.clear(gameRow.id);
    return;
  }
  const limit = turnLimitMs({
    isFirstTurn: turnTimers.isFirstTurn(gameRow.id, role),
    strikes: turnTimers.strikes(gameRow.id, role),
  });
  turnTimers.arm(gameRow.id, role, limit, () => {
    void onTurnTimeout(io, gameRow.id);
  });
}

async function emitFullState(io: IOServer, gameRow: GameRecord) {
  const moves = await games.listMoves(gameRow.id);
  const payload: ServerGameStatePayload = {
    game: withTimerFields(serializeGame(gameRow), gameRow.id),
    moves: moves.map((m) => serializeMove(m, gameRow.code)),
  };
  emitToGame(io, gameRow.code, "game_state", payload);
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

  const seated = await games.seatPlayer(gameRow.id, newPlayer, players.length);
  if (!seated) {
    const refreshed = await games.getGameById(gameRow.id);
    return { game: refreshed ?? gameRow, changed: false };
  }
  const game = await games.updateGame(gameRow.id, {
    status: becomesActive ? "active" : "waiting",
    startedAt: becomesActive ? new Date() : gameRow.startedAt,
    gameState:
      gameRow.gameState ??
      engine.createInitialState(nextPlayers.map((p) => ({ role: p.role }))),
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

async function applyMove(
  io: IOServer,
  gameRow: GameRecord,
  player: GamePlayer,
  moveData: unknown,
  opts: { auto?: boolean } = {},
): Promise<void> {
  const def = getDefinition(gameRow.gameType);
  if (!def.engine.reduce) return;

  const parsedMove = def.moveSchema.safeParse(moveData);
  if (!parsedMove.success) return;
  const parsedState = def.stateSchema.safeParse(gameRow.gameState);
  if (!parsedState.success) return;

  const result = def.engine.reduce(
    parsedState.data,
    { role: player.role },
    parsedMove.data,
  );
  if (!result.ok) return;

  const moveNumber = await games.nextMoveNumber(gameRow.id);
  const moveRow = await games.addMove({
    gameId: gameRow.id,
    moveNumber,
    playerId: player.userId,
    moveData: parsedMove.data,
  });

  let updated = await games.updateGame(gameRow.id, { gameState: result.state });
  updated = await finalize(updated, result.outcome);

  if (!opts.auto) turnTimers.resetStrikes(gameRow.id, player.role);
  scheduleNext(io, updated);

  const move = serializeMove(moveRow, gameRow.code);
  const statePayload: ServerGameStatePayload = {
    game: withTimerFields(serializeGame(updated), updated.id),
    move: opts.auto ? { ...move, auto: true } : move,
  };
  emitToGame(io, gameRow.code, "game_state", statePayload);

  if (updated.status === "completed") {
    turnTimers.dispose(updated.id);
    emitToGame(io, gameRow.code, "game_over", { winner: updated.winner });
    await broadcastGameCard(io, updated.id);
  }
}

async function abortGame(
  io: IOServer,
  gameRow: GameRecord,
  winner: GamePlayer | null,
): Promise<void> {
  const updated = await games.updateGame(gameRow.id, {
    status: "aborted",
    completedAt: new Date(),
    winner: winner ? winner.userId : null,
  });

  if (winner) {
    for (const p of gameRow.players) {
      await profiles.bumpStats(
        p.userId,
        gameRow.gameType,
        p.userId === winner.userId ? "won" : "lost",
      );
    }
  }

  turnTimers.dispose(updated.id);
  emitToGame(io, gameRow.code, "game_state", {
    game: withTimerFields(serializeGame(updated), updated.id),
  });
  emitToGame(io, gameRow.code, "game_over", { winner: updated.winner });
  await broadcastGameCard(io, updated.id);
}

async function onTurnTimeout(io: IOServer, gameId: string): Promise<void> {
  const gameRow = await games.getGameById(gameId);
  if (!gameRow || gameRow.status !== "active") {
    turnTimers.clear(gameId);
    return;
  }
  const role = currentRoleOf(gameRow);
  if (!role) {
    turnTimers.clear(gameId);
    return;
  }
  const player = gameRow.players.find((p) => p.role === role);
  if (!player) {
    turnTimers.clear(gameId);
    return;
  }

  const decision = decideTimeout({ strikes: turnTimers.strikes(gameId, role) });
  if (decision.kind === "abort") {
    const opponent = gameRow.players.find((p) => p.role !== role) ?? null;
    const opponentStrikes = opponent
      ? turnTimers.strikes(gameId, opponent.role)
      : 0;
    const outcome = abortOutcome({ opponentStrikes });
    await abortGame(io, gameRow, outcome.winner === "opponent" ? opponent : null);
    return;
  }

  turnTimers.setStrikes(gameId, role, decision.nextStrikes);
  const def = getDefinition(gameRow.gameType);
  const parsed = def.stateSchema.safeParse(gameRow.gameState);
  if (!def.engine.autoMove || !parsed.success) {
    turnTimers.clear(gameId);
    return;
  }
  const move = def.engine.autoMove(parsed.data, role);
  await applyMove(io, gameRow, player, move, { auto: true });
}

export async function handleJoinRoom(
  io: IOServer,
  socket: Socket,
  payload: ClientJoinRoom,
): Promise<void> {
  const userId = socket.data.userId;
  if (!isGameCode(payload.gameId)) return err(socket, "Invalid game id");

  const gameRow = await games.getGameByCode(payload.gameId);
  if (!gameRow) return err(socket, "Game not found");

  const { game, changed } = await ensureSeated(
    gameRow,
    userId,
    payload.intent ?? "play",
  );

  joinGameRoom(socket, game.code);
  if (changed && game.status === "active") scheduleNext(io, game);
  await emitFullState(io, game);
  if (changed) await broadcastGameCard(io, game.id);
}

export async function handleMakeMove(
  io: IOServer,
  socket: Socket,
  payload: ClientMakeMove,
): Promise<void> {
  const userId = socket.data.userId;
  if (!isGameCode(payload.gameId)) return err(socket, "Invalid game id");

  const gameRow = await games.getGameByCode(payload.gameId);
  if (!gameRow) return err(socket, "Game not found");
  if (gameRow.status !== "active") return err(socket, "Game is not active");

  const player = gameRow.players.find((p) => p.userId === userId);
  if (!player) return err(socket, "Not a player in this game");

  const def = getDefinition(gameRow.gameType);
  if (!def.engine.reduce) return err(socket, "Game does not accept moves");

  const parsedMove = def.moveSchema.safeParse(payload.moveData);
  if (!parsedMove.success) return err(socket, "Invalid move");
  const parsedState = def.stateSchema.safeParse(gameRow.gameState);
  if (!parsedState.success) return err(socket, "Corrupt game state");

  const result = def.engine.reduce(
    parsedState.data,
    { role: player.role },
    parsedMove.data,
  );
  if (!result.ok) return err(socket, result.error);

  await applyMove(io, gameRow, player, parsedMove.data);
}

export const __timerInternals = { onTurnTimeout };
