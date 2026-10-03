import { type GameRecord, games } from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import type { ClientMakeMove, Outcome } from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { publicPlayerId, serializeGame } from "../api/serialize";
import { broadcastGameCard } from "../chat/game-card-broadcast";
import { childLogger } from "../logger";
import { emitToGame, gameRoom } from "./rooms";

const log = childLogger({ mod: "realtime:game-loop" });
const NO_INPUT = {
  throttle: 0,
  steer: 0,
  jump: false,
  boost: false,
  handbrake: false,
};

type Loop = {
  game: GameRecord;
  state: unknown;
  inputs: Map<string, { value: unknown; receivedAt: number }>;
  lastAccepted: Map<string, number>;
  timer: ReturnType<typeof setInterval>;
  tick: number;
  startedAt: number;
  persisting: Promise<unknown> | null;
};

const loops = new Map<string, Loop>();

export function realtimeStateFor(code: string): unknown | null {
  return loops.get(code)?.state ?? null;
}

export function startRealtimeGame(io: IOServer, game: GameRecord): void {
  if (game.status !== "active" || loops.has(game.code)) return;
  const definition = getDefinition(game.gameType);
  if (definition.engine.mode !== "realtime" || !definition.engine.step) return;
  const parsed = definition.stateSchema.safeParse(game.gameState);
  if (!parsed.success) {
    log.error({ gameId: game.id }, "invalid realtime state");
    return;
  }
  const dt = 1 / (definition.engine.tickRate ?? 30);
  const loop: Loop = {
    game,
    state: parsed.data,
    inputs: new Map(),
    lastAccepted: new Map(),
    timer: undefined as unknown as ReturnType<typeof setInterval>,
    tick: 0,
    startedAt: Date.now(),
    persisting: null,
  };
  const step = definition.engine.step;
  loop.timer = setInterval(() => {
    const now = Date.now();
    const inputs = new Map<string, unknown>();
    for (const player of loop.game.players) {
      const latest = loop.inputs.get(player.role);
      inputs.set(
        player.role,
        latest && now - latest.receivedAt <= 250 ? latest.value : NO_INPUT,
      );
    }
    const absent = loop.game.players
      .filter(
        (player) =>
          now - (loop.inputs.get(player.role)?.receivedAt ?? loop.startedAt) >
          45000,
      )
      .map((player) => player.role);
    const result =
      definition.engine.onPlayersAbsent?.(loop.state, absent) ??
      step(loop.state, inputs, dt);
    loop.state = result.state;
    loop.tick += 1;
    if (loop.tick % 2 === 0 || result.outcome.status === "completed") {
      emitToGame(io, game.code, "game_state", {
        game: { ...serializeGame(loop.game), gameState: loop.state },
      });
    }
    if (result.outcome.status === "completed") {
      clearInterval(loop.timer);
      loops.delete(game.code);
      void finishRealtimeGame(io, loop, result.outcome);
      return;
    }
    if (loop.tick % 30 === 0 && !loop.persisting) {
      const snapshot = loop.state;
      loop.persisting = games
        .updateGame(game.id, { gameState: snapshot })
        .catch((error: unknown) =>
          log.error({ error, gameId: game.id }, "snapshot failed"),
        )
        .finally(() => {
          loop.persisting = null;
        });
    }
  }, 1000 * dt);
  loop.timer.unref();
  loops.set(game.code, loop);
}

async function finishRealtimeGame(
  io: IOServer,
  loop: Loop,
  outcome: Outcome,
): Promise<void> {
  if (outcome.status !== "completed") return;
  try {
    await loop.persisting;
    const winningTeam = outcome.winnerRole?.split("-")[0];
    const updated = await games.completeRealtimeGame({
      previous: loop.game,
      gameState: loop.state,
      winnerRole: outcome.winnerRole,
      winningRoles: loop.game.players
        .filter(
          (player) => winningTeam && player.role.startsWith(`${winningTeam}-`),
        )
        .map((player) => player.role),
    });
    if (!updated) return;
    emitToGame(io, updated.code, "game_state", {
      game: serializeGame(updated),
    });
    emitToGame(io, updated.code, "game_over", {
      winner: publicPlayerId(updated, updated.winner),
    });
    await broadcastGameCard(io, updated.id);
  } catch (error) {
    log.error({ error, gameId: loop.game.id }, "realtime completion failed");
  }
}

export function receiveRealtimeInput(
  socket: Socket,
  payload: ClientMakeMove,
): boolean {
  const loop = loops.get(payload.gameId);
  if (!loop) return false;
  if (!socket.rooms.has(gameRoom(payload.gameId))) {
    socket.emit("game_error", { message: "Join the room before playing" });
    return true;
  }
  const player = loop.game.players.find(
    (candidate) => candidate.userId === socket.data.userId,
  );
  if (!player) {
    socket.emit("game_error", { message: "Not a player in this game" });
    return true;
  }
  const definition = getDefinition(loop.game.gameType);
  const parsed = definition.moveSchema.safeParse(payload.moveData);
  if (!parsed.success) {
    socket.emit("game_error", { message: "Invalid controls" });
    return true;
  }
  const now = Date.now();
  if (now - (loop.lastAccepted.get(player.role) ?? 0) < 25) return true;
  loop.lastAccepted.set(player.role, now);
  loop.inputs.set(player.role, { value: parsed.data, receivedAt: now });
  return true;
}

export function stopRealtimeGames(): void {
  for (const loop of loops.values()) clearInterval(loop.timer);
  loops.clear();
}
