import { type GamePlayer, type GameRecord, games } from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import type {
  GameDefinition,
  Outcome,
  ServerGameStatePayload,
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
  withTimerFields,
} from "./turn-timer";

const log = childLogger({ mod: "game-runner" });

const MAX_RETRIES = 3;
const MAX_BOT_BATCHES = 1000;

type Loaded = { definition: GameDefinition; state: unknown };

type Submission = { player: GamePlayer; moveData: unknown; auto?: boolean };

type CommitResult =
  | { ok: true; game: GameRecord }
  | { ok: false; error: string; stale: boolean };

type Settled = { game: GameRecord; error: string | null };

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
  if (row.status !== "active") return null;
  const definition = getDefinition(row.gameType);
  const parsed = definition.stateSchema.safeParse(row.gameState);
  return parsed.success ? { definition, state: parsed.data } : null;
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

function pendingOf(row: GameRecord, loaded: Loaded) {
  return pendingPlayers(
    row.players,
    actingRoles(loaded.definition.engine, loaded.state),
  );
}

function botClockDelay(row: GameRecord, loaded: Loaded): number {
  const { engine } = loaded.definition;
  if (!engine.botMove) return 0;
  const pending = pendingOf(row, loaded);
  if (pending.humans.length || !pending.bots.length) return 0;
  return engine.resultDelayMs?.(loaded.state) ?? 0;
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
  const delay = botClockDelay(row, loaded);
  const key = delay > 0 ? `bots:${clock.key}` : clock.key;
  if (turnTimers.armedKey(row.id) === key && turnTimers.deadline(row.id))
    return;
  turnTimers.arm(row.id, key, delay > 0 ? delay : clock.limitMs, () => {
    void (delay > 0
      ? onBotClock(io, row.id, key)
      : onRoundTimeout(io, row.id, key));
  });
}

function schedule(io: IOServer, row: GameRecord): void {
  const loaded = loadState(row);
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

async function commitMoves(
  io: IOServer,
  row: GameRecord,
  submissions: Submission[],
): Promise<CommitResult> {
  if (row.status !== "active")
    return { ok: false, error: "Game is not active", stale: false };
  const definition = getDefinition(row.gameType);
  const { engine } = definition;
  if (!engine.reduce)
    return { ok: false, error: "Game does not accept moves", stale: false };
  const parsed = definition.stateSchema.safeParse(row.gameState);
  if (!parsed.success)
    return { ok: false, error: "Corrupt game state", stale: false };
  let state = parsed.data;
  let outcome: Outcome = { status: "active" };
  const accepted: Submission[] = [];
  for (const submission of submissions) {
    const move = definition.moveSchema.safeParse(submission.moveData);
    const result = move.success
      ? engine.reduce(state, { role: submission.player.role }, move.data)
      : null;
    if (!move.success || !result?.ok) {
      const error = result && !result.ok ? result.error : "Invalid move";
      if (!accepted.length) return { ok: false, error, stale: false };
      log.warn(
        { gameId: row.id, role: submission.player.role, err: error },
        "batched move rejected",
      );
      break;
    }
    state = result.state;
    outcome = result.outcome;
    accepted.push({ ...submission, moveData: move.data });
    if (outcome.status === "completed") break;
  }

  const persisted = await games.persistGameMoves({
    previous: row,
    moves: accepted.map((submission) => ({
      playerId: submission.player.userId,
      moveData: submission.moveData,
    })),
    gameState: state,
    outcome,
  });
  if (!persisted)
    return { ok: false, error: "Game changed, try again", stale: true };
  const { game } = persisted;

  for (const submission of accepted)
    if (!submission.auto)
      turnTimers.resetStrikes(game.id, submission.player.role);
  schedule(io, game);

  const last = persisted.moves.at(-1);
  const delta = last ? serializeMove(last, game) : undefined;
  const payload: ServerGameStatePayload = {
    game: withTimerFields(serializeGame(game), game.id),
    ...(delta
      ? { move: accepted.at(-1)?.auto ? { ...delta, auto: true } : delta }
      : {}),
  };
  emitToGame(io, game.code, "game_state", payload);
  if (game.status === "completed") await finish(io, game);
  return { ok: true, game };
}

async function commitFresh(
  io: IOServer,
  row: GameRecord,
  build: (row: GameRecord) => Submission[],
): Promise<Settled> {
  let current = row;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const submissions = build(current);
    if (!submissions.length) return { game: current, error: null };
    const result = await commitMoves(io, current, submissions);
    if (result.ok) return { game: result.game, error: null };
    if (!result.stale) return { game: current, error: result.error };
    current = (await games.getGameById(current.id)) ?? current;
  }
  return { game: current, error: "Game is busy, try again" };
}

