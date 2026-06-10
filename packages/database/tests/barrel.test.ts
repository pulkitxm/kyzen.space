import { describe, expect, test } from "bun:test";

describe("@gamelobby/database barrel surface", () => {
  test("re-exports every repository namespace as a function-bag object", async () => {
    const idx = await import("../src/index");
    const namespaces = [
      "accountMerge",
      "conversations",
      "friends",
      "games",
      "invites",
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
    const { games, invites, profiles, accountMerge } = await import(
      "../src/index"
    );
    expect(typeof games.createGame).toBe("function");
    expect(typeof games.getGameByCode).toBe("function");
    expect(typeof games.findLiveGameInConversation).toBe("function");
    expect(typeof invites.create).toBe("function");
    expect(typeof invites.getByToken).toBe("function");
    expect(typeof profiles.bumpStats).toBe("function");
    expect(typeof accountMerge.mergeAccounts).toBe("function");
  });

  test("exposes the value bindings createDb / db / ping / schema / generateInviteToken", async () => {
    const idx = await import("../src/index");
    expect(typeof idx.createDb).toBe("function");
    expect(typeof idx.ping).toBe("function");
    expect(typeof idx.generateInviteToken).toBe("function");
    expect(typeof idx.db).toBe("object");
    expect(typeof idx.schema).toBe("object");
    expect(idx.schema).not.toBeNull();
  });

  test("the schema re-export carries the generic game-trio tables", async () => {
    const { schema } = await import("../src/index");
    const tables = schema as Record<string, unknown>;
    for (const table of ["game", "move", "gamePlayer", "gameInvite"]) {
      expect(tables[table]).toBeDefined();
    }
  });
});

describe("barrel owned-const bindings (c5fe7a7, mock-poisoning isolation)", () => {
  test("value exports are identity-equal to their source modules in a pristine process", () => {
    const src = (name: string) =>
      JSON.stringify(
        Bun.fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url)),
      );
    const code = [
      `const idx = await import(${src("index")});`,
      `const client = await import(${src("client")});`,
      `const inviteToken = await import(${src("invite-token")});`,
      `const pairs = [`,
      `  ["generateInviteToken", idx.generateInviteToken, inviteToken.generateInviteToken],`,
      `  ["createDb", idx.createDb, client.createDb],`,
      `  ["ping", idx.ping, client.ping],`,
      `  ["db", idx.db, client.db],`,
      `  ["schema", idx.schema, client.schema],`,
      `];`,
      `const broken = pairs.filter(([, a, b]) => a !== b).map(([k]) => k);`,
      `if (broken.length > 0) {`,
      `  console.error(broken.join(","));`,
      `  process.exit(1);`,
      `}`,
    ].join("\n");
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", code],
      stderr: "pipe",
      stdout: "pipe",
    });
    expect(new TextDecoder().decode(result.stderr).trim()).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
