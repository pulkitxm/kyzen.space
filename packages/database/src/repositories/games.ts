import { randomInt, randomUUID } from "node:crypto";
import {
  addMoveInputSchema,
  type CreateGameInput,
  createGameInputSchema,
  type GamePlayer,
  type GameRecord,
  type GameRow,
  type GameType,
  type GameUpdate,
  isBotId,
  type MoveRow,
  normalizeGameCode,
  type Outcome,
  type Seat,
} from "@kyzen/shared/types";
import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  ne,
  sql,
} from "drizzle-orm";
import { db } from "../client";
import {
  game,
  gamePlayer,
  matchmakingTicket,
  move,
  userProfile,
} from "../schema";

const GAME_CODE_MAX_ATTEMPTS = 5;

function isGameCodeCollision(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint_name?: string;
    cause?: { code?: string; constraint_name?: string };
  };
  const code = e?.code ?? e?.cause?.code;
  const constraint = e?.constraint_name ?? e?.cause?.constraint_name;
  return code === "23505" && constraint === "game_code_uq";
}

function toGameRecord(row: GameRow, players: GamePlayer[]): GameRecord {
  return { ...row, gameType: row.gameType as GameType, players };
}

export async function createGame(input: CreateGameInput): Promise<GameRecord> {
  createGameInputSchema.parse(input);
  for (let attempt = 1; attempt <= GAME_CODE_MAX_ATTEMPTS; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        return insertGame(tx, input);
      });
    } catch (error) {
      if (!isGameCodeCollision(error)) throw error;
    }
  }
  throw new Error("Failed to allocate a unique game code");
}

export function getPlayers(gameId: string): Promise<GamePlayer[]> {
  return playersIn(db, gameId);
}

export async function getGameById(id: string): Promise<GameRecord | null> {
  const [row] = await db.select().from(game).where(eq(game.id, id)).limit(1);
  if (!row) return null;
  const players = await getPlayers(id);
  return toGameRecord(row, players);
}

export async function getGameByCode(code: string): Promise<GameRecord | null> {
  const [row] = await db
    .select()
    .from(game)
    .where(eq(game.code, normalizeGameCode(code)))
    .limit(1);
  if (!row) return null;
  const players = await getPlayers(row.id);
  return toGameRecord(row, players);
}

export async function getSeriesGames(seriesId: string): Promise<GameRecord[]> {
  const rows = await db
    .select()
    .from(game)
    .where(eq(game.seriesId, seriesId))
    .orderBy(game.createdAt);
  const records: GameRecord[] = [];
  for (const row of rows) {
    const players = await getPlayers(row.id);
    records.push(toGameRecord(row, players));
  }
  return records;
}

export async function findLiveGameInConversation(
  conversationId: string,
  gameType: GameType,
): Promise<GameRecord | null> {
  const [row] = await db
    .select()
    .from(game)
    .where(
      and(
        eq(game.conversationId, conversationId),
        eq(game.gameType, gameType),
        inArray(game.status, ["waiting", "active"]),
      ),
    )
    .orderBy(desc(game.createdAt))
    .limit(1);
  if (!row) return null;
  const players = await getPlayers(row.id);
  return toGameRecord(row, players);
}

export async function seatPlayer(
  gameId: string,
  player: GamePlayer,
  seatOrder: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [waiting] = await tx
      .select({ id: game.id })
      .from(game)
      .where(and(eq(game.id, gameId), eq(game.status, "waiting")))
      .for("update");
    if (!waiting) return false;
    const [occupied] = await tx
      .select({ id: gamePlayer.id })
      .from(gamePlayer)
      .where(
        and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.seatOrder, seatOrder)),
      )
      .limit(1);
    if (occupied) return false;
    const rows = await tx
      .insert(gamePlayer)
      .values({
        gameId,
        userId: player.userId,
        username: player.username,
        role: player.role,
        seatOrder,
      })
      .onConflictDoNothing({ target: [gamePlayer.gameId, gamePlayer.userId] })
      .returning({ id: gamePlayer.id });
    return rows.length > 0;
  });
}

