# Redis-backed presence + durable last-seen

**Date:** 2026-06-04
**Status:** Approved design, ready to plan
**Area:** `apps/server/src/realtime/presence.ts`, `apps/server/src/db`

## Problem

Presence today lives in two in-process maps in `apps/server/src/realtime/presence.ts`:
a `Map<userId, { sockets: Set<socketId>, lastSeen }>`. Each server node only sees
its own connected sockets, so under a multi-node deployment (several servers behind
a load balancer sharing one Redis instance) presence is computed per node and is wrong:

- `isOnline(userId)` returns `false` on node B for a user connected to node A.
- A `presenceSnapshot` built on one node shows audience members on other nodes as offline.
- Multi-tab / multi-device users spread across nodes mis-trigger the
  online/offline transitions and overwrite each other's `lastSeen`.

`lastSeen` is also in memory only, so it is lost on restart and never reflects a
durable "when was this user last online" once the process recycles.

## Goals

- "Who is online right now" is shared across all server nodes via Redis, so presence
  is correct regardless of which node a socket landed on.
- Presence self-heals: if a node crashes, the users it held drop offline within seconds,
  with no manual cleanup and no leaked "ghost online" entries.
- `last_seen_at` is durable in Postgres, so an offline user's last-online time survives
  restarts and is visible to others.
- Single-node dev (no `REDIS_URL`) keeps working unchanged.

## Non-goals

- A live "went offline" *push* to already-connected observers when a node hard-crashes.
  Online *reads* self-heal within the stale window, and graceful disconnects push
  immediately; pushing the crash transition to existing observers needs an elected
  sweeper, which is **deferred** (see Deferred work). It can be added later without
  changing this design.
- Rich presence states (away / busy / typing-as-presence). Status stays `online | offline`,
  matching the existing `PresenceStatus` contract.
- Changing the presence wire contract. `PresenceEntry` already carries
  `lastSeen?: string | null` (`packages/chat-core/src/socket-events.ts:131`).

## Design overview

Two stores of truth, each matched to what it is good at:

- **Redis = live "who is online right now."** Fresh, cheap to write often, shared by all nodes.
- **Postgres = durable "last seen" time.** Written less often, survives restarts.

Two decoupled cadences:

- **Redis presence heartbeat: short (~10s).** Each node refreshes the Redis entries for
  its own connected sockets. Stale window ~25s, so a crashed node's users age out of every
  read within ~25s.
- **DB `last_seen_at` write: long (~60s while online, plus immediately on graceful disconnect).**
  After a crash, last-seen is accurate to within ~60s; on a clean disconnect it is exact.

## Components

### 1. `PresenceStore` interface

A new async seam that hides "Redis vs in-memory" from the handlers:

```
markOnline(userId, socketId)   -> { wasOnline: boolean }    // on connect
refresh(userId, socketId)      -> void                       // Redis heartbeat tick
markOffline(userId, socketId)  -> { stillOnline: boolean }   // on graceful disconnect
isOnline(userId)               -> boolean
onlineAmong(userIds[])         -> Set<userId>                 // batch, for the snapshot
```

### 2. Two implementations, selected by `REDIS_URL`

- **`RedisPresenceStore`**: one sorted set per user, `presence:<userId>`, members are
  `socketId`, scores are the last-heartbeat epoch ms.
  - `markOnline` / `refresh`: `ZADD presence:<userId> <now> <socketId>`, then bump a
    key-level `EXPIRE` (≈ stale window + grace) so an abandoned key self-cleans.
  - `markOffline`: `ZREM presence:<userId> <socketId>`.
  - `isOnline`: `ZCOUNT presence:<userId> (now - staleMs) +inf` > 0 - members whose last
    heartbeat is older than the stale window are ignored, so a crashed node's entries
    simply age out. Reads are always crash-correct.
  - `onlineAmong`: a pipeline of `ZCOUNT`s (one per audience member).
  - Uses a shared app-level Redis command client via a new `getRedis()` helper. Today only
    the adapter's `pub`/`sub` clients exist (`apps/server/src/realtime/redis.ts`); this adds
    a single lazily-created `ioredis` client for normal commands, reusing `env.redisUrl`.

- **`InMemoryPresenceStore`**: the current `Map<userId, Set<socketId>>` behavior for
  single-node dev. `refresh` is a no-op; `isOnline` / `onlineAmong` read the map. Keeps
  `REDIS_URL`-unset deployments working.

### 3. Two per-node heartbeat timers (started in `attachRealtime`)

