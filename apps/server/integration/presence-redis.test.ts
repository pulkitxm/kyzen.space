import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { Redis } from "ioredis";
import { env } from "../src/env";
import { RedisPresenceStore } from "../src/realtime/presence-store";

const STALE_MS = 25_000;
const EXPECTED_TTL = Math.ceil(STALE_MS / 1000) + 5;

const SETUP_HELP = [
  "Presence Redis integration tests need a reachable Redis and could not connect.",
  "Checklist:",
  "(1) REDIS_URL must be set (run via `bun --env-file=../../.env`);",
  "(2) Redis must be running and reachable at that URL;",
  "(3) `new Redis(REDIS_URL).ping()` must return PONG.",
].join(" ");

let redis: Redis;
let redisB: Redis;
const trackedKeys = new Set<string>();

function newUser(): string {
  const userId = crypto.randomUUID();
  trackedKeys.add(`presence:${userId}`);
  return userId;
}

async function delTrackedKeys(): Promise<void> {
  const keys = [...trackedKeys];
  if (keys.length > 0) await redis.del(...keys);
  trackedKeys.clear();
}

beforeAll(async () => {
  if (!env.redisUrl) throw new Error(SETUP_HELP);
  redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 1 });
  redisB = new Redis(env.redisUrl, { maxRetriesPerRequest: 1 });
  redis.on("error", () => {});
  redisB.on("error", () => {});
  try {
    const pong = await redis.ping();
    const pongB = await redisB.ping();
    if (pong !== "PONG" || pongB !== "PONG") throw new Error("ping not PONG");
  } catch (err) {
    redis.disconnect();
    redisB.disconnect();
    throw new Error(`${SETUP_HELP} (underlying error: ${String(err)})`);
  }
});

afterEach(async () => {
  await delTrackedKeys();
});

afterAll(async () => {
  await delTrackedKeys();
  await redis.quit();
  await redisB.quit();
});

