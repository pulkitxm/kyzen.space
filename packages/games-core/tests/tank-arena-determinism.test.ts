import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BotDifficulty,
  TankArenaMove,
  TankArenaState,
} from "@kyzen/shared/types";
import { chachaBlock, deriveSecret } from "../src/games/tank-arena/math";
import { resolutionInput, simulateRound } from "../src/index";
import { apply, engine, seats, started } from "./tank-arena-fixtures";
import { GOLDEN, measure, scripted } from "./tank-arena-golden";

function playBots(
  difficulties: BotDifficulty[],
  seed: number,
): { state: TankArenaState; moves: [string, TankArenaMove][] } {
  const seated = seats(difficulties.length, { teams: true }).map((seat, i) => ({
    ...seat,
    bot: difficulties[i] ?? "easy",
  }));
  let state = engine.createInitialState(seated, { config: {}, seed });
  const moves: [string, TankArenaMove][] = [];
  while (state.phase !== "finished") {
    const role = engine.pendingRoles?.(state)[0];
    if (!role) break;
    const move = engine.botMove?.(
      state,
      role,
      state.seats.find((s) => s.role === role)?.bot ?? "easy",
    );
    if (!move) throw new Error("no move");
    state = apply(state, role, move);
    moves.push([role, move]);
  }
  return { state, moves };
}

describe("determinism", () => {
  test("a fixed four-player script and repeated jumps match the goldens", () => {
    expect(scripted().state.round).toBe(7);
    expect(measure()).toEqual(GOLDEN);
  });

  test("node reproduces the same golden checksums", () => {
    const run = spawnSync(
      "bun",
      [join(import.meta.dir, "..", "scripts", "verify-determinism.ts")],
      { encoding: "utf8" },
    );
    expect(run.stdout).toContain(
      "bun and node reproduce every golden checksum",
    );
    expect(run.status).toBe(0);
  }, 60_000);

  test("simulating twice, interleaved with other worlds, is identical", () => {
    const first = scripted();
    playBots(["easy", "normal"], 5);
    const second = scripted();
    expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
    expect(JSON.stringify(second.frames)).toBe(JSON.stringify(first.frames));
  });

  test("replaying persisted moves rebuilds the identical final state", () => {
    const { state, moves } = playBots(["hard", "normal", "easy", "hard"], 31);
    expect(state.phase).toBe("finished");
    const seated = seats(4, { teams: true }).map((seat, i) => ({
      ...seat,
      bot: (["hard", "normal", "easy", "hard"] as const)[i] ?? null,
    }));
    let replay = engine.createInitialState(seated, { config: {}, seed: 31 });
    for (const [role, move] of moves)
      replay = apply(
        replay,
        role,
        JSON.parse(JSON.stringify(move)) as TankArenaMove,
      );
    expect(JSON.stringify(replay)).toBe(JSON.stringify(state));
  });

  test("clients re-simulate the authoritative positions from public state", () => {
    let state = started(["bastion", "kestrel", "kestrel", "bastion"], {
      teams: true,
      seed: 404,
    });
    for (let round = 1; round <= 8 && state.phase === "plan"; round++) {
      for (const role of engine.pendingRoles?.(state) ?? [])
        state = apply(
          state,
          role,
          engine.botMove?.(state, role, "normal") as TankArenaMove,
        );
      const shown = JSON.parse(
        JSON.stringify(engine.publicState?.(state)),
      ) as TankArenaState;
      const replay = resolutionInput(shown);
      if (!replay) throw new Error("missing resolution");
      const result = simulateRound(replay);
      expect(result.steps).toBe(state.resolution?.steps ?? -1);
      for (const simulated of result.tanks) {
        const actual = state.tanks.find((t) => t.role === simulated.role);
        if (!actual?.alive) continue;
        const width = state.modules * 32;
        const x = Math.round(simulated.x * 10_000) / 10_000 + 0;
        expect(x >= width ? x - width : x).toBe(actual.x);
        expect(Math.round(simulated.y * 10_000) / 10_000 + 0).toBe(actual.y);
        expect(Math.max(0, simulated.hp)).toBe(actual.hp);
      }
    }
  });

  test("the secret derivation uses a standard ChaCha20 block", () => {
    const key = [
      0x03020100, 0x07060504, 0x0b0a0908, 0x0f0e0d0c, 0x13121110, 0x17161514,
      0x1b1a1918, 0x1f1e1d1c,
    ];
    expect(
      chachaBlock(key, 1, 0x09000000, 0x4a000000, 0).map((word) =>
        word.toString(16).padStart(8, "0"),
      ),
    ).toEqual([
      "e4e7f110",
      "15593bd1",
      "1fdd0f50",
      "c47120a3",
      "c7f4d1c7",
      "0368c033",
      "9aaa2204",
      "4e6cd4c3",
      "466482d2",
      "09aa9f07",
      "05d7c214",
      "a2028bd9",
      "d19c12b5",
      "b94e16de",
      "e883d0cb",
      "4e3c50a2",
    ]);
    expect(deriveSecret(7)).toEqual(deriveSecret(7));
    expect(deriveSecret(7)).not.toEqual(deriveSecret(8));
    expect(deriveSecret(2 ** 40)).not.toEqual(deriveSecret(0));
  });

  test("simulation sources use only exactly specified math", () => {
    const folder = join(import.meta.dir, "..", "src", "games", "tank-arena");
    const allowed = new Set([
      "sqrt",
      "floor",
      "round",
      "abs",
      "min",
      "max",
      "imul",
      "PI",
    ]);
    for (const file of readdirSync(folder)) {
      const text = readFileSync(join(folder, file), "utf8");
      for (const match of text.matchAll(/Math\.([A-Za-z0-9]+)/g))
        expect(allowed.has(match[1] ?? "")).toBe(true);
      expect(text.includes("**")).toBe(false);
      expect(/\bDate\b|performance\.|crypto/.test(text)).toBe(false);
    }
  });
});

