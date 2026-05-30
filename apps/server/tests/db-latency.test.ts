import { describe, expect, it } from "bun:test";
import { withLatency } from "../src/db/latency";

type Pending<T> = PromiseLike<T> & {
  values: () => Pending<T>;
  executed: boolean;
};

function makePending<T>(result: T): Pending<T> {
  const pending = {
    executed: false,
    values() {
      return this;
    },
    then(onFulfilled?: any, onRejected?: any) {
      pending.executed = true;
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  } as Pending<T>;
  return pending;
}

type FakeSql = {
  unsafe: (query: string, params?: unknown[]) => Pending<unknown>;
  begin: (fn: (tx: FakeSql) => unknown) => unknown;
  savepoint: (fn: (tx: FakeSql) => unknown) => unknown;
  options: { host: string };
  lastPending?: Pending<unknown>;
  calls: string[];
};

function fakeSql(): FakeSql {
  const sql: FakeSql = {
    calls: [],
    options: { host: "localhost" },
    unsafe(query) {
      sql.calls.push(query);
      const pending = makePending([{ ok: true }]);
      sql.lastPending = pending;
      return pending;
    },
    begin(fn) {
      return fn(sql);
    },
    savepoint(fn) {
      return fn(sql);
    },
  };
  return sql;
}

const DELAY = 60;
const TOLERANCE = 15;

describe("withLatency — disabled", () => {
  it("returns the same client untouched when ms is 0", () => {
    const sql = fakeSql();
    expect(withLatency(sql, 0)).toBe(sql);
  });

  it("returns the same client untouched for negative / non-finite ms", () => {
    const sql = fakeSql();
    expect(withLatency(sql, -5)).toBe(sql);
    expect(withLatency(sql, Number.NaN)).toBe(sql);
  });
});

describe("withLatency — enabled", () => {
  it("delays an `unsafe` query and preserves its result", async () => {
    const slow = withLatency(fakeSql(), DELAY);
    const start = performance.now();
    const result = await slow.unsafe("SELECT 1");
    const elapsed = performance.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(DELAY - TOLERANCE);
    expect(result).toEqual([{ ok: true }]);
  });

  it("delays the `.values()` chained form drizzle uses", async () => {
    const slow = withLatency(fakeSql(), DELAY);
    const start = performance.now();
    const result = await slow.unsafe("SELECT 1").values();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(DELAY - TOLERANCE);
    expect(result).toEqual([{ ok: true }]);
  });

  it("defers execution until the query is awaited (delay precedes the query)", async () => {
    const sql = fakeSql();
    const slow = withLatency(sql, DELAY);
    const pending = slow.unsafe("SELECT 1");

    expect(sql.lastPending!.executed).toBe(false);
    await pending;
    expect(sql.lastPending!.executed).toBe(true);
  });

  it("delays queries run inside a transaction (`begin`)", async () => {
    const sql = fakeSql();
    const slow = withLatency(sql, DELAY);
    const start = performance.now();
    await slow.begin(async (tx) => {
      await tx.unsafe("INSERT 1");
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(DELAY - TOLERANCE);
    expect(sql.calls).toEqual(["INSERT 1"]);
  });

  it("delays queries run inside a nested transaction (`savepoint`)", async () => {
    const sql = fakeSql();
    const slow = withLatency(sql, DELAY);
    const start = performance.now();
    await slow.begin(async (tx) => {
      await tx.savepoint(async (sp) => {
        await sp.unsafe("UPDATE 1");
      });
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(DELAY - TOLERANCE);
    expect(sql.calls).toEqual(["UPDATE 1"]);
  });

  it("passes through non-query properties unchanged", () => {
    const slow = withLatency(fakeSql(), DELAY);
    expect(slow.options).toEqual({ host: "localhost" });
  });
});
