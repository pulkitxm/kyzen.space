# Matchmaking (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any connected user (logged-in or guest) click "Find a match", land in a per-game FIFO queue, and be paired with the next waiting player into the *exact* conversation + game a friend-challenge produces - no new game route, endpoint, DB table, or driver.

**Architecture:** A `MatchmakingStore` mirrors the presence-store pattern: one interface, a Redis implementation (one sorted set per `gameType`, key `mm:queue:<gameType>`, member `userId`, score = enqueue `Date.now()`), an in-memory fallback, and a factory keyed on `REDIS_URL`. The Redis impl pairs with an **atomic Lua `pairAndPop`** (`ZRANGE 0 1 WITHSCORES` then `ZREM` in one `EVAL` round-trip) so two server nodes can never double-match the same pair. New socket handlers `game:queue_join` / `game:queue_leave` are registered in `realtime/index.ts` next to the game lane; on each successful `pairAndPop([a, b])` the pairing function verifies both are still online (`presenceStore.onlineAmong`), `getOrCreateDm(a, b)`, `createGameInConversation({ userId: a, conversationId, gameType, seatingMode: "challenge", challengedUserId: b, config })`, and `emitToUser(match_found, { gameId })` to both. (Because the pair always shares a *DM* conversation, `createGameInConversation` coerces `seatingMode` to `"open"` and `challengedUserId` to `null` for the persisted game - exactly like the existing friend-challenge-in-a-DM path; the `"challenge"` arguments are forwarded for parity but only take effect in group conversations.) Disconnect removes the user from every queue. The web lobby gains a "Find a match" button that calls `ensureIdentity()` (Phase 0), emits `queue_join`, shows a Searching/Cancel state backed by a `matchmakingAtom`, and on `match_found` navigates to `/play/<gameId>`.

**Tech Stack:** TypeScript, Socket.IO on Bun, `ioredis` (`EVAL` Lua), Drizzle/Postgres (only through `@kyzen/database` repositories), Zod schemas in `@kyzen/shared`, Next.js 16 App Router + Jotai + react-icons, Bun test (`mock.module`).

**Scope note:** This phase delivers the matchmaking queue, the pairing service, the two socket events + `match_found`, and the lobby UI. It depends on Phase 0 (`ensureIdentity()` in `apps/web/lib/auth/ensure-identity.ts`, the `anonymousClient` plugin, and the `isAnonymous` session flag) and is independent of Phase 1 (merge) and Phase 3 (invites). `match_found` is a transient socket event, **not** a persisted notification, so no `NotificationType` change is in scope. No new DB table is introduced - the queue lives entirely in Redis (or process memory in dev), so there is **no `drift-guard` / `schema.ts` change** in this phase. No new top-level web route is added, so `RESERVED_USERNAMES` is unchanged. The `game:queue_*` event names live on raw socket events (the game lane already uses raw `join_room` / `make_move`, not `CHAT_EVENTS`), so no `CHAT_EVENTS` constant is added.

**Prerequisite:** Phase 0 must be merged (provides `ensureIdentity()` and `authClient` with `anonymousClient`). The unit tests use a `FakeRedis` and an in-memory store - **no real Redis needed**. The one integration test (Task 9) needs Postgres: run `bun run db:start` before `cd apps/server && bun run test:integration`.

---

## File Structure

- `packages/shared/src/types/games/wire.ts` - add `clientQueueJoinSchema`, `clientQueueLeaveSchema`, their inferred types `ClientQueueJoin` / `ClientQueueLeave`, and the `ServerMatchFoundPayload` type (modify).
- `packages/shared/src/types/games/index.ts` - re-export the new schemas/types from `./wire` (modify).
- `apps/server/src/realtime/matchmaking-store.ts` - `MatchmakingStore` interface + `InMemoryMatchmakingStore` + `RedisMatchmakingStore` (atomic Lua `pairAndPop`) + `createMatchmakingStore()` factory and the `matchmakingStore` singleton (create).
- `apps/server/src/realtime/matchmaking.ts` - `runPairing(...)` pure pairing function, `handleQueueJoin` / `handleQueueLeave`, `attachMatchmakingHandlers(io, socket)`, and `dequeueUserFromAllQueues(userId)` (create).
- `apps/server/src/realtime/index.ts` - call `attachMatchmakingHandlers(io, socket)` per connection and `dequeueUserFromAllQueues` on disconnect (modify).
- `apps/web/lib/matchmaking-atoms.ts` - `matchmakingAtom` holding the searching state per gameType (create).
- `apps/web/app/games/_shared/game-lobby.tsx` - "Find a match" button + Searching/Cancel UI + `match_found` listener → navigate (modify).
- Tests:
  - `apps/server/tests/matchmaking-store.test.ts` - `pairAndPop` atomicity over `FakeRedis`, in-memory store behavior (create).
  - `apps/server/tests/matchmaking.test.ts` - `runPairing` creates DM + game + emits `match_found` to both; self-match guard; liveness requeue; config forwarding; game-creation-failure (create).
  - `apps/server/tests/matchmaking-dequeue.test.ts` - `dequeueUserFromAllQueues` (disconnect drain) + single-queue `handleQueueLeave` against a mocked in-memory store (create).
  - `apps/server/integration/matchmaking-flow.test.ts` - DB-backed: two enqueued users produce one game with both seated (create).

---

## Task 1: Add matchmaking socket payload schemas to `@kyzen/shared`

Per repo rules every socket payload schema lives in `@kyzen/shared/types`, never inline in the server. The game lane validates `clientJoinRoomSchema` / `clientMakeMoveSchema` from `wire.ts`; the matchmaking schemas join them there. `gameTypeSchema` (a `z.enum(GAME_TYPES)`) already rejects unknown game types at parse time, which satisfies the "validate gameType against the registry" security requirement at the wire boundary.

**Files:**
- Modify: `packages/shared/src/types/games/wire.ts:35-41`
- Modify: `packages/shared/src/types/games/index.ts:48-69`
- Test: `packages/shared/tests/matchmaking-schemas.test.ts` (create)

- [ ] **Step 1: Write the failing schema test**

