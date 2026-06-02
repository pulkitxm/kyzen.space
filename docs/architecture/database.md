# Database Layer (Drizzle + Postgres + Repositories)

## What this is / why it matters

This is the **data access stack** for `apps/server`: a single Postgres database, modelled with the [Drizzle ORM](https://orm.drizzle.team), reached through a thin **repository layer** that every route and realtime handler funnels through. There is exactly one rule that the whole layer exists to enforce:

> **Routes and realtime handlers never write SQL. They call repository functions, and repositories are the only code that touches Drizzle / Postgres.**

That layering buys three things. First, **testability**: repositories are plain async functions exported from `apps/server/src/db/repositories/*`, so a route test can `mock.module` the repo and assert on the call instead of standing up a database. Second, **a single place for query shape**: pagination, soft-delete semantics, and the `GameRecord` join all live in one file each, so they can't drift between callers. Third, **a clean seam between the web app and the data**: the Next.js frontend never opens a database connection — it talks to the server over HTTP/WebSocket, and only the server's repositories touch Postgres (see `docs/architecture/README.md`).

The design decision worth internalizing up front is the **generic game schema**. There are no `tic_tac_toe` or `connect_four` tables. Every game — regardless of rules — is stored in three tables: `game` (with a `game_state` JSONB blob), `move` (with a `move_data` JSONB blob), and `game_player` (one row per seat). The *shape* of those JSONB blobs is owned by each game's strict Zod schemas in `packages/games-core`, and those same schemas validate the blobs on the server before the engine ever sees them. This is the database half of the repo's core insight: **the shared game package is imported by both the client and the server, so the server can re-derive and re-validate authoritative state from the same schemas the client uses — the client is never trusted.** That is why adding a game needs **zero** schema changes (see `docs/adding-a-game.md`).

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/server/src/db/schema.ts` | All Drizzle table definitions (`pgTable`), enums, indexes, and the derived `*Row` types. The single source of truth for the relational shape. |
| `apps/server/src/db/client.ts` | Constructs the `postgres-js` connection pool and the Drizzle `db` instance; re-exports `db`, `client`, `schema`, and the `DB` type. |
| `apps/server/src/db/index.ts` | The public facade: re-exports each repository as a namespace (`games`, `messages`, `conversations`, `friends`, `notifications`, `profiles`) plus the row/`GameRecord` types. |
| `apps/server/src/db/latency.ts` | `withLatency` Proxy that injects an artificial per-query delay (`DB_LATENCY_MS`) in non-production, for exercising loading states. |
| `apps/server/src/db/migrate.ts` | Standalone script that applies the SQL migrations in `apps/server/drizzle/` via the Drizzle migrator. |
| `apps/server/src/db/repositories/games.ts` | Game/move/seat CRUD; defines `GameRecord` (the `game` row with `players` attached and `gameType` narrowed to the registry `GameType`) and the `getGameById` join. |
| `apps/server/src/db/repositories/messages.ts` | Message insert/read/soft-delete + keyset-paginated `listMessages`. |
| `apps/server/src/db/repositories/conversations.ts` | DM/group create, membership, read-state, unread counts, last-message bookkeeping. |
| `apps/server/src/db/repositories/friends.ts` | Friendship requests/status keyed by a sorted `pairKey`. |
| `apps/server/src/db/repositories/notifications.ts` | Notification create/list (keyset-paginated)/mark-read/resolve. |
| `apps/server/src/db/repositories/profiles.ts` | `user_profile` reads/writes: username, avatar, appearance, chat layout, and per-game stats. |
| `apps/server/src/db/repositories/cursor.ts` | `encodeCursor` / `decodeCursor` — the opaque base64 `(createdAt, id)` cursor used by keyset pagination. |
| `drizzle.config.ts` | drizzle-kit config: points at `schema.ts`, emits SQL to `apps/server/drizzle`, `strict: true`. |

## The connection: `client.ts`

Everything starts with one pool. `apps/server/src/db/client.ts:7` builds a `postgres-js` client (`max: 10` connections), optionally wraps it for artificial latency, and hands it to Drizzle:

```ts
const client = withLatency(
  postgres(env.databaseUrl, { max: 10 }),
  env.dbLatencyMs,
);

export const db = drizzle(client, { schema });

export { client, schema };
export type DB = typeof db;
```

Two things to note. Passing `{ schema }` (`apps/server/src/db/client.ts:12`) gives Drizzle the full table catalog, which is what makes `db.query.*` relational helpers and good inference available. And `db` is a **module-level singleton** — every repository imports the same instance (`import { db } from "../client"`), so the whole server shares one pool. `DATABASE_URL` and `DB_LATENCY_MS` are read once at startup in `apps/server/src/env.ts:33`.

## The schema: `schema.ts`

`schema.ts` is the one file that describes the relational world. It defines three Postgres enums up front (`apps/server/src/db/schema.ts:32`) — `app_theme`, `color_mode`, `app_pattern` — whose *values are derived from TypeScript constants* (`THEME_IDS`, `COLOR_MODES`, `PATTERN_IDS` from `apps/server/src/lib/*`), so the DB enum can never disagree with the app's notion of valid values.

The auth tables — `user`, `session`, `account`, `verification` (`apps/server/src/db/schema.ts:36`–`90`) — are the shape Better Auth expects (see `docs/architecture/auth.md`); the rest of the app references `user.id` with `onDelete` rules.

At the bottom of the file, Drizzle's `$inferSelect` derives a TypeScript row type for each table (`apps/server/src/db/schema.ts:182`–`185` and `301`–`305`), e.g. `export type GameRow = typeof game.$inferSelect;`. These `*Row` types flow out through `db/index.ts` and become the currency that repositories return — so callers get fully typed rows without hand-writing interfaces.

### The generic game schema (the important part)

Three tables model **every** game. First, `game` (`apps/server/src/db/schema.ts:98`):

```ts
export const game = pgTable(
  "game",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameType: text("game_type").notNull(),
    status: text("status").$type<GameStatus>().notNull().default("waiting"),
    winner: text("winner"),
    gameState: jsonb("game_state").$type<unknown>(),
    config: jsonb("config").$type<unknown>(),
    conversationId: uuid("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    creatorUserId: text("creator_user_id"),
    seatingMode: text("seating_mode").$type<SeatingMode>(),
    challengedUserId: text("challenged_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("game_conversation_idx").on(t.conversationId)],
);
```

The two load-bearing columns are `gameType` (a free-text key like `"tic-tac-toe"` that maps to a `GameDefinition` in games-core) and `gameState` / `config`, both `jsonb(...).$type<unknown>()`. They are typed `unknown` *on purpose*: the database layer is deliberately ignorant of what's inside. The truth about that JSON lives in the game's Zod `stateSchema` / `configSchema` (`packages/games-core`, see `docs/architecture/games-core-schemas.md`), and it is validated at the realtime boundary, not by the DB.

`status` and `seatingMode` are `text(...).$type<...>()` — stored as plain text but narrowed in TypeScript to the unions declared just above the table (`apps/server/src/db/schema.ts:94`–`96`): `GameStatus = "waiting" | "active" | "completed" | "abandoned"` and `SeatingMode = "open" | "challenge"`. `$type` is a *compile-time* cast with no runtime check, so the repositories are responsible for only writing legal values.

Second, `move` (`apps/server/src/db/schema.ts:123`) — an append-only log, one row per move:

```ts
export const move = pgTable(
  "move",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    moveNumber: integer("move_number").notNull(),
    playerId: text("player_id").notNull(),
    moveData: jsonb("move_data").$type<unknown>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("move_game_number_uq").on(t.gameId, t.moveNumber)],
);
```

`moveData` is again `jsonb` typed `unknown` — its real shape is the game's `moveSchema`. The crucial invariant is the **`unique("move_game_number_uq").on(gameId, moveNumber)`** constraint: it guarantees move numbers are dense and unique per game, so the database itself rejects a duplicate move number (a concurrency / double-submit guard). `onDelete: "cascade"` means deleting a game drops its move log too.

Third, `game_player` (`apps/server/src/db/schema.ts:138`) — **one indexed row per seat**:

```ts
export const gamePlayer = pgTable(
  "game_player",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    role: text("role").notNull(),
    seatOrder: integer("seat_order").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [
    unique("game_player_uq").on(t.gameId, t.userId),
    index("game_player_user_idx").on(t.userId),
  ],
);
```

This table is a **normalization** of what used to be a `players` JSONB array on `game`. (The history is visible in the first migration, `apps/server/drizzle/0000_faithful_dragon_lord.sql`, where `game` had a `"players" jsonb DEFAULT '[]'`.) Splitting seats into their own rows pays off in two ways: `unique("game_player_uq").on(gameId, userId)` makes it impossible to seat the same user twice in one game, and `index("game_player_user_idx").on(userId)` makes "all games for this user" a fast indexed join instead of a JSONB scan — that's exactly what `gamesForUser` uses (`apps/server/src/db/repositories/games.ts:121`). `seatOrder` preserves turn order, and `role` is the per-seat role string the engine assigns (e.g. `"X"` / `"O"`).

> **Why JSONB + per-game Zod instead of per-game tables?** A relational table per game would force a migration for every new game and a schema change for every rule tweak — and it would split the validation logic away from the engine. By storing opaque JSONB and validating with the game's own Zod schemas, the *same* `GameDefinition` that the React client imports to render the board is the one the server imports to validate and reduce moves. Adding a game touches `packages/games-core` and `packages/games-client` only; the database layer never changes. See `docs/architecture/games-core-engine.md`.

### Chat / social / profile tables

The remaining tables back the chat-and-social half of the product (DTOs/contract in `docs/architecture/chat-core.md`):

- **`userProfile`** (`apps/server/src/db/schema.ts:165`) — one per `user` (`unique` FK), holding `username` (unique), a `stats` JSONB of type `ProfileStats` (`Record<gameType, GameStat>`, declared at `apps/server/src/db/schema.ts:163`), an `avatar` JSONB (`AvatarConfig`, from `packages/avatar`), and appearance columns backed by the three pgEnums plus a `chatLayout` JSONB. This is the "profile provisioned on first sign-in" row.
- **`conversation`** + **`conversationMember`** (`apps/server/src/db/schema.ts:210`, `229`) — a conversation is a `dm` or `group` (`kind`), and DMs carry a unique `dmKey` so a pair of users can have at most one DM. Membership is a join table with per-member read state (`lastReadMessageId`, `lastReadAt`), `muted`, and a `leftAt` soft-leave. `unique("conversation_member_uq").on(conversationId, userId)` plus `index(...).on(userId)` mirror the `game_player` design.
- **`message`** (`apps/server/src/db/schema.ts:252`) — `kind` (`text`, `game_card`, …), nullable `body`, a `metadata` JSONB (`MessageMetadata` from chat-core), an optional `gameId` link (so a `game_card` message points at a game), and a `deletedAt` for soft delete. The composite `index("message_conv_created_idx").on(conversationId, createdAt)` is precisely the index that makes the keyset pagination below efficient.
- **`friendship`** (`apps/server/src/db/schema.ts:187`) — a `requesterId` / `addresseeId` pair plus a `pairKey` (sorted, unique) so direction doesn't create duplicates; indexed both ways by `(addressee, status)` and `(requester, status)`.
- **`notification`** (`apps/server/src/db/schema.ts:276`) — `userId`, `type`, optional `actorId`, a `payload` JSONB (`NotificationPayload`), and `readAt` / `resolvedAt`. Indexed by `(userId, createdAt)` for the feed and `(userId, readAt)` for the unread badge.

## The repository pattern

Every repository is just a module of async functions over the shared `db`, exported wholesale as a namespace by `apps/server/src/db/index.ts`:

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

The single most important repository type is `GameRecord` (`apps/server/src/db/repositories/games.ts:15`):

```ts
export type GameRecord = Omit<GameRow, "gameType"> & {
  gameType: GameType;
  players: GamePlayer[];
};
```

A raw `GameRow` (straight from the `game` table) has no players — seats live in the separate `game_player` table — and its `gameType` is just free-text `string`. `GameRecord` is the **assembled aggregate**: the game row with its seats attached (in `seatOrder`) *and* `gameType` re-typed from `string` to the registry's `GameType` union (`@gamelobby/games-core`, see `docs/architecture/games-core-schemas.md`). That narrowing lets callers pass `record.gameType` straight to `getDefinition(...)`/`getEngine(...)` without a re-validation cast. Any repository function that returns a game returns a `GameRecord`, so callers can treat "the game and who's in it" as one object. The narrowing happens through a private `toGameRecord(row, players)` helper (`apps/server/src/db/repositories/games.ts:20`) that every game-returning function funnels through; `getGameById` (`apps/server/src/db/repositories/games.ts:82`) is the canonical assembler:

```ts
export async function getGameById(id: string): Promise<GameRecord | null> {
  const [row] = await db.select().from(game).where(eq(game.id, id)).limit(1);
  if (!row) return null;
  const players = await getPlayers(id);
  return toGameRecord(row, players);
}
```

`getPlayers` (`apps/server/src/db/repositories/games.ts:69`) does the second query, ordered by `seatOrder`, and projects each row down to the `GamePlayer` shape (`{ userId, username, role }`). `updateGame` (`apps/server/src/db/repositories/games.ts:107`) re-fetches players the same way after writing, so an updated `GameRecord` always carries fresh seats. The `gameState ?? createInitialState(...)` decision and turn/role logic do **not** live here — that's the realtime driver's job (see below); the repository only persists what it's told.

`createGame` (`apps/server/src/db/repositories/games.ts:36`) is the clearest example of a **transaction**: it inserts the `game` row and then the `game_player` rows inside `db.transaction(...)`, so a game can never exist with a half-written seat list. `conversations.getOrCreateDm` and `createGroup` (`apps/server/src/db/repositories/conversations.ts:37`, `70`) use the same pattern — and `getOrCreateDm` additionally re-checks for an existing DM *inside* the transaction (`apps/server/src/db/repositories/conversations.ts:50`) to dodge a create-create race.

### Keyset (cursor) pagination

Two repositories paginate large feeds — messages and notifications — with **keyset pagination** rather than `OFFSET`. The cursor encodes the `(createdAt, id)` of the last row seen, base64'd (`apps/server/src/db/repositories/cursor.ts:1`):

```ts
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${new Date(createdAt).toISOString()}|${id}`).toString(
    "base64",
  );
}
```

`listMessages` (`apps/server/src/db/repositories/messages.ts:59`) decodes that cursor and adds a "strictly older than the cursor" predicate, using `id` as a tiebreaker so messages with identical timestamps still page deterministically (`apps/server/src/db/repositories/messages.ts:66`):

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

It then fetches `limit + 1` rows ordered `desc(createdAt), desc(id)`, uses the extra row to decide `hasMore`, and emits a `nextCursor` from the last kept row (`apps/server/src/db/repositories/messages.ts:79`–`91`). `notifications.listForUser` (`apps/server/src/db/repositories/notifications.ts:42`) is the same pattern verbatim. This is why the composite `(conversationId, createdAt)` and `(userId, createdAt)` indexes exist — the keyset predicate rides those indexes. The lone `biome-ignore` is one of the few comments the repo allows; the non-null assertion is needed because Drizzle's `or()` is typed to possibly return `undefined`.

### Raw SQL fragments stay inside repositories

Repositories occasionally need a SQL expression Drizzle's builder doesn't model — but it's always the `sql` *template tag*, which parameterizes inputs (no string concatenation), and it never leaks past the repository. Examples: the per-game max move number, `nextMoveNumber` (`apps/server/src/db/repositories/games.ts:143`) uses `` sql<number>`coalesce(max(${move.moveNumber}), 0)` ``; case-insensitive username lookups in `profiles.getProfileByUsername` (`apps/server/src/db/repositories/profiles.ts:36`) use `` sql`lower(${userProfile.username}) = lower(${username})` ``; and `notifications.resolveByRequestId` (`apps/server/src/db/repositories/notifications.ts:114`) matches a JSONB field with `` sql`${notification.payload} ->> 'requestId' = ${requestId}` ``. The takeaway: "no raw SQL in routes" doesn't mean "no SQL anywhere" — it means the SQL is *encapsulated* behind a typed repository function.

### `profiles.bumpStats` — read-modify-write of JSONB

`bumpStats` (`apps/server/src/db/repositories/profiles.ts:114`) is worth flagging because it's a read-modify-write on a JSONB column: it loads the profile, clones `stats`, increments the per-`gameType` counters, and writes the whole object back. It's called once per player from the realtime driver when a game completes (`apps/server/src/realtime/turn-based.ts:90`). Because the `stats` object is small and the call sites are serialized within one move handler, this is fine in practice — but it's a read-modify-write, not an atomic SQL increment, so keep that in mind if stat updates ever fan out across concurrent writers.

## Data-flow walkthrough: persisting a move

This is the database layer's busiest path, and it's where the "client is never trusted" insight becomes concrete. A player taps the board, the client emits `make_move`, and the server's turn-based driver runs `handleMakeMove` (`apps/server/src/realtime/turn-based.ts:120`):

1. **Load the aggregate.** `games.getGameById(payload.gameId)` (`apps/server/src/db/repositories/games.ts:82`) returns the `GameRecord` — game row + seats. The handler checks `status === "active"` and that the socket's `userId` is actually a seated `player` (`turn-based.ts:130`–`133`). The DB join is what makes the seat check possible.
2. **Validate with the shared schemas.** `def.moveSchema.safeParse(payload.moveData)` validates the *client's* input, and `def.stateSchema.safeParse(gameRow.gameState)` validates the *stored* JSONB (`turn-based.ts:138`–`140`). Both schemas come from the same `GameDefinition` the client imports. A bad move or corrupt state is rejected with `game_error` before any write.
3. **Reduce — authoritatively.** `def.engine.reduce(parsedState.data, { role: player.role }, parsedMove.data)` (`turn-based.ts:143`) computes the next state on the server. The client's opinion about legality is irrelevant; `result.ok === false` ends the request.
4. **Allocate a move number.** `games.nextMoveNumber(gameRow.id)` (`apps/server/src/db/repositories/games.ts:143`) returns `max(moveNumber) + 1`. The `move_game_number_uq` unique constraint is the backstop if two moves race to the same number.
5. **Append the move.** `games.addMove({ gameId, moveNumber, playerId, moveData: parsedMove.data })` (`apps/server/src/db/repositories/games.ts:151`) inserts the validated move into the append-only `move` table.
6. **Persist new state.** `games.updateGame(gameRow.id, { gameState: result.state })` (`apps/server/src/db/repositories/games.ts:107`) writes the engine's output back to the `game.game_state` JSONB and bumps `updatedAt`.
7. **Finalize on game over.** If the engine's `outcome.status === "completed"`, `finalize` (`turn-based.ts:69`) calls `games.updateGame` again (status/`completedAt`/`winner`) and `profiles.bumpStats` (`apps/server/src/db/repositories/profiles.ts:114`) once per seat.

In arrows:

`make_move` → `handleMakeMove` (`turn-based.ts:120`) → `games.getGameById` (`games.ts:82`) → `moveSchema/stateSchema.safeParse` (`turn-based.ts:138`) → `engine.reduce` (`turn-based.ts:143`) → `games.nextMoveNumber` (`games.ts:143`) → `games.addMove` (`games.ts:151`) → `games.updateGame` (`games.ts:107`) → `finalize` → `profiles.bumpStats` (`profiles.ts:114`) → broadcast `move_made` + `game_state`.

Notice that no SQL appears anywhere in `turn-based.ts` — only `games.*` and `profiles.*` calls. That's the layering working as intended. The full realtime side of this story is in `docs/architecture/realtime.md`.

## Migrations, push, and latency

**`drizzle.config.ts`** (`drizzle.config.ts:3`) wires drizzle-kit: `dialect: "postgresql"`, `schema: "./apps/server/src/db/schema.ts"`, `out: "./apps/server/drizzle"`, with `strict: true`. `bun run db:generate` diffs the schema and emits a numbered `.sql` file (the repo currently has `0000_*.sql` … `0007_*.sql`).

**`migrate.ts`** (`apps/server/src/db/migrate.ts:9`) is a tiny standalone script — it resolves the `apps/server/drizzle` folder, runs the Drizzle migrator against `db`, closes the pool, and exits. `bun run db:migrate` invokes it (`package.json` script). **However**, per the project's working notes, the **local dev database is push-managed**: it was set up with `bun run db:push` (drizzle-kit applies the schema directly, leaving the migration ledger empty), so `db:migrate` will not have a baseline to apply against locally — apply schema/enum changes with `db:push` or direct SQL in dev. The numbered migrations exist for reproducible/prod-style application. (See `docs/architecture/database.md` callers and the root `CLAUDE.md` Database section for the full command list.)

**`latency.ts`** implements `DB_LATENCY_MS`, a dev affordance for testing loading states. `withLatency` (`apps/server/src/db/latency.ts:70`) is a no-op unless `ms > 0`; otherwise it returns a `Proxy` around the `postgres-js` client that delays each query by intercepting the lazy query object's `then` (`apps/server/src/db/latency.ts:13`) — i.e. the sleep happens when a query is awaited, and the wrapper threads through chainable methods, `unsafe`, and transaction callbacks (`begin` / `savepoint`) so delayed queries still compose. Critically, the latency is **forced to 0 in production**: `env.dbLatencyMs` runs through `resolveDbLatencyMs(nodeEnv, requestedMs)` (`apps/server/src/db/latency.ts:63`), which returns `0` when `nodeEnv === "production"` (`apps/server/src/env.ts:34`). So you can't accidentally ship an artificial delay.

## Gotchas, invariants & conventions

- **Never write SQL outside `db/repositories/*`.** Routes and realtime handlers import the namespaces from `apps/server/src/db/index.ts` (`games`, `messages`, …) and call functions. If you need a new query, add a repository function — don't reach for `db` in a route.
- **`game_state` / `config` / `move_data` are `unknown` by design.** The DB does not know or check their shape. Validity is owned by the game's Zod schemas in `packages/games-core` and enforced at the realtime boundary (`apps/server/src/realtime/turn-based.ts:138`). Treat any `gameState` you read as untrusted until `stateSchema.safeParse`'d.
- **`$type<...>()` is a compile-time cast, not a runtime check.** `status`, `seatingMode`, `kind`, `role`, etc. are stored as plain `text`. The repository is responsible for only inserting values in the declared union; Postgres won't stop you from writing garbage.
- **`GameRecord` always carries `players`; `GameRow` never does.** Seats live in `game_player`. Functions that return a game (`getGameById`, `createGame`, `updateGame`) return the assembled `GameRecord`; `gamesForUser` returns bare `GameRow[]` (it's a list view that doesn't need seats).
- **`game_player` replaced an old `players` JSONB array.** The first migration (`apps/server/drizzle/0000_faithful_dragon_lord.sql`) shows `game` once had a `players jsonb`. Don't reintroduce per-game arrays; one indexed row per seat is the convention (it powers `game_player_uq` and the `userId` index).
- **Move numbers are dense, unique, and DB-enforced.** `move_game_number_uq` on `(gameId, moveNumber)` plus `nextMoveNumber = max + 1` (`apps/server/src/db/repositories/games.ts:143`). A duplicate is a hard insert failure, which is the intended double-submit guard.
- **Cursors are opaque and tolerant.** `decodeCursor` returns `null` (rather than throwing) on a malformed or non-base64 cursor (`apps/server/src/db/repositories/cursor.ts:7`); callers then simply page from the start. Keyset pagination relies on the composite `createdAt`-leading indexes — keep them if you add new paginated lists.
- **DMs and friendships are keyed by a *sorted* pair.** `conversations.dmKey(a, b)` and `friends.pairKey(a, b)` both `[a, b].sort().join(":")` (`apps/server/src/db/repositories/conversations.ts:12`, `apps/server/src/db/repositories/friends.ts:6`), so the relationship is direction-independent and the unique constraint actually prevents duplicates.
- **`bumpStats` is read-modify-write on JSONB.** Not an atomic increment (`apps/server/src/db/repositories/profiles.ts:114`). Fine for the current serialized call site in the move handler; be careful if you ever bump stats from concurrent paths.
- **Dev DB is push-managed.** Use `db:push` (or direct SQL) for local schema/enum changes; `db:migrate` expects a migration baseline the local push-managed DB doesn't have.
- **`DB_LATENCY_MS` is dev-only.** Forced to 0 in production by `resolveDbLatencyMs` (`apps/server/src/db/latency.ts:63`). New vars like this must be added to `turbo.json` `globalEnv` (see `CLAUDE.md`) or builds won't see them.
- **No comments in code.** Per the repo-wide rule, the only comment you'll find in this layer is the single `biome-ignore` on the `or(...)!` non-null assertions in the paginated repositories.

## Where to go next

- [`./README.md`](./README.md) — the architecture index and the shared-logic core insight (start here).
- [`./games-core-schemas.md`](./games-core-schemas.md) — the Zod `stateSchema` / `moveSchema` / `configSchema` that own the shape of the JSONB this layer stores.
- [`./games-core-engine.md`](./games-core-engine.md) — `GameEngine` / `reduce`, the authority that produces the state persisted via `games.updateGame`.
- [`./realtime.md`](./realtime.md) — the socket lanes and the turn-based driver, the busiest caller of the game repositories.
- [`./server-api.md`](./server-api.md) — the Hono REST routes (e.g. `GET /api/games/:gameId`) that also call these repositories.
- [`./auth.md`](./auth.md) — Better Auth and the `user` / `session` / `account` tables plus first-sign-in profile provisioning.
- [`./chat-core.md`](./chat-core.md) — the chat/social DTOs and socket contract backing the `conversation` / `message` / `friendship` / `notification` tables.
- [`./web.md`](./web.md) — how the frontend reads this data over HTTP/WebSocket (it never touches Postgres directly).
- [`./testing.md`](./testing.md) — the DB-backed `integration/` suite that runs these repositories against a live Postgres.
