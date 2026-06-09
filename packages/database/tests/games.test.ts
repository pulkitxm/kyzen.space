import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import type { CreateGameInput } from "@gamelobby/shared/types";

type Behavior =
  | "ok"
  | "collide"
  | "other"
  | "wrong-constraint"
  | "no-constraint"
  | "wrong-code";

let behaviors: Behavior[] = [];
let txCalls = 0;
let seatedBatches: unknown[] = [];

function collisionError() {
  return Object.assign(new Error("duplicate key value"), {
    code: "23505",
    constraint_name: "game_code_uq",
  });
}
function otherError() {
  return Object.assign(new Error("not-null violation"), { code: "23502" });
}
function wrongConstraintError() {
  return Object.assign(new Error("duplicate player"), {
    code: "23505",
    constraint_name: "game_player_uq",
  });
}
function noConstraintError() {
  return Object.assign(new Error("duplicate, unknown constraint"), {
    code: "23505",
  });
}
function wrongCodeError() {
  return Object.assign(new Error("serialization failure"), {
    code: "40001",
    constraint_name: "game_code_uq",
  });
}

function errorFor(b: Behavior): Error {
  switch (b) {
    case "collide":
      return collisionError();
    case "other":
      return otherError();
    case "wrong-constraint":
      return wrongConstraintError();
    case "no-constraint":
      return noConstraintError();
    case "wrong-code":
      return wrongCodeError();
    default:
      throw new Error(`no error for behavior ${b}`);
  }
}

const tx = {
  insert: () => ({
    values: (vals: unknown) => ({
      returning: async () => {
        const b = behaviors[txCalls - 1] ?? "ok";
        if (b !== "ok") throw errorFor(b);
        return [
          {
            id: `uuid-${txCalls}`,
            code: `CODE0${txCalls}`,
            ...(vals as Record<string, unknown>),
          },
        ];
      },
      // biome-ignore lint/suspicious/noThenProperty: the fake drizzle query builder must be awaitable
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected: (reason: unknown) => unknown,
      ) => {
        seatedBatches.push(vals);
        return Promise.resolve(undefined).then(onFulfilled, onRejected);
      },
    }),
  }),
};

const db = {
  transaction: async (cb: (t: typeof tx) => Promise<unknown>) => {
    txCalls++;
    return cb(tx);
  },
};

mock.module("../src/client", () => ({
  db,
  client: {},
  schema: {},
  createDb: () => ({ db, client: {} }),
}));

const { createGame } = await import("../src/repositories/games");

function validInput(): CreateGameInput {
  return {
    gameType: TIC_TAC_TOE,
    players: [{ userId: "u1", username: "alice", role: "X" }],
    gameState: { board: Array(9).fill(null), currentTurn: "X" },
  };
}

async function capture(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e) => e,
  );
}

beforeEach(() => {
  behaviors = [];
  txCalls = 0;
  seatedBatches = [];
});

describe("createGame - code collision retry", () => {
  test("creates a game on the first attempt when there is no collision", async () => {
    behaviors = ["ok"];
    const rec = await createGame(validInput());
    expect(txCalls).toBe(1);
    expect(rec.gameType).toBe(TIC_TAC_TOE);
    expect(rec.players).toEqual([
      { userId: "u1", username: "alice", role: "X" },
    ]);
    expect(seatedBatches).toHaveLength(1);
  });

  test("retries once after a code collision then succeeds", async () => {
    behaviors = ["collide", "ok"];
    const rec = await createGame(validInput());
    expect(txCalls).toBe(2);
    expect(rec.gameType).toBe(TIC_TAC_TOE);
  });

  test("allows exactly five attempts - succeeds on the last after four collisions", async () => {
    behaviors = ["collide", "collide", "collide", "collide", "ok"];
    const rec = await createGame(validInput());
    expect(txCalls).toBe(5);
    expect(rec.gameType).toBe(TIC_TAC_TOE);
  });

  test("throws the domain error after exhausting all five attempts", async () => {
    behaviors = ["collide", "collide", "collide", "collide", "collide"];
    const err = await capture(createGame(validInput()));
    expect(txCalls).toBe(5);
    expect((err as Error).message).toBe(
      "Failed to allocate a unique game code",
    );
  });

  test("rethrows a non-collision error immediately without retrying", async () => {
    behaviors = ["other"];
    const err = await capture(createGame(validInput()));
    expect((err as { code?: string }).code).toBe("23502");
    expect(txCalls).toBe(1);
  });

  test("does not retry a 23505 raised by a different constraint", async () => {
    behaviors = ["wrong-constraint"];
    const err = await capture(createGame(validInput()));
    expect((err as { constraint_name?: string }).constraint_name).toBe(
      "game_player_uq",
    );
    expect(txCalls).toBe(1);
  });

  test("does not retry a 23505 that carries no constraint name", async () => {
    behaviors = ["no-constraint"];
    const err = await capture(createGame(validInput()));
    expect((err as { code?: string }).code).toBe("23505");
    expect(
      (err as { constraint_name?: string }).constraint_name,
    ).toBeUndefined();
    expect(txCalls).toBe(1);
  });

  test("does not retry the game_code_uq constraint under a non-23505 code", async () => {
    behaviors = ["wrong-code"];
    const err = await capture(createGame(validInput()));
    expect((err as { code?: string }).code).toBe("40001");
    expect(txCalls).toBe(1);
  });

  test("validates the input before opening any transaction", async () => {
    const bad = {
      ...validInput(),
      gameType: "chess",
    } as unknown as CreateGameInput;
    const err = await capture(createGame(bad));
    expect(err).toBeInstanceOf(Error);
    expect(txCalls).toBe(0);
  });
});