Create `packages/shared/tests/matchmaking-schemas.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import {
  clientQueueJoinSchema,
  clientQueueLeaveSchema,
} from "@kyzen/shared/types";

describe("clientQueueJoinSchema", () => {
  it("accepts a known game type with no config", () => {
    const parsed = clientQueueJoinSchema.safeParse({ gameType: TIC_TAC_TOE });
    expect(parsed.success).toBe(true);
  });

  it("accepts a known game type with a config object", () => {
    const parsed = clientQueueJoinSchema.safeParse({
      gameType: TIC_TAC_TOE,
      config: { firstMove: "X" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown game type", () => {
    const parsed = clientQueueJoinSchema.safeParse({ gameType: "chess" });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown extra keys", () => {
    const parsed = clientQueueJoinSchema.safeParse({
      gameType: TIC_TAC_TOE,
      sneaky: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("clientQueueLeaveSchema", () => {
  it("accepts a known game type", () => {
    const parsed = clientQueueLeaveSchema.safeParse({ gameType: TIC_TAC_TOE });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown game type", () => {
    const parsed = clientQueueLeaveSchema.safeParse({ gameType: "go" });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/shared && bun test tests/matchmaking-schemas.test.ts`
Expected: FAIL - `clientQueueJoinSchema` / `clientQueueLeaveSchema` are not exported from `@kyzen/shared/types`.

- [ ] **Step 3: Add the schemas to `wire.ts`**

In `packages/shared/src/types/games/wire.ts`, add the following immediately after the `clientMakeMoveSchema` block (after line 41):

```ts
export const clientQueueJoinSchema = z
  .object({
    gameType: gameTypeSchema,
    config: z.unknown().optional(),
  })
  .strict();
export type ClientQueueJoin = z.infer<typeof clientQueueJoinSchema>;

export const clientQueueLeaveSchema = z
  .object({
    gameType: gameTypeSchema,
  })
  .strict();
export type ClientQueueLeave = z.infer<typeof clientQueueLeaveSchema>;

export type ServerMatchFoundPayload = {
  gameId: string;
};
```

- [ ] **Step 4: Re-export from the games barrel**

In `packages/shared/src/types/games/index.ts`, extend the `from "./wire"` export block (lines 48-69) so it also exports the new symbols. Replace the existing block with:

```ts
export {
  type ClientJoinRoom,
  type ClientMakeMove,
  type ClientQueueJoin,
  type ClientQueueLeave,
  clientJoinRoomSchema,
  clientMakeMoveSchema,
  clientQueueJoinSchema,
  clientQueueLeaveSchema,
  type GameJson,
  type GamePlayerDto,
  type GameStatusDto,
  gameJsonSchema,
  gamePlayerSchema,
  gameStatusSchema,
  isGameLive,
  isGameOver,
  type MoveJson,
  moveJsonSchema,
  resolveWinnerUsername,
  type SeatingModeDto,
  type ServerErrorPayload,
  type ServerGameOverPayload,
  type ServerGameStatePayload,
  type ServerMatchFoundPayload,
  seatingModeSchema,
} from "./wire";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/shared && bun test tests/matchmaking-schemas.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/games/wire.ts packages/shared/src/types/games/index.ts packages/shared/tests/matchmaking-schemas.test.ts
git commit -m "feat(shared): add queue_join/queue_leave socket payload schemas"
```

---

## Task 2: The in-memory matchmaking store (interface + FIFO behavior)

Mirror `presence-store.ts` / `presence-store-instance.ts`: a `MatchmakingStore` interface, an `InMemoryMatchmakingStore` for local/dev, a `RedisMatchmakingStore` (Task 3), and a factory keyed on `REDIS_URL`. This task lands the interface and the in-memory implementation first so the pairing logic can be unit-tested without Redis. The store stores **only the `userId`** as a queue member (no PII), and `enqueue` is idempotent per `(gameType, userId)` so a user can be in at most one queue per gameType.

**Files:**
- Create: `apps/server/src/realtime/matchmaking-store.ts`
- Test: `apps/server/tests/matchmaking-store.test.ts` (create; in-memory portion only this task - the FakeRedis portion lands in Task 3)

- [ ] **Step 1: Write the failing in-memory store test**

Create `apps/server/tests/matchmaking-store.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { InMemoryMatchmakingStore } from "../src/realtime/matchmaking-store";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/server && bun test tests/matchmaking-store.test.ts`
Expected: FAIL - module `../src/realtime/matchmaking-store` does not exist.

- [ ] **Step 3: Implement the interface, the in-memory store, and the factory**

Create `apps/server/src/realtime/matchmaking-store.ts`:

```ts
import type { Redis } from "ioredis";
import { env } from "../env";
import { getRedis } from "./redis-client";

export interface MatchmakingStore {
  enqueue(gameType: string, userId: string, score: number): Promise<void>;
  remove(gameType: string, userId: string): Promise<void>;
  removeFromAll(userId: string): Promise<void>;
  pairAndPop(gameType: string): Promise<[string, string] | null>;
  members(gameType: string): Promise<string[]>;
  size(gameType: string): Promise<number>;
}

export class InMemoryMatchmakingStore implements MatchmakingStore {
  private readonly queues = new Map<string, Map<string, number>>();

  private queue(gameType: string): Map<string, number> {
    let q = this.queues.get(gameType);
    if (!q) {
      q = new Map<string, number>();
      this.queues.set(gameType, q);
    }
    return q;
  }

  async enqueue(
    gameType: string,
    userId: string,
    score: number,
  ): Promise<void> {
    const q = this.queue(gameType);
    if (!q.has(userId)) q.set(userId, score);
  }

  async remove(gameType: string, userId: string): Promise<void> {
    this.queues.get(gameType)?.delete(userId);
  }

  async removeFromAll(userId: string): Promise<void> {
    for (const q of this.queues.values()) q.delete(userId);
  }

  private ordered(gameType: string): string[] {
    const q = this.queues.get(gameType);
    if (!q) return [];
    return [...q.entries()]
      .sort((x, y) => x[1] - y[1])
      .map(([userId]) => userId);
  }

  async pairAndPop(gameType: string): Promise<[string, string] | null> {
    const order = this.ordered(gameType);
    if (order.length < 2) return null;
    const [a, b] = order;
    if (!a || !b) return null;
    const q = this.queues.get(gameType);
    q?.delete(a);
    q?.delete(b);
    return [a, b];
  }

  async members(gameType: string): Promise<string[]> {
    return this.ordered(gameType);
  }

  async size(gameType: string): Promise<number> {
    return this.queues.get(gameType)?.size ?? 0;
  }
}

const PAIR_AND_POP_LUA = `
local key = KEYS[1]
local pair = redis.call('ZRANGE', key, 0, 1)
if #pair < 2 then
  return {}
