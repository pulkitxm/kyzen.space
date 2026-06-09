import { describe, expect, it } from "bun:test";
import type { Redis } from "ioredis";
import {
  InMemoryMatchmakingStore,
  queueKey,
  RedisMatchmakingStore,
} from "../src/realtime/matchmaking-store";

class FakeRedis {
  zsets = new Map<string, Map<string, number>>();
  sets = new Map<string, Set<string>>();
  evalCalls: Array<{ script: string; numkeys: number; keys: string[] }> = [];

  private zset(key: string): Map<string, number> {
    let m = this.zsets.get(key);
    if (!m) {
      m = new Map<string, number>();
      this.zsets.set(key, m);
    }
    return m;
  }

  async zadd(
    key: string,
    flag: string,
    score: number,
    member: string,
  ): Promise<number> {
    const m = this.zset(key);
    if (flag === "NX" && m.has(member)) return 0;
    const isNew = !m.has(member);
    m.set(member, score);
    return isNew ? 1 : 0;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const m = this.zsets.get(key);
    if (!m) return 0;
    let removed = 0;
    for (const member of members) {
      if (m.delete(member)) removed += 1;
    }
    return removed;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const m = this.zsets.get(key);
    if (!m) return [];
    const ordered = [...m.entries()]
      .sort((x, y) => x[1] - y[1])
      .map(([member]) => member);
    const end = stop < 0 ? ordered.length + stop : stop;
    return ordered.slice(start, end + 1);
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async sadd(key: string, member: string): Promise<number> {
    const s = this.sets.get(key) ?? new Set<string>();
    const isNew = !s.has(member);
    s.add(member);
    this.sets.set(key, s);
    return isNew ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  async eval(
    script: string,
    numkeys: number,
    ...keys: string[]
  ): Promise<string[]> {
    this.evalCalls.push({ script, numkeys, keys });
    const key = keys[0] ?? "";
    const m = this.zsets.get(key);
    if (!m) return [];
    const ordered = [...m.entries()]
      .sort((x, y) => x[1] - y[1])
      .map(([member]) => member);
    const pair = ordered.slice(0, 2);
    if (pair.length < 2) return [];
    m.delete(pair[0] as string);
    m.delete(pair[1] as string);
    return pair;
  }
}

function redisStore() {
  const fake = new FakeRedis();
  const store = new RedisMatchmakingStore(fake as unknown as Redis);
  return { fake, store };
}

describe("InMemoryMatchmakingStore.pairAndPop boundaries", () => {
  it("returns null with zero queued and pops nothing", async () => {
    const store = new InMemoryMatchmakingStore();
    expect(await store.pairAndPop("tic-tac-toe")).toBeNull();
    expect(await store.size("tic-tac-toe")).toBe(0);
  });

  it("returns null with exactly one queued and leaves that one in place", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "solo", 1);
    expect(await store.pairAndPop("tic-tac-toe")).toBeNull();
    expect(await store.members("tic-tac-toe")).toEqual(["solo"]);
  });

  it("pops exactly the two oldest by score and leaves the third when three are queued", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "third", 30);
    await store.enqueue("tic-tac-toe", "first", 10);
    await store.enqueue("tic-tac-toe", "second", 20);

    const pair = await store.pairAndPop("tic-tac-toe");
    expect(pair).toEqual(["first", "second"]);
    expect(await store.members("tic-tac-toe")).toEqual(["third"]);
    expect(await store.size("tic-tac-toe")).toBe(1);
  });

  it("idempotent enqueue preserves the original FIFO score so a duplicate join keeps position", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "early", 1);
    await store.enqueue("tic-tac-toe", "late", 2);
    await store.enqueue("tic-tac-toe", "early", 99);

    expect(await store.members("tic-tac-toe")).toEqual(["early", "late"]);
    const pair = await store.pairAndPop("tic-tac-toe");
    expect(pair).toEqual(["early", "late"]);
  });

  it("removeFromAll is a no-op for a user who was never queued", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "a", 1);
    await store.enqueue("connect-four", "b", 2);

    await store.removeFromAll("never");
    expect(await store.members("tic-tac-toe")).toEqual(["a"]);
    expect(await store.members("connect-four")).toEqual(["b"]);
  });
});

