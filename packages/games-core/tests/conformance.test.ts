import { describe, expect, test } from "bun:test";
import type { GameDefinition, Seat } from "../src/index";
import {
  GAME_CATEGORIES,
  GAME_TYPES,
  GAMES,
  listGameTypes,
} from "../src/index";

const CATEGORY_IDS = new Set(GAME_CATEGORIES.map((category) => category.id));

function minSeats(def: GameDefinition): Seat[] {
  return def.engine.roles
    .slice(0, def.engine.minPlayers)
    .map((role) => ({ role }));
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

for (const def of GAMES) {
  describe(`conformance: ${def.meta.type}`, () => {
    test("meta.type matches engine.type", () => {
      expect(def.engine.type).toBe(def.meta.type);
    });

    test("player bounds are coherent", () => {
      expect(def.engine.minPlayers).toBeGreaterThanOrEqual(1);
      expect(def.engine.maxPlayers).toBeGreaterThanOrEqual(
        def.engine.minPlayers,
      );
      expect(def.engine.roles.length).toBeGreaterThanOrEqual(
        def.engine.maxPlayers,
      );
    });

    test("the right handler exists for the mode", () => {
      if (def.engine.mode === "turn-based") {
        expect(typeof def.engine.reduce).toBe("function");
      } else {
        expect(typeof def.engine.step).toBe("function");
      }
    });

    test("initial state validates against stateSchema", () => {
      const state = def.engine.createInitialState(minSeats(def));
      const parsed = def.stateSchema.safeParse(state);
      expect(parsed.success).toBe(true);
    });

    test("createInitialState returns a fresh object each call", () => {
      const a = def.engine.createInitialState(minSeats(def));
      const b = def.engine.createInitialState(minSeats(def));
      expect(a).not.toBe(b);
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

    test("turn-based reduce does not mutate the input state", () => {
      if (def.engine.mode !== "turn-based" || !def.engine.reduce) return;
      const state = def.engine.createInitialState(minSeats(def));
      const snapshot = JSON.parse(JSON.stringify(state));
      const role = def.engine.roles[0];
      expect(role).toBeDefined();
      if (role === undefined) throw new Error("engine must declare a role");
      def.engine.reduce(state, { role }, {} as never);
      expect(state).toEqual(snapshot);
    });

    test("meta.categoryId is a known category", () => {
      expect(CATEGORY_IDS.has(def.meta.categoryId)).toBe(true);
    });

    test("engine.roles has no duplicates", () => {
      expect(new Set(def.engine.roles).size).toBe(def.engine.roles.length);
    });

    test("coverImage, when set, is a /games/ path", () => {
      if (def.meta.coverImage === undefined) return;
      expect(typeof def.meta.coverImage).toBe("string");
      expect(def.meta.coverImage.startsWith("/games/")).toBe(true);
    });
  });
}