end
redis.call('ZREM', key, pair[1], pair[2])
return pair
`;

const ALL_QUEUES_KEY = "mm:queues";

export function queueKey(gameType: string): string {
  return `mm:queue:${gameType}`;
}

export class RedisMatchmakingStore implements MatchmakingStore {
  private readonly client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  async enqueue(
    gameType: string,
    userId: string,
    score: number,
  ): Promise<void> {
    await this.client.zadd(queueKey(gameType), "NX", score, userId);
    await this.client.sadd(ALL_QUEUES_KEY, gameType);
  }

  async remove(gameType: string, userId: string): Promise<void> {
    await this.client.zrem(queueKey(gameType), userId);
  }

  async removeFromAll(userId: string): Promise<void> {
    const gameTypes = await this.client.smembers(ALL_QUEUES_KEY);
    await Promise.all(
      gameTypes.map((gameType) =>
        this.client.zrem(queueKey(gameType), userId),
      ),
    );
  }

  async pairAndPop(gameType: string): Promise<[string, string] | null> {
    const result = (await this.client.eval(
      PAIR_AND_POP_LUA,
      1,
      queueKey(gameType),
    )) as string[];
    if (!Array.isArray(result) || result.length < 2) return null;
    const [a, b] = result;
    if (!a || !b) return null;
    return [a, b];
  }

  async members(gameType: string): Promise<string[]> {
    return this.client.zrange(queueKey(gameType), 0, -1);
  }

  async size(gameType: string): Promise<number> {
    return this.client.zcard(queueKey(gameType));
  }
}

function create(): MatchmakingStore {
  if (!env.redisUrl) return new InMemoryMatchmakingStore();
  return new RedisMatchmakingStore(getRedis());
}

export const matchmakingStore: MatchmakingStore = create();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/server && bun test tests/matchmaking-store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/realtime/matchmaking-store.ts apps/server/tests/matchmaking-store.test.ts
git commit -m "feat(server): add matchmaking queue store (interface + in-memory)"
```

---

## Task 3: Atomic `pairAndPop` over Redis (FakeRedis test)

The Redis implementation already exists from Task 2; this task proves the **atomicity contract** - `pairAndPop` pops exactly the two oldest members in a single round-trip and removes them - against a `FakeRedis` that records the EVAL call. The fake models the sorted set as a `Map<member, score>` and executes the same `ZRANGE 0 1` + `ZREM` logic the Lua script does, so the test asserts the Lua contract (oldest-two, atomic removal, no double-match) without a real Redis. This mirrors the `FakeRedis` pattern already used in `apps/server/tests/presence-store.test.ts`.

**Files:**
- Modify: `apps/server/tests/matchmaking-store.test.ts` (add the FakeRedis suite + the imports it needs)

- [ ] **Step 1: Add the `Redis` + `RedisMatchmakingStore` imports to the existing top import block**

Biome's `organizeImports` (the `bun run check` gate) requires all imports at the top of the file, sorted - do **not** add imports mid-file. Replace the top import block written in Task 2:

```ts
import { describe, expect, it } from "bun:test";
import { InMemoryMatchmakingStore } from "../src/realtime/matchmaking-store";
```

with:

```ts
import { describe, expect, it } from "bun:test";
import type { Redis } from "ioredis";
import {
  InMemoryMatchmakingStore,
  RedisMatchmakingStore,
} from "../src/realtime/matchmaking-store";
```

- [ ] **Step 2: Append the failing FakeRedis suite**

Append the following `FakeRedis` class + `describe("RedisMatchmakingStore", ...)` block to the end of `apps/server/tests/matchmaking-store.test.ts` (no `import` lines here - they were hoisted in Step 1):

```ts
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
    const pair = await this.zrange(key, 0, 1);
    if (pair.length < 2) return [];
    await this.zrem(key, pair[0] as string, pair[1] as string);
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
```

- [ ] **Step 3: Run the test to verify the new suite passes**

Run: `cd apps/server && bun test tests/matchmaking-store.test.ts`
Expected: PASS (in-memory suite from Task 2 + the 6 new RedisMatchmakingStore tests).

Note: the single-thread `Promise.all` test passes because Bun runs the two `pairAndPop` calls' `eval` bodies to completion sequentially; the test documents the contract that the Lua `ZRANGE`+`ZREM` is one atomic round-trip so a concurrent caller sees an empty queue.

- [ ] **Step 4: Verify the import sort gate stays green**

