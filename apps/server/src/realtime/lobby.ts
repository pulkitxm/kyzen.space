import { type GameRecord, games } from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import type { GameDefinition } from "@kyzen/shared/types";
import type { Server as IOServer } from "socket.io";
import { broadcastGameCard } from "../chat/game-card-broadcast";
import { withGameLock } from "./game-lock";
import { emitFullState, settle } from "./game-runner";
import { lobbySeats, lobbySettings, newSeed } from "./setup";

const MAX_RETRIES = 3;

export type LobbyResult = { ok: true } | { ok: false; error: string };

type HostedLobby =
  | { ok: true; row: GameRecord; definition: GameDefinition }
  | { ok: false; error: string };

async function hostedLobby(
  gameId: string,
  userId: string,
): Promise<HostedLobby> {
  const row = await games.getGameById(gameId);
  if (!row) return { ok: false, error: "Game not found" };
  const definition = getDefinition(row.gameType);
  if (!definition.engine.lobby)
    return { ok: false, error: "This game has no lobby" };
  if (row.creatorUserId !== userId)
    return { ok: false, error: "Only the host can change the lobby" };
  if (row.status !== "waiting")
    return { ok: false, error: "Game already started" };
  return { ok: true, row, definition };
}

export async function configureRoom(
  io: IOServer,
  userId: string,
  code: string,
  config: unknown,
): Promise<LobbyResult> {
  const found = await games.getGameByCode(code);
  if (!found) return { ok: false, error: "Game not found" };
  return withGameLock(found.id, async () => {
    const hosted = await hostedLobby(found.id, userId);
    if (!hosted.ok) return hosted;
    const { row, definition } = hosted;
    const { engine } = definition;
    const parsed = definition.configSchema.safeParse(config);
    if (!parsed.success) return { ok: false, error: "Invalid game config" };
    const lobby = lobbySettings(parsed.data);
    if (lobby.bots.length && !engine.lobby?.bots)
      return { ok: false, error: "This game does not support bots" };
    if (lobby.mode === "teams" && !engine.lobby?.teams)
      return { ok: false, error: "This game does not support teams" };
    if (row.players.length + lobby.bots.length > engine.maxPlayers)
      return { ok: false, error: "Too many players" };
    const updated = await games.configureLobby(row.id, parsed.data);
    if (!updated) return { ok: false, error: "Game already started" };
    await emitFullState(io, updated);
    return { ok: true };
  });
}

export async function startRoom(
  io: IOServer,
  userId: string,
  code: string,
): Promise<LobbyResult> {
  const found = await games.getGameByCode(code);
  if (!found) return { ok: false, error: "Game not found" };
  return withGameLock(found.id, async () => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const hosted = await hostedLobby(found.id, userId);
      if (!hosted.ok) return hosted;
      const { row, definition } = hosted;
      const { engine } = definition;
      const { seats, bots } = lobbySeats(
        engine,
        row.players,
        lobbySettings(row.config),
      );
      if (seats.length < engine.minPlayers)
        return {
          ok: false,
          error: `At least ${engine.minPlayers} players are needed`,
        };
      if (seats.length > engine.maxPlayers)
        return { ok: false, error: "Too many players" };
      const gameState = engine.createInitialState(seats, {
        config: row.config,
        seed: newSeed(),
      });
      const started = await games.startLobby({
        previous: row,
        bots,
        gameState,
      });
      if (!started) continue;
      const settled = await settle(io, started);
      await emitFullState(io, settled);
      await broadcastGameCard(io, settled.id);
      return { ok: true };
    }
    return { ok: false, error: "The lobby changed, try again" };
  });
}
