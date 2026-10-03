import { type GamePlayer, type GameRecord, games } from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import {
  type GameDefinition,
  type GameJson,
  isBotId,
  type ServerGameStatePayload,
} from "@kyzen/shared/types";
import type { Server as IOServer } from "socket.io";
import {
  publicPlayerId,
  serializeGame,
  serializeMove,
  serializeMoves,
} from "../api/serialize";
import { broadcastGameCard } from "../chat/game-card-broadcast";
import { childLogger } from "../logger";
import { withGameLock } from "./game-lock";
import { emitToGame } from "./rooms";
import { botDifficulty } from "./setup";
import { actingRoles, pendingPlayers, roundClock } from "./simultaneous";
import {
  abortWinners,
  decideTimeout,
  turnLimitMs,
  turnTimers,
} from "./turn-timer";

const log = childLogger({ mod: "game-runner" });

const MAX_RETRIES = 3;
const MAX_BOT_MOVES = 1000;

type Loaded = { definition: GameDefinition; state: unknown };

type Submission = { player: GamePlayer; moveData: unknown; auto?: boolean };

type CommitResult =
  | { ok: true; game: GameRecord }
  | { ok: false; error: string; stale: boolean };

function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableKey((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function loadState(row: GameRecord): Loaded | null {
  const definition = getDefinition(row.gameType);
  const parsed = definition.stateSchema.safeParse(row.gameState);
  return parsed.success ? { definition, state: parsed.data } : null;
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

export async function emitFullState(
  io: IOServer,
  gameRow: GameRecord,
): Promise<void> {
  const moves = await games.listMoves(gameRow.id);
  const payload: ServerGameStatePayload = {
    game: withTimerFields(serializeGame(gameRow), gameRow.id),
    moves: serializeMoves(moves, gameRow),
  };
  emitToGame(io, gameRow.code, "game_state", payload);
}

function scheduleTurn(io: IOServer, row: GameRecord, loaded: Loaded): void {
  const role = loaded.definition.engine.currentRole?.(loaded.state) ?? null;
  if (!role) {
    turnTimers.clear(row.id);
    return;
  }
  const key = `turn:${stableKey(row.gameState)}`;
  if (turnTimers.armedKey(row.id) === key && turnTimers.deadline(row.id))
    return;
  const limit = turnLimitMs({
    isFirstTurn: turnTimers.isFirstTurn(row.id, role),
    strikes: turnTimers.strikes(row.id, role),
  });
  turnTimers.arm(
    row.id,
    key,
    limit,
    () => {
      void onTurnTimeout(io, row.id, key);
    },
    role,
  );
}

function scheduleRound(io: IOServer, row: GameRecord, loaded: Loaded): void {
  const clock = roundClock(loaded.definition.engine, loaded.state);
  if (!clock) {
    turnTimers.clear(row.id);
    return;
  }
  if (turnTimers.armedKey(row.id) === clock.key && turnTimers.deadline(row.id))
    return;
  turnTimers.arm(row.id, clock.key, clock.limitMs, () => {
    void onRoundTimeout(io, row.id, clock.key);
  });
}

function schedule(io: IOServer, row: GameRecord): void {
  const loaded = row.status === "active" ? loadState(row) : null;
  if (!loaded) {
    turnTimers.clear(row.id);
    return;
  }
  if (loaded.definition.engine.mode === "simultaneous")
    scheduleRound(io, row, loaded);
  else scheduleTurn(io, row, loaded);
}

async function finish(io: IOServer, row: GameRecord): Promise<void> {
  turnTimers.dispose(row.id);
  emitToGame(io, row.code, "game_over", {
    winner: publicPlayerId(row, row.winner),
  });
  await broadcastGameCard(io, row.id);
}

async function commitMove(
  io: IOServer,
  row: GameRecord,
  submission: Submission,
): Promise<CommitResult> {
  if (row.status !== "active")
    return { ok: false, error: "Game is not active", stale: false };
  const definition = getDefinition(row.gameType);
  const { engine } = definition;
  if (!engine.reduce)
    return { ok: false, error: "Game does not accept moves", stale: false };
  const move = definition.moveSchema.safeParse(submission.moveData);
  if (!move.success) return { ok: false, error: "Invalid move", stale: false };
  const state = definition.stateSchema.safeParse(row.gameState);
  if (!state.success)
    return { ok: false, error: "Corrupt game state", stale: false };
  const result = engine.reduce(
    state.data,
    { role: submission.player.role },
    move.data,
  );
  if (!result.ok) return { ok: false, error: result.error, stale: false };

  const persisted = await games.persistGameMove({
    previous: row,
    playerId: submission.player.userId,
    moveData: move.data,
    gameState: result.state,
    outcome: result.outcome,
  });
  if (!persisted)
    return { ok: false, error: "Game changed, try again", stale: true };
  const { game, move: moveRow } = persisted;

  if (!submission.auto)
    turnTimers.resetStrikes(game.id, submission.player.role);
  schedule(io, game);

  const delta = serializeMove(moveRow, game);
  const payload: ServerGameStatePayload = {
    game: withTimerFields(serializeGame(game), game.id),
    move: submission.auto ? { ...delta, auto: true } : delta,
  };
  emitToGame(io, game.code, "game_state", payload);
  if (game.status === "completed") await finish(io, game);
  return { ok: true, game };
}

function nextBotSubmission(row: GameRecord): Submission | null {
  const loaded = loadState(row);
  const engine = loaded?.definition.engine;
  if (!loaded || !engine?.botMove) return null;
  const roles = actingRoles(engine, loaded.state);
  const [player] = pendingPlayers(row.players, roles).bots;
  if (!player) return null;
  return {
    player,
    moveData: engine.botMove(
      loaded.state,
      player.role,
      botDifficulty(row.config, player.userId) ?? "normal",
    ),
  };
}

export async function settle(
  io: IOServer,
  row: GameRecord,
): Promise<GameRecord> {
  let current = row;
  for (let step = 0; step < MAX_BOT_MOVES; step++) {
    if (current.status !== "active") break;
    const submission = nextBotSubmission(current);
    if (!submission) break;
    const result = await commitMove(io, current, submission);
    if (result.ok) current = result.game;
    else if (result.stale)
      current = (await games.getGameById(current.id)) ?? current;
    else {
      log.warn(
        { gameId: current.id, role: submission.player.role, err: result.error },
        "bot move rejected",
      );
      break;
    }
  }
  schedule(io, current);
  return current;
}

export function submitMove(
  io: IOServer,
  gameId: string,
  userId: string,
  moveData: unknown,
): Promise<string | null> {
  return withGameLock(gameId, async () => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const row = await games.getGameById(gameId);
      if (!row) return "Game not found";
      if (row.status !== "active") return "Game is not active";
      const player = row.players.find((p) => p.userId === userId);
      if (!player) return "Not a player in this game";
      const result = await commitMove(io, row, { player, moveData });
      if (result.ok) {
        await settle(io, result.game);
        return null;
      }
      if (!result.stale) return result.error;
    }
    return "Game is busy, try again";
  });
}

export async function ensureClock(io: IOServer, code: string): Promise<void> {
  const record = await games.getGameByCode(code);
  if (record?.status !== "active") return;
  await withGameLock(record.id, async () => {
    const fresh = await games.getGameById(record.id);
    if (fresh?.status === "active") await settle(io, fresh);
  });
}

async function abortGame(
  io: IOServer,
  gameRow: GameRecord,
  winners: string[],
): Promise<void> {
  const updated = await games.abortActiveGame(gameRow, winners);
  if (!updated) return;

  turnTimers.dispose(updated.id);
  emitToGame(io, gameRow.code, "game_state", {
    game: withTimerFields(serializeGame(updated), updated.id),
  });
  emitToGame(io, gameRow.code, "game_over", {
    winner: publicPlayerId(updated, updated.winner),
  });
  await broadcastGameCard(io, updated.id);
}

function onTurnTimeout(
  io: IOServer,
  gameId: string,
  armedKey: string,
): Promise<void> {
  return withGameLock(gameId, async () => {
    const row = await games.getGameById(gameId);
    if (row?.status !== "active") {
      turnTimers.clear(gameId);
      return;
    }
    if (`turn:${stableKey(row.gameState)}` !== armedKey) return;
    const loaded = loadState(row);
    const role = loaded?.definition.engine.currentRole?.(loaded.state) ?? null;
    const player = row.players.find((p) => p.role === role);
    if (!loaded || !role || !player) {
      turnTimers.clear(gameId);
      return;
    }

    const strikes = turnTimers.strikes(gameId, role);
    const decision = decideTimeout({ strikes });
    if (decision.kind === "abort") {
      await abortGame(
        io,
        row,
        abortWinners(row.players, role, (other) =>
          turnTimers.strikes(gameId, other),
        ),
      );
      return;
    }

    turnTimers.setStrikes(gameId, role, decision.nextStrikes);
    const { engine } = loaded.definition;
    if (!engine.autoMove) {
      turnTimers.clear(gameId);
      return;
    }
    const result = await commitMove(io, row, {
      player,
      moveData: engine.autoMove(loaded.state, role, strikes),
      auto: true,
    });
    if (result.ok) await settle(io, result.game);
    else turnTimers.clear(gameId);
  });
}

async function autoSubmit(
  io: IOServer,
  row: GameRecord,
  player: GamePlayer,
  strikes: number,
  roundKey: string,
): Promise<GameRecord> {
  let current = row;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const loaded = loadState(current);
    if (!loaded || current.status !== "active") return current;
    const { engine } = loaded.definition;
    if (
      roundClock(engine, loaded.state)?.key !== roundKey ||
      !actingRoles(engine, loaded.state).includes(player.role) ||
      !engine.autoMove
    )
      return current;
    const result = await commitMove(io, current, {
      player,
      moveData: engine.autoMove(loaded.state, player.role, strikes),
      auto: true,
    });
    if (result.ok) return result.game;
    if (!result.stale) {
      log.warn(
        { gameId: current.id, role: player.role, err: result.error },
        "auto move rejected",
      );
      return current;
    }
    current = (await games.getGameById(current.id)) ?? current;
  }
  return current;
}

function onRoundTimeout(
  io: IOServer,
  gameId: string,
  roundKey: string,
): Promise<void> {
  return withGameLock(gameId, async () => {
    let row = await games.getGameById(gameId);
    if (row?.status !== "active") {
      turnTimers.clear(gameId);
      return;
    }
    const loaded = loadState(row);
    if (!loaded) {
      turnTimers.clear(gameId);
      return;
    }
    const { engine } = loaded.definition;
    if (roundClock(engine, loaded.state)?.key !== roundKey) return;
    turnTimers.clear(gameId);
    const pending = pendingPlayers(
      row.players,
      actingRoles(engine, loaded.state),
    );
    for (const player of [...pending.humans, ...pending.bots]) {
      if (row.status !== "active") break;
      const human = !isBotId(player.userId);
      const strikes = human ? turnTimers.strikes(gameId, player.role) : 0;
      if (human) turnTimers.setStrikes(gameId, player.role, strikes + 1);
      row = await autoSubmit(io, row, player, strikes, roundKey);
    }
    await settle(io, row);
  });
}

export const __timerInternals = { onTurnTimeout, onRoundTimeout };
