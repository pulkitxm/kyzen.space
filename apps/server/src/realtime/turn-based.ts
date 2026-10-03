import {
  type GamePlayer,
  type GameRecord,
  games,
  profiles,
} from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import {
  type ClientJoinRoom,
  type ClientMakeMove,
  isGameCode,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { broadcastGameCard } from "../chat/game-card-broadcast";
import { withGameLock } from "./game-lock";
import { emitFullState, settle, submitMove } from "./game-runner";
import { joinGameRoom } from "./rooms";
import { initialState, lobbySettings, plainSeats } from "./setup";

function err(socket: Socket, message: string) {
  socket.emit("game_error", { message });
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

  const definition = getDefinition(gameRow.gameType);
  const { engine } = definition;
  const reserved = engine.lobby ? lobbySettings(gameRow.config).bots.length : 0;
  const seatFree =
    gameRow.status === "waiting" &&
    players.length + reserved < engine.maxPlayers;
  const challengeReserved =
    gameRow.seatingMode === "challenge" &&
    !!gameRow.challengedUserId &&
    userId !== gameRow.challengedUserId;

  if (intent === "spectate" || !seatFree || challengeReserved) {
    return { game: gameRow, changed: false };
  }

  const profile = await profiles.getProfileByUserId(userId);
  const username = profile?.username ?? "player";
  const role = engine.roleForSeat(players.length);
  const newPlayer: GamePlayer = { userId, username, role };
  const nextPlayers = [...players, newPlayer];

  const seated = await games.seatPlayer(gameRow.id, newPlayer, players.length);
  if (!seated) {
    const refreshed = await games.getGameById(gameRow.id);
    return { game: refreshed ?? gameRow, changed: false };
  }
  if (engine.lobby) {
    const refreshed = await games.getGameById(gameRow.id);
    return {
      game: refreshed ?? { ...gameRow, players: nextPlayers },
      changed: true,
    };
  }
  const becomesActive = nextPlayers.length >= engine.minPlayers;
  const game = await games.updateGame(gameRow.id, {
    status: becomesActive ? "active" : "waiting",
    startedAt: becomesActive ? new Date() : gameRow.startedAt,
    gameState:
      becomesActive || gameRow.gameState == null
        ? initialState(definition, plainSeats(nextPlayers), gameRow.config)
        : gameRow.gameState,
  });
  return { game, changed: true };
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

  if (
    gameRow.publicMatch &&
    !gameRow.players.some((player) => player.userId === userId)
  )
    return err(socket, "Game not found");

  const { game, changed } = await withGameLock(gameRow.id, async () => {
    const fresh = (await games.getGameById(gameRow.id)) ?? gameRow;
    const seated = await ensureSeated(fresh, userId, payload.intent ?? "play");
    return {
      game:
        seated.game.status === "active"
          ? await settle(io, seated.game)
          : seated.game,
      changed: seated.changed,
    };
  });

  joinGameRoom(socket, game.code);
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

  const error = await submitMove(io, gameRow.id, userId, payload.moveData);
  if (error) err(socket, error);
}
