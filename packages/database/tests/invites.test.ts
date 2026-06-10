import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import { INVITE_TOKEN_LENGTH } from "../src/invite-token";

let insertedValues: Record<string, unknown> | null = null;
let insertCalls = 0;
let selectCalls = 0;
let storedRow: Record<string, unknown> | null = null;
let insertReturnsEmpty = false;

const db = {
  insert: () => ({
    values: (vals: Record<string, unknown>) => ({
      returning: async () => {
        insertCalls += 1;
        insertedValues = vals;
        if (insertReturnsEmpty) return [];
        return [{ id: "inv-1", createdAt: new Date(), ...vals }];
      },
    }),
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          selectCalls += 1;
          return storedRow ? [storedRow] : [];
        },
      }),
    }),
  }),
};

mock.module("../src/client", () => ({
  db,
  client: {},
  schema: {},
  createDb: () => ({ db, client: {} }),
  ping: async () => {},
}));

const { create, getByToken } = await import("../src/repositories/invites");

function validInput(over: Record<string, unknown> = {}) {
  return {
    inviterUserId: "inviter-1",
    gameType: TIC_TAC_TOE,
    token: "a".repeat(INVITE_TOKEN_LENGTH),
    expiresAt: new Date(Date.now() + 60_000),
    ...over,
    // biome-ignore lint/suspicious/noExplicitAny: build a partial input for negative cases
  } as any;
}

async function capture(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e) => e,
  );
}

beforeEach(() => {
  insertedValues = null;
  insertCalls = 0;
  selectCalls = 0;
  storedRow = null;
  insertReturnsEmpty = false;
});

describe("invites.create", () => {
  test("inserts a row for a full-length token", async () => {
    const row = await create(validInput());
    expect(insertCalls).toBe(1);
    expect(insertedValues?.token).toBe("a".repeat(INVITE_TOKEN_LENGTH));
    expect(insertedValues?.config).toBeNull();
    expect(insertedValues?.seatingMode).toBeNull();
    expect(row.id).toBe("inv-1");
  });

  test("threads config and seatingMode into the inserted row", async () => {
    await create(
      validInput({ config: { difficulty: 7 }, seatingMode: "open" }),
    );
    expect(insertedValues?.config).toEqual({ difficulty: 7 });
    expect(insertedValues?.seatingMode).toBe("open");
  });

  test("rejects a token shorter than INVITE_TOKEN_LENGTH without inserting", async () => {
    const err = await capture(
      create(validInput({ token: "a".repeat(INVITE_TOKEN_LENGTH - 1) })),
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("too short");
    expect(insertCalls).toBe(0);
  });

  test("rejects an empty inviterUserId via the input schema", async () => {
    const err = await capture(create(validInput({ inviterUserId: "" })));
    expect(err).toBeInstanceOf(Error);
    expect(insertCalls).toBe(0);
  });

  test("rejects an unknown game type via the input schema", async () => {
    const err = await capture(create(validInput({ gameType: "chess" })));
    expect(err).toBeInstanceOf(Error);
    expect(insertCalls).toBe(0);
  });

  test("rejects a non-Date expiresAt via the input schema", async () => {
    const err = await capture(
      create(validInput({ expiresAt: Date.now() + 60_000 })),
    );
    expect(err).toBeInstanceOf(Error);
    expect(insertCalls).toBe(0);
  });

  test("rejects an empty token via the schema (min(1)) before the length guard", async () => {
    const err = await capture(create(validInput({ token: "" })));
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("too short");
    expect(insertCalls).toBe(0);
  });

  test("rejects a one-char token via the explicit length guard, not the schema", async () => {
    const err = await capture(create(validInput({ token: "a" })));
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("too short");
    expect(insertCalls).toBe(0);
  });

  test("rejects a token one short of the full length", async () => {
    const err = await capture(
      create(validInput({ token: "a".repeat(INVITE_TOKEN_LENGTH - 1) })),
    );
    expect((err as Error).message).toContain("too short");
    expect(insertCalls).toBe(0);
  });

  test("accepts a token longer than the minimum length", async () => {
    const row = await create(
      validInput({ token: "a".repeat(INVITE_TOKEN_LENGTH + 5) }),
    );
    expect(insertCalls).toBe(1);
    expect(row.id).toBe("inv-1");
  });

  test("throws 'Failed to create invite' when the insert returns no row", async () => {
    insertReturnsEmpty = true;
    const err = await capture(create(validInput()));
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Failed to create invite");
    expect(insertCalls).toBe(1);
  });

  test("does not reject an extra unknown key (the input schema is not strict)", async () => {
    const row = await create(validInput({ unexpected: "ignored" }));
    expect(insertCalls).toBe(1);
    expect(row.id).toBe("inv-1");
    expect(insertedValues?.unexpected).toBeUndefined();
  });
});

describe("invites.getByToken", () => {
  test("returns the row when present", async () => {
    storedRow = {
      id: "inv-1",
      token: "a".repeat(INVITE_TOKEN_LENGTH),
      inviterUserId: "inviter-1",
      gameType: TIC_TAC_TOE,
      config: null,
      seatingMode: null,
      expiresAt: new Date(),
      createdAt: new Date(),
    };
    const row = await getByToken("a".repeat(INVITE_TOKEN_LENGTH));
    expect(row?.id).toBe("inv-1");
    expect(selectCalls).toBe(1);
  });

  test("returns null for an unknown token (no row)", async () => {
    storedRow = null;
    const row = await getByToken("does-not-exist");
    expect(row).toBeNull();
    expect(selectCalls).toBe(1);
  });

  test("does not pre-validate token length, just queries and returns null", async () => {
    storedRow = null;
    const row = await getByToken("short");
    expect(row).toBeNull();
    expect(selectCalls).toBe(1);
  });
});
