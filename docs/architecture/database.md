# Database Layer (Repositories + Data Access)

## What this is / why it matters

This is the **data-access stack** for `apps/server`: one Postgres database, modelled with the [Drizzle ORM](https://orm.drizzle.team), reached through a thin **repository layer** that every route and realtime handler funnels through. One rule defines the layer:

> **Routes and realtime handlers never write SQL. They call repository functions, and repositories are the only code that touches Drizzle / Postgres.**

That layering buys three things. **Testability** — repositories are plain async functions in `apps/server/src/db/repositories/*`, so a route test can `mock.module` the repo instead of standing up a database. **A single place for query shape** — pagination, soft-delete, and the `GameRecord` join each live in one file, so they can't drift between callers. **A clean seam** — the Next.js frontend never opens a database connection; only the server's repositories touch Postgres.

The *shape* of the tables themselves — the schema, the generic JSONB game model, and how Drizzle models it — is documented separately in [`database-schema.md`](./database-schema.md). This page is about how that schema is **read and written**.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/server/src/db/client.ts` | Constructs the `postgres-js` connection pool and the Drizzle `db` instance; re-exports `db`, `client`, `schema`, and the `DB` type. |
| `apps/server/src/db/index.ts` | The public facade: re-exports each repository as a namespace (`games`, `messages`, `conversations`, `friends`, `notifications`, `profiles`) plus the row / `GameRecord` types. |
| `apps/server/src/db/latency.ts` | `withLatency` Proxy that injects an artificial per-query delay (`DB_LATENCY_MS`) in non-production, for exercising loading states. |
| `apps/server/src/db/repositories/games.ts` | Game/move/seat CRUD; defines `GameRecord` (the `game` row with `players` attached and `gameType` narrowed to the registry `GameType`) and the `getGameById` join. |
| `apps/server/src/db/repositories/messages.ts` | Message insert/read/soft-delete + keyset-paginated `listMessages`. |
| `apps/server/src/db/repositories/conversations.ts` | DM/group create, membership, read-state, unread counts, last-message bookkeeping. |
| `apps/server/src/db/repositories/friends.ts` | Friendship requests/status keyed by a sorted `pairKey`. |
| `apps/server/src/db/repositories/notifications.ts` | Notification create/list (keyset-paginated)/mark-read/resolve. |
| `apps/server/src/db/repositories/profiles.ts` | `user_profile` reads/writes: username, avatar, appearance, chat layout, and per-game stats. |
| `apps/server/src/db/repositories/cursor.ts` | `encodeCursor` / `decodeCursor` — the opaque base64 `(createdAt, id)` cursor used by keyset pagination. |

> `apps/server/src/db/schema.ts`, `db/migrate.ts`, and `drizzle.config.ts` — the table definitions and migrations — are covered in [`database-schema.md`](./database-schema.md).

## The connection: `client.ts`

Everything starts with one pool. `client.ts:7` builds a `postgres-js` client (`max: 10` connections), optionally wraps it for artificial latency, and hands it to Drizzle:

```ts
const client = withLatency(
  postgres(env.databaseUrl, { max: 10 }),
  env.dbLatencyMs,
);

export const db = drizzle(client, { schema });
```

Passing `{ schema }` (`client.ts:12`) gives Drizzle the full table catalog, which is what makes the `db.query.*` relational helpers and good inference available. And `db` is a **module-level singleton** — every repository imports the same instance (`import { db } from "../client"`), so the whole server shares one pool. `DATABASE_URL` and `DB_LATENCY_MS` are read once at startup in `apps/server/src/env.ts`.

## The repository pattern

Every repository is a module of async functions over the shared `db`, exported wholesale as a namespace by `db/index.ts`:

```ts
export { type DB, db, schema } from "./client";
export * as conversations from "./repositories/conversations";
export * as friends from "./repositories/friends";
export type { GameRecord } from "./repositories/games";
export * as games from "./repositories/games";
export * as messages from "./repositories/messages";
export * as notifications from "./repositories/notifications";
export * as profiles from "./repositories/profiles";
```

So callers write `import { games, profiles } from "../db"` and then `games.getGameById(id)` / `profiles.bumpStats(...)`. There is no class, no DI container, no base "Repository" abstraction — just modules. The discipline is conventional, not enforced by types: routes and realtime handlers import these namespaces and never import Drizzle directly.

### `GameRecord` and the seat join

The single most important repository type is `GameRecord` (`games.ts:15`):

```ts
export type GameRecord = Omit<GameRow, "gameType"> & {
  gameType: GameType;
  players: GamePlayer[];
};
```

A raw `GameRow` (straight from the `game` table) has no players — seats live in the separate `game_player` table — and its `gameType` is just free-text `string`. `GameRecord` is the **assembled aggregate**: the game row with its seats attached (in `seatOrder`) *and* `gameType` re-typed from `string` to the registry's `GameType` union, so callers can pass `record.gameType` straight to `getDefinition(...)` / `getEngine(...)` without a re-validation cast. Every game-returning function funnels through a private `toGameRecord(row, players)` helper (`games.ts:20`); `getGameById` (`games.ts:82`) is the canonical assembler:

```ts
export async function getGameById(id: string): Promise<GameRecord | null> {
  const [row] = await db.select().from(game).where(eq(game.id, id)).limit(1);
  if (!row) return null;
  const players = await getPlayers(id);
  return toGameRecord(row, players);
}
```

`getPlayers` (`games.ts:69`) does the second query, ordered by `seatOrder`; `updateGame` (`games.ts:107`) re-fetches players the same way after writing, so an updated `GameRecord` always carries fresh seats. `createGame` (`games.ts:36`) inserts the `game` row and its `game_player` rows inside `db.transaction(...)`, so a game can never exist with a half-written seat list — `conversations.getOrCreateDm` and `createGroup` use the same pattern (the former additionally re-checks for an existing DM *inside* the transaction to dodge a create-create race). The `gameState ?? createInitialState(...)` and turn/role logic do **not** live here — that's the realtime driver's job; the repository only persists what it's told.

### Keyset (cursor) pagination

Two repositories paginate large feeds — messages and notifications — with **keyset pagination** rather than `OFFSET`. The cursor encodes the `(createdAt, id)` of the last row seen, base64'd (`cursor.ts:1`). `listMessages` (`messages.ts:59`) decodes that cursor and adds a "strictly older than the cursor" predicate, using `id` as a tiebreaker so messages with identical timestamps still page deterministically:

```ts
if (opts.cursor) {
  const c = decodeCursor(opts.cursor);
  if (c) {
    conds.push(
      // biome-ignore lint/style/noNonNullAssertion: drizzle or() returns SQL given non-empty args
      or(
        lt(message.createdAt, c.createdAt),
        and(eq(message.createdAt, c.createdAt), lt(message.id, c.id)),
      )!,
    );
  }
}
```

It then fetches `limit + 1` rows ordered `desc(createdAt), desc(id)`, uses the extra row to decide `hasMore`, and emits a `nextCursor` from the last kept row. `notifications.listForUser` is the same pattern verbatim. This is why the composite `(conversationId, createdAt)` and `(userId, createdAt)` indexes exist — the keyset predicate rides those indexes. The lone `biome-ignore` is one of the few comments the repo allows; the non-null assertion is needed because Drizzle's `or()` is typed to possibly return `undefined`.

### Raw SQL fragments stay inside repositories

Repositories occasionally need a SQL expression Drizzle's builder doesn't model — but it's always the `sql` *template tag*, which parameterizes inputs (no string concatenation), and it never leaks past the repository. Examples: the per-game max move number, `nextMoveNumber` (`games.ts:143`) uses `` sql<number>`coalesce(max(${move.moveNumber}), 0)` ``; case-insensitive username lookups in `profiles.getProfileByUsername` (`profiles.ts:36`) use `` sql`lower(${userProfile.username}) = lower(${username})` ``; and `notifications.resolveByRequestId` matches a JSONB field with `` sql`${notification.payload} ->> 'requestId' = ${requestId}` ``. The takeaway: "no raw SQL in routes" doesn't mean "no SQL anywhere" — it means the SQL is *encapsulated* behind a typed repository function.

### `profiles.bumpStats` — read-modify-write of JSONB

`bumpStats` (`profiles.ts:147`) is a read-modify-write on a JSONB column: it loads the profile, clones `stats`, increments the per-`gameType` counters, and writes the whole object back. It's called once per player from the realtime driver when a game completes (`apps/server/src/realtime/turn-based.ts:90`). Because the `stats` object is small and the call sites are serialized within one move handler, this is fine in practice — but it's a read-modify-write, not an atomic SQL increment, so keep that in mind if stat updates ever fan out across concurrent writers.

## Data-flow walkthrough: persisting a move

This is the database layer's busiest path, and where the "client is never trusted" insight becomes concrete. A player taps the board, the client emits `make_move`, and the server's turn-based driver runs `handleMakeMove` (`apps/server/src/realtime/turn-based.ts:120`):

1. **Load the aggregate.** `games.getGameById(payload.gameId)` (`games.ts:82`) returns the `GameRecord` — game row + seats. The handler checks `status === "active"` and that the socket's `userId` is actually a seated player. The DB join is what makes the seat check possible.
2. **Validate with the shared schemas.** `def.moveSchema.safeParse(payload.moveData)` validates the *client's* input, and `def.stateSchema.safeParse(gameRow.gameState)` validates the *stored* JSONB (`turn-based.ts:138`). Both schemas come from the same `GameDefinition` the client imports. A bad move or corrupt state is rejected before any write.
3. **Reduce — authoritatively.** `def.engine.reduce(...)` (`turn-based.ts:143`) computes the next state on the server. The client's opinion about legality is irrelevant.
4. **Allocate a move number.** `games.nextMoveNumber(gameRow.id)` (`games.ts:143`) returns `max(moveNumber) + 1`. The `move_game_number_uq` constraint is the backstop if two moves race to the same number.
5. **Append the move.** `games.addMove(...)` (`games.ts:151`) inserts the validated move into the append-only `move` table.
6. **Persist new state.** `games.updateGame(gameRow.id, { gameState: result.state })` (`games.ts:107`) writes the engine's output back to the `game.game_state` JSONB and bumps `updatedAt`.
7. **Finalize on game over.** If the engine's outcome is `completed`, `finalize` (`turn-based.ts:69`) calls `games.updateGame` again (status / `completedAt` / `winner`) and `profiles.bumpStats` (`profiles.ts:147`) once per seat.

In arrows:

`make_move` → `handleMakeMove` → `games.getGameById` → `moveSchema/stateSchema.safeParse` → `engine.reduce` → `games.nextMoveNumber` → `games.addMove` → `games.updateGame` → `finalize` → `profiles.bumpStats` → broadcast `move_made` + `game_state`.

Notice that no SQL appears anywhere in `turn-based.ts` — only `games.*` and `profiles.*` calls. That's the layering working as intended. The full realtime side of this story is in [`realtime.md`](./realtime.md).

## Artificial latency: `latency.ts`

`DB_LATENCY_MS` is a dev affordance for testing loading states. `withLatency` (`latency.ts:70`) is a no-op unless `ms > 0`; otherwise it returns a `Proxy` around the `postgres-js` client that delays each query by intercepting the lazy query object's `then` (`latency.ts:14`) — so the sleep happens when a query is awaited — and threads through chainable methods, `unsafe`, and transaction callbacks (`begin` / `savepoint`) so delayed queries still compose. Critically, the latency is **forced to 0 in production**: `env.dbLatencyMs` runs through `resolveDbLatencyMs(nodeEnv, requestedMs)` (`latency.ts:63`), which returns `0` when `nodeEnv === "production"`. So you can't accidentally ship an artificial delay. New env vars like this must be added to `turbo.json` `globalEnv` or builds won't see them.

## Gotchas, invariants & conventions

- **Never write SQL outside `db/repositories/*`.** Routes and realtime handlers import the namespaces from `db/index.ts` and call functions. If you need a new query, add a repository function — don't reach for `db` in a route.
- **`GameRecord` always carries `players`; `GameRow` never does.** Seats live in `game_player`. `getGameById` / `createGame` / `updateGame` return the assembled `GameRecord`; `gamesForUser` (`games.ts:121`) returns bare `GameRow[]` (a list view that doesn't need seats).
- **Cursors are opaque and tolerant.** `decodeCursor` returns `null` (rather than throwing) on a malformed or non-base64 cursor (`cursor.ts:7`); callers then simply page from the start. Keyset pagination relies on the composite `createdAt`-leading indexes — keep them if you add new paginated lists.
- **`bumpStats` is read-modify-write on JSONB** (`profiles.ts:147`), not an atomic increment. Fine for the current serialized call site in the move handler; be careful if you ever bump stats from concurrent paths.
- **`DB_LATENCY_MS` is dev-only.** Forced to 0 in production by `resolveDbLatencyMs` (`latency.ts:63`).
- **JSONB blobs are untrusted until parsed.** `game_state` / `config` / `move_data` are `unknown` by design; validity is owned by the games-core Zod schemas (see [`database-schema.md`](./database-schema.md)) and enforced at the realtime boundary (`turn-based.ts:138`). Treat any `gameState` you read as untrusted until `stateSchema.safeParse`'d.
- **No comments in code.** Per the repo-wide rule, the only comment you'll find in this layer is the single `biome-ignore` on the `or(...)!` non-null assertion in the paginated repositories.

## Where to go next

- [`./database-schema.md`](./database-schema.md) — the table definitions, the generic JSONB game schema, and how Drizzle models it (the shapes this layer reads and writes).
- [`./games-core-schemas.md`](./games-core-schemas.md) — the Zod `stateSchema` / `moveSchema` / `configSchema` that own the shape of the JSONB this layer stores.
- [`./games-core-engine.md`](./games-core-engine.md) — `GameEngine` / `reduce`, the authority that produces the state persisted via `games.updateGame`.
- [`./realtime.md`](./realtime.md) — the socket lanes and the turn-based driver, the busiest caller of the game repositories.
- [`./server-api.md`](./server-api.md) — the Hono REST routes (e.g. `GET /api/games/:gameId`) that also call these repositories.
- [`./testing.md`](./testing.md) — the DB-backed `integration/` suite that runs these repositories against a live Postgres.