export async function configureLobby(
  gameId: string,
  config: unknown,
): Promise<GameRecord | null> {
  const [row] = await db
    .update(game)
    .set({ config, updatedAt: new Date() })
    .where(and(eq(game.id, gameId), eq(game.status, "waiting")))
    .returning();
  if (!row) return null;
  return toGameRecord(row, await getPlayers(gameId));
}

async function playersIn(
  executor: typeof db | Transaction,
  gameId: string,
): Promise<GamePlayer[]> {
  const rows = await executor
    .select({
      userId: gamePlayer.userId,
      username: gamePlayer.username,
      role: gamePlayer.role,
      avatar: userProfile.avatar,
    })
    .from(gamePlayer)
    .leftJoin(userProfile, eq(userProfile.userId, gamePlayer.userId))
    .where(eq(gamePlayer.gameId, gameId))
    .orderBy(gamePlayer.seatOrder);
  return rows.map((r) => ({ ...r, avatar: r.avatar ?? null }));
}

export async function removeLobbyPlayer(input: {
  gameId: string;
  userId: string;
  roleForSeat: (index: number) => string;
}): Promise<GameRecord | null> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: game.id })
      .from(game)
      .where(and(eq(game.id, input.gameId), eq(game.status, "waiting")))
      .for("update");
    if (!locked) return null;
    const removed = await tx
      .delete(gamePlayer)
      .where(
        and(
          eq(gamePlayer.gameId, locked.id),
          eq(gamePlayer.userId, input.userId),
        ),
      )
      .returning({ id: gamePlayer.id });
    if (!removed.length) return null;
    const remaining = await tx
      .select({ id: gamePlayer.id })
      .from(gamePlayer)
      .where(eq(gamePlayer.gameId, locked.id))
      .orderBy(gamePlayer.seatOrder);
    for (const [index, seat] of remaining.entries())
      await tx
        .update(gamePlayer)
        .set({ seatOrder: index, role: input.roleForSeat(index) })
        .where(eq(gamePlayer.id, seat.id));
    const [updated] = await tx
      .update(game)
      .set({
        config: sql`${game.config} #- array['teams', ${input.userId}]::text[]`,
        updatedAt: new Date(),
      })
      .where(eq(game.id, locked.id))
      .returning();
    if (!updated) throw new Error("Lobby could not be updated");
    return toGameRecord(updated, await playersIn(tx, locked.id));
  });
}

