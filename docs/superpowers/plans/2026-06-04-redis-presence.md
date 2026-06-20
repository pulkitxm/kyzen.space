# Redis-backed Presence + Durable Last-Seen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Socket.IO presence correct across multiple server nodes by storing live "who's online" in Redis (self-healing via a short heartbeat) and persisting a durable `last_seen_at` to Postgres on a slower cadence.

**Architecture:** A `PresenceStore` interface with two implementations: `RedisPresenceStore` (a per-user sorted set keyed by heartbeat time, so crashed nodes' entries age out of reads) and `InMemoryPresenceStore` (single-node dev, no Redis). Two per-node timers refresh Redis (~10s) and write `last_seen_at` to the DB (~60s). Presence handlers read/write through the store; `last_seen` always comes from the DB.

**Tech Stack:** Bun, TypeScript, Socket.IO v4, `@socket.io/redis-adapter` + `ioredis` (already deps), Drizzle ORM + Postgres, `bun:test`.

---

## File Structure

**Create:**
- `apps/server/src/realtime/redis-client.ts`: lazily-created shared `ioredis` command client (`getRedis()`), separate from the adapter's pub/sub.
- `apps/server/src/realtime/presence-store.ts`: `PresenceStore` interface, `InMemoryPresenceStore`, `RedisPresenceStore`, `createPresenceStore()` factory, and the `presenceStore` singleton.
- `apps/server/src/realtime/presence-heartbeat.ts`: `refreshPresence(io)`, `persistLastSeen(io)`, `startPresenceHeartbeats(io)`.
- `apps/server/tests/presence-store.test.ts`: store unit tests.
- `apps/server/tests/presence.test.ts`: handler transition tests.
- `apps/server/tests/presence-heartbeat.test.ts`: heartbeat tick tests.

**Modify:**
- `apps/server/src/env.ts`: three `PRESENCE_*_MS` vars.
- `turbo.json`: same three vars in `globalEnv`.
- `.env.example`: document them.
- `apps/server/src/db/schema.ts:178`: add `last_seen_at` column to `userProfile`.
- `apps/server/src/db/repositories/profiles.ts`: add `touchLastSeen` + `getLastSeen`.
- `apps/server/src/realtime/presence.ts`: rewrite to use the store + DB last-seen.
- `apps/server/src/realtime/index.ts:31`: start the heartbeats.
- `docs/architecture/realtime.md`: update presence gotcha + scale-out section.
- `docs/architecture/database.md`: note the new column.

---

## Task 1: Presence interval env vars

**Files:**
- Modify: `apps/server/src/env.ts:56`
- Modify: `turbo.json:23`
- Modify: `.env.example:31`

- [ ] **Step 1: Add the three vars to `env.ts`**

In `apps/server/src/env.ts`, replace the line:

```ts
  usernameChangeCooldownDays: number("USERNAME_CHANGE_COOLDOWN_DAYS", 30),
} as const;
```

with:

```ts
  usernameChangeCooldownDays: number("USERNAME_CHANGE_COOLDOWN_DAYS", 30),

  presenceHeartbeatMs: number("PRESENCE_HEARTBEAT_MS", 10000),
  presenceStaleMs: number("PRESENCE_STALE_MS", 25000),
  presenceLastSeenPersistMs: number("PRESENCE_LASTSEEN_PERSIST_MS", 60000),
} as const;
```

- [ ] **Step 2: Add the vars to `turbo.json` `globalEnv`**

In `turbo.json`, replace:

```json
    "NOT_ALLOWED_USERNAMES",
    "USERNAME_CHANGE_COOLDOWN_DAYS"
  ],
```

with:

```json
    "NOT_ALLOWED_USERNAMES",
    "USERNAME_CHANGE_COOLDOWN_DAYS",
    "PRESENCE_HEARTBEAT_MS",
    "PRESENCE_STALE_MS",
    "PRESENCE_LASTSEEN_PERSIST_MS"
  ],
```

- [ ] **Step 3: Document in `.env.example`**

In `.env.example`, after the line `# REDIS_URL=redis://localhost:6379` (line 31), add a blank line then:

```bash
# Presence tuning (optional). Redis heartbeat refresh interval, the staleness
# window after which an un-refreshed socket counts as offline, and how often
# last_seen_at is persisted to Postgres while a user is online.
# PRESENCE_HEARTBEAT_MS=10000
# PRESENCE_STALE_MS=25000
# PRESENCE_LASTSEEN_PERSIST_MS=60000
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/env.ts turbo.json .env.example
git commit -m "feat(server): add presence heartbeat/stale/persist interval env vars"
```

---

## Task 2: DB column + profiles repo functions

**Files:**
- Modify: `apps/server/src/db/schema.ts:178`
- Modify: `apps/server/src/db/repositories/profiles.ts`

- [ ] **Step 1: Add the `last_seen_at` column**

In `apps/server/src/db/schema.ts`, in the `userProfile` table, replace:

```ts
  usernameChangedAt: timestamp("username_changed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
```

with:

```ts
  usernameChangedAt: timestamp("username_changed_at"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
```

- [ ] **Step 2: Add `touchLastSeen` and `getLastSeen` to the profiles repo**

In `apps/server/src/db/repositories/profiles.ts`, add these two functions at the end of the file. They use `db`, `inArray`, and `userProfile`, all already imported at the top:

```ts
export async function touchLastSeen(
  userIds: string[],
  when: Date,
): Promise<void> {
  if (userIds.length === 0) return;
  await db
    .update(userProfile)
    .set({ lastSeenAt: when })
    .where(inArray(userProfile.userId, userIds));
}

export async function getLastSeen(
  userIds: string[],
): Promise<Map<string, Date | null>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: userProfile.userId, lastSeenAt: userProfile.lastSeenAt })
    .from(userProfile)
    .where(inArray(userProfile.userId, userIds));
  return new Map(rows.map((r) => [r.userId, r.lastSeenAt]));
}
```

- [ ] **Step 3: Apply the schema to the local DB**

Run: `bun run db:push`
Expected: drizzle-kit reports adding column `last_seen_at` to `user_profile` and applies it. (This repo's dev DB is push-managed; if your deploy pipeline applies migrations, also run `bun run db:generate` and commit the generated SQL.)

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/src/db/repositories/profiles.ts
git commit -m "feat(server): add user_profile.last_seen_at + touch/get last-seen repo fns"
```

---

## Task 3: Shared Redis command client

**Files:**
- Create: `apps/server/src/realtime/redis-client.ts`

- [ ] **Step 1: Write `getRedis()`**

Create `apps/server/src/realtime/redis-client.ts`:

```ts
import { Redis } from "ioredis";
import { env } from "../env";
import { childLogger } from "../logger";

const log = childLogger({ mod: "realtime:redis-client" });

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!env.redisUrl) {
    throw new Error("getRedis() called without REDIS_URL");
  }
  if (!client) {
    client = new Redis(env.redisUrl);
    client.on("error", (err) => log.error({ err }, "redis client error"));
  }
  return client;
}
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/realtime/redis-client.ts
git commit -m "feat(server): add shared ioredis command client for realtime"
```

---

## Task 4: PresenceStore interface + InMemoryPresenceStore

**Files:**
- Create: `apps/server/src/realtime/presence-store.ts`
- Test: `apps/server/tests/presence-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/presence-store.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { InMemoryPresenceStore } from "../src/realtime/presence-store";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test tests/presence-store.test.ts`
Expected: FAIL - cannot find module `../src/realtime/presence-store` (or `InMemoryPresenceStore` is not exported).

- [ ] **Step 3: Write the interface + in-memory implementation**

Create `apps/server/src/realtime/presence-store.ts`:

```ts
export interface PresenceStore {
  markOnline(userId: string, socketId: string): Promise<{ wasOnline: boolean }>;
  refresh(userId: string, socketId: string): Promise<void>;
  markOffline(
    userId: string,
    socketId: string,
  ): Promise<{ stillOnline: boolean }>;
  isOnline(userId: string): Promise<boolean>;
  onlineAmong(userIds: string[]): Promise<Set<string>>;
}

