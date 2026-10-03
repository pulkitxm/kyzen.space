import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BotDifficulty,
  TankAction,
  TankArenaMove,
  TankArenaState,
} from "@kyzen/shared/types";
import { chachaBlock, deriveSecret } from "../src/games/tank-arena/math";
import {
  canUse,
  type Frame,
  resolutionInput,
  simulateRound,
} from "../src/index";
import { apply, engine, lock, seats, started } from "./tank-arena-fixtures";

const GOLDEN_STATE =
  "a2106fd20659f05f006f9d095e9d0a6d7f8020649ff46a6a63dea4bbb933ca55";
const GOLDEN_FRAMES =
  "b1ddd52bd7721ff8b0f410f043dcb53f42c1828fa0d83e45ef47a1d8530700a6";

const SCRIPT: Record<string, [TankAction, number, number][]> = {
  p1: [
    ["missile", 40, 0.7],
    ["specialA", 45, 0.75],
    ["shield", 90, 0.5],
    ["missile", 135, 0.8],
    ["specialB", 0, 0.5],
    ["missile", 60, 0.9],
  ],
  p2: [
    ["missile", 140, 0.65],
    ["jump", 70, 0.5],
    ["specialA", 120, 0.6],
    ["missile", 30, 1],
    ["specialB", 100, 0.7],
    ["shield", 90, 0.5],
  ],
  p3: [
    ["specialA", 60, 0.8],
    ["missile", 150, 0.55],
    ["jump", 110, 0.8],
    ["specialB", 80, 0.9],
    ["missile", 10, 1],
    ["missile", 170, 0.45],
  ],
  p4: [
    ["jump", 70, 0.5],
    ["specialB", 180, 0.5],
    ["missile", 100, 0.75],
    ["specialA", 20, 0.95],
    ["missile", -10, 1],
    ["jump", 30, 1],
  ],
};

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function scripted(): { state: TankArenaState; frames: Frame[] } {
  let state = started(["bastion", "kestrel", "kestrel", "bastion"], {
    teams: true,
    seed: 2026,
  });
  let frames: Frame[] = [];
  for (let round = 1; round <= 6 && state.phase === "plan"; round++) {
    for (const role of engine.pendingRoles?.(state) ?? []) {
      const [action, angle, power] = SCRIPT[role]?.[round - 1] ?? [
        "idle",
        90,
        0.5,
      ];
      const move = canUse(state, role, action)
        ? lock(round, action, angle, power)
        : lock(round, "missile", angle, power);
      state = apply(state, role, move);
    }
    const replay = resolutionInput(state);
    frames = [];
    if (replay) simulateRound(replay, (frame) => frames.push(frame));
  }
  return { state, frames };
}

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
  test("a fixed four-player script matches the golden hashes", () => {
    const { state, frames } = scripted();
    expect(state.round).toBe(7);
    const frameText = JSON.stringify(
      frames.map((frame) => [
        frame.step,
        frame.tanks.map((t) => [t.x, t.y, t.hp]),
        frame.projectiles.map((p) => [p.x, p.y]),
      ]),
    );
    expect(sha(JSON.stringify(state))).toBe(GOLDEN_STATE);
    expect(sha(frameText)).toBe(GOLDEN_FRAMES);
  });

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
