import { describe, expect, it, mock } from "bun:test";
import type { Redis } from "ioredis";

mock.module("../src/env", () => ({
  env: { redisUrl: "", presenceStaleMs: 25_000 },
}));

mock.module("../src/realtime/redis-client", () => ({
  getRedis: () => {
    throw new Error("getRedis() called without REDIS_URL");
  },
}));

const {
  InMemoryPresenceStore,
  RedisPresenceStore,
  createPresenceStore,
  presenceStore,
} = await import("../src/realtime/presence-store");

describe("InMemoryPresenceStore", () => {
  it("reports a user online after markOnline and offline after the last markOffline", async () => {
    const store = new InMemoryPresenceStore();

    const first = await store.markOnline("u1", "s1");
    expect(first.wasOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(true);

    const second = await store.markOnline("u1", "s2");
    expect(second.wasOnline).toBe(true);

    const offA = await store.markOffline("u1", "s1");
    expect(offA.stillOnline).toBe(true);
    expect(await store.isOnline("u1")).toBe(true);

    const offB = await store.markOffline("u1", "s2");
    expect(offB.stillOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(false);
  });

  it("onlineAmong returns only the online subset", async () => {
    const store = new InMemoryPresenceStore();
    await store.markOnline("a", "s1");
    await store.markOnline("c", "s2");

    const online = await store.onlineAmong(["a", "b", "c"]);
    expect([...online].sort()).toEqual(["a", "c"]);
  });
});

describe("createPresenceStore", () => {
  it("returns the in-memory store when REDIS_URL is unset", () => {
    expect(createPresenceStore()).toBeInstanceOf(InMemoryPresenceStore);
    expect(presenceStore).toBeInstanceOf(InMemoryPresenceStore);
  });
});

class FakeRedis {
  store = new Map<string, Map<string, number>>();

  async zadd(key: string, score: number, member: string): Promise<number> {
    const m = this.store.get(key) ?? new Map<string, number>();
    const isNew = !m.has(member);
    m.set(member, score);
    this.store.set(key, m);
    return isNew ? 1 : 0;
  }

  async zrem(key: string, member: string): Promise<number> {
    const m = this.store.get(key);
    if (!m) return 0;
    const had = m.delete(member);
    return had ? 1 : 0;
  }

  async zcount(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<number> {
    const m = this.store.get(key);
    if (!m) return 0;
    const lo = typeof min === "string" ? Number(min) : min;
    const hi = max === "+inf" ? Number.POSITIVE_INFINITY : Number(max);
    let count = 0;
    for (const score of m.values()) {
      if (score >= lo && score <= hi) count += 1;
    }
    return count;
  }

  async expire(): Promise<number> {
    return 1;
  }
}

describe("RedisPresenceStore", () => {
  it("counts fresh members as online and ages out stale ones", async () => {
    let now = 1_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    const first = await store.markOnline("u1", "s1");
    expect(first.wasOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(true);

    now += 30_000;
    expect(await store.isOnline("u1")).toBe(false);

    await store.refresh("u1", "s1");
    expect(await store.isOnline("u1")).toBe(true);
  });

  it("markOffline removes the socket and reports remaining presence", async () => {
    const now = 5_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await store.markOnline("u1", "s1");
    await store.markOnline("u1", "s2");

    const offA = await store.markOffline("u1", "s1");
    expect(offA.stillOnline).toBe(true);

    const offB = await store.markOffline("u1", "s2");
    expect(offB.stillOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(false);
  });

  it("onlineAmong returns only fresh users", async () => {
    const now = 9_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });
    await store.markOnline("a", "s1");
    await store.markOnline("c", "s2");

    const online = await store.onlineAmong(["a", "b", "c"]);
    expect([...online].sort()).toEqual(["a", "c"]);
  });
});
