import type {
  GamePlayer,
  GameRecord,
  MoveRow,
  Outcome,
  Seat,
} from "@kyzen/shared/types";

type Persist = {
  previous: GameRecord;
  moves: { playerId: string; moveData: unknown }[];
  gameState: unknown;
  outcome: Outcome;
};

export type MemoryGames = ReturnType<typeof createMemoryGames>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function createMemoryGames() {
  const rows = new Map<string, GameRecord>();
  const moves = new Map<string, MoveRow[]>();
  const completions: { gameId: string; winners: string[]; draw: boolean }[] =
    [];
  const casMisses: string[] = [];
  const persists: number[] = [];
  const matchmakingCalls: {
    seats: Seat[];
    createState: (seats: Seat[]) => unknown;
    config: unknown;
  }[] = [];
  const hooks: {
    beforePersist: ((input: Persist) => Promise<void> | void) | null;
  } = { beforePersist: null };

  function stored(id: string): GameRecord {
    const row = rows.get(id);
    if (!row) throw new Error(`missing game ${id}`);
    return row;
  }

  function put(row: GameRecord): GameRecord {
    rows.set(row.id, clone(row));
    if (!moves.has(row.id)) moves.set(row.id, []);
    return clone(row);
  }

  function appendMove(gameId: string, playerId: string, moveData: unknown) {
    const list = moves.get(gameId) ?? [];
    const saved: MoveRow = {
      id: `${gameId}-m${list.length + 1}`,
      gameId,
      moveNumber: list.length + 1,
      playerId,
      moveData: clone(moveData),
      createdAt: new Date(),
    };
    list.push(saved);
    moves.set(gameId, list);
    return saved;
  }

  const games = {
    getGameById: async (id: string) => {
      await tick();
      const row = rows.get(id);
      return row ? clone(row) : null;
    },
    getGameByCode: async (code: string) => {
      await tick();
      const row = [...rows.values()].find(
        (candidate) => candidate.code === code.toUpperCase(),
      );
      return row ? clone(row) : null;
    },
    listMoves: async (gameId: string) => clone(moves.get(gameId) ?? []),
    persistGameMoves: async (input: Persist) => {
      await hooks.beforePersist?.(input);
      await tick();
      const current = stored(input.previous.id);
      if (
        current.status !== "active" ||
        JSON.stringify(current.gameState) !==
          JSON.stringify(input.previous.gameState)
      ) {
        casMisses.push(...input.moves.map((entry) => entry.playerId));
        return null;
      }
      persists.push(input.moves.length);
      const completed = input.outcome.status === "completed";
      const winners =
        input.outcome.status === "completed"
          ? current.players
              .filter((player) =>
                input.outcome.status === "completed"
                  ? input.outcome.winnerRoles.includes(player.role)
                  : false,
              )
              .map((player) => player.userId)
          : [];
      const draw = input.outcome.status === "completed" && input.outcome.draw;
      const updated: GameRecord = {
        ...current,
        gameState: clone(input.gameState),
        status: completed ? "completed" : "active",
        winners,
        winner: draw
          ? "draw"
          : winners.length === 1
            ? (winners[0] ?? null)
            : null,
        completedAt: completed ? new Date() : null,
        updatedAt: new Date(),
      };
      rows.set(updated.id, clone(updated));
      if (completed) completions.push({ gameId: updated.id, winners, draw });
      return {
        game: clone(updated),
        moves: input.moves.map((entry) =>
          clone(appendMove(updated.id, entry.playerId, entry.moveData)),
        ),
      };
    },
    abortActiveGame: async (previous: GameRecord, winners: string[]) => {
      const current = stored(previous.id);
      if (current.status !== "active") return null;
      const updated: GameRecord = {
        ...current,
        status: "aborted",
        winners,
        winner: winners.length === 1 ? (winners[0] ?? null) : null,
        completedAt: new Date(),
      };
      rows.set(updated.id, clone(updated));
      return clone(updated);
    },
    seatPlayer: async (
      gameId: string,
      player: GamePlayer,
      seatOrder: number,
    ) => {
      await tick();
      const current = stored(gameId);
      if (
        current.status !== "waiting" ||
        current.players.length !== seatOrder ||
        current.players.some((p) => p.userId === player.userId)
      )
        return false;
      current.players = [...current.players, { ...player, avatar: null }];
      return true;
    },
    updateGame: async (id: string, patch: Partial<GameRecord>) => {
      const updated = { ...stored(id), ...clone(patch), updatedAt: new Date() };
      rows.set(id, updated);
      return clone(updated);
    },
    removeLobbyPlayer: async (input: {
      gameId: string;
      userId: string;
      roleForSeat: (index: number) => string;
    }) => {
      await tick();
      const current = stored(input.gameId);
      if (
        current.status !== "waiting" ||
        !current.players.some((player) => player.userId === input.userId)
      )
        return null;
      current.players = current.players
        .filter((player) => player.userId !== input.userId)
        .map((player, index) => ({
          ...player,
          role: input.roleForSeat(index),
        }));
      const teams = (current.config as { teams?: Record<string, string> })
        ?.teams;
      if (teams) delete teams[input.userId];
      return clone(current);
    },
    configureLobby: async (gameId: string, config: unknown) => {
      const current = stored(gameId);
      if (current.status !== "waiting") return null;
      current.config = clone(config);
      return clone(current);
    },
    startLobby: async (input: {
      previous: GameRecord;
      bots: GamePlayer[];
      gameState: unknown;
    }) => {
      await tick();
      const current = stored(input.previous.id);
      if (
        current.status !== "waiting" ||
        JSON.stringify(current.config) !== JSON.stringify(input.previous.config)
      )
        return null;
      const updated: GameRecord = {
        ...current,
        status: "active",
        startedAt: new Date(),
        gameState: clone(input.gameState),
        players: [
          ...current.players,
          ...input.bots.map((bot) => ({ ...bot, avatar: null })),
        ],
      };
      rows.set(updated.id, clone(updated));
      return clone(updated);
    },
    createGame: async (
      input: Partial<GameRecord> & { players: GamePlayer[] },
    ) =>
      put({
        id: `game-${rows.size + 1}`,
        code: `C0DE${String(rows.size + 1).padStart(2, "0")}`,
        publicMatch: false,
        gameType: "tic-tac-toe",
        status: "waiting",
        winner: null,
        winners: [],
        gameState: null,
        config: null,
        conversationId: null,
        creatorUserId: null,
        seatingMode: "open",
        challengedUserId: null,
        seriesId: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...clone(input),
      } as GameRecord),
    joinMatchmaking: async (input: {
      seats: Seat[];
      createState: (seats: Seat[]) => unknown;
      config: unknown;
    }) => {
      matchmakingCalls.push(input);
      return null;
    },
    leaveMatchmaking: async () => null,
  };

  return {
    games,
    rows,
    moves,
    completions,
    casMisses,
    persists,
    matchmakingCalls,
    hooks,
    put,
    stored,
    reset() {
      rows.clear();
      moves.clear();
      completions.length = 0;
      casMisses.length = 0;
      persists.length = 0;
      matchmakingCalls.length = 0;
      hooks.beforePersist = null;
    },
  };
}
