import { describe, expect, test } from "bun:test";
import { GAME_CATEGORIES, GAME_TYPES } from "@kyzen/shared/constants";
import type {
  BotDifficulty,
  GameDefinition,
  Outcome,
  Seat,
  SetupOptions,
} from "@kyzen/shared/types";
import { GAMES, listGameTypes } from "../src/index";

const CATEGORY_IDS = new Set<string>(
  Object.values(GAME_CATEGORIES).map((category) => category.id),
);
const SAMPLED_SEATS = 8;
const DIFFICULTIES: BotDifficulty[] = ["easy", "normal", "hard"];
const PLAYOUT_LIMIT = 2000;

function seatRoles(def: GameDefinition, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    def.engine.roleForSeat(index),
  );
}

function minSeats(def: GameDefinition): Seat[] {
  return seatRoles(def, def.engine.minPlayers).map((role) => ({
    role,
    team: role,
    bot: null,
  }));
}

function defaultConfig(def: GameDefinition): unknown {
  return def.configSchema.parse(
    Object.fromEntries((def.configFields ?? []).map((f) => [f.key, f.default])),
  );
}

function setup(def: GameDefinition, seed = 12345): SetupOptions {
  return { config: defaultConfig(def), seed };
}

function initial(def: GameDefinition, seed?: number): unknown {
  return def.engine.createInitialState(minSeats(def), setup(def, seed));
}

function actingRole(def: GameDefinition, state: unknown): string | null {
  if (def.engine.mode === "simultaneous")
    return def.engine.pendingRoles?.(state)[0] ?? null;
  return def.engine.currentRole?.(state) ?? null;
}

function playout(def: GameDefinition): Outcome | null {
  const { engine } = def;
  if (!engine.reduce || !engine.autoMove) return null;
  let state = initial(def);
  for (let step = 0; step < PLAYOUT_LIMIT; step++) {
    const role = actingRole(def, state);
    if (!role) return null;
    const result = engine.reduce(
      state,
      { role },
      engine.autoMove(state, role, 0),
    );
    if (!result.ok) throw new Error(result.error);
    if (result.outcome.status === "completed") return result.outcome;
    state = result.state;
  }
  return null;
}

describe("GAMES registry", () => {
  test("is non-empty and has unique types", () => {
    expect(GAMES.length).toBeGreaterThan(0);
    const types = GAMES.map((d) => d.meta.type);
    expect(new Set(types).size).toBe(types.length);
  });

  test("GAME_TYPES matches the registry exactly", () => {
    expect([...GAME_TYPES].sort()).toEqual(listGameTypes().sort());
  });
});

const DEFINITIONS: GameDefinition[] = GAMES;