export async function createRematch(
  input: CreateGameInput & { seriesId: string },
): Promise<{ game: GameRecord; created: boolean }> {
  createGameInputSchema.parse(input);
  for (let attempt = 1; attempt <= GAME_CODE_MAX_ATTEMPTS; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${input.seriesId}))`,
        );
        const [live] = await tx
          .select()
          .from(game)
          .where(
            and(
              eq(game.seriesId, input.seriesId),
              inArray(game.status, ["waiting", "active"]),
            ),
          )
          .orderBy(desc(game.createdAt))
          .limit(1);
        if (live)
          return {
            game: toGameRecord(live, await playersIn(tx, live.id)),
            created: false,
          };
        return { game: await insertGame(tx, input), created: true };
      });
    } catch (error) {
      if (!isGameCodeCollision(error)) throw error;
    }
  }
  throw new Error("Failed to allocate a unique game code");
}

export async function startLobby(input: {
  previous: GameRecord;
  bots: GamePlayer[];
  gameState: unknown;
}): Promise<GameRecord | null> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: game.id })
      .from(game)
      .where(
        and(
          eq(game.id, input.previous.id),
          eq(game.status, "waiting"),
          sql`coalesce(${game.config}, 'null'::jsonb) = ${JSON.stringify(input.previous.config ?? null)}::jsonb`,
        ),
      )
      .for("update");
    if (!locked) return null;
    const seated = await tx
      .select({ userId: gamePlayer.userId })
      .from(gamePlayer)
      .where(eq(gamePlayer.gameId, locked.id))
      .orderBy(gamePlayer.seatOrder);
    const humans = input.previous.players;
    if (
      seated.length !== humans.length ||
      seated.some((row, index) => row.userId !== humans[index]?.userId)
    )
      return null;
    if (input.bots.length)
      await tx.insert(gamePlayer).values(
        input.bots.map((bot, index) => ({
          gameId: locked.id,
          userId: bot.userId,
          username: bot.username,
          role: bot.role,
          seatOrder: humans.length + index,
        })),
      );
    const [updated] = await tx
      .update(game)
      .set({
        status: "active",
        gameState: input.gameState,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(game.id, locked.id))
      .returning();
    if (!updated) throw new Error("Game could not be started");
    return toGameRecord(updated, [
      ...humans,
      ...input.bots.map((bot) => ({ ...bot, avatar: null })),
    ]);
  });
}

export async function updateGame(
  id: string,
  patch: GameUpdate,
): Promise<GameRecord> {
  const [row] = await db
    .update(game)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(game.id, id))
    .returning();
  if (!row) throw new Error("Failed to update game");
  const players = await getPlayers(id);
  return toGameRecord(row, players);
}

export async function gamesForUser(
  userId: string,
  opts: { offset?: number; limit?: number; includePublic?: boolean } = {},
): Promise<GameRow[]> {
  return db
    .select(getTableColumns(game))
    .from(game)
    .innerJoin(gamePlayer, eq(gamePlayer.gameId, game.id))
    .where(
      and(
        eq(gamePlayer.userId, userId),
        opts.includePublic ? undefined : eq(game.publicMatch, false),
      ),
    )
    .orderBy(desc(game.updatedAt))
    .offset(opts.offset ?? 0)
    .limit(opts.limit ?? 20);
}

export async function listMoves(gameId: string): Promise<MoveRow[]> {
  return db
    .select()
    .from(move)
    .where(eq(move.gameId, gameId))
    .orderBy(move.moveNumber);
}

export async function nextMoveNumber(gameId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${move.moveNumber}), 0)` })
    .from(move)
    .where(eq(move.gameId, gameId));
  return (row?.max ?? 0) + 1;
}

