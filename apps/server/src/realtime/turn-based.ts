import {
  type ClientJoinRoom,
  type ClientMakeMove,
  getEngine,
  type Outcome,
  type ServerGameStatePayload,
} from "@gamelobby/games-core";
import type { Server as IOServer, Socket } from "socket.io";
import { serializeGame, serializeMove } from "../api/serialize";
import { type GamePlayer, type GameRow, games, profiles } from "../db";
import { emitToGame, joinGameRoom } from "./rooms";

/**
 * Generic turn-based dispatcher. This is the "common module": it knows nothing
 * about any specific game. It loads the right engine by `gameType`, validates
 * moves via the pure `engine.reduce`, persists through repositories, and
 * broadcasts state. New turn-based games need only register an engine.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(socket: Socket, message: string) {
  socket.emit("game_error", { message });
}

async function emitFullState(io: IOServer, gameRow: GameRow) {
  const moves = await games.listMoves(gameRow.id);
  const payload: ServerGameStatePayload = {
    game: serializeGame(gameRow),
    moves: moves.map(serializeMove),
  };
  emitToGame(io, gameRow.id, "game_state", payload);
}

/** Seat a newcomer into a waiting game, activating it when full. */
async function ensureSeated(
  gameRow: GameRow,
  userId: string,
): Promise<GameRow | { error: string }> {
  const players = (gameRow.players ?? []) as GamePlayer[];
  if (players.some((p) => p.userId === userId)) return gameRow;

  const engine = getEngine(gameRow.gameType);
  if (gameRow.status !== "waiting" || players.length >= engine.maxPlayers) {
    return { error: "Cannot join this game" };
  }

  const profile = await profiles.getProfileByUserId(userId);
  const username = profile?.username ?? "player";
  const role = engine.roles[players.length]!;
  const nextPlayers = [...players, { userId, username, role }];
  const becomesActive = nextPlayers.length >= engine.minPlayers;

  return games.updateGame(gameRow.id, {
    players: nextPlayers,
    status: becomesActive ? "active" : "waiting",
    startedAt: becomesActive ? new Date() : gameRow.startedAt,
    gameState:
      gameRow.gameState ??
      engine.createInitialState(nextPlayers.map((p) => ({ role: p.role }))),
  });
}

async function finalize(gameRow: GameRow, outcome: Outcome): Promise<GameRow> {
  if (outcome.status !== "completed") return gameRow;

  const players = (gameRow.players ?? []) as GamePlayer[];
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
  if (!UUID_RE.test(payload.gameId)) return err(socket, "Invalid game id");

  const gameRow = await games.getGameById(payload.gameId);
  if (!gameRow) return err(socket, "Game not found");

  const seated = await ensureSeated(gameRow, userId);
  if ("error" in seated) return err(socket, seated.error);

  joinGameRoom(socket, payload.gameId);
  await emitFullState(io, seated);
}

export async function handleMakeMove(
  io: IOServer,
  socket: Socket,
  payload: ClientMakeMove,
): Promise<void> {
  const userId = socket.data.userId;
  if (!UUID_RE.test(payload.gameId)) return err(socket, "Invalid game id");

  const gameRow = await games.getGameById(payload.gameId);
  if (!gameRow) return err(socket, "Game not found");
  if (gameRow.status !== "active") return err(socket, "Game is not active");

  const players = (gameRow.players ?? []) as GamePlayer[];
  const player = players.find((p) => p.userId === userId);
  if (!player) return err(socket, "Not a player in this game");

  const engine = getEngine(gameRow.gameType);
  if (!engine.reduce) return err(socket, "Game does not accept moves");

  const result = engine.reduce(
    gameRow.gameState,
    { role: player.role },
    payload.moveData,
  );
  if (!result.ok) return err(socket, result.error);

  const moveNumber = await games.nextMoveNumber(gameRow.id);
  const moveRow = await games.addMove({
    gameId: gameRow.id,
    moveNumber,
    playerId: userId,
    moveData: payload.moveData,
  });

  let updated = await games.updateGame(gameRow.id, { gameState: result.state });
  updated = await finalize(updated, result.outcome);

  emitToGame(io, gameRow.id, "move_made", {
    move: serializeMove(moveRow),
    gameState: updated.gameState,
  });
  await emitFullState(io, updated);

  if (updated.status === "completed") {
    emitToGame(io, gameRow.id, "game_over", { winner: updated.winner });
  }
}
