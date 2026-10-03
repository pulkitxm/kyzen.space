import { describe, expect, test } from "bun:test";
import {
  type BotDifficulty,
  type TankArenaMove,
  type TankArenaState,
  tankArenaMoveSchema,
} from "@kyzen/shared/types";
import { apply, engine, seats } from "./tank-arena-fixtures";

const DIFFICULTIES: BotDifficulty[] = ["easy", "normal", "hard"];

function botGame(
  difficulties: BotDifficulty[],
  seed: number,
  options: { teams?: boolean; maxRounds?: number } = {},
): { state: TankArenaState; moves: [string, TankArenaMove][] } {
  const seated = seats(difficulties.length, { teams: options.teams }).map(
    (seat, i) => ({ ...seat, bot: difficulties[i] ?? "easy" }),
  );
  let state = engine.createInitialState(seated, { config: {}, seed });
  const moves: [string, TankArenaMove][] = [];
  const limit = options.maxRounds ?? 40;
  while (state.phase !== "finished" && state.round <= limit) {
    const role = engine.pendingRoles?.(state)[0];
    if (!role) break;
    const seat = state.seats.find((s) => s.role === role);
    const move = engine.botMove?.(state, role, seat?.bot ?? "easy");
    expect(tankArenaMoveSchema.safeParse(move).success).toBe(true);
    if (!move) throw new Error("no bot move");
    state = apply(state, role, move);
    moves.push([role, move]);
  }
  return { state, moves };
}

describe("bots", () => {
  test("every difficulty produces legal moves through whole games", () => {
    for (const difficulty of DIFFICULTIES)
      for (const seed of [1, 2, 3]) {
        const { state, moves } = botGame(
          [difficulty, difficulty, difficulty, difficulty],
          seed * 101,
          { teams: seed % 2 === 0, maxRounds: 12 },
        );
        expect(moves.length).toBeGreaterThan(4);
        expect(state.round).toBeGreaterThan(1);
      }
  });

  test("bot moves are deterministic for a state", () => {
    const { state } = botGame(["hard", "normal"], 77, { maxRounds: 3 });
    if (state.phase !== "plan") return;
    for (const difficulty of DIFFICULTIES)
      expect(engine.botMove?.(state, "p1", difficulty)).toEqual(
        engine.botMove?.(state, "p1", difficulty),
      );
  });

  test("hard beats easy across seeded duels", () => {
    let hardWins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const hardFirst = seed % 2 === 1;
      const { state } = botGame(
        hardFirst ? ["hard", "easy"] : ["easy", "hard"],
        seed * 7919,
      );
      const hardRole = hardFirst ? "p1" : "p2";
      if (
        state.outcome &&
        !state.outcome.draw &&
        state.outcome.winnerRoles.includes(hardRole)
      )
        hardWins += 1;
    }
    expect(hardWins).toBeGreaterThanOrEqual(15);
  });
});