function botSubmissions(row: GameRecord): Submission[] {
  const loaded = loadState(row);
  const engine = loaded?.definition.engine;
  if (!loaded || !engine?.botMove) return [];
  return pendingOf(row, loaded).bots.map((player) => ({
    player,
    moveData: engine.botMove?.(
      loaded.state,
      player.role,
      botDifficulty(row.config, player.userId) ?? "normal",
    ),
  }));
}

function dueBotSubmissions(row: GameRecord): Submission[] {
  const loaded = loadState(row);
  if (!loaded || botClockDelay(row, loaded) > 0) return [];
  return botSubmissions(row);
}

export async function settle(
  io: IOServer,
  row: GameRecord,
): Promise<GameRecord> {
  let current = row;
  for (let batch = 0; batch < MAX_BOT_BATCHES; batch++) {
    const result = await commitFresh(io, current, dueBotSubmissions);
    const advanced = result.game !== current;
    current = result.game;
    if (result.error) {
      log.warn({ gameId: current.id, err: result.error }, "bot moves rejected");
      break;
    }
    if (!advanced) break;
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
      const result = await commitMoves(io, row, [{ player, moveData }]);
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
    const result = await commitMoves(io, row, [
      {
        player,
        moveData: engine.autoMove(loaded.state, role, strikes),
        auto: true,
      },
    ]);
    if (result.ok) await settle(io, result.game);
    else turnTimers.clear(gameId);
  });
}

function timeoutSubmissions(
  row: GameRecord,
  roundKey: string,
  strikes: Map<string, number>,
): Submission[] {
  const loaded = loadState(row);
  const engine = loaded?.definition.engine;
  if (!loaded || !engine?.autoMove) return [];
  if (roundClock(engine, loaded.state)?.key !== roundKey) return [];
  const pending = pendingOf(row, loaded);
  return [...pending.humans, ...pending.bots].map((player) => ({
    player,
    moveData: engine.autoMove?.(
      loaded.state,
      player.role,
      strikes.get(player.role) ?? 0,
    ),
    auto: true,
  }));
}

function onRoundTimeout(
  io: IOServer,
  gameId: string,
  roundKey: string,
): Promise<void> {
  return withGameLock(gameId, async () => {
    const row = await games.getGameById(gameId);
    const loaded = row ? loadState(row) : null;
    if (!row || !loaded) {
      turnTimers.clear(gameId);
      return;
    }
    const { engine } = loaded.definition;
    if (roundClock(engine, loaded.state)?.key !== roundKey) return;
    turnTimers.clear(gameId);
    const strikes = new Map<string, number>();
    for (const player of pendingOf(row, loaded).humans) {
      const previous = turnTimers.strikes(gameId, player.role);
      strikes.set(player.role, previous);
      turnTimers.setStrikes(gameId, player.role, previous + 1);
    }
    const result = await commitFresh(io, row, (current) =>
      timeoutSubmissions(current, roundKey, strikes),
    );
    if (result.error)
      log.warn({ gameId, err: result.error }, "auto moves rejected");
    await settle(io, result.game);
  });
}

function onBotClock(io: IOServer, gameId: string, key: string): Promise<void> {
  return withGameLock(gameId, async () => {
    const row = await games.getGameById(gameId);
    const loaded = row ? loadState(row) : null;
    if (!row || !loaded) {
      turnTimers.clear(gameId);
      return;
    }
    const roundKey = roundClock(loaded.definition.engine, loaded.state)?.key;
    if (!roundKey || `bots:${roundKey}` !== key) return;
    turnTimers.clear(gameId);
    let result = await commitFresh(io, row, (current) => {
      const fresh = loadState(current);
      const freshKey = fresh
        ? roundClock(fresh.definition.engine, fresh.state)?.key
        : null;
      return freshKey === roundKey ? botSubmissions(current) : [];
    });
    if (result.error) {
      log.warn({ gameId, err: result.error }, "bot moves rejected");
      result = await commitFresh(io, result.game, (current) =>
        timeoutSubmissions(current, roundKey, new Map()),
      );
    }
    await settle(io, result.game);
  });
}

export const __timerInternals = { onTurnTimeout, onRoundTimeout, onBotClock };
