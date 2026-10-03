import { describe, expect, test } from "bun:test";

describe("@kyzen/database barrel surface", () => {
  test("re-exports every repository namespace as a function-bag object", async () => {
    const idx = await import("../src/index");
    const namespaces = [
      "accountMerge",
      "conversations",
      "friends",
      "games",
      "messages",
      "notifications",
      "profiles",
    ] as const;
    for (const ns of namespaces) {
      const bag = idx[ns];
      expect(typeof bag).toBe("object");
      expect(bag).not.toBeNull();
      const fns = Object.values(bag as Record<string, unknown>);
      expect(fns.length).toBeGreaterThan(0);
      for (const fn of fns) {
        expect(typeof fn).toBe("function");
      }
    }
  });

  test("re-exports the known repository functions by name", async () => {
    const { games, profiles, accountMerge } = await import("../src/index");
    expect(typeof games.createGame).toBe("function");
    expect(typeof games.getGameByCode).toBe("function");
    expect(typeof games.findLiveGameInConversation).toBe("function");
    expect(typeof games.persistGameMoves).toBe("function");
    expect(typeof games.removeLobbyPlayer).toBe("function");
    expect(typeof games.createRematch).toBe("function");
    expect(typeof profiles.bumpStats).toBe("function");
    expect(typeof accountMerge.mergeAccounts).toBe("function");
  });

  test("exposes the value bindings createDb / db / ping / schema", async () => {
    const idx = await import("../src/index");
    expect(typeof idx.createDb).toBe("function");
    expect(typeof idx.ping).toBe("function");
    expect(typeof idx.db).toBe("object");
    expect(typeof idx.schema).toBe("object");
    expect(idx.schema).not.toBeNull();
  });

  test("the schema re-export carries the generic game-trio tables", async () => {
    const { schema } = await import("../src/index");
    const tables = schema as Record<string, unknown>;
    for (const table of ["game", "move", "gamePlayer"]) {
      expect(tables[table]).toBeDefined();
    }
  });
});