describe("performance", () => {
  test("resolution and hard bots stay fast up to 256 tanks", () => {
    const rows: string[] = [];
    for (const count of [2, 4, 8, 16, 32, 64, 128, 256]) {
      const seated = seats(count, { teams: true });
      let state = engine.createInitialState(seated, { config: {}, seed: 99 });
      for (const seat of seated)
        state = apply(
          state,
          seat.role,
          engine.botMove?.(state, seat.role, "normal") as TankArenaMove,
        );
      let resolveMax = 0;
      let resolveTotal = 0;
      let botMax = 0;
      let botTotal = 0;
      let botCalls = 0;
      let rounds = 0;
      for (let round = 0; round < 3 && state.phase === "plan"; round++) {
        const pending = engine.pendingRoles?.(state) ?? [];
        const moves = pending.map((role) => {
          const started = performance.now();
          const move = engine.botMove?.(state, role, "hard") as TankArenaMove;
          const elapsed = performance.now() - started;
          botMax = Math.max(botMax, elapsed);
          botTotal += elapsed;
          botCalls += 1;
          return [role, move] as const;
        });
        moves.forEach(([role, move], index) => {
          const begin = performance.now();
          state = apply(state, role, move);
          if (index === moves.length - 1) {
            const elapsed = performance.now() - begin;
            resolveMax = Math.max(resolveMax, elapsed);
            resolveTotal += elapsed;
            rounds += 1;
          }
        });
      }
      const publicKb =
        JSON.stringify(engine.publicState?.(state)).length / 1024;
      rows.push(
        `${count} tanks: resolve avg ${(resolveTotal / rounds).toFixed(2)} ms max ${resolveMax.toFixed(2)} ms, hard bot avg ${(botTotal / botCalls).toFixed(2)} ms max ${botMax.toFixed(2)} ms, public state ${publicKb.toFixed(1)} KB`,
      );
      expect(resolveMax).toBeLessThan(1000);
      expect(botMax).toBeLessThan(1000);
    }
    console.info(rows.join("\n"));
  }, 120_000);
});
