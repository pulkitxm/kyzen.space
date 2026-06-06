import { describe, expect, it } from "bun:test";
import type { Redis } from "ioredis";
import {
  InMemoryPresenceStore,
  type PresenceStore,
  RedisPresenceStore,
} from "../src/realtime/presence-store";

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

describe("InMemoryPresenceStore idempotency and edge cases", () => {
  it("re-adding the same socketId is idempotent", async () => {
    const store = new InMemoryPresenceStore();

    const first = await store.markOnline("u1", "s1");
    expect(first.wasOnline).toBe(false);

    const second = await store.markOnline("u1", "s1");
    expect(second.wasOnline).toBe(true);
    expect(await store.isOnline("u1")).toBe(true);

    const off = await store.markOffline("u1", "s1");
    expect(off.stillOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(false);
  });

  it("markOffline of a never-added socket returns stillOnline:false without throwing", async () => {
    const store = new InMemoryPresenceStore();
    await store.markOnline("u1", "s1");

    const off = await store.markOffline("u1", "ghost");
    expect(off.stillOnline).toBe(true);
    expect(await store.isOnline("u1")).toBe(true);
  });

  it("markOffline for an unknown user returns stillOnline:false without throwing", async () => {
    const store = new InMemoryPresenceStore();

    const off = await store.markOffline("nobody", "s1");
    expect(off.stillOnline).toBe(false);
    expect(await store.isOnline("nobody")).toBe(false);
  });

  it("onlineAmong of an empty list returns an empty set", async () => {
    const store = new InMemoryPresenceStore();
    await store.markOnline("u1", "s1");

    const online = await store.onlineAmong([]);
    expect(online.size).toBe(0);
  });

  it("onlineAmong dedupes duplicate ids in the input", async () => {
    const store = new InMemoryPresenceStore();
    await store.markOnline("a", "s1");

    const online = await store.onlineAmong(["a", "a", "b", "b", "a"]);
    expect([...online].sort()).toEqual(["a"]);
    expect(online.size).toBe(1);
  });

  it("isolates distinct users so one going offline does not affect another", async () => {
    const store = new InMemoryPresenceStore();
    await store.markOnline("u1", "s1");
    await store.markOnline("u2", "s2");

    const off = await store.markOffline("u1", "s1");
    expect(off.stillOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(false);
    expect(await store.isOnline("u2")).toBe(true);
  });

  it("keeps a user online until both of two sockets are removed", async () => {
    const store = new InMemoryPresenceStore();
    await store.markOnline("u1", "s1");
    await store.markOnline("u1", "s2");
    expect(await store.isOnline("u1")).toBe(true);

    const offA = await store.markOffline("u1", "s1");
    expect(offA.stillOnline).toBe(true);
    expect(await store.isOnline("u1")).toBe(true);

    const offB = await store.markOffline("u1", "s2");
    expect(offB.stillOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(false);
  });
});

class FakeRedis {
  store = new Map<string, Map<string, number>>();
  expireCalls: Array<{ key: string; seconds: number }> = [];

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

  async expire(key: string, seconds: number): Promise<number> {
    this.expireCalls.push({ key, seconds });
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

describe("RedisPresenceStore wasOnline freshness semantics", () => {
  it("reports wasOnline:true only when a fresh member already exists", async () => {
    const now = 2_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    const first = await store.markOnline("u1", "s1");
    expect(first.wasOnline).toBe(false);

    const second = await store.markOnline("u1", "s2");
    expect(second.wasOnline).toBe(true);
  });

  it("reports wasOnline:false when the only existing member is stale", async () => {
    let now = 3_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    const first = await store.markOnline("u1", "s1");
    expect(first.wasOnline).toBe(false);

    now += 30_000;

    const second = await store.markOnline("u1", "s2");
    expect(second.wasOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(true);
  });
});

describe("RedisPresenceStore refresh re-scores stale members", () => {
  it("moves a stale member back to fresh by re-scoring it", async () => {
    let now = 4_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await store.markOnline("u1", "s1");
    const keyMembers = fake.store.get("presence:u1");
    expect(keyMembers?.get("s1")).toBe(4_000_000);

    now += 30_000;
    expect(await store.isOnline("u1")).toBe(false);

    await store.refresh("u1", "s1");
    expect(keyMembers?.get("s1")).toBe(4_030_000);
    expect(await store.isOnline("u1")).toBe(true);
  });
});

describe("RedisPresenceStore key format and isolation", () => {
  it("uses exactly the presence:<userId> key format", async () => {
    const now = 6_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await store.markOnline("alice", "s1");

    expect([...fake.store.keys()]).toEqual(["presence:alice"]);
    expect(fake.store.has("presence:alice")).toBe(true);
  });

  it("stores distinct users under distinct keys", async () => {
    const now = 7_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await store.markOnline("alice", "s1");
    await store.markOnline("bob", "s2");

    expect([...fake.store.keys()].sort()).toEqual([
      "presence:alice",
      "presence:bob",
    ]);
    expect(fake.store.get("presence:alice")?.has("s1")).toBe(true);
    expect(fake.store.get("presence:alice")?.has("s2")).toBe(false);
    expect(fake.store.get("presence:bob")?.has("s2")).toBe(true);
  });
});

describe("RedisPresenceStore EXPIRE TTL", () => {
  it("invokes expire with ceil(staleMs/1000)+5 on markOnline", async () => {
    const now = 8_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await store.markOnline("u1", "s1");

    expect(fake.expireCalls).toEqual([{ key: "presence:u1", seconds: 30 }]);
  });

  it("invokes expire with the same TTL on refresh", async () => {
    const now = 8_100_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await store.markOnline("u1", "s1");
    await store.refresh("u1", "s1");

    expect(fake.expireCalls).toEqual([
      { key: "presence:u1", seconds: 30 },
      { key: "presence:u1", seconds: 30 },
    ]);
  });

  it("derives a different TTL from a different staleMs", async () => {
    const now = 8_200_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 10_000,
      now: () => now,
    });

    await store.markOnline("u1", "s1");

    expect(fake.expireCalls).toEqual([{ key: "presence:u1", seconds: 15 }]);
  });

  it("rounds a non-second-aligned staleMs up before adding the buffer", async () => {
    const now = 8_300_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 12_500,
      now: () => now,
    });

    await store.markOnline("u1", "s1");

    expect(fake.expireCalls).toEqual([{ key: "presence:u1", seconds: 18 }]);
  });
});

describe("RedisPresenceStore onlineAmong over mixed freshness", () => {
  it("returns exactly the fresh users among fresh, stale, and absent", async () => {
    let now = 10_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await store.markOnline("stale", "s1");
    now += 30_000;
    await store.markOnline("fresh", "s2");

    const online = await store.onlineAmong([
      "fresh",
      "stale",
      "absent",
      "fresh",
    ]);
    expect([...online].sort()).toEqual(["fresh"]);
    expect(online.size).toBe(1);
  });
});

describe("RedisPresenceStore multi-socket markOffline", () => {
  it("reports stillOnline:true while a fresh socket remains and false once removed", async () => {
    const now = 11_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await store.markOnline("u1", "s1");
    await store.markOnline("u1", "s2");
    await store.markOnline("u1", "s3");

    const offA = await store.markOffline("u1", "s1");
    expect(offA.stillOnline).toBe(true);

    const offB = await store.markOffline("u1", "s2");
    expect(offB.stillOnline).toBe(true);
    expect(await store.isOnline("u1")).toBe(true);

    const offC = await store.markOffline("u1", "s3");
    expect(offC.stillOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(false);
  });

  it("treats a remaining stale socket as offline after removing the fresh one", async () => {
    let now = 12_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await store.markOnline("u1", "stale-socket");
    now += 30_000;
    await store.markOnline("u1", "fresh-socket");
    expect(await store.isOnline("u1")).toBe(true);

    const off = await store.markOffline("u1", "fresh-socket");
    expect(off.stillOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(false);
  });
});

describe("RedisPresenceStore alternate staleMs window", () => {
  it("uses a 5s freshness window to age members out sooner", async () => {
    let now = 13_000_000;
    const fake = new FakeRedis();
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 5_000,
      now: () => now,
    });

    await store.markOnline("u1", "s1");
    expect(await store.isOnline("u1")).toBe(true);

    now += 4_000;
    expect(await store.isOnline("u1")).toBe(true);

    now += 2_000;
    expect(await store.isOnline("u1")).toBe(false);

    expect(fake.expireCalls).toEqual([{ key: "presence:u1", seconds: 10 }]);
  });
});

describe("RedisPresenceStore staleness boundary is inclusive", () => {
  it("treats a member scored exactly staleMs ago as online, one ms later offline", async () => {
    const t0 = 1_000_000;
    let now = t0;
    const fake = new FakeRedis();
    const staleMs = 25_000;
    const store = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs,
      now: () => now,
    });

    await store.markOnline("u1", "s1");
    expect(fake.store.get("presence:u1")?.get("s1")).toBe(t0);

    now = t0 + staleMs;
    expect(now - staleMs).toBe(t0);
    expect(await store.isOnline("u1")).toBe(true);

    now = t0 + staleMs + 1;
    expect(await store.isOnline("u1")).toBe(false);
  });
});

describe("InMemoryPresenceStore refresh is a no-op", () => {
  it("returns undefined and leaves the user online without throwing", async () => {
    const store: PresenceStore = new InMemoryPresenceStore();
    await store.markOnline("u1", "s1");
    expect(await store.isOnline("u1")).toBe(true);

    const result = await store.refresh("u1", "s1");
    expect(result).toBeUndefined();
    expect(await store.isOnline("u1")).toBe(true);
  });
});

describe("RedisPresenceStore keeps no per-instance state", () => {
  it("shares all presence state through one client across instances", async () => {
    const now = 14_000_000;
    const fake = new FakeRedis();
    const storeA = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });
    const storeB = new RedisPresenceStore(fake as unknown as Redis, {
      staleMs: 25_000,
      now: () => now,
    });

    await storeA.markOnline("u1", "a");
    expect(await storeB.isOnline("u1")).toBe(true);

    await storeB.markOffline("u1", "a");
    expect(await storeA.isOnline("u1")).toBe(false);
  });
});