export async function addMove(input: {
  gameId: string;
  moveNumber: number;
  playerId: string;
  moveData: unknown;
}): Promise<MoveRow> {
  addMoveInputSchema.parse(input);
  const [row] = await db.insert(move).values(input).returning();
  if (!row) throw new Error("Failed to add move");
  return row;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertGame(
  tx: Transaction,
  input: CreateGameInput,
): Promise<GameRecord> {
  const id = randomUUID();
  const [row] = await tx
    .insert(game)
    .values({
      id,
      publicMatch: input.publicMatch ?? false,
      gameType: input.gameType,
      status: input.status ?? "waiting",
      gameState: input.gameState,
      config: input.config ?? null,
      winner: null,
      winners: [],
      seriesId: input.seriesId ?? id,
      conversationId: input.conversationId ?? null,
      creatorUserId: input.creatorUserId ?? null,
      seatingMode: input.seatingMode ?? null,
      challengedUserId: input.challengedUserId ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to create game");
  const created = row;
  if (input.players.length) {
    await tx.insert(gamePlayer).values(
      input.players.map((p, i) => ({
        gameId: created.id,
        userId: p.userId,
        username: p.username,
        role: p.role,
        seatOrder: i,
      })),
    );
  }
  return toGameRecord(created, input.players);
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [result[index], result[swap]] = [result[swap] as T, result[index] as T];
  }
  return result;
}

export async function joinMatchmaking(input: {
  userId: string;
  owner: string;
  gameType: GameType;
  config: unknown;
  seats: Seat[];
  createState: (seats: Seat[]) => unknown;
}): Promise<{ code: string; userIds: string[] } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(802938)`);
    const [active] = await tx
      .select({ code: game.code })
      .from(game)
      .innerJoin(gamePlayer, eq(gamePlayer.gameId, game.id))
      .where(
        and(
          eq(gamePlayer.userId, input.userId),
          eq(game.publicMatch, true),
          eq(game.status, "active"),
        ),
      )
      .limit(1);
    if (active) return { code: active.code, userIds: [input.userId] };
    const [ticket] = await tx
      .select({
        joinedAt: matchmakingTicket.joinedAt,
        samePool: sql<boolean>`${matchmakingTicket.gameType} = ${input.gameType} and ${matchmakingTicket.config} = ${JSON.stringify(input.config)}::jsonb and ${matchmakingTicket.expiresAt} > now()`,
      })
      .from(matchmakingTicket)
      .where(eq(matchmakingTicket.userId, input.userId));
    const ticketValues = {
      userId: input.userId,
      owner: input.owner,
      gameType: input.gameType,
      config: input.config,
      expiresAt: sql`now() + interval '45 seconds'`,
    };
    await tx
      .insert(matchmakingTicket)
      .values(ticketValues)
      .onConflictDoUpdate({
        target: matchmakingTicket.userId,
        set: {
          ...ticketValues,
          joinedAt: ticket?.samePool ? ticket.joinedAt : sql`now()`,
        },
      });
    const opponentCount = input.seats.length - 1;
    if (opponentCount < 1) return null;
    const opponents = await tx
      .select()
      .from(matchmakingTicket)
      .where(
        and(
          eq(matchmakingTicket.gameType, input.gameType),
          ne(matchmakingTicket.userId, input.userId),
          gt(matchmakingTicket.expiresAt, sql`now()`),
          sql`${matchmakingTicket.config} = ${JSON.stringify(input.config)}::jsonb`,
        ),
      )
      .orderBy(matchmakingTicket.joinedAt, matchmakingTicket.userId)
      .limit(opponentCount);
    if (opponents.length < opponentCount) return null;
    const userIds = shuffled([
      input.userId,
      ...opponents.map((opponent) => opponent.userId),
    ]);
    const players = userIds.map((userId, index) => ({
      userId,
      username: `Player ${index + 1}`,
      role: input.seats[index]?.role ?? "",
    }));
    const created = await insertGame(tx, {
      publicMatch: true,
      gameType: input.gameType,
      players,
      gameState: input.createState(input.seats),
      config: input.config,
      status: "active",
    });
    await tx
      .update(game)
      .set({ startedAt: new Date() })
      .where(eq(game.id, created.id));
    await tx
      .delete(matchmakingTicket)
      .where(inArray(matchmakingTicket.userId, userIds));
    return { code: created.code, userIds };
  });
}

export async function releaseMatchmakingOwner(owner: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(802938)`);
    await tx
      .delete(matchmakingTicket)
      .where(eq(matchmakingTicket.owner, owner));
  });
}

