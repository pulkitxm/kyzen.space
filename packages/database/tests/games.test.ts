import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import type { CreateGameInput } from "@gamelobby/shared/types";
import * as realClient from "../src/client";

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
  ...realClient,
  db,
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

describe("createGame - input validation rejects before any transaction", () => {
  test("rejects a player missing its role without opening a transaction", async () => {
    const bad = {
      ...validInput(),
      players: [{ userId: "u1", username: "alice" }],
    } as unknown as CreateGameInput;
    const err = await capture(createGame(bad));
    expect(err).toBeInstanceOf(Error);
    expect(txCalls).toBe(0);
  });

  test("rejects a missing players array", async () => {
    const { players, ...rest } = validInput();
    const err = await capture(createGame(rest as unknown as CreateGameInput));
    expect(err).toBeInstanceOf(Error);
    expect(txCalls).toBe(0);
  });

  test("rejects a non-array players value", async () => {
    const bad = {
      ...validInput(),
      players: "u1",
    } as unknown as CreateGameInput;
    const err = await capture(createGame(bad));
    expect(err).toBeInstanceOf(Error);
    expect(txCalls).toBe(0);
  });

  test("rejects an out-of-union status", async () => {
    const bad = {
      ...validInput(),
      status: "midgame",
    } as unknown as CreateGameInput;
    const err = await capture(createGame(bad));
    expect(err).toBeInstanceOf(Error);
    expect(txCalls).toBe(0);
  });

  test("rejects an out-of-union seatingMode", async () => {
    const bad = {
      ...validInput(),
      seatingMode: "weird",
    } as unknown as CreateGameInput;
    const err = await capture(createGame(bad));
    expect(err).toBeInstanceOf(Error);
    expect(txCalls).toBe(0);
  });

  test("accepts an empty players array (a seatless game)", async () => {
    behaviors = ["ok"];
    const rec = await createGame({ ...validInput(), players: [] });
    expect(txCalls).toBe(1);
    expect(rec.players).toEqual([]);
    expect(seatedBatches).toHaveLength(0);
  });
});

describe("createGame - default threading", () => {
  test("defaults status to 'waiting', config/seatingMode/winner to null", async () => {
    behaviors = ["ok"];
    const rec = await createGame(validInput());
    expect(rec.status).toBe("waiting");
    expect(rec.config).toBeNull();
    expect(rec.seatingMode).toBeNull();
    expect(rec.winner).toBeNull();
  });

  test("defaults seriesId to the row's own id when none is supplied (fresh series root)", async () => {
    behaviors = ["ok"];
    const rec = await createGame(validInput());
    expect(rec.seriesId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("threads an explicit seriesId through (a rematch inherits the parent's series)", async () => {
    behaviors = ["ok"];
    const rec = await createGame({
      ...validInput(),
      seriesId: "parent-series-id",
    });
    expect(rec.seriesId).toBe("parent-series-id");
  });

  test("threads conversation / creator / challenged / seatingMode / config through", async () => {
    behaviors = ["ok"];
    const rec = await createGame({
      ...validInput(),
      conversationId: "conv-1",
      creatorUserId: "creator-1",
      challengedUserId: "challenged-1",
      seatingMode: "challenge",
      config: { difficulty: 3 },
      status: "active",
    });
    expect(rec.conversationId).toBe("conv-1");
    expect(rec.creatorUserId).toBe("creator-1");
    expect(rec.challengedUserId).toBe("challenged-1");
    expect(rec.seatingMode).toBe("challenge");
    expect(rec.config).toEqual({ difficulty: 3 });
    expect(rec.status).toBe("active");
  });

  test("attaches the input players (not the inserted row) onto the returned record", async () => {
    behaviors = ["ok"];
    const players = [
      { userId: "u1", username: "alice", role: "X" },
      { userId: "u2", username: "bob", role: "O" },
    ];
    const rec = await createGame({ ...validInput(), players });
    expect(rec.players).toEqual(players);
    expect(seatedBatches).toHaveLength(1);
    const seated = seatedBatches[0] as Array<Record<string, unknown>>;
    expect(seated).toHaveLength(2);
    expect(seated[0]?.seatOrder).toBe(0);
    expect(seated[1]?.seatOrder).toBe(1);
    expect(seated[1]?.role).toBe("O");
  });
});