for (const def of DEFINITIONS) {
  describe(`conformance: ${def.meta.type}`, () => {
    const sampled = Math.min(def.engine.maxPlayers, SAMPLED_SEATS);

    test("meta.type matches engine.type", () => {
      expect(def.engine.type).toBe(def.meta.type);
    });

    test("player bounds are coherent", () => {
      expect(Number.isInteger(def.engine.minPlayers)).toBe(true);
      expect(def.engine.minPlayers).toBeGreaterThanOrEqual(1);
      expect(def.engine.maxPlayers).toBeGreaterThanOrEqual(
        def.engine.minPlayers,
      );
      expect(
        Number.isInteger(def.engine.maxPlayers) ||
          def.engine.maxPlayers === Number.POSITIVE_INFINITY,
      ).toBe(true);
    });

    test("roleForSeat names a distinct, stable role for every seat", () => {
      const roles = seatRoles(def, sampled);
      expect(roles.every((role) => role.length > 0)).toBe(true);
      expect(new Set(roles).size).toBe(roles.length);
      expect(seatRoles(def, sampled)).toEqual(roles);
    });

    test("the right handler exists for the mode", () => {
      if (def.engine.mode === "realtime") {
        expect(typeof def.engine.step).toBe("function");
      } else {
        expect(typeof def.engine.reduce).toBe("function");
      }
    });

    test("simultaneous engines provide the round hooks", () => {
      if (def.engine.mode !== "simultaneous") return;
      expect(typeof def.engine.roundOf).toBe("function");
      expect(typeof def.engine.pendingRoles).toBe("function");
      expect(typeof def.engine.roundTimeMs).toBe("function");
      expect(typeof def.engine.autoMove).toBe("function");
    });

    test("lobby engines with bots provide botMove", () => {
      if (!def.engine.lobby?.bots) return;
      expect(typeof def.engine.botMove).toBe("function");
    });

    test("initial state validates against stateSchema", () => {
      const parsed = def.stateSchema.safeParse(initial(def));
      expect(parsed.success).toBe(true);
    });

    test("createInitialState returns a fresh, seed-deterministic object", () => {
      const a = initial(def, 99);
      const b = initial(def, 99);
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    test("moveSchema rejects clearly-invalid input", () => {
      expect(def.moveSchema.safeParse(undefined).success).toBe(false);
      expect(def.moveSchema.safeParse("nonsense").success).toBe(false);
      expect(
        def.moveSchema.safeParse({ definitely: "not a move" }).success,
      ).toBe(false);
    });

    test("configSchema accepts the declared field defaults", () => {
      const config = Object.fromEntries(
        (def.configFields ?? []).map((f) => [f.key, f.default]),
      );
      expect(def.configSchema.safeParse(config).success).toBe(true);
    });

    test("public queue configs parse and size a valid group", () => {
      for (const queue of def.queues ?? []) {
        const parsed = def.configSchema.safeParse(queue.config);
        expect(parsed.success).toBe(true);
        const size = def.engine.playerCount?.(parsed.data) ?? 2;
        expect(Number.isInteger(size)).toBe(true);
        expect(size).toBeGreaterThanOrEqual(Math.max(2, def.engine.minPlayers));
        expect(size).toBeLessThanOrEqual(def.engine.maxPlayers);
      }
    });

    test("reduce does not mutate the input state", () => {
      if (!def.engine.reduce) return;
      const state = initial(def);
      const snapshot = JSON.parse(JSON.stringify(state));
      def.engine.reduce(
        state,
        { role: def.engine.roleForSeat(0) },
        {} as never,
      );
      expect(state).toEqual(snapshot);
    });

    test("meta.categoryId is a known category", () => {
      expect(CATEGORY_IDS.has(def.meta.categoryId)).toBe(true);
    });

    test("coverImage, when set, is a /games/ path", () => {
      if (def.meta.coverImage === undefined) return;
      expect(typeof def.meta.coverImage).toBe("string");
      expect(def.meta.coverImage.startsWith("/games/")).toBe(true);
    });

    test("tutorialVideo, when set, is a /games/ path", () => {
      if (def.meta.tutorialVideo === undefined) return;
      expect(typeof def.meta.tutorialVideo).toBe("string");
      expect(def.meta.tutorialVideo.startsWith("/games/")).toBe(true);
    });

    test("howToPlay, when set, is a non-empty list of non-empty steps", () => {
      if (def.meta.howToPlay === undefined) return;
      expect(def.meta.howToPlay.length).toBeGreaterThan(0);
      for (const step of def.meta.howToPlay) {
        expect(typeof step).toBe("string");
        expect(step.trim().length).toBeGreaterThan(0);
      }
    });

    test("autoMove returns a legal move for the acting role", () => {
      const { engine } = def;
      if (!engine.autoMove || !engine.reduce) return;
      const state = initial(def);
      const role = actingRole(def, state);
      if (!role) return;
      for (const strikes of [0, 1, 5]) {
        const move = engine.autoMove(state, role, strikes);
        expect(def.moveSchema.safeParse(move).success).toBe(true);
        expect(engine.reduce(state, { role }, move).ok).toBe(true);
      }
    });

    test("simultaneous round hooks describe the opening round", () => {
      const { engine } = def;
      if (engine.mode !== "simultaneous") return;
      if (!engine.pendingRoles || !engine.roundOf || !engine.roundTimeMs)
        return;
      const state = initial(def);
      const roles = new Set(seatRoles(def, engine.minPlayers));
      const pending = engine.pendingRoles(state);
      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every((role) => roles.has(role))).toBe(true);
      expect(Number.isInteger(engine.roundOf(state))).toBe(true);
      expect(engine.roundTimeMs(state)).toBeGreaterThan(0);
      expect(Number.isFinite(engine.roundTimeMs(state))).toBe(true);
    });

    test("resultDelayMs is a finite, non-negative delay", () => {
      const { engine } = def;
      if (!engine.resultDelayMs) return;
      const delay = engine.resultDelayMs(initial(def));
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(0);
    });

    test("botMove returns a legal move at every difficulty", () => {
      const { engine } = def;
      if (!engine.botMove || !engine.reduce) return;
      const state = initial(def);
      const role = actingRole(def, state);
      if (!role) return;
      for (const difficulty of DIFFICULTIES) {
        const move = engine.botMove(state, role, difficulty);
        expect(def.moveSchema.safeParse(move).success).toBe(true);
        expect(engine.reduce(state, { role }, move).ok).toBe(true);
      }
    });

    test("a completed outcome names winners by seat role", () => {
      const outcome = playout(def);
      if (outcome?.status !== "completed") return;
      const roles = new Set(seatRoles(def, def.engine.minPlayers));
      expect(Array.isArray(outcome.winnerRoles)).toBe(true);
      expect(outcome.winnerRoles.every((role) => roles.has(role))).toBe(true);
      expect(typeof outcome.draw).toBe("boolean");
      if (!outcome.draw) expect(outcome.winnerRoles.length).toBeGreaterThan(0);
    });
  });
}