export async function leaveMatchmaking(
  userId: string,
  owner: string,
  gameType: GameType,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(802938)`);
    await tx
      .delete(matchmakingTicket)
      .where(
        and(
          eq(matchmakingTicket.userId, userId),
          eq(matchmakingTicket.owner, owner),
          eq(matchmakingTicket.gameType, gameType),
        ),
      );
    const [active] = await tx
      .select({ code: game.code })
      .from(game)
      .innerJoin(gamePlayer, eq(gamePlayer.gameId, game.id))
      .where(
        and(
          eq(gamePlayer.userId, userId),
          eq(game.publicMatch, true),
          eq(game.status, "active"),
        ),
      )
      .limit(1);
    return active?.code ?? null;
  });
}

function resolveWinners(
  players: GamePlayer[],
  winnerRoles: string[],
  draw: boolean,
): { winners: string[]; winner: string | null } {
  const winners = players
    .filter((player) => winnerRoles.includes(player.role))
    .map((player) => player.userId);
  return {
    winners,
    winner: draw ? "draw" : winners.length === 1 ? (winners[0] ?? null) : null,
  };
}

export async function persistGameMoves(input: {
  previous: GameRecord;
  moves: { playerId: string; moveData: unknown }[];
  gameState: unknown;
  outcome: Outcome;
}): Promise<{ game: GameRecord; moves: MoveRow[] } | null> {
  if (!input.moves.length) throw new Error("No moves to save");
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(game)
      .where(
        and(
          eq(game.id, input.previous.id),
          eq(game.status, "active"),
          sql`${game.gameState} = ${JSON.stringify(input.previous.gameState)}::jsonb`,
        ),
      )
      .for("update");
    if (!locked) return null;
    const outcome = input.outcome;
    const completed = outcome.status === "completed";
    const result = completed
      ? resolveWinners(
          input.previous.players,
          outcome.winnerRoles,
          outcome.draw,
        )
      : { winners: [], winner: null };
    const [updated] = await tx
      .update(game)
      .set({
        gameState: input.gameState,
        status: completed ? "completed" : "active",
        winner: result.winner,
        winners: result.winners,
        completedAt: completed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(game.id, locked.id))
      .returning();
    const [number] = await tx
      .select({ next: sql<number>`coalesce(max(${move.moveNumber}), 0) + 1` })
      .from(move)
      .where(eq(move.gameId, locked.id));
    const first = Number(number?.next ?? 1);
    const saved = await tx
      .insert(move)
      .values(
        input.moves.map((entry, index) => ({
          gameId: locked.id,
          playerId: entry.playerId,
          moveData: entry.moveData,
          moveNumber: first + index,
        })),
      )
      .returning();
    if (!updated || saved.length !== input.moves.length)
      throw new Error("Moves could not be saved");
    if (completed)
      await updateMatchStats(
        tx,
        input.previous,
        result.winners,
        outcome.status === "completed" && outcome.draw,
      );
    return {
      game: toGameRecord(updated, input.previous.players),
      moves: saved.sort((a, b) => a.moveNumber - b.moveNumber),
    };
  });
}

async function updateMatchStats(
  tx: Transaction,
  record: GameRecord,
  winners: string[],
  draw: boolean,
) {
  const humans = record.players
    .filter((player) => !isBotId(player.userId))
    .sort((a, b) => a.userId.localeCompare(b.userId));
  for (const player of humans) {
    const [profile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, player.userId))
      .for("update");
    if (!profile) continue;
    const listed = winners.includes(player.userId);
    const drawn = draw && (winners.length === 0 || listed);
    const won = !draw && listed;
    const stats = { ...profile.stats };
    const current = stats[record.gameType] ?? {
      played: 0,
      won: 0,
      lost: 0,
      drawn: 0,
    };
    stats[record.gameType] = {
      played: current.played + 1,
      won: current.won + (won ? 1 : 0),
      lost: current.lost + (!won && !drawn ? 1 : 0),
      drawn: current.drawn + (drawn ? 1 : 0),
    };
    await tx
      .update(userProfile)
      .set({ stats, updatedAt: new Date() })
      .where(eq(userProfile.userId, player.userId));
  }
}

export async function abortActiveGame(
  previous: GameRecord,
  winners: string[],
): Promise<GameRecord | null> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(game)
      .set({
        status: "aborted",
        winner: winners.length === 1 ? (winners[0] ?? null) : null,
        winners,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(game.id, previous.id),
          eq(game.status, "active"),
          sql`${game.gameState} = ${JSON.stringify(previous.gameState)}::jsonb`,
        ),
      )
      .returning();
    if (!updated) return null;
    if (winners.length) await updateMatchStats(tx, previous, winners, false);
    return toGameRecord(updated, previous.players);
  });
}
