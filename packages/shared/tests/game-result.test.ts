import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import {
  buildGameResultViewModel,
  type GameJson,
  isMatchSeriesComplete,
  resolveMatchConfig,
} from "../src/types";

function game(overrides: Partial<GameJson> = {}): GameJson {
  return {
    id: "K7P2QX",
    gameType: TIC_TAC_TOE,
    status: "completed",
    winner: "u1",
    players: [
      { userId: "u1", username: "alice", role: "X" },
      { userId: "u2", username: "bob", role: "O" },
    ],
    gameState: {},
    conversationId: "conv-1",
    ...overrides,
  };
}

describe("resolveMatchConfig", () => {
  test("defaults to single format", () => {
    expect(resolveMatchConfig(undefined)).toEqual({ format: "single" });
    expect(resolveMatchConfig({})).toEqual({ format: "single" });
  });

  test("parses best-of config", () => {
    expect(resolveMatchConfig({ bestOf: 3 })).toEqual({
      format: "bestOf",
      totalRounds: 3,
      winsNeeded: 2,
    });
  });

  test("parses fixed rounds config", () => {
    expect(resolveMatchConfig({ rounds: 5 })).toEqual({
      format: "fixedRounds",
      totalRounds: 5,
    });
  });
});

describe("buildGameResultViewModel", () => {
  test("returns null for active games", () => {
    expect(
      buildGameResultViewModel({
        game: game({ status: "active", winner: null }),
        userId: "u1",
        series: null,
      }),
    ).toBeNull();
  });

  test("builds a single-match win view", () => {
    const model = buildGameResultViewModel({
      game: game(),
      userId: "u1",
      series: null,
      canContinue: true,
    });
    expect(model?.phase).toBe("matchComplete");
    expect(model?.headline).toBe("You won!");
    expect(model?.primaryAction).toBe("rematch");
    expect(model?.sessionStats[0]?.wins).toBe(1);
    expect(model?.sessionStats[1]?.losses).toBe(1);
  });

  test("shows draw outcome", () => {
    const model = buildGameResultViewModel({
      game: game({ winner: "draw" }),
      userId: "u1",
      series: null,
    });
    expect(model?.headline).toBe("It's a draw");
    expect(model?.isDraw).toBe(true);
    expect(model?.roundLabel).toBe("Draw");
  });

  test("uses series score for session stats", () => {
    const model = buildGameResultViewModel({
      game: game({ winner: "u2" }),
      userId: "u1",
      series: {
        seriesId: "s1",
        gameType: TIC_TAC_TOE,
        score: {
          entries: [
            { userId: "u1", username: "alice", wins: 1 },
            { userId: "u2", username: "bob", wins: 2 },
          ],
          draws: 0,
          completedGames: 3,
          totalGames: 3,
        },
        games: [],
      },
    });
    expect(model?.sessionStats[0]?.played).toBe(3);
    expect(model?.sessionStats[0]?.wins).toBe(1);
    expect(model?.sessionStats[0]?.losses).toBe(2);
    expect(model?.showSeriesHistory).toBe(true);
  });

  test("requests next round during an unfinished best-of series", () => {
    const model = buildGameResultViewModel({
      game: game(),
      userId: "u1",
      series: {
        seriesId: "s1",
        gameType: TIC_TAC_TOE,
        score: {
          entries: [
            { userId: "u1", username: "alice", wins: 1 },
            { userId: "u2", username: "bob", wins: 0 },
          ],
          draws: 0,
          completedGames: 1,
          totalGames: 1,
        },
        games: [
          {
            gameId: "K7P2QX",
            gameNumber: 1,
            status: "completed",
            winner: "u1",
            winnerUsername: "alice",
            completedAt: null,
          },
        ],
      },
      matchConfig: { format: "bestOf", totalRounds: 3, winsNeeded: 2 },
      canContinue: true,
    });
    expect(model?.phase).toBe("roundComplete");
    expect(model?.primaryAction).toBe("nextRound");
    expect(model?.seriesLabel).toBe("Best of 3");
    expect(model?.roundProgress).toEqual({ current: 1, total: 3 });
  });

  test("marks a best-of series complete when wins needed are reached", () => {
    const model = buildGameResultViewModel({
      game: game(),
      userId: "u1",
      series: {
        seriesId: "s1",
        gameType: TIC_TAC_TOE,
        score: {
          entries: [
            { userId: "u1", username: "alice", wins: 2 },
            { userId: "u2", username: "bob", wins: 0 },
          ],
          draws: 0,
          completedGames: 2,
          totalGames: 2,
        },
        games: [],
      },
      matchConfig: { format: "bestOf", totalRounds: 3, winsNeeded: 2 },
      canContinue: true,
    });
    expect(model?.phase).toBe("seriesComplete");
    expect(model?.seriesWinnerId).toBe("u1");
    expect(model?.primaryAction).toBe("rematch");
    expect(model?.headline).toBe("Series champion!");
  });

  test("disables continue actions when rematch is unavailable", () => {
    const model = buildGameResultViewModel({
      game: game({ conversationId: null }),
      userId: "u1",
      series: null,
      canContinue: false,
    });
    expect(model?.primaryAction).toBe("none");
  });
});

describe("isMatchSeriesComplete", () => {
  test("treats single format as always complete", () => {
    expect(
      isMatchSeriesComplete(
        {},
        {
          entries: [],
          draws: 0,
          completedGames: 1,
          totalGames: 1,
        },
      ),
    ).toBe(true);
  });

  test("detects a finished best-of series", () => {
    expect(
      isMatchSeriesComplete(
        { bestOf: 3 },
        {
          entries: [
            { userId: "u1", username: "alice", wins: 2 },
            { userId: "u2", username: "bob", wins: 0 },
          ],
          draws: 0,
          completedGames: 2,
          totalGames: 2,
        },
      ),
    ).toBe(true);
  });

  test("keeps an in-progress best-of series open", () => {
    expect(
      isMatchSeriesComplete(
        { bestOf: 3 },
        {
          entries: [
            { userId: "u1", username: "alice", wins: 1 },
            { userId: "u2", username: "bob", wins: 0 },
          ],
          draws: 0,
          completedGames: 1,
          totalGames: 1,
        },
      ),
    ).toBe(false);
  });
});