- **Redis refresh**: every `PRESENCE_HEARTBEAT_MS` (~10s): collect this node's local
  connected sockets, group by `userId`, `refresh` each (pipelined). No-op under the
  in-memory store.
- **DB persist**: every `PRESENCE_LASTSEEN_PERSIST_MS` (~60s): one batched
  `touchLastSeen(distinctLocalUserIds, now)` write. Runs in both modes (it is what keeps
  last-seen near-accurate across a crash).

Both timers iterate only the node's *local* sockets, which is all a node can see and all
it is responsible for refreshing.

### 4. Database

- Add nullable `last_seen_at timestamp` to `userProfile` (`apps/server/src/db/schema.ts:165`).
  Apply locally with `db:push` (this repo's dev DB is push-managed; `db:migrate` fails locally);
  generate the migration file with `db:generate` for prod.
- `apps/server/src/db/repositories/profiles.ts`:
  - `touchLastSeen(userIds: string[], when: Date)`: batched update, no-op on empty input.
  - `getLastSeen(userIds: string[]) -> Map<userId, Date | null>`: batch read for building
    snapshot entries for offline users.

### 5. Configuration

New env vars (added to `apps/server/src/env.ts`, `turbo.json` `globalEnv`, and `.env.example`),
all optional with defaults:

- `PRESENCE_HEARTBEAT_MS` (default 10000)
- `PRESENCE_STALE_MS` (default 25000)
- `PRESENCE_LASTSEEN_PERSIST_MS` (default 60000)

## Data flow

- **Connect** (`handlePresenceConnect`): `markOnline(userId, socketId)`. If `!wasOnline`,
  broadcast `presenceUpdate { status: "online", lastSeen: null }` to the audience. Then send
  the connecting socket a `presenceSnapshot`: `onlineAmong(audience)` for statuses +
  `getLastSeen(offlineAudienceIds)` for their last-seen times.
- **Redis heartbeat tick:** refresh all local sockets' users in Redis.
- **DB heartbeat tick:** `touchLastSeen` for all local online users.
- **Graceful disconnect** (`handlePresenceDisconnect`): `markOffline(userId, socketId)`.
  If `!stillOnline`, `touchLastSeen([userId], now)` and broadcast
  `presenceUpdate { status: "offline", lastSeen: now }` to the audience.
- **Crash:** no disconnect handler runs. The node stops refreshing, so the user's ZSET
  members go stale and `isOnline` reads return offline within ~`PRESENCE_STALE_MS`. The DB
  heartbeat had stamped `last_seen_at` within ~`PRESENCE_LASTSEEN_PERSIST_MS`, so last-seen
  is close to correct. (No live push to existing observers - see Deferred work.)

The audience computation (`audienceFor`: accepted friends + conversation members) is unchanged.
`isOnline` becomes async, but it is module-private (only `payloadFor` uses it today), so the
change does not ripple outside `presence.ts`.

## Error handling

- Redis command failures in the store are caught and logged via the realtime child logger;
  a failed `isOnline` / `onlineAmong` degrades to treating the user(s) as offline rather than
  throwing into a socket handler. A failed `refresh` is logged and skipped - the entry simply
  goes stale and is re-established on the next tick.
- `touchLastSeen` failures are logged and swallowed; last-seen is best-effort and must never
  break connect/disconnect.
- The shared Redis client reuses the existing error logging pattern in
  `apps/server/src/realtime/redis.ts` (`conn.on("error", ...)`).

## Testing

- Unit-test `InMemoryPresenceStore` directly (connect → online, multi-socket reference
  counting, last socket removed → offline).
- Unit-test `RedisPresenceStore` against a Redis double / `mock.module` for `ioredis`,
  asserting the `ZADD` / `ZREM` / `ZCOUNT` calls and that stale-scored members are excluded
  from `isOnline`.
- Test the presence handlers with the store mocked (`mock.module`), asserting the
  online/offline broadcast transitions and that `touchLastSeen` fires on last-socket disconnect.
- Keep pure helpers exported for unit testing, per repo test conventions.

## Docs to update (same change)

- `docs/architecture/realtime.md`: rewrite the presence half of the "in-process maps" gotcha
  (`realtime.md:431`) and extend the Scale-out section to describe Redis-backed presence +
  durable last-seen.
- `docs/architecture/database.md`: note the new `user_profile.last_seen_at` column.

## Deferred work

- **Elected sweeper for live offline-on-crash pushes.** A single node (chosen via a Redis
  `SET ... NX EX` lock) periodically prunes stale ZSET members and, when a user's set empties,
  finalizes `last_seen_at` and broadcasts the offline transition to existing observers. Closes
  the one Non-goal gap without changing this design.