Run: `bun run check`
Expected: PASS (the imports were hoisted in Step 1, so Biome's `organizeImports` has nothing to reorder).

- [ ] **Step 5: Commit**

```bash
git add apps/server/tests/matchmaking-store.test.ts
git commit -m "test(server): cover atomic pairAndPop over a FakeRedis"
```

---

## Task 4: Pairing service `runPairing` (creates DM + game, emits to both)

`runPairing` is the pure, dependency-injected core of matchmaking: given a popped `[a, b]`, it guards self-match and online liveness, then reuses `getOrCreateDm` + `createGameInConversation` (the exact friend-challenge path) and emits `match_found` to both via `emitToUser`. Injecting deps keeps it unit-testable with `mock.module` of the complete `@kyzen/database` barrel and the presence store. Defaults wire the real `conversations.getOrCreateDm`, the real `createGameInConversation` service, `presenceStore`, and `emitToUser`.

`runPairing` forwards `seatingMode: "challenge"` and `challengedUserId: b` to `createGameInConversation` for parity with the friend-challenge call shape, but note that for the DM conversation `getOrCreateDm` returns, the service coerces those to `seatingMode: "open"` / `challengedUserId: null` (`games-in-chat-service.ts:96-115`). The unit test below mocks `createGameInConversation`, so it asserts the *forwarded* call args (`"challenge"` / `"b"`); the DB-backed Task 9 test asserts the *persisted* coerced values (`"open"` / `null`).

**Files:**
- Create: `apps/server/src/realtime/matchmaking.ts`
- Test: `apps/server/tests/matchmaking.test.ts` (create)

- [ ] **Step 1: Write the failing pairing test**

Create `apps/server/tests/matchmaking.test.ts`:

```ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";

type CreateGameInput = {
  userId: string;
  conversationId: string;
  gameType: string;
  seatingMode?: string;
  challengedUserId?: string | null;
  config?: unknown;
};

let onlineSet = new Set<string>(["a", "b"]);
let getOrCreateDmCalls: Array<[string, string]> = [];
let createGameCalls: CreateGameInput[] = [];
let createGameResult: { ok: boolean; value?: unknown; error?: string } = {
  ok: true,
  value: { game: { id: "GAMECODE" } },
};
const emitted: Array<{ userId: string; event: string; payload: unknown }> = [];
const requeued: Array<{ gameType: string; userId: string }> = [];

mock.module("@kyzen/database", () => ({
  conversations: {
    getOrCreateDm: async (a: string, b: string) => {
      getOrCreateDmCalls.push([a, b]);
      return { conversation: { id: "conv-1" }, created: true };
    },
  },
  games: {},
  profiles: {},
  messages: {},
  friends: {},
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

mock.module("../src/chat/games-in-chat-service", () => ({
  createGameInConversation: async (input: CreateGameInput) => {
    createGameCalls.push(input);
    return createGameResult;
  },
}));

const { runPairing } = await import("../src/realtime/matchmaking");

function deps() {
  return {
    onlineAmong: async (ids: string[]) =>
      new Set(ids.filter((id) => onlineSet.has(id))),
    emitMatch: (userId: string, gameId: string) =>
      emitted.push({ userId, event: "match_found", payload: { gameId } }),
    requeue: async (gameType: string, userId: string) =>
      void requeued.push({ gameType, userId }),
  };
}

describe("runPairing", () => {
  beforeEach(() => {
    onlineSet = new Set(["a", "b"]);
    getOrCreateDmCalls = [];
    createGameCalls = [];
    createGameResult = { ok: true, value: { game: { id: "GAMECODE" } } };
    emitted.length = 0;
    requeued.length = 0;
  });

  it("creates the DM + challenge game and emits match_found to both players", async () => {
    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, deps());

    expect(getOrCreateDmCalls).toEqual([["a", "b"]]);
    expect(createGameCalls).toHaveLength(1);
    expect(createGameCalls[0]).toMatchObject({
      userId: "a",
      conversationId: "conv-1",
      gameType: TIC_TAC_TOE,
      seatingMode: "challenge",
      challengedUserId: "b",
    });
    expect(
      emitted.map((e) => ({ userId: e.userId, payload: e.payload })).sort((x, y) =>
        x.userId.localeCompare(y.userId),
      ),
    ).toEqual([
      { userId: "a", payload: { gameId: "GAMECODE" } },
      { userId: "b", payload: { gameId: "GAMECODE" } },
    ]);
  });

  it("forwards a config object to createGameInConversation", async () => {
    await runPairing(TIC_TAC_TOE, ["a", "b"], { firstMove: "O" }, deps());
    expect(createGameCalls[0]?.config).toEqual({ firstMove: "O" });
  });

  it("refuses to match a user with themselves", async () => {
    await runPairing(TIC_TAC_TOE, ["a", "a"], undefined, deps());
    expect(createGameCalls).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it("requeues the survivor and aborts when one player went offline", async () => {
    onlineSet = new Set(["a"]);
    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, deps());
    expect(createGameCalls).toHaveLength(0);
    expect(emitted).toHaveLength(0);
    expect(requeued).toEqual([{ gameType: TIC_TAC_TOE, userId: "a" }]);
  });

  it("requeues neither when both dropped", async () => {
    onlineSet = new Set();
    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, deps());
    expect(createGameCalls).toHaveLength(0);
    expect(requeued).toHaveLength(0);
  });

  it("does not emit match_found when game creation fails", async () => {
    createGameResult = { ok: false, error: "boom" };
    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, deps());
    expect(emitted).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/server && bun test tests/matchmaking.test.ts`
Expected: FAIL - module `../src/realtime/matchmaking` does not exist.

- [ ] **Step 3: Implement `runPairing` (and the handler scaffolding the next task fills in)**

Create `apps/server/src/realtime/matchmaking.ts`:

```ts
import { conversations } from "@kyzen/database";
import { hasEngine } from "@kyzen/games-core";
import {
  clientQueueJoinSchema,
  clientQueueLeaveSchema,
  type GameType,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { createGameInConversation } from "../chat/games-in-chat-service";
import { childLogger } from "../logger";
import { matchmakingStore } from "./matchmaking-store";
import { presenceStore } from "./presence-store-instance";
import { emitToUser } from "./rooms";

const log = childLogger({ mod: "realtime:matchmaking" });

export type PairingDeps = {
  onlineAmong: (userIds: string[]) => Promise<Set<string>>;
  emitMatch: (userId: string, gameId: string) => void;
  requeue: (gameType: string, userId: string) => Promise<void>;
};

export async function runPairing(
  gameType: GameType,
  pair: [string, string],
  config: unknown,
  deps: PairingDeps,
): Promise<void> {
  const [a, b] = pair;
  if (a === b) {
    log.warn({ gameType, a }, "refusing to match a user with themselves");
    return;
  }

  const online = await deps.onlineAmong([a, b]);
  if (!online.has(a) || !online.has(b)) {
    const survivor = online.has(a) ? a : online.has(b) ? b : null;
    if (survivor) await deps.requeue(gameType, survivor);
    log.info({ gameType, a, b, survivor }, "pairing aborted (liveness)");
    return;
  }

  const { conversation } = await conversations.getOrCreateDm(a, b);
  const created = await createGameInConversation({
    userId: a,
    conversationId: conversation.id,
    gameType,
    seatingMode: "challenge",
    challengedUserId: b,
    config,
  });
  if (!created.ok) {
    log.error({ gameType, a, b, error: created.error }, "match game failed");
    return;
  }

  const gameId = created.value.game.id;
  deps.emitMatch(a, gameId);
  deps.emitMatch(b, gameId);
  log.info({ gameType, a, b, gameId }, "match found");
}

function defaultPairingDeps(io: IOServer): PairingDeps {
  return {
    onlineAmong: (userIds) => presenceStore.onlineAmong(userIds),
    emitMatch: (userId, gameId) =>
      emitToUser(io, userId, "match_found", { gameId }),
    requeue: (gameType, userId) =>
      matchmakingStore.enqueue(gameType, userId, Date.now()),
  };
}

export async function handleQueueJoin(
  io: IOServer,
  userId: string,
  gameType: GameType,
  config: unknown,
): Promise<void> {
  if (!hasEngine(gameType)) return;
  await matchmakingStore.enqueue(gameType, userId, Date.now());
  const pair = await matchmakingStore.pairAndPop(gameType);
  if (!pair) return;
  await runPairing(gameType, pair, config, defaultPairingDeps(io));
}

export async function handleQueueLeave(
  userId: string,
  gameType: GameType,
): Promise<void> {
  await matchmakingStore.remove(gameType, userId);
}

export async function dequeueUserFromAllQueues(userId: string): Promise<void> {
  await matchmakingStore.removeFromAll(userId);
}

export function attachMatchmakingHandlers(io: IOServer, socket: Socket): void {
  socket.on("game:queue_join", (payload: unknown) => {
    const parsed = clientQueueJoinSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("game_error", { message: "Invalid queue_join payload" });
      return;
    }
    void (async () => {
      try {
        await handleQueueJoin(
          io,
          socket.data.userId,
          parsed.data.gameType,
          parsed.data.config,
        );
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "queue_join failed");
        socket.emit("game_error", { message: "Matchmaking failed" });
      }
    })();
  });

  socket.on("game:queue_leave", (payload: unknown) => {
    const parsed = clientQueueLeaveSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("game_error", { message: "Invalid queue_leave payload" });
      return;
    }
    void (async () => {
      try {
        await handleQueueLeave(socket.data.userId, parsed.data.gameType);
      } catch (err) {
        log.error({ err, userId: socket.data.userId }, "queue_leave failed");
      }
    })();
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/server && bun test tests/matchmaking.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/realtime/matchmaking.ts apps/server/tests/matchmaking.test.ts
git commit -m "feat(server): pair matched players into the friend-challenge game path"
```

---

## Task 5: Register the matchmaking handlers and dequeue on disconnect

Wire the handlers into the connection lifecycle exactly where the game lane is registered, and drain the user from every queue on disconnect so a player who closes the tab while searching is not paired into a dead game.

**Files:**
- Modify: `apps/server/src/realtime/index.ts:1-20` (imports) and `:54-92` (connection body)

- [ ] **Step 1: Add the imports**

In `apps/server/src/realtime/index.ts`, add the following import to the relative-import block. Biome's `organizeImports` (the `bun run check` gate) sorts the `./` siblings alphabetically, so it belongs between `./io` (line 13) and `./presence` (line 14) - place it there, or add it anywhere and run `bun run fix` to sort:

```ts
import {
  attachMatchmakingHandlers,
  dequeueUserFromAllQueues,
} from "./matchmaking";
```

- [ ] **Step 2: Attach the handlers per connection**

In the `io.on("connection", ...)` body, add the call right after `attachGameChatHandlers(io, socket);` (line 62):

```ts
    attachGameChatHandlers(io, socket);
    attachMatchmakingHandlers(io, socket);
```

- [ ] **Step 3: Dequeue on disconnect**

Change the `disconnect` handler (lines 88-91) so it also drains the matchmaking queues:

```ts
    socket.on("disconnect", (reason) => {
      slog.info({ reason }, "socket disconnected");
      void dequeueUserFromAllQueues(socket.data.userId);
      void handlePresenceDisconnect(io, socket);
    });
```

- [ ] **Step 4: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 5: Verify the full server unit suite still passes**

Run: `cd apps/server && bun test tests`
Expected: PASS (existing suite + `matchmaking-store`, `matchmaking`).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/realtime/index.ts
git commit -m "feat(server): register matchmaking handlers and dequeue on disconnect"
```

---

## Task 6: `dequeueUserFromAllQueues` unit coverage

The disconnect path calls `dequeueUserFromAllQueues`, which delegates to `matchmakingStore.removeFromAll`; `handleQueueLeave` removes from one queue. Cover both against a real `InMemoryMatchmakingStore` injected via `mock.module`. This lives in its own file (not appended to `matchmaking.test.ts`) so the store mock is declared **before** the first import of `../src/realtime/matchmaking` - otherwise the matchmaking module would already have evaluated against the real singleton and the mock would not rebind (per the Bun mock-isolation note). Per that same note, the `matchmaking-store` mock is a **complete barrel** - it re-exports every runtime symbol the real module exports (`matchmakingStore`, `InMemoryMatchmakingStore`, `RedisMatchmakingStore`, `queueKey`) so the leak does not break `matchmaking-store.test.ts` (which imports `RedisMatchmakingStore`) regardless of file run order. The complete `@kyzen/database` and games-in-chat barrels are still mocked because importing `matchmaking.ts` transitively loads them.

**Files:**
- Create: `apps/server/tests/matchmaking-dequeue.test.ts`

- [ ] **Step 1: Write the failing dequeue test file**

Create `apps/server/tests/matchmaking-dequeue.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import {
  InMemoryMatchmakingStore,
  queueKey,
  RedisMatchmakingStore,
} from "../src/realtime/matchmaking-store";

const sharedStore = new InMemoryMatchmakingStore();

mock.module("../src/realtime/matchmaking-store", () => ({
  matchmakingStore: sharedStore,
  InMemoryMatchmakingStore,
  RedisMatchmakingStore,
  queueKey,
}));

mock.module("@kyzen/database", () => ({
  conversations: { getOrCreateDm: async () => ({ conversation: { id: "c" } }) },
  games: {},
  profiles: {},
  messages: {},
  friends: {},
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

mock.module("../src/chat/games-in-chat-service", () => ({
  createGameInConversation: async () => ({ ok: true, value: { game: { id: "G" } } }),
}));

const { dequeueUserFromAllQueues, handleQueueLeave } = await import(
  "../src/realtime/matchmaking"
);

describe("dequeueUserFromAllQueues", () => {
  it("removes the user from every queue they are in", async () => {
    await sharedStore.enqueue(TIC_TAC_TOE, "gone", 1);
    await sharedStore.enqueue(TIC_TAC_TOE, "stay", 2);
    await sharedStore.enqueue("connect-four", "gone", 3);

    await dequeueUserFromAllQueues("gone");

    expect(await sharedStore.members(TIC_TAC_TOE)).toEqual(["stay"]);
    expect(await sharedStore.members("connect-four")).toEqual([]);
  });

  it("handleQueueLeave removes the user from only the named queue", async () => {
    await sharedStore.enqueue(TIC_TAC_TOE, "leaver", 10);
    await sharedStore.enqueue("connect-four", "leaver", 11);

    await handleQueueLeave("leaver", TIC_TAC_TOE);

    expect(await sharedStore.members(TIC_TAC_TOE)).not.toContain("leaver");
    expect(await sharedStore.members("connect-four")).toEqual(["leaver"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd apps/server && bun test tests/matchmaking-dequeue.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/server/tests/matchmaking-dequeue.test.ts
git commit -m "test(server): cover disconnect dequeue and single-queue leave"
```

---

## Task 7: `matchmakingAtom` for the web searching state

State shared by the lobby button and the `match_found` listener lives in a Jotai atom (Jotai-first per the architecture). The atom holds which gameType is currently being searched (or `null` when idle), so a single component reads it but it is colocated with the other `lib/*-atoms` for reuse by future matchmaking entry points.

**Files:**
- Create: `apps/web/lib/matchmaking-atoms.ts`
- Test: `apps/web/tests/matchmaking-atoms.test.ts` (create)

- [ ] **Step 1: Write the failing atom test**

Create `apps/web/tests/matchmaking-atoms.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createStore } from "jotai";
import { matchmakingAtom } from "@/lib/matchmaking-atoms";

describe("matchmakingAtom", () => {
  it("defaults to idle (searching = null)", () => {
    const store = createStore();
    expect(store.get(matchmakingAtom)).toEqual({ searching: null });
  });

  it("tracks the gameType currently being searched", () => {
    const store = createStore();
    store.set(matchmakingAtom, { searching: "tic-tac-toe" });
    expect(store.get(matchmakingAtom)).toEqual({ searching: "tic-tac-toe" });
    store.set(matchmakingAtom, { searching: null });
    expect(store.get(matchmakingAtom).searching).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && bun test tests/matchmaking-atoms.test.ts`
Expected: FAIL - module `@/lib/matchmaking-atoms` does not exist.

- [ ] **Step 3: Implement the atom**

Create `apps/web/lib/matchmaking-atoms.ts`:

```ts
import { atom } from "jotai";

export type MatchmakingState = { searching: string | null };

export const matchmakingAtom = atom<MatchmakingState>({ searching: null });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && bun test tests/matchmaking-atoms.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/matchmaking-atoms.ts apps/web/tests/matchmaking-atoms.test.ts
git commit -m "feat(web): add matchmakingAtom for the lobby searching state"
```

---

## Task 8: "Find a match" button + Searching/Cancel UI in the lobby

Add a "Find a match" button beneath "Play with a friend" in `game-lobby.tsx`. Clicking it calls `ensureIdentity()` (Phase 0, mints a guest when logged-out), emits `game:queue_join` over the socket, and flips the `matchmakingAtom` to searching. A Searching panel offers Cancel (emits `game:queue_leave` and resets the atom). A `match_found` socket listener navigates to `/play/<gameId>`. Anon and logged-in users use the identical path. The button no longer needs `userId` to be non-null because `ensureIdentity()` provisions one on demand.

**Files:**
- Modify: `apps/web/app/games/_shared/game-lobby.tsx:1-59`

- [ ] **Step 1: Rewrite the lobby component to add matchmaking**

Replace the top of `apps/web/app/games/_shared/game-lobby.tsx` (lines 1-59, the imports + the `GameLobby` function through its closing brace on line 59) with:

```tsx
"use client";

import type { ConfigField, GameMeta } from "@kyzen/shared/types";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { FaMagnifyingGlass, FaXmark } from "react-icons/fa6";
import { ConversationPicker } from "@/app/games/components/conversation-picker";
import { ensureIdentity } from "@/lib/auth/ensure-identity";
import { matchmakingAtom } from "@/lib/matchmaking-atoms";
import { useSocket, useSocketEvent } from "@/lib/socket/socket-context";

export function GameLobby({
  meta,
  configFields,
  userId,
}: {
  meta: GameMeta;
  configFields: ConfigField[];
  userId: string | null;
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const [matchmaking, setMatchmaking] = useAtom(matchmakingAtom);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(configFields.map((f) => [f.key, f.default])),
  );

  const setField = (key: string, value: unknown) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const searching = matchmaking.searching === meta.type;

  useSocketEvent<{ gameId: string }>("match_found", (payload) => {
    if (!payload?.gameId) return;
    setMatchmaking({ searching: null });
    router.push(`/play/${payload.gameId}`);
  });

  const findMatch = useCallback(async () => {
    setBusy(true);
    try {
      await ensureIdentity();
      socket?.emit("game:queue_join", { gameType: meta.type, config });
      setMatchmaking({ searching: meta.type });
    } catch {
      setMatchmaking({ searching: null });
    } finally {
      setBusy(false);
    }
  }, [socket, meta.type, config, setMatchmaking]);

  const cancelMatch = useCallback(() => {
    setMatchmaking({ searching: null });
    socket?.emit("game:queue_leave", { gameType: meta.type });
  }, [socket, meta.type, setMatchmaking]);

  return (
    <div className="mt-8 max-w-sm space-y-6">
      {configFields.length > 0 ? (
        <div className="space-y-4">
          {configFields.map((field) => (
            <ConfigFieldRow
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={(v) => setField(field.key, v)}
            />
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => (userId ? setOpen(true) : router.push("/auth"))}
        className="w-full rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm shadow outline-none transition hover:opacity-90"
      >
        Play with a friend
      </button>

      {searching ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3">
          <span className="flex items-center gap-2 text-card-foreground text-sm">
            <FaMagnifyingGlass
              size={16}
              className="animate-pulse"
              aria-hidden="true"
            />
            Searching for an opponent…
          </span>
          <button
            type="button"
            onClick={cancelMatch}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-card-foreground text-xs outline-none transition hover:bg-surface-overlay"
          >
            <FaXmark size={14} aria-hidden="true" />
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={findMatch}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay disabled:pointer-events-none disabled:opacity-50"
        >
          <FaMagnifyingGlass size={16} aria-hidden="true" />
          {busy ? "Starting…" : "Find a match"}
        </button>
      )}

      {open && userId ? (
        <ConversationPicker
          userId={userId}
          gameType={meta.type}
          config={config}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
```

(Leave the `LABEL` / `CONTROL` constants and the `ConfigFieldRow` function below unchanged.)

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 3: Verify the full web suite still passes**

Run: `cd apps/web && bun test tests`
Expected: PASS (existing suite + `matchmaking-atoms`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/games/_shared/game-lobby.tsx
git commit -m "feat(web): add 'Find a match' button with searching/cancel state"
```

---

## Task 9: DB-backed integration test - two enqueued users yield one seated game

A single end-to-end assertion over the real DB: enqueue two users into an `InMemoryMatchmakingStore`, `pairAndPop`, run the real `runPairing` (with a stub `emitMatch`/`requeue` and an `onlineAmong` that reports both online), and confirm a single game exists in the DM with the creator seated and the second player joinable. This exercises `getOrCreateDm` + `createGameInConversation` for real.

**Important - DM seating coercion:** `getOrCreateDm(a, b)` creates a `kind: "dm"` conversation, and `createGameInConversation` (`apps/server/src/chat/games-in-chat-service.ts:96-115`) **forces** `seatingMode = "open"` and `challengedUserId = null` for any DM conversation, ignoring the `seatingMode: "challenge"` / `challengedUserId: b` arguments `runPairing` passes (those arguments only take effect in group conversations). This is the exact behavior of the existing friend-challenge-in-a-DM path, so the integration test must assert `seatingMode === "open"` and `challengedUserId === null` for the persisted game - **not** `"challenge"` / `b.id`. The `runPairing` unit test (Task 4) still asserts the *call* forwards `seatingMode: "challenge"`, which is correct because that test mocks the service and never hits the DM coercion.

**Cleanup note:** the `createHarness` API (`apps/server/integration/harness.ts`) exposes `trackGame(gameId)` (deleted from the `game` table by id-or-code in `cleanup`) but has **no** way to register a conversation for cleanup - `getOrCreateDm` creates the DM inside `runPairing`, so it never goes through `h.makeDm` (which is what registers a conversation for the harness). `conversation.createdBy` is `onDelete: "set null"` (schema.ts:216), so deleting the test users does **not** cascade-delete the DM. Track each created game by its **DB id** (`record.id`) via `h.trackGame`, and delete the DM conversations in a local `afterAll` via the exported `db`/`schema` (mirroring `apps/server/integration/game-flows.test.ts:60-67`). Wraps in `describe.skipIf(!DB_UP)` and registers `afterAll(h.cleanup)` per the harness contract.

**Files:**
- Create: `apps/server/integration/matchmaking-flow.test.ts`

- [ ] **Step 1: Write the integration test**

Create `apps/server/integration/matchmaking-flow.test.ts`:

```ts
import { afterAll, describe, expect, it } from "bun:test";
import { conversations, db, games, schema } from "@kyzen/database";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { eq } from "drizzle-orm";
import { createGameInConversation } from "../src/chat/games-in-chat-service";
import { runPairing } from "../src/realtime/matchmaking";
import { InMemoryMatchmakingStore } from "../src/realtime/matchmaking-store";
import { createHarness, DB_UP } from "./harness";

const h = createHarness("mmflow");
const createdConvIds: string[] = [];

afterAll(async () => {
  if (DB_UP) {
    for (const id of createdConvIds) {
      await db
        .delete(schema.conversation)
        .where(eq(schema.conversation.id, id))
        .catch(() => {});
    }
  }
  await h.cleanup();
});

describe.skipIf(!DB_UP)("matchmaking flow (DB-backed)", () => {
  it("pairs two enqueued users into one open game with both seatable", async () => {
    const a = await h.makeUser("a");
    const b = await h.makeUser("b");

    const store = new InMemoryMatchmakingStore();
    await store.enqueue(TIC_TAC_TOE, a.id, 1);
    await store.enqueue(TIC_TAC_TOE, b.id, 2);

    const pair = await store.pairAndPop(TIC_TAC_TOE);
    expect(pair).toEqual([a.id, b.id]);

    const matched: Array<{ userId: string; gameId: string }> = [];
    await runPairing(TIC_TAC_TOE, pair as [string, string], undefined, {
      onlineAmong: async (ids) => new Set(ids),
      emitMatch: (userId, gameId) => matched.push({ userId, gameId }),
      requeue: async () => {},
    });

    expect(matched.map((m) => m.userId).sort()).toEqual([a.id, b.id].sort());
    const gameId = matched[0]?.gameId;
    expect(gameId).toBeTruthy();

    const dm = await conversations.findDm(a.id, b.id);
    expect(dm).not.toBeNull();
    if (dm) createdConvIds.push(dm.id);

    const record = await games.getGameByCode(gameId as string);
    expect(record).not.toBeNull();
    if (record) h.trackGame(record.id);
    expect(record?.gameType).toBe(TIC_TAC_TOE);
    expect(record?.seatingMode).toBe("open");
    expect(record?.challengedUserId).toBeNull();
    expect(record?.players.map((p) => p.userId)).toEqual([a.id]);

    const seated = await games.seatPlayer(
      record?.id as string,
      { userId: b.id, username: b.username, role: "O" },
      1,
    );
    expect(seated).toBe(true);
    const loaded = await games.getGameById(record?.id as string);
    expect(loaded?.players.map((p) => p.userId).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  it("creates exactly one game per DM even if pairAndPop is attempted twice", async () => {
    const a = await h.makeUser("c");
    const b = await h.makeUser("d");

    const store = new InMemoryMatchmakingStore();
    await store.enqueue(TIC_TAC_TOE, a.id, 1);
    await store.enqueue(TIC_TAC_TOE, b.id, 2);

    const first = await store.pairAndPop(TIC_TAC_TOE);
    const second = await store.pairAndPop(TIC_TAC_TOE);
    expect(first).toEqual([a.id, b.id]);
    expect(second).toBeNull();

    const { conversation } = await conversations.getOrCreateDm(a.id, b.id);
    createdConvIds.push(conversation.id);

    const created = await createGameInConversation({
      userId: a.id,
      conversationId: conversation.id,
      gameType: TIC_TAC_TOE,
      seatingMode: "challenge",
      challengedUserId: b.id,
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      const record = await games.getGameByCode(created.value.game.id);
      if (record) h.trackGame(record.id);
    }
  });
});
```

- [ ] **Step 2: Run the integration test (DB required)**

Run: `bun run db:start`
Run: `cd apps/server && bun run test:integration`
Expected: PASS - the `matchmaking flow (DB-backed)` suite passes (and the rest of the integration suite is unaffected). If Postgres is not running, the suite is skipped via `describe.skipIf(!DB_UP)`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/integration/matchmaking-flow.test.ts
git commit -m "test(server): integration cover matchmaking producing one seated game"
```

---

## Task 10: Docs sync - realtime matchmaking lane

A change is not done until the docs reflect it. Document the new matchmaking lane in the realtime architecture page next to the existing game-lane description.

**Files:**
- Modify: `docs/architecture/realtime.md`

- [ ] **Step 1: Read the realtime doc to find the game-lane section**

Run: `grep -n "join_room\|make_move\|game lane\|registerGameEvent" docs/architecture/realtime.md`
Expected: prints the line numbers of the game-lane description so you can insert the matchmaking lane immediately after it.

- [ ] **Step 2: Add a matchmaking subsection**

Insert the following block immediately after the game-lane paragraph identified in Step 1 (keep the surrounding prose intact):

```md
### Matchmaking lane

`game:queue_join { gameType, config? }` and `game:queue_leave { gameType }` (payloads validated by `clientQueueJoinSchema` / `clientQueueLeaveSchema` in `@kyzen/shared/types`) drive a FIFO queue. The queue lives in `realtime/matchmaking-store.ts`: one Redis sorted set per game type (`mm:queue:<gameType>`, member `userId`, score = enqueue `Date.now()`) with an atomic Lua `pairAndPop` that pops the two oldest members in one round-trip, plus an in-memory fallback selected when `REDIS_URL` is unset (the same factory pattern as `presence-store-instance.ts`). On each successful `pairAndPop([a, b])`, `runPairing` (`realtime/matchmaking.ts`) guards self-matches, confirms both are still online via `presenceStore.onlineAmong` (requeuing the survivor otherwise), then reuses `getOrCreateDm(a, b)` + `createGameInConversation({ seatingMode: "challenge", challengedUserId: b, ... })` and emits the transient `match_found { gameId }` to both via `emitToUser`. Because the pair shares a DM, the service coerces the persisted game to `seatingMode: "open"` / `challengedUserId: null` (the same as the friend-challenge-in-a-DM path); the `"challenge"` args are forwarded for call-shape parity but only bind in group conversations. `match_found` is not a persisted notification. Disconnect drains the user from every queue (`dequeueUserFromAllQueues`). The queue stores only `userId` - no PII.
```

- [ ] **Step 3: Verify the em-dash gate stays green**

Run: `bun run check`
Expected: PASS (the repo bans em-dashes in CI; the block above uses only ASCII hyphens, so it is clean).

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/realtime.md
git commit -m "docs(realtime): document the matchmaking queue lane"
```

---

## Final verification

- [ ] **Run the whole gate**

Run: `bun run type-check`
Expected: PASS.
Run: `bun run check`
Expected: PASS (Biome format/lint/imports + no-comments + no-em-dash).
Run: `bun run test`
Expected: PASS across workspaces. New unit suites: `matchmaking-schemas` (shared), `matchmaking-store` + `matchmaking` + `matchmaking-dequeue` (server), `matchmaking-atoms` (web).

- [ ] **Run the DB-backed integration suite**

Run: `bun run db:start`
Run: `cd apps/server && bun run test:integration`
Expected: PASS - `matchmaking-flow.test.ts` plus the existing integration suite.

- [ ] **Manual smoke (optional, needs `bun run db:start` + `bun run dev`, two browser sessions)**

1. Open two browsers (one logged-in, one logged-out). In each, go to `/games/tic-tac-toe`.
2. In the logged-out one, click "Find a match" - it mints a guest, shows "Searching for an opponent…" with Cancel.
3. Click "Find a match" in the second browser. Both should navigate to the same `/play/<gameId>` and seat into one tic-tac-toe game.
4. Repeat but click Cancel before the second player joins - confirm the queue empties (the searching panel disappears and no game is created).

---

## Self-review notes (coverage against spec §5.3)

- Redis sorted set per gameType (`mm:queue:<gameType>`, member `userId`, score = enqueue `Date.now()`) + atomic Lua `pairAndPop` + in-memory fallback + `REDIS_URL` factory mirroring `presence-store-instance.ts` - Tasks 2-3. ✅
- `game:queue_join { gameType, config? }` / `game:queue_leave { gameType }` registered in `realtime/index.ts` via the per-connection attach approach; payload Zod schemas in `@kyzen/shared` (not inline) - Tasks 1, 4, 5. ✅
- `match_found { gameId }` emitted to BOTH players via `emitToUser` - Task 4 (asserted), Task 8 (client navigates). ✅
- Disconnect removes the user from all queues (hooked into the presence disconnect path) - Tasks 5-6. ✅
- Pairing reuses `presenceStore.onlineAmong([a, b])` liveness (requeue survivor) → `getOrCreateDm(a, b)` → `createGameInConversation({ userId: a, seatingMode: "challenge", challengedUserId: b, config })` → `emitToUser match_found` - Task 4 (unit), Task 9 (DB-backed). The DM persists as `seatingMode: "open"` / `challengedUserId: null` (the service coerces challenge→open for DMs); Task 9 asserts the coerced values, Task 4 asserts the forwarded call args. ✅
- Web "Find a match" button in `game-lobby.tsx` → `ensureIdentity()` → emit `queue_join` → Searching + Cancel (`queue_leave`) → `match_found` navigates to `/play/<gameId>`, backed by `matchmakingAtom` in `apps/web/lib` - Tasks 7-8. ✅
- **Security/privacy asserted in tests:** self-match guard (`runPairing` rejects `[a, a]` - Task 4); unknown gameType rejected at the wire (`gameTypeSchema` - Task 1) and at the handler (`hasEngine` in `handleQueueJoin` - Task 4); at-most-one-queue-per-gameType via idempotent `enqueue`/`ZADD NX` (Tasks 2-3); queue stores only `userId`, no PII (Task 3); `queue_join` requires an authenticated socket - enforced by the existing `io.use()` gate in `realtime/index.ts` (guests are authenticated anon users, so they queue normally). ✅
- Docs synced: matchmaking lane added to `docs/architecture/realtime.md` - Task 10. ✅
- Out of this phase: merge (Phase 1), invites (Phase 3), `NotificationType` changes (none - `match_found` is transient), DB schema / `drift-guard` (none - queue is Redis-only), `RESERVED_USERNAMES` (no new route).
```