export class InMemoryPresenceStore implements PresenceStore {
  private readonly sockets = new Map<string, Set<string>>();

  async markOnline(
    userId: string,
    socketId: string,
  ): Promise<{ wasOnline: boolean }> {
    const set = this.sockets.get(userId);
    const wasOnline = (set?.size ?? 0) > 0;
    if (set) {
      set.add(socketId);
    } else {
      this.sockets.set(userId, new Set([socketId]));
    }
    return { wasOnline };
  }

  async refresh(): Promise<void> {}

  async markOffline(
    userId: string,
    socketId: string,
  ): Promise<{ stillOnline: boolean }> {
    const set = this.sockets.get(userId);
    if (!set) return { stillOnline: false };
    set.delete(socketId);
    if (set.size === 0) this.sockets.delete(userId);
    return { stillOnline: set.size > 0 };
  }

  async isOnline(userId: string): Promise<boolean> {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  async onlineAmong(userIds: string[]): Promise<Set<string>> {
    const online = new Set<string>();
    for (const id of userIds) {
      if ((this.sockets.get(id)?.size ?? 0) > 0) online.add(id);
    }
    return online;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bun test tests/presence-store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/realtime/presence-store.ts apps/server/tests/presence-store.test.ts
git commit -m "feat(server): add PresenceStore interface + in-memory implementation"
```

---

## Task 5: RedisPresenceStore

**Files:**
- Modify: `apps/server/src/realtime/presence-store.ts`
- Modify: `apps/server/tests/presence-store.test.ts`

- [ ] **Step 1: Write the failing test (with a fake Redis and a controllable clock)**

In `apps/server/tests/presence-store.test.ts`, add the import at the top:

```ts
import type { Redis } from "ioredis";
import { InMemoryPresenceStore, RedisPresenceStore } from "../src/realtime/presence-store";
```

(Replace the existing single-name import line with the line above.) Then append:

```ts
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
    let now = 5_000_000;
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test tests/presence-store.test.ts`
Expected: FAIL - `RedisPresenceStore` is not exported.

- [ ] **Step 3: Implement `RedisPresenceStore`**

In `apps/server/src/realtime/presence-store.ts`, add the import at the very top of the file:

```ts
import type { Redis } from "ioredis";
```

Then add this class after `InMemoryPresenceStore`:

```ts
type RedisPresenceOptions = { staleMs: number; now?: () => number };

export class RedisPresenceStore implements PresenceStore {
  private readonly client: Redis;
  private readonly staleMs: number;
  private readonly now: () => number;
  private readonly expireSeconds: number;

  constructor(client: Redis, opts: RedisPresenceOptions) {
    this.client = client;
    this.staleMs = opts.staleMs;
    this.now = opts.now ?? (() => Date.now());
    this.expireSeconds = Math.ceil(opts.staleMs / 1000) + 5;
  }

  private key(userId: string): string {
    return `presence:${userId}`;
  }

  private async write(userId: string, socketId: string): Promise<void> {
    const key = this.key(userId);
    await this.client.zadd(key, this.now(), socketId);
    await this.client.expire(key, this.expireSeconds);
  }

  async markOnline(
    userId: string,
    socketId: string,
  ): Promise<{ wasOnline: boolean }> {
    const wasOnline = await this.isOnline(userId);
    await this.write(userId, socketId);
    return { wasOnline };
  }

  async refresh(userId: string, socketId: string): Promise<void> {
    await this.write(userId, socketId);
  }

  async markOffline(
    userId: string,
    socketId: string,
  ): Promise<{ stillOnline: boolean }> {
    await this.client.zrem(this.key(userId), socketId);
    return { stillOnline: await this.isOnline(userId) };
  }

  async isOnline(userId: string): Promise<boolean> {
    const fresh = this.now() - this.staleMs;
    const count = await this.client.zcount(this.key(userId), fresh, "+inf");
    return count > 0;
  }

  async onlineAmong(userIds: string[]): Promise<Set<string>> {
    const online = new Set<string>();
    await Promise.all(
      userIds.map(async (id) => {
        if (await this.isOnline(id)) online.add(id);
      }),
    );
    return online;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bun test tests/presence-store.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 5: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/realtime/presence-store.ts apps/server/tests/presence-store.test.ts
git commit -m "feat(server): add Redis sorted-set PresenceStore with heartbeat staleness"
```

---

## Task 6: Store factory + singleton

**Files:**
- Modify: `apps/server/src/realtime/presence-store.ts`

- [ ] **Step 1: Add the factory and singleton**

At the very top of `apps/server/src/realtime/presence-store.ts`, add to the imports (keep the existing `import type { Redis } from "ioredis";`):

```ts
import { env } from "../env";
import { getRedis } from "./redis-client";
```

At the end of the file, add:

```ts
export function createPresenceStore(): PresenceStore {
  if (!env.redisUrl) return new InMemoryPresenceStore();
  return new RedisPresenceStore(getRedis(), { staleMs: env.presenceStaleMs });
}

export const presenceStore = createPresenceStore();
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 3: Verify the factory picks in-memory without `REDIS_URL`**

Run: `cd apps/server && bun test tests/presence-store.test.ts`
Expected: PASS - importing the module (which now constructs the singleton at load) does not throw. The test env has no `REDIS_URL`, so `createPresenceStore()` returns the in-memory store and `getRedis()` is never called.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/realtime/presence-store.ts
git commit -m "feat(server): add presence store factory + singleton selected by REDIS_URL"
```

---

## Task 7: Rewrite presence handlers to use the store + DB last-seen

**Files:**
- Modify: `apps/server/src/realtime/presence.ts`
- Test: `apps/server/tests/presence.test.ts`

- [ ] **Step 1: Write the failing handler test**

Create `apps/server/tests/presence.test.ts`:

```ts
import { beforeEach, describe, expect, it, mock } from "bun:test";

let onlineSet = new Set<string>();
let markOnlineResult = { wasOnline: false };
let markOfflineResult = { stillOnline: false };
const refreshCalls: Array<[string, string]> = [];

let friendIds: string[] = [];
let convIds: string[] = [];
let memberIds: Record<string, string[]> = {};
let lastSeen = new Map<string, Date | null>();
const touchLastSeenCalls: Array<{ userIds: string[]; when: Date }> = [];

mock.module("../src/realtime/presence-store", () => ({
  presenceStore: {
    markOnline: async () => markOnlineResult,
    markOffline: async () => markOfflineResult,
    refresh: async (userId: string, socketId: string) => {
      refreshCalls.push([userId, socketId]);
    },
    isOnline: async (userId: string) => onlineSet.has(userId),
    onlineAmong: async (ids: string[]) =>
      new Set(ids.filter((id) => onlineSet.has(id))),
  },
}));

mock.module("../src/db", () => ({
  friends: { acceptedFriendIds: async () => friendIds },
  conversations: {
    getConversationIdsForUser: async () => convIds,
    getMemberIds: async (cid: string) => memberIds[cid] ?? [],
  },
  profiles: {
    getLastSeen: async () => lastSeen,
    touchLastSeen: async (userIds: string[], when: Date) => {
      touchLastSeenCalls.push({ userIds, when });
    },
  },
}));

const { handlePresenceConnect, handlePresenceDisconnect } = await import(
  "../src/realtime/presence"
);

type Emit = { room: string; event: string; payload: unknown };

function fakeIo(emits: Emit[]) {
  return {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) =>
        emits.push({ room, event, payload }),
    }),
  } as never;
}

function fakeSocket(userId: string, socketId: string, selfEmits: Emit[]) {
  return {
    id: socketId,
    data: { userId },
    emit: (event: string, payload: unknown) =>
      selfEmits.push({ room: "self", event, payload }),
  } as never;
}

beforeEach(() => {
  onlineSet = new Set();
  markOnlineResult = { wasOnline: false };
  markOfflineResult = { stillOnline: false };
  refreshCalls.length = 0;
  friendIds = [];
  convIds = [];
  memberIds = {};
  lastSeen = new Map();
  touchLastSeenCalls.length = 0;
});

describe("handlePresenceConnect", () => {
  it("sends a snapshot and broadcasts online to the audience when newly online", async () => {
    friendIds = ["friendA"];
    onlineSet = new Set(["me"]);
    lastSeen = new Map([["friendA", new Date("2026-06-01T00:00:00.000Z")]]);

    const ioEmits: Emit[] = [];
    const selfEmits: Emit[] = [];
    await handlePresenceConnect(
      fakeIo(ioEmits),
      fakeSocket("me", "s1", selfEmits),
    );

    const snapshot = selfEmits.find((e) => e.event === "presence_snapshot");
    expect(snapshot).toBeDefined();
    expect((snapshot?.payload as { entries: unknown[] }).entries).toEqual([
      {
        userId: "friendA",
        status: "offline",
        lastSeen: "2026-06-01T00:00:00.000Z",
      },
    ]);

    const update = ioEmits.find((e) => e.event === "presence_update");
    expect(update?.room).toBe("user:friendA");
    expect(update?.payload).toEqual({
      userId: "me",
      status: "online",
      lastSeen: null,
    });
  });

  it("does not broadcast online when the user was already online", async () => {
    friendIds = ["friendA"];
    markOnlineResult = { wasOnline: true };

    const ioEmits: Emit[] = [];
    const selfEmits: Emit[] = [];
    await handlePresenceConnect(
      fakeIo(ioEmits),
      fakeSocket("me", "s2", selfEmits),
    );

    expect(ioEmits.find((e) => e.event === "presence_update")).toBeUndefined();
  });
});

describe("handlePresenceDisconnect", () => {
  it("persists last-seen and broadcasts offline when the last socket leaves", async () => {
    friendIds = ["friendA"];
    markOfflineResult = { stillOnline: false };

    const ioEmits: Emit[] = [];
    await handlePresenceDisconnect(
      fakeIo(ioEmits),
      fakeSocket("me", "s1", []),
    );

    expect(touchLastSeenCalls).toHaveLength(1);
    expect(touchLastSeenCalls[0]?.userIds).toEqual(["me"]);

    const update = ioEmits.find((e) => e.event === "presence_update");
    expect(update?.room).toBe("user:friendA");
    const payload = update?.payload as { status: string; lastSeen: string | null };
    expect(payload.status).toBe("offline");
    expect(typeof payload.lastSeen).toBe("string");
  });

  it("does nothing when other sockets remain online", async () => {
    friendIds = ["friendA"];
    markOfflineResult = { stillOnline: true };

    const ioEmits: Emit[] = [];
    await handlePresenceDisconnect(
      fakeIo(ioEmits),
      fakeSocket("me", "s1", []),
    );

    expect(touchLastSeenCalls).toHaveLength(0);
    expect(ioEmits).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test tests/presence.test.ts`
Expected: FAIL - the current `presence.ts` still uses the in-memory map, so `presence_update` payloads include the wrong shape / `touchLastSeen` is never called.

- [ ] **Step 3: Rewrite `presence.ts`**

Replace the entire contents of `apps/server/src/realtime/presence.ts` with:

```ts
import { CHAT_EVENTS, type PresenceStatus } from "@kyzen/chat-core";
import type { Server as IOServer, Socket } from "socket.io";
import { conversations, friends, profiles } from "../db";
import { childLogger } from "../logger";
import { presenceStore } from "./presence-store";
import { emitToUser } from "./rooms";

const log = childLogger({ mod: "realtime:presence" });

type PresenceEntry = {
  userId: string;
  status: PresenceStatus;
  lastSeen: string | null;
};

export function isOnline(userId: string): Promise<boolean> {
  return presenceStore.isOnline(userId);
}

async function audienceFor(userId: string): Promise<string[]> {
  const audience = new Set<string>();
  const [friendIds, convIds] = await Promise.all([
    friends.acceptedFriendIds(userId),
    conversations.getConversationIdsForUser(userId),
  ]);
  for (const id of friendIds) audience.add(id);
  for (const cid of convIds) {
    const ids = await conversations.getMemberIds(cid);
    for (const id of ids) audience.add(id);
  }
  audience.delete(userId);
  return [...audience];
}

export async function handlePresenceConnect(
  io: IOServer,
  socket: Socket,
): Promise<void> {
  const userId = socket.data.userId;
  const { wasOnline } = await presenceStore.markOnline(userId, socket.id);
  const audience = await audienceFor(userId);

  const onlineSet = await presenceStore.onlineAmong(audience);
  const offlineIds = audience.filter((id) => !onlineSet.has(id));
  const lastSeen = await profiles.getLastSeen(offlineIds);
  const entries: PresenceEntry[] = audience.map((id): PresenceEntry =>
    onlineSet.has(id)
      ? { userId: id, status: "online", lastSeen: null }
      : {
          userId: id,
          status: "offline",
          lastSeen: lastSeen.get(id)?.toISOString() ?? null,
        },
  );
  socket.emit(CHAT_EVENTS.presenceSnapshot, { entries });

  if (!wasOnline) {
    const mine: PresenceEntry = { userId, status: "online", lastSeen: null };
    for (const uid of audience) {
      emitToUser(io, uid, CHAT_EVENTS.presenceUpdate, mine);
    }
  }
}

export async function handlePresenceDisconnect(
  io: IOServer,
  socket: Socket,
): Promise<void> {
  const userId = socket.data.userId;
  const { stillOnline } = await presenceStore.markOffline(userId, socket.id);
  if (stillOnline) return;

  const now = new Date();
  try {
    await profiles.touchLastSeen([userId], now);
  } catch (err) {
    log.error({ err, userId }, "touchLastSeen failed");
  }

  const audience = await audienceFor(userId);
  const mine: PresenceEntry = {
    userId,
    status: "offline",
    lastSeen: now.toISOString(),
  };
  for (const uid of audience) {
    emitToUser(io, uid, CHAT_EVENTS.presenceUpdate, mine);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bun test tests/presence.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/realtime/presence.ts apps/server/tests/presence.test.ts
git commit -m "feat(server): back presence with PresenceStore + durable last-seen"
```

---

## Task 8: Heartbeat timers + wire into attachRealtime

**Files:**
- Create: `apps/server/src/realtime/presence-heartbeat.ts`
- Test: `apps/server/tests/presence-heartbeat.test.ts`
- Modify: `apps/server/src/realtime/index.ts:31`

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/presence-heartbeat.test.ts`:

```ts
import { beforeEach, describe, expect, it, mock } from "bun:test";

const refreshCalls: Array<[string, string]> = [];
const touchLastSeenCalls: Array<{ userIds: string[]; when: Date }> = [];

mock.module("../src/realtime/presence-store", () => ({
  presenceStore: {
    refresh: async (userId: string, socketId: string) => {
      refreshCalls.push([userId, socketId]);
    },
  },
}));

mock.module("../src/db", () => ({
  profiles: {
    touchLastSeen: async (userIds: string[], when: Date) => {
      touchLastSeenCalls.push({ userIds, when });
    },
  },
}));

const { refreshPresence, persistLastSeen } = await import(
  "../src/realtime/presence-heartbeat"
);

function fakeIo(sockets: Array<{ id: string; userId?: string }>) {
  const map = new Map(
    sockets.map((s) => [s.id, { id: s.id, data: { userId: s.userId } }]),
  );
  return { sockets: { sockets: map } } as never;
}

beforeEach(() => {
  refreshCalls.length = 0;
  touchLastSeenCalls.length = 0;
});

describe("refreshPresence", () => {
  it("refreshes every local socket that has a userId", async () => {
    await refreshPresence(
      fakeIo([
        { id: "s1", userId: "u1" },
        { id: "s2", userId: "u2" },
        { id: "s3" },
      ]),
    );
    expect(refreshCalls.sort()).toEqual([
      ["u1", "s1"],
      ["u2", "s2"],
    ]);
  });
});

describe("persistLastSeen", () => {
  it("writes one batched touchLastSeen with distinct userIds", async () => {
    await persistLastSeen(
      fakeIo([
        { id: "s1", userId: "u1" },
        { id: "s2", userId: "u1" },
        { id: "s3", userId: "u2" },
      ]),
    );
    expect(touchLastSeenCalls).toHaveLength(1);
    expect(touchLastSeenCalls[0]?.userIds.sort()).toEqual(["u1", "u2"]);
  });

  it("does not write when no sockets are connected", async () => {
    await persistLastSeen(fakeIo([]));
    expect(touchLastSeenCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test tests/presence-heartbeat.test.ts`
Expected: FAIL - cannot find module `../src/realtime/presence-heartbeat`.

- [ ] **Step 3: Implement the heartbeat module**

Create `apps/server/src/realtime/presence-heartbeat.ts`:

```ts
import type { Server as IOServer } from "socket.io";
import { profiles } from "../db";
import { env } from "../env";
import { childLogger } from "../logger";
import { presenceStore } from "./presence-store";

const log = childLogger({ mod: "realtime:presence-heartbeat" });

function localUserSockets(io: IOServer): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [, socket] of io.sockets.sockets) {
    const userId = socket.data.userId as string | undefined;
    if (userId) pairs.push([userId, socket.id]);
  }
  return pairs;
}

export async function refreshPresence(io: IOServer): Promise<void> {
  const pairs = localUserSockets(io);
  await Promise.allSettled(
    pairs.map(([userId, socketId]) => presenceStore.refresh(userId, socketId)),
  );
}

export async function persistLastSeen(io: IOServer): Promise<void> {
  const userIds = new Set<string>();
  for (const [userId] of localUserSockets(io)) userIds.add(userId);
  if (userIds.size === 0) return;
  await profiles.touchLastSeen([...userIds], new Date());
}

export function startPresenceHeartbeats(io: IOServer): () => void {
  const refreshTimer = setInterval(() => {
    refreshPresence(io).catch((err) =>
      log.error({ err }, "presence refresh tick failed"),
    );
  }, env.presenceHeartbeatMs);

  const persistTimer = setInterval(() => {
    persistLastSeen(io).catch((err) =>
      log.error({ err }, "last-seen persist tick failed"),
    );
  }, env.presenceLastSeenPersistMs);

  refreshTimer.unref?.();
  persistTimer.unref?.();

  return () => {
    clearInterval(refreshTimer);
    clearInterval(persistTimer);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bun test tests/presence-heartbeat.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Start the heartbeats in `attachRealtime`**

In `apps/server/src/realtime/index.ts`, add the import alongside the other realtime imports (after the `./presence` import line):

```ts
import { startPresenceHeartbeats } from "./presence-heartbeat";
```

Then, in `attachRealtime`, replace:

```ts
  attachRedisAdapter(io);
  setIO(io);
```

with:

```ts
  attachRedisAdapter(io);
  setIO(io);
  startPresenceHeartbeats(io);
```

- [ ] **Step 6: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/realtime/presence-heartbeat.ts apps/server/tests/presence-heartbeat.test.ts apps/server/src/realtime/index.ts
git commit -m "feat(server): per-node presence heartbeat + last-seen persist timers"
```

---

## Task 9: Update docs

**Files:**
- Modify: `docs/architecture/realtime.md:431`
- Modify: `docs/architecture/realtime.md` (Scale-out section)
- Modify: `docs/architecture/database.md`

- [ ] **Step 1: Update the presence gotcha**

In `docs/architecture/realtime.md`, replace the bullet:

```markdown
- **Typing and presence are in-process maps, not DB-backed.** They are also not Redis-aware: the maps in `typing.ts:8` and `presence.ts:8` are per-node, so a multi-node deployment would compute presence/typing per node. Treat them as best-effort, single-node-accurate signals.
```

with:

```markdown
- **Presence is Redis-backed; typing is still an in-process map.** Presence reads/writes go through a `PresenceStore` (`presence-store.ts`): a Redis sorted set per user (`presence:<userId>`, scored by heartbeat time) when `REDIS_URL` is set, or an in-process map for single-node dev. A per-node timer refreshes the live entries every `PRESENCE_HEARTBEAT_MS`, so a crashed node's users age out of reads within `PRESENCE_STALE_MS`. Durable last-seen lives in `user_profile.last_seen_at`, written on graceful disconnect and on a slower `PRESENCE_LASTSEEN_PERSIST_MS` timer while online. The live "went offline" push on a hard crash is not yet implemented (online reads still self-correct within the stale window). Typing (`typing.ts:8`) is still a per-node in-process map - treat it as best-effort, single-node-accurate.
```

- [ ] **Step 2: Extend the Scale-out section**

In `docs/architecture/realtime.md`, in the "Scale-out via Redis" section, after the paragraph that begins with `**Redis is a shared dependency, not a store.**`, add:

```markdown
**Presence uses Redis directly, not just the adapter.** Beyond broadcast fan-out, the `PresenceStore` (`presence-store.ts`) keeps a per-user sorted set of live socket heartbeats in Redis so "who's online" is correct cluster-wide and self-heals when a node dies. It uses a dedicated command client (`getRedis()` in `redis-client.ts`), separate from the adapter's pub/sub connections. With no `REDIS_URL`, presence falls back to an in-process map and stays single-node.
```

- [ ] **Step 3: Note the new column in the database doc**

In `docs/architecture/database.md`, find the `user_profile` table description and add a line noting the new column. Add this sentence to that table's description:

```markdown
`last_seen_at` (nullable timestamp) records when the user was last online - written on graceful disconnect and periodically while connected by the realtime presence heartbeat; see [realtime.md](./realtime.md).
```

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/realtime.md docs/architecture/database.md
git commit -m "docs: document Redis-backed presence + user_profile.last_seen_at"
```

---

## Final Verification

- [ ] **Step 1: Full type-check**

Run: `bun run type-check`
Expected: PASS across all workspaces.

- [ ] **Step 2: Full server test suite**

Run: `cd apps/server && bun test`
Expected: PASS, including `presence-store.test.ts`, `presence.test.ts`, `presence-heartbeat.test.ts`.

- [ ] **Step 3: Lint/format gate**

Run: `bun run check`
Expected: PASS (no formatting/lint/import-order violations). If it reports fixable issues, run `bun run fix` and re-run `bun run check`, then amend the last commit.

- [ ] **Step 4: Manual multi-node smoke (optional, needs Redis)**

With `REDIS_URL` set, run two server instances on different ports sharing one Redis, connect a client to each, and confirm: a user connected to node A shows online in node B's presence snapshot; killing node A drops that user to offline within ~`PRESENCE_STALE_MS`; and `user_profile.last_seen_at` reflects roughly the disconnect time.

---

## Self-Review

**Spec coverage:**
- Shared cluster-wide "who's online" via Redis → Tasks 4–6 (`RedisPresenceStore`), Task 7 (handlers read through it). ✓
- Self-heals on crash → Task 5 (stale-scored members excluded from `zcount`) + Task 8 (heartbeat refresh). ✓
- Durable `last_seen_at` in Postgres → Task 2 (column + repo), Task 7 (disconnect write), Task 8 (periodic write). ✓
- Single-node dev keeps working → Task 4 (`InMemoryPresenceStore`), Task 6 (factory falls back when no `REDIS_URL`). ✓
- Two decoupled cadences → Task 1 (env vars), Task 8 (two timers). ✓
- Deferred sweeper / no live crash push → documented as not-implemented in Task 9; out of scope here. ✓
- **Deviation from spec:** the spec mentioned optionally adding `last_seen_at` to `PUBLIC_USER_COLUMNS`/`PublicUserRow`; this plan instead uses a focused `getLastSeen` repo function and leaves `PublicUserRow` untouched, to minimize blast radius on existing `getPublicUsers` consumers. Behavior is identical.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the only "find the section" instruction (database.md) is paired with the exact sentence to insert.

**Type consistency:** `PresenceStore` method names/signatures are identical across the interface (Task 4), both implementations (Tasks 4–5), the factory (Task 6), the handlers (Task 7), and the heartbeat (Task 8). `touchLastSeen(userIds, when)` and `getLastSeen(userIds) → Map<string, Date | null>` match between Task 2 and Tasks 7–8. The `PresenceEntry` shape (`userId`/`status`/`lastSeen`) matches the `ServerPresenceUpdate` wire type in `chat-core`.
