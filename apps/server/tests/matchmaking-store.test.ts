import { describe, expect, it } from "bun:test";
import type { Redis } from "ioredis";
import {
  InMemoryMatchmakingStore,
  RedisMatchmakingStore,
} from "../src/realtime/matchmaking-store";

describe("InMemoryMatchmakingStore", () => {
  it("enqueue is idempotent per (gameType, userId)", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "a", 1);
    await store.enqueue("tic-tac-toe", "a", 2);
    expect(await store.size("tic-tac-toe")).toBe(1);
  });

  it("pairAndPop returns the two oldest members in FIFO order and removes them", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "a", 10);
    await store.enqueue("tic-tac-toe", "b", 20);
    await store.enqueue("tic-tac-toe", "c", 30);

    const pair = await store.pairAndPop("tic-tac-toe");
    expect(pair).toEqual(["a", "b"]);
    expect(await store.size("tic-tac-toe")).toBe(1);

    const none = await store.pairAndPop("tic-tac-toe");
    expect(none).toBeNull();
    expect(await store.size("tic-tac-toe")).toBe(1);
  });

  it("pairAndPop returns null when fewer than two are queued", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "a", 1);
    expect(await store.pairAndPop("tic-tac-toe")).toBeNull();
    expect(await store.size("tic-tac-toe")).toBe(1);
  });

  it("remove takes a user out of one queue without touching others", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "a", 1);
    await store.enqueue("tic-tac-toe", "b", 2);
    await store.enqueue("connect-four", "a", 3);

    await store.remove("tic-tac-toe", "a");
    expect(await store.members("tic-tac-toe")).toEqual(["b"]);
    expect(await store.members("connect-four")).toEqual(["a"]);
  });

  it("removeFromAll takes a user out of every queue", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "a", 1);
    await store.enqueue("connect-four", "a", 2);
    await store.enqueue("tic-tac-toe", "b", 3);

    await store.removeFromAll("a");
    expect(await store.members("tic-tac-toe")).toEqual(["b"]);
    expect(await store.members("connect-four")).toEqual([]);
  });

  it("requeue re-inserts a user keeping FIFO ordering by score", async () => {
    const store = new InMemoryMatchmakingStore();
    await store.enqueue("tic-tac-toe", "survivor", 5);
    await store.enqueue("tic-tac-toe", "later", 100);
    expect(await store.members("tic-tac-toe")).toEqual(["survivor", "later"]);
  });
});

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

describe("RedisMatchmakingStore", () => {
  it("enqueue uses ZADD NX so a duplicate userId never re-scores", async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchmakingStore(fake as unknown as Redis);
    await store.enqueue("tic-tac-toe", "a", 10);
    await store.enqueue("tic-tac-toe", "a", 999);
    expect(fake.zsets.get("mm:queue:tic-tac-toe")?.get("a")).toBe(10);
    expect(await store.size("tic-tac-toe")).toBe(1);
  });

  it("stores only the userId as the member (no PII)", async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchmakingStore(fake as unknown as Redis);
    await store.enqueue("tic-tac-toe", "user-123", 1);
    expect([...(fake.zsets.get("mm:queue:tic-tac-toe")?.keys() ?? [])]).toEqual(
      ["user-123"],
    );
  });

  it("pairAndPop pops the two oldest members atomically in one eval", async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchmakingStore(fake as unknown as Redis);
    await store.enqueue("tic-tac-toe", "a", 10);
    await store.enqueue("tic-tac-toe", "b", 20);
    await store.enqueue("tic-tac-toe", "c", 30);

    const pair = await store.pairAndPop("tic-tac-toe");
    expect(pair).toEqual(["a", "b"]);
    expect(fake.evalCalls).toHaveLength(1);
    expect(fake.evalCalls[0]?.numkeys).toBe(1);
    expect(fake.evalCalls[0]?.keys).toEqual(["mm:queue:tic-tac-toe"]);
    expect(await store.members("tic-tac-toe")).toEqual(["c"]);
  });

  it("pairAndPop returns null and removes nothing when fewer than two queued", async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchmakingStore(fake as unknown as Redis);
    await store.enqueue("tic-tac-toe", "a", 1);
    expect(await store.pairAndPop("tic-tac-toe")).toBeNull();
    expect(await store.size("tic-tac-toe")).toBe(1);
  });

  it("a second concurrent pairAndPop cannot re-pop the same pair", async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchmakingStore(fake as unknown as Redis);
    await store.enqueue("tic-tac-toe", "a", 1);
    await store.enqueue("tic-tac-toe", "b", 2);

    const [first, second] = await Promise.all([
      store.pairAndPop("tic-tac-toe"),
      store.pairAndPop("tic-tac-toe"),
    ]);
    const popped = [first, second].filter((p) => p !== null);
    expect(popped).toHaveLength(1);
    expect(popped[0]).toEqual(["a", "b"]);
    expect(await store.size("tic-tac-toe")).toBe(0);
  });

  it("removeFromAll clears the user from every registered queue", async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchmakingStore(fake as unknown as Redis);
    await store.enqueue("tic-tac-toe", "a", 1);
    await store.enqueue("connect-four", "a", 2);
    await store.enqueue("tic-tac-toe", "b", 3);

    await store.removeFromAll("a");
    expect(await store.members("tic-tac-toe")).toEqual(["b"]);
    expect(await store.members("connect-four")).toEqual([]);
  });
});
