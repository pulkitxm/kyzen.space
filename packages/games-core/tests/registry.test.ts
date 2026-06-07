import { describe, expect, test } from "bun:test";
import { GAME_CATEGORIES } from "@gamelobby/shared/constants";
import {
  GAMES,
  getCategoryGroups,
  getDefinition,
  getEngine,
  hasEngine,
  listGameMeta,
  listGameTypes,
} from "../src/index";

const knownTypes = GAMES.map((def) => def.meta.type);
const categoryIds = new Set<string>(
  Object.values(GAME_CATEGORIES).map((category) => category.id),
);
const UNKNOWN_TYPE = "definitely-not-a-real-game";

describe("getDefinition", () => {
  for (const type of knownTypes) {
    test(`returns the definition for ${type}`, () => {
      const def = getDefinition(type);
      expect(def.meta.type).toBe(type);
      expect(def.engine.type).toBe(type);
    });
  }

  test("throws for an unknown type", () => {
    expect(() => getDefinition(UNKNOWN_TYPE)).toThrow(
      `Unknown game type: ${UNKNOWN_TYPE}`,
    );
  });
});

describe("getEngine", () => {
  for (const type of knownTypes) {
    test(`returns the engine for ${type}`, () => {
      const engine = getEngine(type);
      expect(engine).toBe(getDefinition(type).engine);
      expect(engine.type).toBe(type);
    });
  }

  test("throws for an unknown type", () => {
    expect(() => getEngine(UNKNOWN_TYPE)).toThrow(
      `Unknown game type: ${UNKNOWN_TYPE}`,
    );
  });
});

describe("hasEngine", () => {
  for (const type of knownTypes) {
    test(`is true for known type ${type}`, () => {
      expect(hasEngine(type)).toBe(true);
    });
  }

  test("is false for an unknown type", () => {
    expect(hasEngine(UNKNOWN_TYPE)).toBe(false);
  });
});

describe("listGameTypes and listGameMeta are consistent with GAMES", () => {
  test("listGameTypes matches GAMES length and types", () => {
    const types = listGameTypes();
    expect(types.length).toBe(GAMES.length);
    expect(new Set(types)).toEqual(new Set(knownTypes));
  });

  test("listGameMeta matches GAMES length and types", () => {
    const meta = listGameMeta();
    expect(meta.length).toBe(GAMES.length);
    expect(new Set(meta.map((m) => m.type))).toEqual(new Set(knownTypes));
  });

  test("listGameMeta entries are the definition metas", () => {
    const meta = listGameMeta();
    for (const def of GAMES) {
      const found = meta.find((m) => m.type === def.meta.type);
      expect(found).toBe(def.meta);
    }
  });
});

describe("getCategoryGroups", () => {
  const groups = getCategoryGroups();

  test("returns only non-empty categories", () => {
    for (const group of groups) {
      expect(group.games.length).toBeGreaterThan(0);
    }
  });

  test("every group category id exists in GAME_CATEGORIES", () => {
    for (const group of groups) {
      expect(categoryIds.has(group.category.id)).toBe(true);
    }
  });

  test("group games all belong to the group category", () => {
    for (const group of groups) {
      for (const meta of group.games) {
        expect<string>(meta.categoryId).toBe(group.category.id);
      }
    }
  });

  test("accounts for every game across all groups", () => {
    const grouped = groups.flatMap((group) => group.games.map((m) => m.type));
    expect(new Set(grouped)).toEqual(new Set(knownTypes));
  });
});

describe("GAMES category integrity", () => {
  for (const def of GAMES) {
    test(`${def.meta.type} categoryId resolves to a real category`, () => {
      expect(categoryIds.has(def.meta.categoryId)).toBe(true);
    });
  }
});