describe("RedisMatchmakingStore.pairAndPop boundaries", () => {
  it("returns null with zero queued without removing anything", async () => {
    const { fake, store } = redisStore();
    expect(await store.pairAndPop("tic-tac-toe")).toBeNull();
    expect(await store.size("tic-tac-toe")).toBe(0);
    expect(fake.evalCalls).toHaveLength(1);
  });

  it("pops exactly the two oldest and leaves the third when three are queued", async () => {
    const { store } = redisStore();
    await store.enqueue("tic-tac-toe", "third", 30);
    await store.enqueue("tic-tac-toe", "first", 10);
    await store.enqueue("tic-tac-toe", "second", 20);

    const pair = await store.pairAndPop("tic-tac-toe");
    expect(pair).toEqual(["first", "second"]);
    expect(await store.members("tic-tac-toe")).toEqual(["third"]);
  });

  it("idempotent ZADD NX keeps the original score so a duplicate join holds FIFO position", async () => {
    const { fake, store } = redisStore();
    await store.enqueue("tic-tac-toe", "early", 1);
    await store.enqueue("tic-tac-toe", "late", 2);
    await store.enqueue("tic-tac-toe", "early", 99);

    expect(fake.zsets.get(queueKey("tic-tac-toe"))?.get("early")).toBe(1);
    expect(await store.members("tic-tac-toe")).toEqual(["early", "late"]);
  });

  it("removeFromAll is a no-op for a user who was never queued", async () => {
    const { store } = redisStore();
    await store.enqueue("tic-tac-toe", "a", 1);
    await store.enqueue("connect-four", "b", 2);

    await store.removeFromAll("never");
    expect(await store.members("tic-tac-toe")).toEqual(["a"]);
    expect(await store.members("connect-four")).toEqual(["b"]);
  });

  it("two concurrent pairAndPop on a two-member queue yield exactly one pair (atomic eval)", async () => {
    const { fake, store } = redisStore();
    await store.enqueue("tic-tac-toe", "a", 1);
    await store.enqueue("tic-tac-toe", "b", 2);

    const results = await Promise.all([
      store.pairAndPop("tic-tac-toe"),
      store.pairAndPop("tic-tac-toe"),
      store.pairAndPop("tic-tac-toe"),
    ]);
    const popped = results.filter((p) => p !== null);
    expect(popped).toHaveLength(1);
    expect(popped[0]).toEqual(["a", "b"]);
    expect(await store.size("tic-tac-toe")).toBe(0);
    expect(fake.evalCalls).toHaveLength(3);
  });
});

describe("in-memory vs Redis store parity", () => {
  async function snapshot(
    store: InMemoryMatchmakingStore | RedisMatchmakingStore,
  ) {
    await store.enqueue("tic-tac-toe", "u1", 1);
    await store.enqueue("tic-tac-toe", "u2", 2);
    await store.enqueue("tic-tac-toe", "u3", 3);
    await store.enqueue("connect-four", "u1", 4);

    const afterEnqueueTtt = await store.members("tic-tac-toe");
    const sizeTtt = await store.size("tic-tac-toe");

    await store.remove("tic-tac-toe", "u2");
    const afterRemove = await store.members("tic-tac-toe");

    const pair = await store.pairAndPop("tic-tac-toe");
    const afterPair = await store.members("tic-tac-toe");

    await store.removeFromAll("u1");
    const tttAfterAll = await store.members("tic-tac-toe");
    const cfAfterAll = await store.members("connect-four");

    return {
      afterEnqueueTtt,
      sizeTtt,
      afterRemove,
      pair,
      afterPair,
      tttAfterAll,
      cfAfterAll,
    };
  }

  it("public surface yields identical observable results", async () => {
    const mem = await snapshot(new InMemoryMatchmakingStore());
    const { store } = redisStore();
    const redis = await snapshot(store);

    expect(redis.afterEnqueueTtt).toEqual(mem.afterEnqueueTtt);
    expect(redis.sizeTtt).toBe(mem.sizeTtt);
    expect(redis.afterRemove).toEqual(mem.afterRemove);
    expect(redis.pair).toEqual(mem.pair);
    expect(redis.afterPair).toEqual(mem.afterPair);
    expect(redis.tttAfterAll).toEqual(mem.tttAfterAll);
    expect(redis.cfAfterAll).toEqual(mem.cfAfterAll);

    expect(mem.afterEnqueueTtt).toEqual(["u1", "u2", "u3"]);
    expect(mem.afterRemove).toEqual(["u1", "u3"]);
    expect(mem.pair).toEqual(["u1", "u3"]);
    expect(mem.afterPair).toEqual([]);
    expect(mem.cfAfterAll).toEqual([]);
  });
});
