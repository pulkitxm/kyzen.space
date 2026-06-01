import {
  type ClientJoinRoom,
  type ClientMakeMove,
  getDefinition,
  type Outcome,
  type ServerGameStatePayload,
} from "@gamelobby/games-core";
import type { Server as IOServer, Socket } from "socket.io";
import { serializeGame, serializeMove } from "../api/serialize";
import { broadcastGameCard } from "../chat/game-card-broadcast";
import { type GamePlayer, type GameRecord, games, profiles } from "../db";
import { emitToGame, joinGameRoom } from "./rooms";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Resolve the caller into a seat or a spectator. Already-seated players rejoin
 * unchanged. With intent "spectate", or when the game is full/active, or when
 * a "challenge" seat is reserved for someone else, the caller joins read-only
 * (no seat) — `make_move` already rejects non-players, so this is the
 * server-side guard against seat theft. Returns `changed: true` only when a new
 * player was actually seated.
 */
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

  // Anything that isn't a free, claimable seat falls through to spectating.
  if (intent === "spectate" || !seatFree || challengeReserved) {
    return { game: gameRow, changed: false };
  }

  const profile = await profiles.getProfileByUserId(userId);
  const username = profile?.username ?? "player";
  const role = engine.roles[players.length]!;
  const newPlayer: GamePlayer = { userId, username, role };
  const nextPlayers = [...players, newPlayer];
  const becomesActive = nextPlayers.length >= engine.minPlayers;

  await games.seatPlayer(gameRow.id, newPlayer, players.length);
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

export async function handleJoinRoom(
  io: IOServer,
  socket: Socket,
  payload: ClientJoinRoom,
): Promise<void> {
  const userId = socket.data.userId;
  if (!UUID_RE.test(payload.gameId)) return err(socket, "Invalid game id");

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

  const player = gameRow.players.find((p) => p.userId === userId);
  if (!player) return err(socket, "Not a player in this game");

  const def = getDefinition(gameRow.gameType);
  if (!def.engine.reduce) return err(socket, "Game does not accept moves");

  // Strict guardrails: validate the inbound move and the stored state against
  // the game's own schemas before handing them to the engine.
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
    emitToGame(io, gameRow.id, "game_over", { winner: updated.winner });
    // The move ended the game: refresh the in-chat card so it shows the result.
    // Its status is resolved server-side on assembly (see enrichGameCardMeta).
    await broadcastGameCard(io, updated.id);
  }
}
