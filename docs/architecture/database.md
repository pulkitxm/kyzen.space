# Database Layer (Repositories + Data Access)

## What this is / why it matters

This is the **data-access stack**: `@gamelobby/database` (`packages/database/`), the **server-only** package that owns one Postgres database, modelled with the [Drizzle ORM](https://orm.drizzle.team) and reached through a thin **repository layer** that every route and realtime handler funnels through. Only `apps/server` imports it; the Next.js frontend never does. One rule defines the layer:

> **Routes and realtime handlers never write SQL. They call repository functions, and repositories are the only code that touches Drizzle / Postgres.**

That layering buys three things. **Testability**: repositories are plain async functions in `packages/database/src/repositories/*`, so a route test can `mock.module("@gamelobby/database", …)` instead of standing up a database. **A single place for query shape**: pagination, soft-delete, and the `GameRecord` join each live in one file, so they can't drift between callers. **A clean seam**: the Next.js frontend never opens a database connection (it never imports `@gamelobby/database`); only the server's repositories touch Postgres.

The *shape* of the tables themselves (the schema, the generic JSONB game model, and how Drizzle models it) is documented separately in [`database-schema.md`](./database-schema.md). This page is about how that schema is **read and written**.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/database/src/client.ts` | `createDb(url, latencyMs)` factory + the singleton it builds: the `postgres-js` connection pool and the Drizzle `db` instance. Re-exports `createDb`, `db`, `client`, `schema`, and the `DB` type. |
| `packages/database/src/index.ts` | The public facade (`@gamelobby/database`): re-exports each repository as a namespace (`games`, `messages`, `conversations`, `friends`, `notifications`, `profiles`) plus the row / `GameRecord` types (re-exported from `@gamelobby/shared/types`). |
| `packages/database/src/latency.ts` | `withLatency` Proxy that injects an artificial per-query delay (`DB_LATENCY_MS`) in non-production, for exercising loading states. |
| `packages/database/src/repositories/games.ts` | Game/move/seat CRUD; assembles `GameRecord` (the `game` row with `players` attached and `gameType` narrowed to the registry `GameType`) via `toGameRecord` and the `getGameById` / `getGameByCode` joins; `createGame` allocates the public `code` (and defaults `seriesId` to the row's own id) and retries on a `game_code_uq` collision; the series reads `getSeriesGames` / `findLiveGameInConversation`. |
| `packages/database/src/repositories/messages.ts` | Message insert/read/soft-delete + keyset-paginated `listMessages`. |
| `packages/database/src/repositories/conversations.ts` | DM/group create, membership, read-state, unread counts, last-message bookkeeping. |
| `packages/database/src/repositories/friends.ts` | Friendship requests/status keyed by a sorted `pairKey`. |
| `packages/database/src/repositories/notifications.ts` | Notification create/list (keyset-paginated)/mark-read/resolve. |
| `packages/database/src/repositories/profiles.ts` | `user_profile` reads/writes: username, avatar, appearance, chat layout, and per-game stats. |
| `packages/database/src/repositories/cursor.ts` | `encodeCursor` / `decodeCursor`: the opaque base64 `(createdAt, id)` cursor used by keyset pagination. |

> `packages/database/src/schema.ts`, `src/migrate.ts`, `src/drift-guard.ts`, and the root `drizzle.config.ts` (the table definitions and migrations) are covered in [`database-schema.md`](./database-schema.md).

## The connection: `client.ts`

Everything starts with one pool. `createDb` (`client.ts:14`) builds a `postgres-js` client (`max: 10` connections), optionally wraps it for artificial latency, and hands it to Drizzle:

```ts
export function createDb(url: string, latencyMs = 0) {
  const connection = withLatency(postgres(url, { max: 10 }), latencyMs);
  return { db: drizzle(connection, { schema }), client: connection };
}

const singleton = createDb(process.env.DATABASE_URL ?? "", defaultLatencyMs());

export const client = singleton.client;
export const db = singleton.db;
```

Passing `{ schema }` (`client.ts:16`) gives Drizzle the full table catalog, which is what makes the `db.query.*` relational helpers and good inference available. The exported `db` is a **module-level singleton** built from one `createDb(...)` call (`client.ts:19`) - every repository imports the same instance (`import { db } from "../client"`), so the whole server shares one pool. The package reads its own env directly: `DATABASE_URL` (`client.ts:19`) and `DB_LATENCY_MS` (via `defaultLatencyMs()`, `client.ts:8`) - `apps/server` no longer resolves DB config for it. The `createDb` factory is also exported (`index.ts:24`) so tests can spin up an isolated instance against another URL.

## The repository pattern

Every repository is a module of async functions over the shared `db`, exported wholesale as a namespace by `index.ts`:

```ts
export { createDb, type DB, db, schema } from "./client";
export * as conversations from "./repositories/conversations";
export * as friends from "./repositories/friends";
export * as games from "./repositories/games";
export * as messages from "./repositories/messages";
export * as notifications from "./repositories/notifications";
export * as profiles from "./repositories/profiles";
```

So callers write `import { games, profiles } from "@gamelobby/database"` and then `games.getGameById(id)` / `profiles.bumpStats(...)`. There is no class, no DI container, no base "Repository" abstraction - just modules. The discipline is conventional, not enforced by types: routes and realtime handlers import these namespaces and never import Drizzle directly.

Repositories also **validate their inputs** with the Zod schemas exported from `@gamelobby/shared/types` before they write: `createGame` runs `createGameInputSchema.parse(input)` (`games.ts:29`), `addMove` runs `addMoveInputSchema.parse(input)` (`games.ts:171`), `insertMessage` / `create` / `createProfile` / `updateAppearance` parse theirs the same way.

### `GameRecord` and the seat join

The single most important repository type is `GameRecord`. It is now declared once in `@gamelobby/shared/types` (`packages/shared/src/types/db/index.ts:199`) and re-exported by `@gamelobby/database`:

```ts
export type GameRecord = Omit<GameRow, "gameType"> & {
  gameType: GameType;
  players: GamePlayer[];
};
```

A raw `GameRow` (straight from the `game` table) has no players (seats live in the separate `game_player` table) and its `gameType` is just free-text `string`. `GameRecord` is the **assembled aggregate**: the game row with its seats attached (in `seatOrder`) *and* `gameType` re-typed from `string` to the registry's `GameType` union, so callers can pass `record.gameType` straight to `getDefinition(...)` / `getEngine(...)` without a re-validation cast. Every game-returning function funnels through a private `toGameRecord(row, players)` helper (`games.ts:25`); `getGameById` (`games.ts:93`) is the canonical assembler:

```ts
export async function getGameById(id: string): Promise<GameRecord | null> {
  const [row] = await db.select().from(game).where(eq(game.id, id)).limit(1);
  if (!row) return null;
  const players = await getPlayers(id);
  return toGameRecord(row, players);
}
```

`getGameById` keys on the internal UUID, but the realtime lane and the read REST endpoint hold the **public room code**, so `getGameByCode` (`games.ts:100`) is the by-code twin - it normalizes the code first (`normalizeGameCode`) and otherwise assembles a `GameRecord` identically:

```ts
export async function getGameByCode(code: string): Promise<GameRecord | null> {
  const [row] = await db
    .select()
    .from(game)
    .where(eq(game.code, normalizeGameCode(code)))
    .limit(1);
  if (!row) return null;
  const players = await getPlayers(row.id);
  return toGameRecord(row, players);
}
```

`getPlayers` (`games.ts:73`) does the second query, ordered by `seatOrder`, left-joining `user_profile` so each seat also carries its player's `avatar` (avatars can change, so they are joined at read time rather than snapshotted into `game_player`); `updateGame` (`games.ts:160`) re-fetches players the same way after writing, so an updated `GameRecord` always carries fresh seats. `createGame` (`games.ts:29`) validates its input then inserts the `game` row and its `game_player` rows inside `db.transaction(...)`, so a game can never exist with a half-written seat list - and because the public `code` is randomly allocated, the whole insert is wrapped in a collision-retry loop (`GAME_CODE_MAX_ATTEMPTS = 5`, `games.ts:18`) that catches a `game_code_uq` unique violation via `isGameCodeCollision` (`games.ts:20`) and re-rolls; any non-collision error is re-thrown immediately (`games.ts:67`), and exhausting all five attempts throws `Failed to allocate a unique game code` (`games.ts:70`). `createGame` also generates the row id itself with `randomUUID()` (`games.ts:34`) so it can default `seriesId` to that same id (`seriesId: input.seriesId ?? id`, `games.ts:44`) - a fresh game is its own series root, while a rematch passes its parent's `seriesId` through. `conversations.getOrCreateDm` and `createGroup` use the same transaction pattern (the former additionally re-checks for an existing DM *inside* the transaction to dodge a create-create race). The `gameState ?? createInitialState(...)` and turn/role logic do **not** live here - that's the realtime driver's job; the repository only persists what it's told.

#### Series reads: `getSeriesGames` and `findLiveGameInConversation`

Two read-only queries back the rematch feature. `getSeriesGames(seriesId)` (`games.ts:111`) selects every `game` row sharing one `seriesId`, ordered by `createdAt`, and assembles each into a `GameRecord` (seats attached) - the flat "every game in this series" query that feeds both the series score and the `GET /api/games/:gameId/series` endpoint. `findLiveGameInConversation(conversationId, gameType)` (`games.ts:125`) returns the most-recent `GameRecord` whose `status` is `waiting | active` for that `(conversationId, gameType)` pair, or `null`:

```ts
export async function findLiveGameInConversation(
  conversationId: string,
  gameType: GameType,
): Promise<GameRecord | null> {
  const [row] = await db
    .select()
    .from(game)
    .where(
      and(
        eq(game.conversationId, conversationId),
        eq(game.gameType, gameType),
        inArray(game.status, ["waiting", "active"]),
      ),
    )
    .orderBy(desc(game.createdAt))
    .limit(1);
  if (!row) return null;
  const players = await getPlayers(row.id);
  return toGameRecord(row, players);
}
```

It is the data half of the **one-live-game-per-(conversation, game-type)** invariant: both `createGameInConversation` and `rematchGame` call it first and short-circuit to the existing live game rather than creating a duplicate (see [`realtime.md`](./realtime.md) and [`server-api.md`](./server-api.md)). The `computeSeriesScore` tally over `getSeriesGames`' output is a **pure** server helper (`apps/server/src/chat/series.ts`), so it is unit-testable without a database.

### Keyset (cursor) pagination

Two repositories paginate large feeds (messages and notifications) with **keyset pagination** rather than `OFFSET`. The cursor encodes the `(createdAt, id)` of the last row seen, base64'd (`cursor.ts:1`). `listMessages` (`messages.ts:55`) decodes that cursor and adds a "strictly older than the cursor" predicate, using `id` as a tiebreaker so messages with identical timestamps still page deterministically:

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

It then fetches `limit + 1` rows ordered `desc(createdAt), desc(id)`, uses the extra row to decide `hasMore`, and emits a `nextCursor` from the last kept row. `notifications.listForUser` is the same pattern verbatim. This is why the composite `(conversationId, createdAt)` and `(userId, createdAt)` indexes exist - the keyset predicate rides those indexes. The `biome-ignore` on the `or(...)!` is one of the few comments the repo allows (one per paginated repo); the non-null assertion is needed because Drizzle's `or()` is typed to possibly return `undefined`.

### Raw SQL fragments stay inside repositories

Repositories occasionally need a SQL expression Drizzle's builder doesn't model - but it's always the `sql` *template tag*, which parameterizes inputs (no string concatenation), and it never leaks past the repository. Examples: the per-game max move number, `nextMoveNumber` (`games.ts:196`) uses `` sql<number>`coalesce(max(${move.moveNumber}), 0)` ``; case-insensitive username lookups in `profiles.getProfileByUsername` (`profiles.ts:42`) use `` sql`lower(${userProfile.username}) = lower(${username})` ``; and `notifications.resolveByRequestId` (`notifications.ts:110`) matches a JSONB field with `` sql`${notification.payload} ->> 'requestId' = ${requestId}` ``. The takeaway: "no raw SQL in routes" doesn't mean "no SQL anywhere" - it means the SQL is *encapsulated* behind a typed repository function.

### `profiles.bumpStats`: read-modify-write of JSONB

`bumpStats` (`profiles.ts:153`) is a read-modify-write on a JSONB column: it loads the profile, clones `stats`, increments the per-`gameType` counters, and writes the whole object back. It's called once per player from the realtime driver when a game completes (`apps/server/src/realtime/turn-based.ts:93`). Because the `stats` object is small and the call sites are serialized within one move handler, this is fine in practice - but it's a read-modify-write, not an atomic SQL increment, so keep that in mind if stat updates ever fan out across concurrent writers.

## Data-flow walkthrough: persisting a move

This is the database layer's busiest path, and where the "client is never trusted" insight becomes concrete. A player taps the board, the client emits `make_move`, and the server's turn-based driver runs `handleMakeMove` (`apps/server/src/realtime/turn-based.ts:125`):

1. **Load the aggregate.** `games.getGameByCode(payload.gameId)` (`games.ts:100`) returns the `GameRecord` (game row + seats) resolved from the public room **code** the client sent (the wire never carries the UUID). The handler checks `status === "active"` and that the socket's `userId` is actually a seated player. The DB join is what makes the seat check possible.
2. **Validate with the shared schemas.** `def.moveSchema.safeParse(payload.moveData)` validates the *client's* input (`turn-based.ts:143`), and `def.stateSchema.safeParse(gameRow.gameState)` validates the *stored* JSONB (`turn-based.ts:145`). Both schemas come from the same `GameDefinition` the client imports. A bad move or corrupt state is rejected before any write.
3. **Reduce, authoritatively.** `def.engine.reduce(...)` (`turn-based.ts:148`) computes the next state on the server. The client's opinion about legality is irrelevant.
4. **Allocate a move number.** `games.nextMoveNumber(gameRow.id)` (`games.ts:196`) returns `max(moveNumber) + 1` - keyed on the internal UUID `gameRow.id`, since `move.game_id` FKs the UUID. The `move_game_number_uq` constraint is the backstop if two moves race to the same number.
5. **Append the move.** `games.addMove(...)` (`games.ts:204`) inserts the validated move into the append-only `move` table.
6. **Persist new state.** `games.updateGame(gameRow.id, { gameState: result.state })` (`games.ts:160`) writes the engine's output back to the `game.game_state` JSONB and bumps `updatedAt`.
7. **Finalize on game over.** If the engine's outcome is `completed`, `finalize` (`turn-based.ts:74`) calls `games.updateGame` again (status / `completedAt` / `winner`) and `profiles.bumpStats` (`profiles.ts:153`) once per seat.

In arrows:

`make_move` → `handleMakeMove` → `games.getGameByCode` → `moveSchema/stateSchema.safeParse` → `engine.reduce` → `games.nextMoveNumber` → `games.addMove` → `games.updateGame` → `finalize` → `profiles.bumpStats` → broadcast `move_made` + `game_state`.

Notice that no SQL appears anywhere in `turn-based.ts` - only `games.*` and `profiles.*` calls. That's the layering working as intended. The full realtime side of this story is in [`realtime.md`](./realtime.md).

## Artificial latency: `latency.ts`

`DB_LATENCY_MS` is a dev affordance for testing loading states. `withLatency` (`latency.ts:70`) is a no-op unless `ms > 0`; otherwise it returns a `Proxy` around the `postgres-js` client that delays each query by intercepting the lazy query object's `then` (`latency.ts:14`), so the sleep happens when a query is awaited, and threads through chainable methods, `unsafe`, and transaction callbacks (`begin` / `savepoint`) so delayed queries still compose. The package resolves the delay itself: `defaultLatencyMs()` (`client.ts:8`) reads `DB_LATENCY_MS` from `process.env` and runs it through `resolveDbLatencyMs(nodeEnv, requestedMs)` (`latency.ts:63`), which **forces it to 0 in production** (returns `0` when `nodeEnv === "production"`). So you can't accidentally ship an artificial delay, and `apps/server` no longer has to compute it. New env vars like this must be added to `turbo.json` `globalEnv` or builds won't see them.

## Gotchas, invariants & conventions

- **Never write SQL outside `packages/database/src/repositories/*`.** Routes and realtime handlers import the namespaces from `@gamelobby/database` and call functions. If you need a new query, add a repository function - don't reach for `db` in a route.
- **`GameRecord` always carries `players`; `GameRow` never does.** Seats live in `game_player`. `getGameById` / `getGameByCode` / `getSeriesGames` / `findLiveGameInConversation` / `createGame` / `updateGame` return the assembled `GameRecord`; `gamesForUser` (`games.ts:174`) returns bare `GameRow[]` (a list view that doesn't need seats).
- **Resolve games by code from the wire, by id internally.** The realtime lane and `GET /api/games/:gameId` hold the public room **code**, so they call `getGameByCode(code)` (`games.ts:100`); writes (`addMove` / `updateGame` / `listMoves` / `seatPlayer`) all take the internal UUID `gameRow.id`. `createGame` retries on a `game_code_uq` collision before giving up with `Failed to allocate a unique game code` once it exhausts `GAME_CODE_MAX_ATTEMPTS` (`games.ts:18`).
- **`seatPlayer` is idempotent.** It inserts the `game_player` row with `ON CONFLICT (game_id, user_id) DO NOTHING` and returns a `boolean` - `true` if the seat was written, `false` if that `(game_id, user_id)` was already seated (`games.ts:146`). This absorbs a duplicate/concurrent `join_room` for the same user without raising `game_player_uq`; the realtime driver branches on the result rather than blindly re-activating the game (see [realtime](./realtime.md)).
- **At most one live game per `(conversation, gameType)`.** `findLiveGameInConversation` (`games.ts:125`) is the read behind that invariant; the create/rematch services short-circuit to its result instead of inserting a duplicate. A series of every game in a rematch chain is read flat via `getSeriesGames` (`games.ts:111`) keyed on the shared `seriesId`.
- **Cursors are opaque and tolerant.** `decodeCursor` returns `null` (rather than throwing) on a malformed or non-base64 cursor (`cursor.ts:7`); callers then simply page from the start. Keyset pagination relies on the composite `createdAt`-leading indexes - keep them if you add new paginated lists.
- **`bumpStats` is read-modify-write on JSONB** (`profiles.ts:153`), not an atomic increment. Fine for the current serialized call site in the move handler; be careful if you ever bump stats from concurrent paths.
- **`DB_LATENCY_MS` is dev-only.** Forced to 0 in production by `resolveDbLatencyMs` (`latency.ts:63`), and resolved inside the package (`client.ts:8`).
- **JSONB blobs are untrusted until parsed.** `game_state` / `config` / `move_data` are `unknown` by design; validity is owned by the games' Zod schemas (see [`database-schema.md`](./database-schema.md)) and enforced at the realtime boundary (`turn-based.ts:145`). Treat any `gameState` you read as untrusted until `stateSchema.safeParse`'d.
- **No comments in code.** Per the repo-wide rule, the only comments you'll find in this layer are the `biome-ignore` directives on the `or(...)!` non-null assertions in the two paginated repositories.

## Where to go next

- [`./shared.md`](./shared.md) - `@gamelobby/shared`, the package this layer imports for its row types, domain types, and the Zod input schemas the repositories validate against.
- [`./database-schema.md`](./database-schema.md) - the table definitions, the generic JSONB game schema, and how Drizzle models it (the shapes this layer reads and writes).
- [`./games-core-schemas.md`](./games-core-schemas.md) - the Zod `stateSchema` / `moveSchema` / `configSchema` that own the shape of the JSONB this layer stores.
- [`./games-core-engine.md`](./games-core-engine.md) - `GameEngine` / `reduce`, the authority that produces the state persisted via `games.updateGame`.
- [`./realtime.md`](./realtime.md) - the socket lanes and the turn-based driver, the busiest caller of the game repositories.
- [`./server-api.md`](./server-api.md) - the Hono REST routes (e.g. `GET /api/games/:gameId`) that also call these repositories.
- [`./testing.md`](./testing.md) - the DB-backed `integration/` suite that runs these repositories against a live Postgres.
