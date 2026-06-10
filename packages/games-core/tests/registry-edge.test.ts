import { describe, expect, test } from "bun:test";
import { GAME_CATEGORIES } from "@gamelobby/shared/constants";
import {
  GAMES,
  getCategoryGroups,
  getDefinition,
  getEngine,
  hasEngine,
  listDefinitions,
  listGameMeta,
  listGameTypes,
} from "../src/index";

const knownTypes = GAMES.map((def) => def.meta.type);

describe("registry lookups are stable across calls", () => {
  test("getDefinition returns the same object reference each call", () => {
    for (const type of knownTypes) {
      expect(getDefinition(type)).toBe(getDefinition(type));
    }
  });

  test("getEngine returns the same object reference each call", () => {
    for (const type of knownTypes) {
      expect(getEngine(type)).toBe(getEngine(type));
    }
  });

  test("getDefinition resolves to the exact element in GAMES", () => {
    for (const def of GAMES) {
      expect(getDefinition(def.meta.type)).toBe(def);
    }
  });

  test("getEngine resolves to the definition's own engine instance", () => {
    for (const def of GAMES) {
      expect(getEngine(def.meta.type)).toBe(def.engine);
    }
  });
});

describe("listDefinitions identity", () => {
  test("returns the GAMES array reference itself", () => {
    expect(listDefinitions()).toBe(GAMES);
  });

  test("its types line up with listGameTypes in the same order", () => {
    expect(listDefinitions().map((d) => d.meta.type)).toEqual(listGameTypes());
  });
});

describe("listGameMeta order parity", () => {
  test("preserves GAMES order, not just set membership", () => {
    expect(listGameMeta().map((m) => m.type)).toEqual(
      GAMES.map((d) => d.meta.type),
    );
  });
});

describe("hasEngine narrowing and unknown-string handling", () => {
  test("is false for the empty string and whitespace", () => {
    expect(hasEngine("")).toBe(false);
    expect(hasEngine("   ")).toBe(false);
  });

  test("is case-sensitive on the slug", () => {
    expect(hasEngine("Tic-Tac-Toe")).toBe(false);
    expect(hasEngine("TIC-TAC-TOE")).toBe(false);
  });

  test("a passing hasEngine implies getDefinition does not throw", () => {
    for (const type of knownTypes) {
      if (hasEngine(type)) {
        expect(() => getDefinition(type)).not.toThrow();
      }
    }
  });
});

describe("getDefinition unknown-type messages", () => {
  test("includes the offending type verbatim, even the empty string", () => {
    expect(() => getDefinition("")).toThrow("Unknown game type: ");
    expect(() => getEngine("")).toThrow("Unknown game type: ");
  });

  test("a case-variant slug is treated as unknown", () => {
    expect(() => getDefinition("Tic-Tac-Toe")).toThrow(
      "Unknown game type: Tic-Tac-Toe",
    );
  });
});

describe("getCategoryGroups ordering and grouping", () => {
  test("preserves GAME_CATEGORIES insertion order among non-empty groups", () => {
    const groups = getCategoryGroups();
    const orderedNonEmptyIds = Object.values(GAME_CATEGORIES)
      .map((category) => category.id)
      .filter((id) => GAMES.some((def) => def.meta.categoryId === id));
    expect(groups.map((group) => group.category.id)).toEqual(
      orderedNonEmptyIds,
    );
  });

  test("never yields an empty group", () => {
    for (const group of getCategoryGroups()) {
      expect(group.games.length).toBeGreaterThan(0);
    }
  });

  test("each group carries the definition meta objects, not copies", () => {
    for (const group of getCategoryGroups()) {
      for (const meta of group.games) {
        const def = GAMES.find((d) => d.meta.type === meta.type);
        expect(def).toBeDefined();
        expect(def?.meta).toBe(meta);
      }
    }
  });

  test("partitions every game into exactly one group", () => {
    const placements = getCategoryGroups().flatMap((group) =>
      group.games.map((meta) => meta.type),
    );
    expect(placements.length).toBe(GAMES.length);
    expect(new Set(placements).size).toBe(placements.length);
  });
});