describe("RedisPresenceStore over real Redis", () => {
  it("markOnline writes a ZSET member with a numeric score and a sane TTL", async () => {
    const store = new RedisPresenceStore(redis, { staleMs: STALE_MS });
    const user = newUser();
    const key = `presence:${user}`;

    const first = await store.markOnline(user, "sockA");
    expect(first.wasOnline).toBe(false);
    expect(await store.isOnline(user)).toBe(true);

    const raw = await redis.zrange(key, 0, -1, "WITHSCORES");
    expect(raw.length).toBe(2);
    expect(raw[0]).toBe("sockA");
    expect(Number.isFinite(Number(raw[1]))).toBe(true);
    expect(Number(raw[1])).toBeGreaterThan(0);

    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(EXPECTED_TTL);
    expect(ttl).toBeGreaterThan(EXPECTED_TTL - 5);
  });

  it("markOnline reports wasOnline computed before the write", async () => {
    const store = new RedisPresenceStore(redis, { staleMs: STALE_MS });
    const user = newUser();

    expect((await store.markOnline(user, "s1")).wasOnline).toBe(false);
    expect((await store.markOnline(user, "s2")).wasOnline).toBe(true);
  });

  it("makes presence visible across two server nodes sharing one Redis", async () => {
    const nodeA = new RedisPresenceStore(redis, { staleMs: STALE_MS });
    const nodeB = new RedisPresenceStore(redisB, { staleMs: STALE_MS });
    const user = newUser();

    await nodeA.markOnline(user, "sockA");
    expect(await nodeB.isOnline(user)).toBe(true);

    await nodeB.markOnline(user, "sockB");

    const offA = await nodeA.markOffline(user, "sockA");
    expect(offA.stillOnline).toBe(true);
    expect(await nodeA.isOnline(user)).toBe(true);
    expect(await nodeB.isOnline(user)).toBe(true);

    const offB = await nodeB.markOffline(user, "sockB");
    expect(offB.stillOnline).toBe(false);
    expect(await nodeA.isOnline(user)).toBe(false);
    expect(await nodeB.isOnline(user)).toBe(false);
  });

  it("ages a member out by score once the injected clock passes staleMs", async () => {
    let t = 1_000_000_000;
    const store = new RedisPresenceStore(redis, {
      staleMs: STALE_MS,
      now: () => t,
    });
    const user = newUser();

    await store.markOnline(user, "s1");
    expect(await store.isOnline(user)).toBe(true);

    t += 30_000;
    expect(await store.isOnline(user)).toBe(false);

    await store.refresh(user, "s1");
    expect(await store.isOnline(user)).toBe(true);
  });

  it("treats staleness as score-based even while the key still exists", async () => {
    let t = 2_000_000_000;
    const store = new RedisPresenceStore(redis, {
      staleMs: STALE_MS,
      now: () => t,
    });
    const user = newUser();
    const key = `presence:${user}`;

    await store.markOnline(user, "s1");
    expect(await redis.exists(key)).toBe(1);
    expect(await redis.ttl(key)).toBeGreaterThan(0);

    await redis.persist(key);
    expect(await redis.ttl(key)).toBe(-1);

    t += STALE_MS + 1_000;
    expect(await store.isOnline(user)).toBe(false);
    expect(await redis.exists(key)).toBe(1);
    expect(await redis.zcard(key)).toBe(1);
  });

  it("onlineAmong returns exactly the fresh subset across nodes", async () => {
    let t = 3_000_000_000;
    const clock = () => t;
    const nodeA = new RedisPresenceStore(redis, {
      staleMs: STALE_MS,
      now: clock,
    });
    const nodeB = new RedisPresenceStore(redisB, {
      staleMs: STALE_MS,
      now: clock,
    });

    const freshA = newUser();
    const freshB = newUser();
    const neverOnline = newUser();
    const stale = newUser();
    const freshAgainA = newUser();
    const freshAgainB = newUser();

    await nodeA.markOnline(stale, "ss");
    t += STALE_MS + 5_000;

    await nodeA.markOnline(freshA, "sa1");
    await nodeB.markOnline(freshB, "sb1");
    await nodeA.markOnline(freshAgainA, "sa2");
    await nodeB.markOnline(freshAgainB, "sb2");

    const ids = [freshA, freshB, neverOnline, stale, freshAgainA, freshAgainB];
    const online = await nodeB.onlineAmong(ids);
    expect([...online].sort()).toEqual(
      [freshA, freshB, freshAgainA, freshAgainB].sort(),
    );
  });

  it("tracks many users connecting and disconnecting across two nodes", async () => {
    const nodeA = new RedisPresenceStore(redis, { staleMs: STALE_MS });
    const nodeB = new RedisPresenceStore(redisB, { staleMs: STALE_MS });

    const [u0, u1, u2, u3, u4] = [
      newUser(),
      newUser(),
      newUser(),
      newUser(),
      newUser(),
    ];
    const users = [u0, u1, u2, u3, u4];

    await Promise.all(
      users.map((user, i) => {
        const node = i % 2 === 0 ? nodeA : nodeB;
        return node.markOnline(user, `sock-${i}`);
      }),
    );

    const allOnline = await nodeA.onlineAmong(users);
    expect([...allOnline].sort()).toEqual([...users].sort());

    await nodeA.markOffline(u0, "sock-0");
    await nodeB.markOffline(u1, "sock-1");

    const remaining = await nodeB.onlineAmong(users);
    expect([...remaining].sort()).toEqual([u2, u3, u4].sort());
    expect(remaining.has(u0)).toBe(false);
    expect(remaining.has(u1)).toBe(false);
  });

  it("keeps a user online while any socket remains and clears on the last", async () => {
    const store = new RedisPresenceStore(redis, { staleMs: STALE_MS });
    const user = newUser();

    await store.markOnline(user, "s1");
    await store.markOnline(user, "s2");
    await store.markOnline(user, "s3");
    expect(await store.isOnline(user)).toBe(true);

    expect((await store.markOffline(user, "s1")).stillOnline).toBe(true);
    expect((await store.markOffline(user, "s2")).stillOnline).toBe(true);
    expect((await store.markOffline(user, "s3")).stillOnline).toBe(false);
    expect(await store.isOnline(user)).toBe(false);
  });

  it("markOffline is idempotent and safe for unknown users", async () => {
    const store = new RedisPresenceStore(redis, { staleMs: STALE_MS });
    const user = newUser();
    const key = `presence:${user}`;

    await store.markOnline(user, "s1");
    expect((await store.markOffline(user, "s1")).stillOnline).toBe(false);

    const second = await store.markOffline(user, "s1");
    expect(second.stillOnline).toBe(false);
    expect(await redis.exists(key)).toBe(0);

    const neverOnline = newUser();
    const off = await store.markOffline(neverOnline, "ghost");
    expect(off.stillOnline).toBe(false);
    expect(await redis.exists(`presence:${neverOnline}`)).toBe(0);
  });

  it("onlineAmong handles empty and duplicated id inputs", async () => {
    const store = new RedisPresenceStore(redis, { staleMs: STALE_MS });

    const empty = await store.onlineAmong([]);
    expect(empty.size).toBe(0);

    const user = newUser();
    await store.markOnline(user, "s1");

    const deduped = await store.onlineAmong([user, user]);
    expect([...deduped]).toEqual([user]);
  });

  it("self-heals concurrent multi-node connects and disconnects", async () => {
    const nodeA = new RedisPresenceStore(redis, { staleMs: STALE_MS });
    const nodeB = new RedisPresenceStore(redisB, { staleMs: STALE_MS });
    const user = newUser();
    const key = `presence:${user}`;

    await Promise.all([
      nodeA.markOnline(user, "a"),
      nodeB.markOnline(user, "b"),
    ]);

    expect(await nodeA.isOnline(user)).toBe(true);
    expect(await nodeB.isOnline(user)).toBe(true);
    expect(await redis.zcard(key)).toBe(2);

    await Promise.all([
      nodeA.markOffline(user, "a"),
      nodeB.markOffline(user, "b"),
    ]);

    expect(await nodeA.isOnline(user)).toBe(false);
    expect(await nodeB.isOnline(user)).toBe(false);
    expect(await redis.exists(key)).toBe(0);
  });

  it("ages out a crashed node's socket cluster-wide without markOffline", async () => {
    let t = 4_000_000_000;
    const clock = () => t;
    const nodeA = new RedisPresenceStore(redis, {
      staleMs: STALE_MS,
      now: clock,
    });
    const nodeB = new RedisPresenceStore(redisB, {
      staleMs: STALE_MS,
      now: clock,
    });
    const user = newUser();

    await nodeA.markOnline(user, "a");
    expect(await nodeB.isOnline(user)).toBe(true);

    t += STALE_MS + 5_000;
    expect(await nodeB.isOnline(user)).toBe(false);
  });
});
